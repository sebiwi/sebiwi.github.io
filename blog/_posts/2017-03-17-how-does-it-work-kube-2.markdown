---
title:  "How does it work? Kubernetes! Episode 2 - Kubernetes networking"
layout: post
date:   2017-03-17 20:19:02 +0100
tag:
- architecure
- kubernetes
- infrastructure as code
category: blog
author: sebiwi
---

## I don’t even understand what the problem is dude

Well, as I said in the previous article, communication between pods that are
hosted on different machines can be a little bit tricky. Docker will create by
default a virtual bridge called “docker0” on the host machine, and it will assign
a private network range to it.

![Docker bridge]({{ site.url }}/assets/images/how-does-it-work-kube/2/docker-bridge.png){: class="bigger-image" }
<figcaption class="caption">Super bridge (172.17.0.1/16)</figcaption>

For each container that is created, a virtual ethernet device is attached to this bridge,
which is then mapped to eth0 inside the container, with an ip within the aforementioned network range.
Note that this will happen for each host that is running Docker, without any coordination between
the hosts. Therefore, the network ranges might collide.

Because of this, containers will only be able to communicate with containers that are connected to
the same virtual bridge. In order to communicate with other containers on other hosts, they must rely
on port-mapping. This means that you need to assign a port on the host machine to each container, and
then somehow forward all traffic on that port to that container. What if your application needs to
advertise its own IP address to a container that is hosted on another node? It doesn’t actually knows
its real IP, since his local IP is getting translated into another IP and a port on the host machine.
You can automate the port-mapping, but things start to get kinda complex when following this model.

That’s why Kubernetes chose simplicity and skipped the dynamic port-allocation deal. It just assumes
that all containers can communicate with each other without Network Address Translation (NAT), that
all containers can communicate with each node (and vice-versa), and that the IP that a container sees
for itself is the same that the other containers see for it. Aside from being simpler, it also enables
applications to be ported rather easily from virtual machines to containers, since they do not have to
change the way they work network-wise.

There are many different networking options that offer these capabilities for Kubernetes: [Contiv][1], [Flannel][2],
[Nuage Networks][3], [OVN][5], [Project Calico][6], [Romana][7] and [Weave Net][8].
For this project, we will use the combination of two of these options: Calico and Flannel, or [Canal][9].

## Show me the Canal!

Alright. Let’s talk about Flannel and Calico then.

![Flannel and Calico]({{ site.url }}/assets/images/how-does-it-work-kube/2/flannel-calico.jpg){: .center-image width="360px" }
<figcaption class="caption">Great logos</figcaption>

Flannel allows inter-pod communication between different hosts by providing an overlay software-defined
network (SDN). This solves the main issue we had the Docker networking model. As I said before, when using
Docker, each container has an IP address that allows it to communicate with other containers **on the same host**.
When pods are placed in different hosts, they rely on their host IP address. Therefore, communication between
between them is possible by port-mapping. This is fine at a container-level, but applications running inside
these containers can have a hard time if they need to advertise their external IP and port to everyone else.

Flannel helps by giving each host a different IP subnet range. The Docker daemon will then assign IPs from
this range to containers. Then containers can talk to each user using these unique IP addresses by means of
packet encapsulation. Imagine that you have two containers, Container A and Container B. Container A is
placed on Host Machine A, and Container B is placed on Host Machine B. When Container A wants to talk to
Container B, it will use container B's IP address as the destination address of his packet. This packet will
then be encapsulated with an outer UDP packet between Host Machine A and Host Machine B, which will be sent
by Host Machine A, and that will have Host Machine B's IP address as the destination address. Once the packet
arrives to Host Machine B, the encapsulation is removed and the packet is routed to the container using the
inner IP address. The flannel configuration regarding the container/Host Machine mapping is stored in etcd.
The routing is done by a flannel daemon called flanneld.

![Flannel SDN diagram]({{ site.url }}/assets/images/how-does-it-work-kube/2/flannel-sdn.png){: class="bigger-image" }
<figcaption class="caption"><a href="https://github.com/coreos/flannel/blob/master/README.md#theory-of-operation">Like this, see?</a></figcaption>

Calico secures this overlay network, restricting traffic between the pods based on a fine-grained network policy.
As I said before, the default Kubernetes behaviour is to allow traffic from all sources inside or outside the
cluster to all pods within the cluster. Little reminder from the Kubernetes networking model:

* all containers can communicate with all other containers without NAT
* all nodes can communicate with all containers (and vice-versa) without NAT
* the IP that a container sees itself as is the same IP that others see it as

For security and multi-tenancy reasons, it is coherent to restrict communication between sets of pods on the
Kubernetes cluster. Calico supports the v1alpha1 network policy  API for Kubernetes. Basically what it does
is that it enables network isolation to limit connectivity from an optional set of sources to an optional
set of destination TPC/UDP ports. This does not limit the access to the pods by the host itself, as it is
necessary for Kubernetes health checks.

With that in mind, inter-pod communication can be restricted at a namespace level, or using particular network
policies, using selectors to select the concerned nodes.

I chose Flannel for the SDN part because it is the standard SDN tool for CoreOS (Container Linux), it is
shipped with the distribution, it is rather easy to configure, and the documentation is great. I chose
Calico because I wanted to use test policy-based security management on Kubernetes, and because of its
tight integration with Flannel. They both rely on etcd, which is rather cool since I’m running an etcd
cluster anyways.

By the way, Calico can be used as a standalone component, that will handle both the SDN and the network
policy-based security management. Then again, Flannel has a few additional networking options, such as
udp, vxlan, and even AWS VPC route programming (in case you ever need it).

## Ok, now I get it. So, how did you do it?

I think I have to talk to you about the way I see Infrastructure as Code, and explain the tools of the
trade first. That’s all for today though. The fun part starts in the next article.

Stay tuned!

[1]: https://github.com/contiv/netplugin
[2]: https://github.com/coreos/flannel#flannel
[3]: http://www.nuagenetworks.net/
[5]: https://github.com/openvswitch/ovn-kubernetes
[6]: http://docs.projectcalico.org/v2.0/introduction/
[7]: http://romana.io/
[8]: https://www.weave.works/products/weave-net/
[9]: https://github.com/projectcalico/canal
