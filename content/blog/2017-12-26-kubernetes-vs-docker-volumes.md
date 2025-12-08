---
title:  "Kubernetes vs Docker: Volumes!"
date:   2017-12-26 08:19:02 +0100
tags:
- docker
- kubernetes
author: sebiwi
---

_This post was co-written by the amazing Pierre-Yves Napoly._

## Hey everybody

After reading both the Kubernetes and Docker “How does it work?” series, I
suess you can’t wait to transform your old-school infrastructure and put
all your applications inside containers. Indeed, containers are a great way to
make your applications portable and easy to deploy. Nevertheless, there is a
subject we have not discussed yet: data persistence.

Before we start, we’d like to say that there are ways to handle data that are
more cloud-oriented than volumes. These include managed relational database
services, non-relational database services, and object storage services, all of
which are easier to operate than volumes, since they harness most of the
benefits of the cloud ecosystem. Volumes seem to match better [with pets than
with cattle][1] and may be an obstacle to scalability unless you are using read
only volumes (more on this later). In any case, be sure to regularly backup
your data.

A container is created from a fixed image, and all its changes are lost when
re-instantiating the image into a new container. It is an ephemeral resource.

![Ephemeral resource](/images/kube-vs-swarm/1/ephemeral-resource.jpg)

How can we make sure that all the data in the container is persisted somewhere?
You could snapshot the container into a new image, but there is a limit in the
number of time you can do that. And what if your container dies? What if the
machine that’s hosting the image dies? If you see yourself in one of the
previous situations you should probably take a look at Volumes.

## What is a Volume?

A volume can be defined in many ways. Kubernetes says that:

> “At its core, a volume is just a directory, possibly with some data in it,
> which is accessible to the containers in a pod. How that directory comes to be,
> the medium that backs it, and the contents of it are determined by the
> particular volume type used.”

Whereas Docker says that:

> “Volumes are directories that are stored outside of the container’s filesystem
> and which hold reusable and shareable data that can persist even when
> containers are terminated. This data can be reused by the same service on
> redeployment, or shared with other services.”

Even if Docker and Kubernetes use different words to define them, we can see
that the two concepts are really similar and in both cases volumes serve the
same purpose.

## Why would anyone use them?

Basically, the two main reasons to use Volumes are data persistency and shared
resources, or in other words, to be able to keep your data if your container
dies, or to share data between multiple containers. These shared resources also
include Secrets, which can be made available to containers/pods through
Volumes.

How are you supposed to do that though? The solution to this problem is not
easy. Are Volumes binded to a single node? How are multiple containers located
on different hosts supposed to use them then? Are they hosted on a single
machine? Are they even hosted on a machine? Do you even Volume?

The answer to this is basically different implementations for different needs.
There are many types of Volumes (Types for Kubernetes, and Drivers for Docker),
each one with its own advantages and drawbacks.

Let’s take a look at some of them, shall we?

## Kubernetes Volumes

Kubernetes came out with the notion of Volume as a resource first, then Docker
followed.  There are many Volume types. When I say many, [I mean a lot][2]. You’ve
got local, node-hosted Volume types like emptyDir, hostPath, and local (duh).
You also have Volume types that are hosted on Cloud IaaS platforms, such as
gcePersistentDisk (GCE), awsElasticBlockStore (AWS), and AzureDiskVolume
(Azure). Some Volumes are even backed on traditional storage solutions, like
nfs, iscsi, or fc (fibre channel). Others can be backed on modern, distributed
file systems, like flocker, glusterfs and cephfs.

![Kubernetes logo](/images/kube-vs-swarm/1/kube-logo.png)

There’s no way we can describe all of them in a single article. We just can’t.
I’m sorry. We’ll do a couple of important ones though.

The simplest kind of volume is the emptyDir Volume. These are created when a
Pod is assigned to a node, and they exist for as long as the Pod keeps running
on the node. If the Pod is removed from the node, the Volume is deleted. Then
you have basic, but more complex kind of Volumes: the hostPath Volumes. These
mount either a file or a directory from the node’s filesystem into the Pod
itself. Yay, volumes!

These are great and all, but they do not actually provide us with the
persistence we’re looking for. The resources are either linked to the execution
and lifetime of the Pod, or to the underlying host, which is precisely what we
do not want.

In order to have persistent Volumes with a different lifecycle than your pods,
you will need to use a different volume type. We’re going to see how this works
using the awsElasticBlockStore type based on the AWS EBS managed service.

Basically, and as the name already hints, this type of Volume is backed against
an AWS Elastic Block Storage volume. This is cool because the contents of the
Volume will continue to exist, even if the Pod is removed: the EBS volume will
just be unmounted. There are some requirements for these to work: all the
cluster nodes must be EC2 instances, which need to be in the same availability
zone as the EBS volume, and a volume might only be mounted by a single
instance. Wanna see it? Hands to work!

First, you will need a Kubernetes cluster running on AWS. There are many ways
to achieve this. I’ll be using [minikube][3] for this one, but you can use [kops][4] if
you wanna go for a big scale cluster.

Then, you will need a working EBS volume, with and its ID. You can create that
using the web console, or with the AWS CLI, like so:

```bash
aws ec2 create-volume --availability-zone=eu-west-1b --size=5 --volume-type=gp2
```

Remember that the availability zone of the EBS volume must be the same as the
one for the ECS instances hosting the cluster.

Once you have that, you only need to create a Pod, and mount the required
volume while specifying a mount point, like so:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mongo-ebs
spec:
  containers:
  - image: mongo
    name: mongo-pod
    volumeMounts:
    - mountPath: /data/db
      name: mongo-volume
  volumes:
  - name: mongo-volume
    awsElasticBlockStore:
      volumeID: <Volume-ID>
      fsType: ext4
```

I’ll name this file mongo.yml. Then all you need to do is type the following
command in order to create the pod:

```bash
kubectl create -f mongo.yml
```

This will create the pod with the associated AWS EBS volume mounted at the
specified mount path.


That was simple, right? Let’s see how we can achieve the same thing using
Swarm.

## Swarm Volumes

Swarm might not look as mature as Kubernetes: it only comes with one type of
volume natively, which is a volume shared between the container and its Docker
host. This might come in handy for testing a deployment locally, but it won’t
do the job on a distributed cluster.  Between two deployments the container on
which the volume is mounted might move from a cluster node to another. If this
happens, it will lose the data that was on the precedent node and a new empty
volume will be recreated on the new node. Ouch.

![Swarm logo](/images/kube-vs-swarm/1/swarm-logo.png)

One possible solution to palliate this problem is to associate placement
constraints with the container so it always runs on the same node. You should
never do this. It is a really nasty way to solve our problem and if your node
crashes, well… you do the math.

But yeah, you must have guessed it, there are many solutions other than local
volume. Like for networks, Docker can use [different drivers][5] to handle its
volumes even if it uses the local driver by default.

There are two ways to install the drivers:

- Launch the driver as a system service, and configure the Docker host to use it.
This is the way most drivers works for now.
- Install the driver as a Docker plugin, using the simple command:

```bash
docker plugin install rexray/ebs
```

Super simple right? Docker is gonna search for the plugin container on the
Docker Hub and it’s going to download it right after. Sadly, very few plugins
are available as of this moment. This will most likely change in the near
future.

A great volume driver which can be installed as a Docker plugin is REX-Ray. It
is compatible with multiple storage providers and it is agnostic of the
provider it’s using, bringing better user experience to the balance.

Let’s say we have a Swarm cluster and we need a Mongo database for an
application running on the same Swarm cluster. We are going to launch a Mongo
container that belongs to the same network as our application and map an EBS
volume to it using REX-ray to ensure data persistency.

To use EBS volumes, we need to provide credentials. This can be achieved in
three different ways:

- By associating an AWS IAM role to the instance running Docker
- Through a REX-ray configuration file
- Through configuration variables while installing the plugin

First we are going to install REX-Ray on our Swarm manager using a simple
command:

```bash
docker plugin install rexray/ebs EBS_ACCESSKEY=access_key EBS_SECRETKEY=secret_key
```

Then we create a Docker volume using REX-ray:

```bash
docker volume create \
--driver rexray/ebs  \
--opt size=5         \
--opt volumetype=gp2 \
--name ebs_vol
```

This is going to create a 5 gigabytes EBS volume of gp2 type gp2.

All we have to do now is to launch a new Docker service using the MongoDB
official image and map the volume to Mongo’s data directory:

```bash
docker service create           \
--network my_overlay_network    \
--replicas 1                    \
--mount type=volume,src=ebs_vol,target=/data/db \
--name mongodb mongo
```

We now have a Mongo container accessible by all containers on
my_overlay_network at mongodb:27017, which ensures data persistency if the
service stops. Isn’t that great?

From what I’ve seen so far, this is the best way to handle volumes with Swarm.
Note that you’ll have to implement your own regular backup policy for the
volume on the storage provider. But this will be outside of Docker Swarm scope.

## Wow, that was great

Yeah, it is indeed pretty cool. We got to see what is a volume, how to use it,
and what should we use them for. We also know now how both Kubernetes and Swarm
handle their persistent data. It is nice to see that both solutions are mature
enough and capable of handling data using similar workflows. Even if the exact
procedure used to mount and use volumes is not exactly the same for the two of
them, you can see that the abstractions match in a certain way. Great minds
think alike, don’t they?

### Anyway, TL;DR

- Map volumes to you containers to ensure data persistency
- Use volumes on platform storage such as Amazon EBS or GCE Persistent Disk rather than local volumes
- Platform storage compatibility is native in Kubernetes and easily installable in Docker
- Be sure to backup your volume regularly
- If dealing with cattle, consider using replicated databases instead of volumes for better scalability

That was fun, wasn’t it? See you on the next adventure!

[1]: https://blog.octo.com/en/pet-vs-cattle-from-server-craftsman-to-software-craftsman/
[2]: https://kubernetes.io/docs/concepts/storage/volumes/
[3]: https://github.com/kubernetes/minikube
[4]: https://github.com/kubernetes/kops
[5]: https://docs.docker.com/engine/extend/legacy_plugins/#network-plugins
