---
title: "Counting the florbs: BRIN indexes, rollup tables, and a 90-second query"
description:
  "A story about counting fifteen million of something, fast. What a BRIN index
  is and why it’s great, why it failed at volume, and how a daily rollup table
  fixed it, proven with query plans. Now with a sequel: how update churn
  quietly killed the BRIN, and the boring B-tree that replaced it."
date: 2026-06-22 09:00:00 +0200
tags:
  - databases
  - performance
  - postgres
author: sebiwi
---

## TL;DR

I needed to count the florbs. All of them, across the whole system, over any
time window you care to name. The florbs lived in Postgres, so I tried using a
[BRIN index][1], which was great for small windows and useless for large ones.
Then I built a daily rollup table to pre-aggregate the counts, kept the BRIN
around for the small stuff, and ended up with a query that went from about 90
seconds to a handful of milliseconds.

**If you keep reading, I’m going to tell you what a BRIN index is, why it’s
great, why it wasn’t enough, how a rollup table works, and how to use it for big
counts.**

**Update, July 2026:** this post now has a sequel baked in. The BRIN quietly
died of update churn, the refresh became the single most expensive query on the
cluster, and the fix was the boring B-tree after all. The original story is
still below as written; the plot twist starts at “One month later”.

## The florbs

I’m not going to tell you what a florb is. It doesn’t matter (trust me). It's
better this way. It's more fun too. Here’s everything you actually need to know.

There are about fifteen million florbs living in a Postgres database. There are
more of them every second. Each florb is either still florbing, has florbed
cleanly, or has failed to florb, and each one takes some amount of time to do
so. They belong to different tenants. One day, someone important walked over and
asked a perfectly reasonable question: _across all of them, what fraction of
florbs are failing right now? And last week? And over the last 90 days?_

We already had a way to look at one tenant’s florbs. What we didn’t have was the
global view: every florb, every tenant, an arbitrary time window, the error rate
at a glance. So I went to build it.

It's just counting, right?

## First attempt: a BRIN index

The florbs live in one big ass table, and the only thing my query filters on is
`created_at`. Count the rows in a time window, group by status, done. The naive
version is fine until the table gets big, and fifteen million rows is big enough
to make a plain sequential scan crawl. In other words, not something you want to
run on every dashboard load.

So then I index `created_at`. Florbs are append-mostly, and they arrive roughly
in time order. This means that the table is already physically laid out on disk
in `created_at` order. That is the exact situation [BRIN indexes][1] were built
for.

A BRIN index (Block Range INdex) is super lazy. I like that. Instead of storing
one entry per row like a B-tree, it slices the table in ranges of physical
blocks and stores only the minimum and maximum value of the indexed column for
each range. That’s the whole idea. For a table sorted by time, each block range
covers a small slice of time, so when you ask for “florbs created last Tuesday”,
Postgres can skip every block range whose min and max don’t overlap Tuesday, and
only look at the few that do. Other databases do this too, they just don't call
them BRIN: ClickHouse does [minmax skip indexes][2], for example.

The result is an index that is small (kilobytes, not gigabytes), costs almost
nothing to maintain on insert, and makes narrow time-window queries fast. A
one-day window dropped to around 268 milliseconds. Problem solved. Right?

## Where it fell apart

BRIN indexes are _lossy_: a block range only tells Postgres that matching rows
_might_ live in those blocks, never that they definitely do. Postgres still has
to read every block in the matching ranges and re-check each row by hand. When
your window is narrow and only a handful of ranges match, that recheck is cheap.
When your window is wide, it's expensive.

A 30-day window matched about 4.4 million rows, roughly 30% of the table. At
that point the planner did the sensible thing and gave up on the index entirely:
if you’re going to read a third of the table anyway, the bookkeeping of a lossy
index is pure overhead, so it fell back to a parallel sequential scan. That scan
took about 89 seconds. The 90-day window was worse.

But then I started thinking about this differently. A sequential scan reads the
whole table no matter how wide your window is. One day or ninety days, same
cost, because it reads everything either way. There is no index in the world
that fixes this, because the problem was never finding the rows. The problem is
that there are simply too many of them to count on demand. The BRIN index was a
good answer to a subset of the question.

## Second attempt: a rollup table

Alright, counting fifteen million florbs on every request is too slow, let's not
do that. How about counting them once ahead of time, and keep the running totals
around?

That’s a rollup table. Mine pre-aggregates the florbs by day, at a grain of
(tenant, day, status). A whole day’s worth of florbs for a given tenant and
status collapses into a single row holding a count. A wide-window query then
sums a few thousand pre-aggregated rows instead of scanning millions of raw
ones.

There is one design decision here that matters more than all the others: **store
the raw data, never the finished answers.** It is tempting to store an
`average_duration` or a `failure_rate` directly. Don’t do that. If you want to
combine two days, a stored average is useless, because the average of two
averages is a lie unless both days had exactly the same number of florbs.

So instead of an average I store a `sum_duration_ms` and a `duration_count`, and
instead of a rate I store the raw counts per status. Then any span of days
reconstructs perfectly: the failure rate is `SUM(failed) / SUM(total)`, and the
average duration is `SUM(sum_duration_ms) / SUM(duration_count)`, both computed
at read time over however many days you asked for. Same numbers as the live
query, every single time.

The cool side effect is that this table barely grows. Its size depends on the
number of tenants, statuses, and days, not on the number of florbs. A year of
history is a few hundred thousand rows, which is kinda nothing.

Reads route themselves by window width. Narrow windows (under a week) still hit
the live table through the BRIN index, where they’re fast, exact, and perfectly
fresh. Wide windows hit the rollup. Best of both worlds.

### Keeping it fresh

The rollup is rebuilt by a small loop that runs inside the app itself: refresh
once on startup, then every fifteen minutes. Since many instances of the app are
running, they all coordinate through a Postgres [advisory lock][3], so exactly
one of them does the work at a time and the rest happily do nothing (execute but
no-op). No cron, no extra service, no new infrastructure, fresh and frugal.

Two interesting implementation details here. First, each refresh deletes and
rebuilds a trailing window of days rather than upserting, because a florb can
change its verdict after the fact (it goes from still florbing to florbed or
failed), which means a bucket’s count can go _down_, and an upsert would never
notice. Second, it only recomputes the last few days, because a florb’s
timestamp never changes once it is created, so older buckets are already final.
That recompute is a quick, BRIN-assisted scan of recent rows. There's one
assumption here, based on my florbs behavior: the trailing window has to be at
least as long as a florb can take to settle. If a florb could keep florbing for
longer than the window, it would age out still counted as running, and its final
verdict would never make it into the rollup. Your florbs may behave differently.

There is also a small downside: rollup answers can be up to fifteen minutes
stale, and they are aligned to day boundaries at the very edges of the window.
On a 90-day dashboard, it's a rounding error. On the narrow windows where you
would actually notice, you’re reading the live table anyway, so it doesn’t
apply.

## The data model, if you want to steal it

Here is the whole pattern, anonymized into the florb domain, ready to adapt. The
base table is whatever you already have; the only assumptions are a timestamp
and a status:

```sql
-- The table you already have. Append-mostly, naturally ordered by time.
CREATE TABLE florbs (
    id          BIGSERIAL   PRIMARY KEY,
    tenant_id   INTEGER     NOT NULL,
    status      TEXT        NOT NULL,  -- 'running' | 'completed' | 'failed'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms BIGINT                 -- NULL until the florb finishes
);
```

Step one, the BRIN index, for the narrow windows (foreshadowing: this exact
index is the villain of the sequel below, so read to the end before copying):

```sql
CREATE INDEX CONCURRENTLY idx_florbs_created_at_brin
    ON florbs
    USING BRIN (created_at)
    WITH (pages_per_range = 32);
```

Step two, the rollup table. Notice that it stores counts and duration
components, never averages or rates:

```sql
CREATE TABLE florb_daily_stats (
    tenant_id       INTEGER     NOT NULL,
    day             DATE        NOT NULL,  -- (created_at AT TIME ZONE 'UTC')::date
    status          TEXT        NOT NULL,
    count           BIGINT      NOT NULL DEFAULT 0,
    sum_duration_ms BIGINT      NOT NULL DEFAULT 0,
    duration_count  BIGINT      NOT NULL DEFAULT 0,
    refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, day, status)
);

CREATE INDEX idx_florb_daily_stats_day ON florb_daily_stats (day);
```

Step three, the refresh. Delete a trailing window and rebuild it in one
transaction, behind an advisory lock so only one process runs it. Here `$1` is
something like today minus three days:

```sql
SELECT pg_try_advisory_xact_lock(8675309);  -- losers no-op; one runner at a time.

-- $1 must be a UTC-midnight boundary, or the oldest day is deleted but only partly rebuilt.
DELETE FROM florb_daily_stats
WHERE day >= ($1 AT TIME ZONE 'UTC')::date;

INSERT INTO florb_daily_stats
    (tenant_id, day, status, count, sum_duration_ms, duration_count, refreshed_at)
SELECT tenant_id,
       (created_at AT TIME ZONE 'UTC')::date AS day,
       status,
       COUNT(*),
       COALESCE(SUM(duration_ms), 0),
       COUNT(duration_ms),
       NOW()
FROM florbs
WHERE created_at >= $1
GROUP BY tenant_id, day, status;
```

And finally the read, reconstructing the stats from the stored components over
whatever window you want:

```sql
SELECT
    SUM(count)                                            AS total,
    SUM(count) FILTER (WHERE status = 'completed')        AS completed,
    SUM(count) FILTER (WHERE status = 'failed')           AS failed,
    SUM(count) FILTER (WHERE status = 'running')          AS running,
    SUM(sum_duration_ms) / NULLIF(SUM(duration_count), 0) AS avg_duration_ms
FROM florb_daily_stats
WHERE day >= $1 AND day <= $2;
```

That last query is the whole point. It touches a few thousand rows, reconstructs
the same totals and averages the live query would have computed, and returns
fast. Add a `tenant_id` filter and you get a per-tenant view out of the same
table.

## Proof: reading the query plans

Data trumps debate, so let’s look at what Postgres actually did. An
`EXPLAIN ANALYZE` on the two paths tells the complete story.

First, the wide-window query against the live table, the one we’re trying to
avoid (a narrower window than the 90-second worst case, but still wide enough to
make the point):

```text
Parallel Bitmap Heap Scan on florbs
  Index: idx_florbs_created_at_brin
  Heap Blocks: lossy=154514
  Rows Removed by Index Recheck: 26511
  Buffers: read=416403            (~3.3 GB off disk)
  rows ≈ 1.78M
Execution Time: 11014 ms
```

Everything painful is right there. `Heap Blocks: lossy` and
`Rows Removed by Index Recheck` are the BRIN tax: Postgres visited about 154,000
blocks the index said _might_ match, then threw away the rows that didn’t. It
read about 416,000 pages, roughly 3.3 GB, and aggregated 1.78 million rows, even
with parallel workers helping. Eleven seconds, and that was one of the faster
runs. The grouped variant took about 13.6 seconds.

Now the same question, answered from the rollup:

```text
Bitmap Index Scan on idx_florb_daily_stats_day
  Index Cond: day >= '2026-06-01' AND day <= '2026-06-14'
Bitmap Heap Scan on florb_daily_stats
  rows = 3031   Buffers: read=240
Execution Time: 29.875 ms
```

Three thousand rows instead of nearly two million. Two hundred and forty pages
instead of four hundred thousand. About 30 milliseconds cold, and under 10
milliseconds once the cache is warm. That works out to roughly 370 times faster
while reading around 1,750 times fewer pages.

Same numbers out, three orders of magnitude less work to get them.

## One month later: the BRIN betrayal

This post originally ended right below this section, lessons learned and all. I
published it, felt pretty good about it, and moved on. A month later I opened
the database monitoring page and found a single query eating between three
quarters and nine tenths of all query time on the cluster. Not a dashboard
query. The refresh. The one I described up there as “a quick, BRIN-assisted
scan of recent rows”.

It was neither quick nor BRIN-assisted. The plan showed a full sequential scan
of what had grown to twenty-four million florbs: eleven and a half gigabytes
read off disk, nine minutes on average, thirteen on bad days, every fifteen
minutes, to produce roughly a thousand rollup rows. The refresh loop was
spending 60% of its life re-reading the entire table, and the buffer cache hit
ratio was 2.5%, which for a query that touches everything is less a metric and
more a cry for help.

The whole setup rested on one sentence from earlier: “florbs are append-mostly,
and they arrive roughly in time order.” Half of that is true. They do arrive in
time order. But every florb also mutates at least once in its life, when it
stops florbing: the status flips to a final verdict, and the duration gets
filled in. And in Postgres, an UPDATE never modifies a row in place. It writes
a brand new row version wherever there happens to be free space, which is often
a different page entirely. There is an optimization ([HOT updates][4]) that
tries to keep the new version on the same page, but it’s off the table the
moment the update touches any indexed column, and status was indexed. So every
florb that finished, teleported. A row created in March now physically lives
between two rows created in June.

Do that a few million times and the BRIN’s little min/max summaries stop
summarizing. Every block range holds a mix of ancient and fresh florbs, so
every range’s min/max stretches to cover months, so no range can ever be
skipped, so the index is decoration. Postgres even keeps a number for this,
[`pg_stats.correlation`][5]: 1.0 means the column’s values are laid out on disk
in perfect order, 0 means confetti. Mine was confetti. The planner looked at
the lossy index, looked at the table, correctly computed that the index would
skip nothing, and fell back to the crawl. Every fifteen minutes. For a month.

The BRIN was never wrong. My mental model of my own table was.

There was a supporting act too: with default settings, autovacuum on a table
this size doesn’t bother showing up until almost five million rows are dead.
Mine was sitting on well over a million dead tuples, a day and a half behind
schedule, and all that scattered free space is exactly where updated florbs
love to teleport into.

## The boring fix

The final thoughts below, kept intact from the original post, spend a whole
paragraph explaining why I didn’t want a B-tree. The fix is a B-tree:

```sql
-- One entry per row, keyed by value. Doesn't care where rows live on disk.
CREATE INDEX CONCURRENTLY idx_florbs_created_at ON florbs (created_at);

-- Goodbye, sweet prince.
DROP INDEX CONCURRENTLY idx_florbs_created_at_brin;

-- Vacuum at ~250k dead florbs instead of ~5M.
ALTER TABLE florbs SET (
    autovacuum_vacuum_scale_factor  = 0.01,
    autovacuum_vacuum_threshold     = 10000,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_analyze_threshold    = 10000
);
```

In fairness to past me, the B-tree I rejected back then was a different beast:
a big covering index meant to make wide-window aggregation index-only, which
would still scale with the number of rows matched. This one is plain and
narrow. It serves the refresh and the narrow live windows, where a three-day
slice of twenty-four million rows is exactly the selective range scan B-trees
are good at, and physical row order is irrelevant because each index entry
points at its row wherever it happens to live. The rollup still owns the wide
windows. The architecture survived; the index underneath it didn’t.

The refresh goes from crawling the whole table to an index range scan over a
few days of florbs, and everything else on the cluster breathes easier too,
because a nine-minute full-table scan every fifteen minutes was flushing the
buffer cache for everyone. All three statements are online, by the way:
`CONCURRENTLY` builds and drops take no blocking locks, and the autovacuum
change is a metadata flip.

## Final thoughts

I did consider other options before reaching for a second table. A big covering
B-tree index would have made the scan index-only, but it scales with the number
of rows matched, so 90-day windows would still be measured in seconds, and it is
a large index to maintain on every insert. A dedicated time-series database is
the textbook tool for this kind of question, except that florbs mutate after
they are created, and most time-series stores really don’t want you updating
points after the fact, so it was the wrong shape for the data. The data could
have been modeled differently in this scenario, but it still implied adding an
extra infrastructure component, with its operational overhead. The boring
relational rollup won on simplicity.

**Lessons learned** (now with sequel-flavored additions):

- Match the index to how you query the data, and when no index can save you,
  stop querying the raw data and pre-aggregate it.
- BRIN was the right tool for small windows and a trap for large ones, and
  knowing the difference is most of the job.
- “Append-mostly” is not “append-only”. BRIN doesn’t just need rows to arrive
  in time order, it needs them to _stay_ where they landed. If your rows mutate
  after insert, check `pg_stats.correlation` before trusting a BRIN with
  anything you care about.
- An index is not a contract. The planner re-decides on every single query and
  will quietly stop using an index that stopped making sense, especially inside
  a background job nobody watches. Read the plans of the queries you _don’t_
  see, not just the ones users complain about.
- Autovacuum’s default thresholds are percentages, and percentages of
  twenty-four million are enormous numbers. Big churny tables deserve their own
  settings.

You still wanna know what a florb is? Why? Some mysteries are load-bearing.

[1]: https://www.postgresql.org/docs/current/brin.html
[2]: https://clickhouse.com/docs/optimize/skipping-indexes#minmax
[3]:
  https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
[4]: https://www.postgresql.org/docs/current/storage-hot.html
[5]: https://www.postgresql.org/docs/current/view-pg-stats.html
