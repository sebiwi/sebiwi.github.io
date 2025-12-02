---
title:  "On Operations, DevOps and soft skills"
date:   2019-01-17 07:19:02 +0100
tags:
- software craftsmanship
author: sebiwi
---

## Let’s talk about communication for a bit.

One of the most interesting roles I’ve had to fulfill the last couple of years
has been the “Operations guy working as a part of a Development team”. This is
a fascinating situation to find yourself in. Allow me to elaborate.

Historically, Operations teams have been isolated from Development teams. **Two
separate organizational entities**. The reasons for this were manifold:
Operations people were a scarce resource, they needed to accommodate vast
amounts of work for numerous Development teams (server provisioning for team A,
middleware configuration for team B, application deployment for team C), it
made sense for management to group people into teams using their skillset as
sorting criteria... you name it. In the end, most interactions between
Development teams and Operation teams happened through ticketing systems.


![Effective communication](/images/soft-skills/effective-communication.jpg)
<figcaption class="caption">Effective communication</figcaption>

These workflows created and fueled most of the **communication issues** within
organizations, and by doing so, created **gargantuan bottlenecks** on the
development/deployment pipelines. Applications and services took months or even
years to ship into production. This, needless to say, was frustrating for
everyone involved in the process. It also had a huge impact on Time to Market.
No one was happy.

While these situations still occur nowadays, the incorporation of Agile
approaches into Software Development is becoming increasingly common, and its
impact on Operations is clearly visible from an organisational point of view.
It is not rare, for example, to see **Feature Teams within an organization.**
These are **cross-functional**, which means that they tend to incorporate many
different profiles into their ranks. From conception, design, and
implementation, up to deployment, product owners and designers will be working
hand in hand with developers. This most likely means that an **OPS will also be a
part of the team.**

## How is that a game changer?

When working as an OPS in a Development, Feature or Product team, **most of your
responsibilities will shift**, whether you realize it or not. It will not be
about taking team X’s artifact and deploying it on servers A, B and C anymore.
It is **your team now**, and therefore, **your artifact and your servers.** You will
most likely have to deal with a lot of things you are not used to dealing with.

**This is a good thing. Embrace it.**

It is an opportunity. If you do things right, you will be able to:

* Use and apply your knowledge regarding technical architecture and systems. This
may concern not only the application itself, but also every service or platform
involved.
* Facilitate discussions and answer questions regarding your areas of
expertise. Once again, this not only includes the application, but also the
components around it.
* Show people what you do everyday, and how you do it.
What’s the point of your work? Is it actually necessary? Isn’t it something
that needs to be done only at the beginning of an application’s lifetime?
* Improve the team’s dynamics: help them grow, and help them care. Don’t hold
back: from good development practices applied to Operations, to workshops on
existing processes.
* Learn, to a vast extent.

Under this light, the role of an OPS inside a development team is virtually
Tech Leading, focusing on operational aspects. In short, it’s mostly about soft
skills (even though technical skills are still required), about the ability to
express ideas, vulgarize subjects, solve issues, analyze and solve problems,
and share knowledge with your team. That’s a tremendous change. **And the basic
ingredient for all of these is kindness.**

## On technical architecture

When working on an organizational setup like this, there is a high chance that you
will be the most technical person on the team. When I say technical, I mean
with the biggest background on Linux/Windows systems, middleware, networks and
virtualisation. **If not, that’s great news.** It means that you will have people
with whom you will be able to discuss all of these subjects. Someone who will
be able to challenge you, or remind you what’s important when you’re having
tunnel vision. In any case, you will most likely have to propose solutions to
many different issues.

At some point you will have to deploy your application and its dependencies
somewhere. That’s where your knowledge on the subject comes in. Web servers,
application servers, reverse proxies, caching systems, databases, failover,
high availability, disaster recovery... These are all things you will have to
analyze. Should you use nginx or Apache? PostgreSQL or MySQL? The answer is
always the same: **it all depends on your needs**. Try to analyze what you need
before proposing a solution. Leverage your experience when doing so.

Be cautious: **this does not mean that you need to make all of these decisions
all by yourself.** There are trade-offs for every single choice you will make.
These trade-offs will not only impact the functioning of the application
itself, but also its development. This means that their opinion on the matter
is paramount. Your role is to explain the different options to the people that
are concerned by the choice. Remember, consensus is key. Embrace challenge too.
For good ideas, you need human interaction, healthy conflicts, argument and
debate. When doing so, remember to be kind. Don’t impose your opinions on
everyone else. Be constructive. And this is not specific for this section.
There should be an acronym for this, **RTBK**. It should be used way more often
than [RTFM][1].

This also applies to Continuous Integration and Continuous Deployment. What is
the simplest workflow in order to take the application’s source code, shape it
into the actual application and make it accessible to users? This has
tremendous value: it will allow you to automate time-consuming, repetitive
tasks, creating a safe automated pipeline, which will in turn allow everyone to
concentrate on delivering value. A piece of advice: start small, and work your
way up to something that suits your needs. “Simple is better” should be your
mantra. Once again, apply the knowledge acquired from previous experiences when
doing so.

![Why do you keep using Jenkins if you hate it?](/images/comics/2018-04-09-dear-jenkins.jpg)
<figcaption class="caption">Improve, based on your experiences</figcaption>

## On facilitating interactions

More often than not, people on your team will have questions regarding your
field of expertise.  Discussions will be held on subjects you know in depth. A
lot of terms will be thrown around: availability, redundancy, stress testing,
    building and deployment. Once again, **if they know everything there is to know
    about these subjects, that’s a good thing too**. Either way, you might want to
step in and catalyze the discussion.

![Individuals and interactions overs processes and tools](/images/comics/2018-01-29-communication.jpg)
<figcaption class="caption">Individuals and interactions over processes and tools</figcaption>

Before doing so, **remember to be kind**. It is a key aspect in human interaction,
and it will encourage participation, collaboration, and innovation.

First off, explain the meaning of every concept being discussed to everyone. **It
is crucial for every single person on the team to share the same language in
order to have effective interactions**. When having discussions about the
“bastion”, one person may be talking about the web interface of a Cloud
provider, whereas another one might be talking about a Linux server.

Be clear with your communication. **More specifically, work on your
vulgarization. I can’t stress this enough**. The ability to express complex
concepts in a simple fashion is priceless. It’s one of the most valuable skills
you can learn. They don’t necessarily need to know every single detail on the
subject. It is not the same, saying “there was a problem with the application’s
configuration” than “the application crashed because we forgot to set the
heap’s maximum size”. A fundamental part of the vulgarization exercise is to be
capable of discerning the appropriate level of technical depth for each person.

Sometimes, these discussions will start to consume the time allocated for other
purposes: stand up meetings, retrospectives, backlog grooming or others. While
it’s good to be able to facilitate these discussions, it is also important to
find the right instances to do so. If they do not exist, you can propose new
ones yourself. Or even better, just make yourself available in order to discuss
these subjects. Individuals and interactions over processes and tools.

## On sharing

A large amount of people see Operations as an impenetrable affair. It
is safe to say that it is a hard topic to grasp. This is mainly due to the huge
amount of subjects it covers. Operations entails development, systems
administration, networks and security, just to name a few. **This may sound
intimidating to most newcomers.**

Nevertheless, **this does not mean that they are not interested. They are often
just scared of the unknown**. Once people see that you are approachable, they
will start asking questions. Even if they don’t, you should ask them if there
are things that they want to learn. If things go right, you’ll get the
opportunity to share your knowledge.

Before even thinking about doing so: **RTBK**. If you don’t know what this means,
you’re skipping important parts of this article. Don’t. Go back, and take the
time to read them.

There are two fundamental reasons to share your knowledge. First, **mentoring
people is one of the most interesting and rewarding things you can do.**
Motivated people have **tremendous potential**, and if they are willing to learn
and are interested in what you do, **you can catalyze their growth to a great
extent.** Sometimes it only takes a **little push for someone to discover a great
deal of capabilities.** You just need to know how to give the right push, in the
right direction.

Second, it allows you to **spread the knowledge**. If you’re the only person
working on these subjects, you will most likely become a single point of
failure. If something happens to what you built when you are not available to
fix it, the whole system goes down. It is reasonable to want **to share that
responsibility with someone.** Do not expect them to become fully autonomous, or
a plug in replacement for you right away, they are already doing something else
as a full-time job. Still, having enough knowledge to be able to debug common
issues is already great.

![Fullstack DevOps engineer](/images/soft-skills/fullstack-devops-engineer.jpg)
<figcaption class="caption">Fullstack DevOps engineer</figcaption>

The most efficient form of knowledge sharing is pair programming. It is
fundamental that everything that is going on is completely understood. You
can’t expect people to pick up Infrastructure as Code without having any
knowledge on Linux systems, for example. This is not necessarily an issue, as
you can teach them as you go. Make sure they understand what’s going on, and do
it often. Ask them to reformulate what you just said: drawing things works
great for this purpose.

This is probably going to be a good exercise for you as well. Explaining a
concept to someone forces you to structure it differently in your head, and it
will allow you to know if you fully understand it too. If you do not, you can
look up the answer together. This is not a problem. More on this in the next
section.

Later on, you can give them tasks you would normally work on by yourself. When
doing this, the most important part is to be able to select the right amount of
work, with the right complexity. It must be challenging enough for them to feel
excited, and not hard enough to make them frustrated. Aim for balance.

You can also use other formats in order to teach large groups of people at the
same time. Mob programming works great too, or code katas, if you have
interesting subjects you can share. [You can teach them how to code their own
wrappers using Test-Driven Development][2], how to [test their infrastructure code][3],
 or how to [leverage monitoring or reporting tools in order to understand what’s
 going on within your system][4].

## On improving

Last but not least, you should contribute to the continuous improvement of the
team. When doing so, **remember to be kind**. Make sure everyone on the team knows
how important this is. It is a must-have quality when trying to improve as a
whole, when proposing enhancements and giving feedback. Change your
formulations, switch from “you made a mistake” to “we made a mistake”, it will
help you stay away from finger pointing. **Responsibilities should be collective.**

It’s hard to be specific on this topic, since areas of improvement will vary
from team to team. I’ll give it a try though.

At first, most people will refer to you as the DevOps of the team. Explain them
that **DevOps is not a role, but a culture of collaboration and communication**. It
should be a goal you should all aim for.

**Fail**, and fail fast, too. Champion innovation, testing new ideas, validating
them, and cope with the fact that sometimes they don’t work. It’s a good thing,
as long as you know when to seek an alternative, and you get to learn
something.

**Work on quality**. Start doing code reviews, for example, if you are not doing
them already, and include infrastructure code as well. They are most important
when trying to see what people are doing, to correct or improve certain
practices, and to share the code. Have them read your code too. At first they
will be scared, and they will tell you that they don’t want to because they
won’t have any remarks or contributions. This is not true. They will read it,
and understand how it works. If they don’t, they can come over and ask for
clarifications. No single points of failure.

**Measure everything**. Preach the importance of monitoring and observability. Let
them know how to work on code instrumentation for it to be easily observable.
Show them the benefits of having structured, clear logs, and being able to
query the platform to have immediate answers on what is going on, at any time.
They’ll be onboard as soon as you show them the advantages.

**Lead by example.** Motivate them, code with them, show them that you can do the
same things you do in standard development when you’re doing Operations. Show
them Clean Code, Test-Driven Development and refactoring, applied to
infrastructure code.

**Learn from errors and mistakes.** If you have a production incident, analyze the
root cause so that you can learn from it, and prevent it in the future. Asking
yourself five times why something happened is a great way of finding root
causes. You will often see that what you thought was a technical issue actually
has an organizational or design root cause.

**Say “I don’t know”, when you don’t know.** You are not meant to know everything.
Not knowing is not an issue. It is impossible to know everything. It is a good
thing to say it. Be honest. People will trust you more, and start doing it
themselves too.

![I don't know. Say it.](/images/comics/2018-12-03-experience.jpg)
<figcaption class="caption">"I don't know". Say it.</figcaption>

## There’s no way I’m remembering all those things

You don’t have to. It all comes down to six basic principles:

* Remember to be kind.
* Use your power for the greater good.
* Help people, explain things to them, resolve issues.
* Share what you know.
* Improve the team itself.
* Remember to be kind.

And most importantly, have fun. If it’s not fun, it’s probably not worth it.

[1]: https://en.wikipedia.org/wiki/RTFM
[2]: https://github.com/sebiwi/terraform-wrapper
[3]: https://sebiwi.github.io/blog/the-wizard-1/
[4]: https://sebiwi.github.io/blog/ara/
