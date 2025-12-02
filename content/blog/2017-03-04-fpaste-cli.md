---
title:  "fpaste-cli: Share content with magic and style"
date:   2017-03-04 10:50:02 +0100
tags:
- tips and tricks
author: sebiwi
---

## Hey people,

I hacked something together in order to highlight text and send it automatically to fpaste, then
put the fpaste link in your clipboard automatically.

## Why?

Well, I just happen to share a lot of content (code snippets, application or middleware logs, ASCII
art, you name it!) with other people using both fpaste and pastebin. It makes it easier to read
text when trying to debug something.

Basically, I really dislike this format:

![Awful hangouts message](/images/fpaste-cli/awful-message.png){: .center-image width="220px" }
<figcaption class="caption">Sigh.</figcaption>

It makes me want to rage quit. And then throw my computer out the window.
What I’ve realised is that people don't use pastebin/fpaste because it takes approximately 13
seconds to open the website, paste the content, click on post, and then share the URL.
Everyone knows that 13 seconds is way too long in 2017.

## So I just do this instead:

I highlight the stuff I want to share, I right click it, and then I click on "Send to fpaste".

![Send to fpaste example](/images/fpaste-cli/send-to-fpaste.png)
<figcaption class="caption">This looks simple, right?</figcaption>

This is a pretty cool picture by the way. It has send to fpaste, vim, and zebras on it.

Then, magically, I have an fpaste link on my clipboard, which contains the content I just
highlighted:

![Send to fpaste result](/images/fpaste-cli/send-to-fpaste-result.png){: class="bigger-image" }

Pretty cool huh? And stylish, while at it.

That being said, I use an Automator workflow in order to do the magic, so this part only works on
OS X. I would really like to do something similar on Linux, but I don't know any tools similar to
Automator that would allow to create a similar workflow.

If you think of any, please let me know!

## Why fpaste and not pastebin?

Mostly because I was working at a place where pastebin was blocked when I wrote this, and fpaste
wasn't. Besides, someone [already did it for pastebin][1]. It gave me a good starting point.

## So how do I set it up?

You just have to clone the [GitHub project][2], and then create an Automator service that sends the
highlighted text to your script as stdin. You can use the one that's already on the GitHub repo,
but you will have to adapt it depending on the location of fpaste.py in your system. You can create
a symbolic link in your path if you're really diggin' it.

![Service creation](/images/fpaste-cli/service-creation.png){: class="bigger-image" }

For the script, I didn't wrap the whole API, since I just wanted to get something working fast.
Maybe I'll do it sometime in the future. You're free to contribute as well if you feel like it.

Anyway, I just thought I'd share.

[1]: https://github.com/tupton/pastebin-cl
[2]: https://github.com/sebiwi/fpaste-cli
