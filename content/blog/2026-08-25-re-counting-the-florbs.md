---
title: "Re-counting the florbs: churn ultimatum"
description:
  "The sequel to counting the florbs. The refresh became the most expensive
  query on the cluster, I blamed the wrong index, shipped a fix for something
  that wasn't necessary, and then a SELECT revealed 12x bloat. The query healed
  itself."
series: "Counting the florbs"
date: 2026-08-25 09:00:00 +0200
tags:
  - databases
  - performance
  - postgres
author: sebiwi
---

## TL;DR

Nine weeks ago I wrote about [counting twenty-five million florbs][1] with a BRIN
index and a rollup table, published the post, and felt great. And then, the
rollup’s refresh loop became the most expensive query on the database. I blamed
the BRIN index, shipped a fix for a problem my table didn’t have, and got my ass
handed to me by one `SELECT`. The real problem was table bloat, the real fix was
an autovacuum setting I had shipped as damage control, and the query healed
itself.

**If you keep reading, I’m going to tell you why a scan reads pages and not
rows, why `VACUUM` never gives space back, how stale statistics don't tell the
truth to the planner, and how a sliding window fixed the issue straight away.**

## Previously, on counting the florbs

[Last time][1]: there are around twenty-five million florbs in a Postgres table.
Each one is either still florbing, has florbed cleanly, or has failed to florb.
A BRIN index made narrow time-window counts fast, a daily rollup table made wide
ones fast, and a small refresh loop rebuilds the rollup’s trailing three days
every fifteen minutes. If you haven’t read the previous post (but you should, I
think), that’s all the intel you need. (I’m still not telling you what a florb
is.)

## One month later: the database is crawling

A month after publishing, I checked the database and found a single query eating
between three quarters and nine tenths of all query time on the cluster. It
wasn't a dashboard query. It was the refresh. The one I had described as “a
quick, BRIN-assisted scan of recent rows”. Shiiiiiiiiiiiiiiiii-

Turns out, it was not quick nor BRIN-assisted. I ran a plan and it showed a full
sequential scan of all twenty-five million florbs: thirty-seven gigabytes read
off disk, nine minutes on average, thirteen on bad days, every fifteen minutes,
to produce roughly a thousand rollup rows. This was basically running
all the time. Also, the refresh loop was spending 60% of its life re-reading the
entire table, and the buffer cache hit ratio was 2.5%, which for a query that
touches everything is bad. Really bad. Catastrophic. Anyway.

## The confetti theory

I had a theory though. The setup rested on a single idea from the original post
(go read it): “florbs are append-mostly, and they arrive roughly in time order.”
But every florb also mutates at least once in its life, when it stops florbing:
the status flips to a final verdict, and the duration gets filled in.

In Postgres, an UPDATE never modifies a row in place. It writes a new row
version wherever there is free space, which can be a different page. There is an
optimization ([HOT updates][2]) that tries to keep the new version on the same
page, but it doesn't work anymore from the moment the update touches any indexed
column, and status was indexed. According to the theory, every florb that
finished teleported: a row created in March now physically lives between two
rows created in June, the BRIN’s min/max summaries stretch until they summarize
nothing, and the index is just standing there, without doing anything.

It explained everything, it was mechanically sound and it fit the symptoms.
Occam's razor, or so I thought. So I shipped the fix:

```sql
-- One entry per row, keyed by value. Doesn't care where rows live on disk.
CREATE INDEX CONCURRENTLY idx_florbs_created_at ON florbs (created_at);

-- Goodbye buddy (this was a mistake, but I didn't know that yet).
DROP INDEX CONCURRENTLY idx_florbs_created_at_brin;

-- Vacuum at ~250k dead florbs instead of ~5M.
ALTER TABLE florbs SET (
    autovacuum_vacuum_scale_factor  = 0.01,
    autovacuum_vacuum_threshold     = 10000,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_analyze_threshold    = 10000
);
```

That autovacuum change at the bottom, which I added as damage control, was
what ended up solving the issue. Hold that thought.

The deploy did something. The refresh dropped from nine minutes to a couple, and
the plan dutifully showed my shiny new B-tree. That felt good at first.

But then the rest of the cluster got _slower_: unrelated queries regressed, and
the dashboards other people used started dragging. I had improved my query but
everyone else’s was worse. So I stopped the refresh loop by holding the advisory
lock from a psql session, and tried to figure out what I had done.

## Plot hole

First, I ran an `ANALYZE`. The planner’s statistics were over a month stale, and
it was estimating eight million rows in a three-day window which actually held
one million (!). Fresh stats fixed the estimate and swapped the plan’s sort for
a hash aggregate. Progress. Still 131 seconds, uncontended, to aggregate one
million rows.

Second, the buffers. `EXPLAIN (ANALYZE, BUFFERS)` showed the scan touching 1.1
million pages, about 8.5 gigabytes, to fetch that one million rows, and 81 of
those 131 seconds were pure disk wait (!).

One page per row is a suspicious number. Pages hold multiple dozens of rows.
Usually. Right?

And third, this:

```sql
SELECT attname, correlation FROM pg_stats
WHERE tablename = 'florbs' AND attname = 'created_at';

--   attname   | correlation
-- ------------+-------------
--  created_at |  0.99055177
```

Basically, [`pg_stats.correlation`][3] being 1.0 means the column’s values sit
on disk in perfect order, and 0 means confetti. Mine was 0.99. The rows were
laid out in almost perfect time order. Nothing had teleported anywhere. The
confetti theory was science fiction, and the B-tree I shipped for it was not
necessary. Shiiiiiiiiiiiiiiiii-

So then I investigated the one page per row thing.

## Bloat

```sql
SELECT pg_size_pretty(pg_relation_size('florbs')) AS heap_size,
       round(n_live_tup::numeric
             / (pg_relation_size('florbs') / 8192), 1) AS live_rows_per_page
FROM pg_stat_user_tables WHERE relname = 'florbs';

--  heap_size | live_rows_per_page
-- -----------+--------------------
--  37 GB     |                5.1
```

The heap is 37 GB, which at 8 KB per page is about 4.85 million pages. There are
5.1 live rows per page on average. 4.85 million pages \* 5.1 rows ≈ 24.7 million
live rows, which checks out: that's roughly the 25 million florbs. If a healthy
page holds 60 rows, and these were packed densely, they'd need around 412,000
pages (24.7 million / 60). And that, times 8 KB, is about 3.1 GB.

Thirty-seven gigabytes of table held around three gigabytes of live florbs. And
that thirty-seven gigabytes had been sitting in the very first plan I ran, and I
never asked myself why twenty-five million small rows needed that much room.

So all in all, a healthy page fits around sixty of these rows, mine averaged
five, and the recent region, where all the update churn concentrates, was closer
to _one_ live row per page. That’s bloat: every status flip writes a new row
version and leaves a dead one behind, `VACUUM` eventually frees the dead ones
but never compacts pages or gives space back. With default thresholds,
autovacuum doesn’t run on a table this size until almost five million rows are
dead. Mine had been running a day and a half late for months. Every page ended
up almost empty.

And a scan reads _pages_, not rows. Reading three days of florbs meant reading a
million nearly-empty pages, eight and a half gigabytes of mostly nothing, no
matter which index found them. The BRIN index was innocent: its block ranges
pointed correctly at the window, the rows really were in time order, there was
twelve times too much ground to scan (60 / 5.1).

## I had already shipped a fix for this

Remember the autovacuum tuning I shipped as damage control for the wrong fix?
Watch this.

The refresh only reads a sliding three-day window. Old florbs never change (that
assumption from the original post held up fine). With autovacuum being triggered
at ~250k dead rows instead of five million, newly written pages stay dense: dead
versions get cleaned within minutes and their space reused right away. So every
day, one bloated day slid out of the window and one dense day slid in. Nobody
rewrote anything. The query healed itself:

```text
day  0    avg  90-125s    ~1,060,000 pages read per run
day  5    avg      15s      ~380,000 pages read per run
day 13    avg     2-4s       ~17,000 pages read per run
```

Two weeks after the autovacuum fine-tuning, the refresh runs in a couple of
seconds, reads seventeen thousand pages instead of a million, hits cache 98% of
the time, and every neighboring query recovered with it. I left the B-tree
because it’s a perfectly good index, robust to whatever the physical layout
does, but it was never the fix.

The thirty-four gigabytes of old empty pages are still there. Plain vacuum will
never give them back. If I ever want the disk, that’s a job for [pg_repack][4],
an online table rewrite with only a brief lock at the final swap. There’s no
performance reason left to run it; it would purely be tidying. I also learned to
leave a little slack in new pages (`fillfactor = 90`) so future row versions can
stay put, which slows the whole cycle from restarting.

## Final thoughts

The original post ended by saying the boring relational rollup won on
simplicity. That's still true: the architecture never changed. The problem was
everything I believed about the table underneath it.

**Lessons learned**:

- A scan reads pages, not rows. Before blaming an index, divide live rows by
  pages (`n_live_tup` vs `pg_relation_size`). Mine said five rows per page where
  sixty fit, and that one number explained everything.
- Measure before theorizing. My confetti theory was mechanically sound and
  explained every symptom, but was destroyed by a single `SELECT` I could have
  run on day one. Elegant and coherent is not the same as true.
- `VACUUM` frees, it never compacts. And its default thresholds are percentages,
  so on twenty-five million rows autovacuum waits for millions of dead tuples
  before being triggered. Do your fine-tuning, especially for big churny tables.
  In my case, that boring config change outperformed every clever index I
  shipped.
- Read the plans of the queries you _don’t_ see, not just the ones users
  complain about. A background job hid a nine-minute scan for a month.
- If your hot set slides with time, you don’t have to fix the past. Make the
  _new_ data healthy and let the window slide off the damage. Cheapest migration
  I ever ran: none.

I really hope I don't have to write a third post about this fucking shit, and
that this solution is final. And I'm still not telling you what a florb is.

[1]: /blog/counting-the-florbs-brin-indexes-rollup-tables-and-a-90-second-query/
[2]: https://www.postgresql.org/docs/current/storage-hot.html
[3]: https://www.postgresql.org/docs/current/view-pg-stats.html
[4]: https://reorg.github.io/pg_repack/
