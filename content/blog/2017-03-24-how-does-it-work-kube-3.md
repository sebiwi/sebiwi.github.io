---
title:  "How does it work? Kubernetes! Episode 3 - Infrastructure as code: the tools of the trade"
date:   2017-03-24 20:19:02 +0100
tags:
- kubernetes
- infrastructure as code
author: sebiwi
---

## I understand the SDN-related issues. Tell me about Infrastructure as Code already

Alright. Whenever I think about automating the creation of a platform or an application
using [Infrastructure as Code][1], I think about three different stages: provisioning,
configuration and deployment.

**Provisioning** is the process of creating the virtual resources in which your application
or platform will run. The complexity of the resources may vary depending on your platform:
from simple virtual machines if you're working locally, to something slightly more elaborate
if you're working on the cloud (network resources, firewalls, and various other services).

**Configuration** is the part in which you configure your virtual machines so that they can behave
in a certain way. This stage includes general OS configuration, security hardening, middleware
installation, middleware-specific configuration, and so on.

**Deployment** is usually application deployment, or where you put your artefacts in the right place
in order to make your applications work on the previously configured resources.

Sometimes, a single tool for all these stages will do. Sometimes, it will not. Most of the time
I try to keep my code as simple and replaceable as possible (good code is easy to delete, right?).
Don't get me wrong, I won't play on hard mode or try to do everything using shell scripts.
I'll just try to [keep it simple][2].

But let me talk to you a bit about CoreOS first.

## Less is more: Enter CoreOS (yeah yeah, Container Linux)

Container Linux by CoreOS (formerly known as CoreOS Linux, or just CoreOS) is a lightweight Linux
distribution that uses containers to run applications. This is a game changer if you're used to
standard Linux distributions, in which you install packages using a package manager. This thing
doesn't even have a package manager.

{{< figure src="/images/how-does-it-work-kube/3/coreos-package-manager.png" class="bigger-image" alt="CoreOS package manager" caption="Now what?!" >}}

It just ships with the basic GNU Core Utilities so you can move around, and then some tools
that will come in handy for our quest. These include [Kubelet][3], [Docker][4], [etcd][5] and [flannel][6].
I'll explain how these things work and how I'm going to use them in the whole Kubernetes journey
later. Just keep in mind that CoreOS (yeah yeah, Container Linux) is an OS specifically
designed to run containers, and that we're going to take advantage of that in our context.

![CoreOS distribution](/images/how-does-it-work-kube/3/coreos-explanation.png)
<figcaption class="caption"><a href="https://coreos.com/why/#distro">CoreOS as a distribution</a></figcaption>

_So we're going to manually create these CoreOS virtual machines before installing Kubernetes, right?_

**Well, no, not really.**

## Provisioning: Vagrant to the rescue

Vagrant is pretty rad too. It allows you to create reproducible environments based on virtual
machines on many different backends, using code. So you just write something called a Vagrantfile,
in which you specify all the machines you want and their configuration using Ruby. Then, you type
`vagrant up` and all your virtual machines will start popping up.

For this we're using VirtualBox as a provider. [There are many others][7], in case you're feeling creative.

_So, once we have all the virtual hosts we need running in our computer, we're just going to
manually configure everything in them, right?_

**Well, no, not really.**

## Configuration and Deployment: Ansible zen

You do know Ansible, right? Just so you know, an ansible is a category of fictional device or
technology capable of instantaneous or superluminal communication. The term was first used in
Rocannon's World, a science fiction novel by Ursula K. Le Guin. Oh, it is also an IT automation tool.

I really like Ansible because _most of the time_, the only thing you need in order to use it is a
control machine (which can be the same computer you're using to code) and SSH access to the
target hosts. No complex architectures or master-slave architectures. You can start coding right away!

_Note: This is not one of those cases, but we'll get to that in the next article._

_So, we can configure our platform automatically using Ansible. We're just going to create our
machines automatically, configure our resources automatically, and just hope it works, right?_

**Well, no, not really.**

## Test and conquer: Molecule

[Molecule][8] is a testing tool for Ansible code. It spins up ephemeral infrastructure, it test
your roles on the newly created infrastructure, and then it destroys the infrastructure. It
also checks for a whole range of other things, like syntax, code quality and impotence,
so it's pretty well adapted for what we're trying to do here.

![Molecule logo](/images/how-does-it-work-kube/3/molecule-logo.png)
<figcaption class="caption">It's an actual molecule!</figcaption>

There are 3 main Molecule drivers: Docker, OpenStack and Vagrant. I usually use the Docker
driver for testing roles, due to the fact that a container is usually lightweight, easy to
spin up and destroy, and faster than a virtual machine. The thing is that it's hard to
create a CoreOS container, in order to install Kubernetes to create more containers. Like,
I heard you like containers so let me put a container inside your container so you can schedule
containers inside containers while you schedule containers inside containers. Besides, there
are no CoreOS Docker images as of this moment. Therefore, we'll be using the Vagrant driver.
The target platform just happens to be Vagrant and VirtualBox. Huh.

So we're going to test our code on VirtualBox virtual machines launched by Vagrant, which is
exactly the platform we're using for our project. Great.

## Excellent, just show me the code

I could, but I won’t. That’s all for today. I’ll talk to you about the really really fun part in the next article.

Stay tuned!

[1]: https://en.wikipedia.org/wiki/Infrastructure_as_Code
[2]: https://en.wikipedia.org/wiki/KISS_principle
[3]: https://kubernetes.io/docs/admin/kubelet/
[4]: https://www.docker.com/what-docker
[5]: https://github.com/coreos/etcd
[6]: https://github.com/coreos/flannel
[7]: https://www.vagrantup.com/docs/providers/
[8]: https://molecule.readthedocs.io/en/latest/
