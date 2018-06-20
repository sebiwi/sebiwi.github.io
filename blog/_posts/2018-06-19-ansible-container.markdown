---
title:  "Ansible Container: Chronicle of a death foretold"
layout: post
date:   2018-06-07 08:19:02 +0100
tag:
- infrastructure as code
category: blog
author: sebiwi
---

__This article was co-written by the great [Adrien Besnard][1]__

Alright, here’s what’s up:

## TL;DR

We tried Ansible Container. We’d rather keep using Dockerfiles for image
builds: creating a Docker image and provisioning servers with Ansible are two
very different things. Different in terms of lifecycle, philosophy and
workflow. So different, that in our opinion, they’re not compatible.

Wanna know why? Read on.

Disclaimer! While the current status of Ansible Container is not clear, it
seems that during the writing of this article the tool has been deprecated:
https://github.com/ansible/ansible-container/commit/2fa778a7c8d1699672314ac0b89c53554f435cb7.
After the limitations we noticed, we won't say that we didn't see that
coming...

## Friendly reminders (because we’re friendly)

### Ansible

Ansible is an automation software which allows you to do provisioning,
configuration and deployment tasks. Everything is written in a neat, simple,
easily readable YAML format, which is way better than old school Bash scripts.
But it remains code, Infrastructure as Code.

We won’t go deep into the details but we can say it has been a game-changer
regarding automated configuration and deployment because of its simplicity: you
only need SSH access to a server and that’s all. Every action is done from a
centralized server (which can be your computer, but it’s usually a CI/CD server
such as Jenkins) which connects to the other servers using SSH in order to
execute actions (most of the time, that means running Python code). Simple,
easy, efficient.

One of the cool abstraction of Ansible are the Roles which are a way to
describe how to setup an application without knowing the target host in
advance, in a reusable way.

### Docker

Docker is the de-facto container management tool. It allows you to build and
manage images, from which you can create containers. You can use Docker to do
this last part too if you want. Usually, when developing using a
container-oriented workflow, you will use Docker in order to package your
application.

Sadly, the process of creating Docker images isn’t perfect. This, for example,
is the sample Dockerfile used in order to create an Elasticsearch image:

```Dockerfile
FROM openjdk:8-jre

# grab gosu for easy step-down from root
ENV GOSU_VERSION 1.10
RUN set -x \
    && wget -O /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$(dpkg --print-architecture)" \
    && wget -O /usr/local/bin/gosu.asc "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$(dpkg --print-architecture).asc" \
    && export GNUPGHOME="$(mktemp -d)" \
    && gpg --keyserver ha.pool.sks-keyservers.net --recv-keys B42F6819007F00F88E364FD4036A9C25BF357DD4 \
    && gpg --batch --verify /usr/local/bin/gosu.asc /usr/local/bin/gosu \
    && rm -rf "$GNUPGHOME" /usr/local/bin/gosu.asc \
    && chmod +x /usr/local/bin/gosu \
    && gosu nobody true

RUN set -ex; \
# https://artifacts.elastic.co/GPG-KEY-elasticsearch
    key='46095ACC8548582C1A2699A9D27D666CD88E42B4'; \
    export GNUPGHOME="$(mktemp -d)"; \
    gpg --keyserver ha.pool.sks-keyservers.net --recv-keys "$key"; \
    gpg --export "$key" > /etc/apt/trusted.gpg.d/elastic.gpg; \
    rm -rf "$GNUPGHOME"; \
    apt-key list

# https://www.elastic.co/guide/en/elasticsearch/reference/current/setup-repositories.html
# https://www.elastic.co/guide/en/elasticsearch/reference/5.0/deb.html
RUN set -x \
    && apt-get update && apt-get install -y --no-install-recommends apt-transport-https && rm -rf /var/lib/apt/lists/* \
    && echo 'deb https://artifacts.elastic.co/packages/5.x/apt stable main' > /etc/apt/sources.list.d/elasticsearch.list

ENV ELASTICSEARCH_VERSION 5.6.8
ENV ELASTICSEARCH_DEB_VERSION 5.6.8

RUN set -x \
    \
# don't allow the package to install its sysctl file (causes the install to fail)
# Failed to write '262144' to '/proc/sys/vm/max_map_count': Read-only file system
    && dpkg-divert --rename /usr/lib/sysctl.d/elasticsearch.conf \
    \
    && apt-get update \
    && apt-get install -y --no-install-recommends "elasticsearch=$ELASTICSEARCH_DEB_VERSION" \
    && rm -rf /var/lib/apt/lists/*

ENV PATH /usr/share/elasticsearch/bin:$PATH

WORKDIR /usr/share/elasticsearch

RUN set -ex \
    && for path in \
        ./data \
        ./logs \
        ./config \
        ./config/scripts \
    ; do \
        mkdir -p "$path"; \
        chown -R elasticsearch:elasticsearch "$path"; \
    done

COPY config ./config

VOLUME /usr/share/elasticsearch/data

COPY docker-entrypoint.sh /

EXPOSE 9200 9300
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["elasticsearch"]
```

It makes you want to die, doesn’t it? It’s complex, verbose and hard to
interpret. What are the logic steps involved in the construction of this image?
If you spend some (a lot) of time reading this Dockerfile in order to
understand what it does, you will realize that it starts from an openjdk image,
it installs gosu, and then it does a lot of things in order to install
Elasticsearch.

### Ansible Container

Now imagine this: you work with your infrastructure in the cloud, and you
configure and deploy everything using Ansible. You have a huge galaxy of roles
that allow you to do many things related to your application (like installing
Java and Zookeeper, to name a few). You want to transform your workflow in
order to start using a container-based approach, but you don’t want to lose all
your Ansible resources.

What if instead of doing all that, you do this:

```yaml
---
- host: container
  roles:
  - gosu
  - elasticsearch
```

Wouldn’t that be great? Wouldn’t it? Yes it would.

So we started looking around and we realized that there’s a tool called Ansible
Container.

From its homepage:

```
WHY NOT BUILD YOUR CONTAINERS WITH ANSIBLE PLAYBOOKS? NOW YOU CAN.

Ansible Container represents an end to the command && command && command (and
so on) syntax you’ve been struggling with to build containers.
```

Sounds pretty good, doesn’t it? Let’s take a look into it.

## Let’s play!

In order to play with Ansible Container, we’re going to deploy our own simple
Scala application which uses ZooKeeper in order to manage its state.

### Our application

Our application is dead simple:
- First, it reads its configuration from the /etc/archiver.conf file
- For each cycle on configured frequency, it looks for files under the
  configured directory. If it finds any, it compresses them and then it deletes
  the original files

The fun part is that you can launch as many instances of the application as you
want, and only one of them will do the compression/deletion tasks. That’s what
Zookeeper is used for.

In order to make the application communicate with Zookeeper, we use Apache
Curator, which is a Zookeeper library. It provides many utilities we can use in
order to provide distributed lock policies and leader election.

You can see the code of our application here:
https://gitlab.octo.com/abesnard/ansible-container-zookeeper-article/tree/provision-virtual-machines/archiver.

We wanted to create an application that needs Zookeeper because it seemed like
a coherent test case provided the assumptions stated before: we have an
Ansible-managed workflow, on virtual machines, and we’re moving towards a
container-based approach.

#### The Ansible Role

The Ansible Role is fairly simple:
- We create a user which will be used in order to run our application
- We copy the JAR
- We create the configuration file using some Ansible variables
- And finally we run everything using systemd

```yaml
---
- name: create system user
  user:
    name: "archiver"
    system: yes
    home: "/usr/lib/archiver"

- name: create directories
  file:
    path: "{{ item }}"
    owner: "archiver"
    group: "archiver"
    state: directory
  with_items:
  - "/usr/lib/archiver"

- name: copy JAR file
  copy:
    src: "archiver.jar"
    dest: "/usr/lib/archiver/archiver.jar"
    owner: "archiver"
    group: "archiver"
  register: copy_jar_file

- name: create config file
  copy:
    content: |
    archiver {
        input-folder-path = "{{ archiver_input_folder_path }}"
        output-folder-path = "{{ archiver_output_folder_path }}"
        tick-period = {{ archiver_tick_period_in_seconds }} seconds
    }

{% raw %}
    zookeeper.servers = [
        {{ archiver_zookeeper_servers | map('quote') | join(', ') }}
    ]
{% endraw %}

    lock.timeout = {{ archiver_lock_timeout_in_seconds }} seconds

    dest: "/etc/archiver.conf"
    owner: "archiver"
    group: "archiver"
  register: create_config_file

- name: create systemd service
  copy:
    content: |
    [Unit]
    Description=Archiver

    [Service]
    owner=archiver
    Group=archiver
    ExecStart=/usr/bin/java -jar "/usr/lib/archiver/archiver.jar"
    dest: "/etc/systemd/system/archiver.service"
  register: create_systemd_service

- name: reload systemd
  systemd:
    daemon_reload: yes
  when: create_systemd_service.changed

- name: start systemd service
  systemd:
    name: "archiver.service"
    enabled: yes
    state: started

- name: restart systemd service
  systemd:
    name: "archiver.service"
    enabled: yes
    state: restarted
  when: create_systemd_service.changed or create_config_file.changed or copy_jar_file.changed
```

### ZooKeeper

In a few words: ZooKeeper is a distributed and resilient key-value store. It
also provides some abstractions, making it a great solution in order to have a
distributed lock... which is exactly what we want because we only want one
instance of our Archiver application to run compression/deletion tasks at a
time.

#### The Ansible role

Because we do not want to reinvent the wheel, we’re going to use an existing
Ansible role from the Ansible Galaxy in order to provision ZooKeeper on our
machines : https://galaxy.ansible.com/AnsibleShipyard/ansible-zookeeper/.

It’s a little bit off-topic, but Ansible Galaxy is a great tool which you can
use to organize and centralize your roles. More information here: https://galaxy.ansible.com/!

### End to end

Our playbook looks quite simple :

```yaml
{% raw %}
---
- name: install ZooKeeper
  become: yes
  become_method: sudo
  hosts: zookeeper
  roles:
  - role: "AnsibleShipyard.ansible-zookeeper"
    zookeeper_hosts: "{{ groups['zookeeper'] | map('extract', hostvars, ['ansible_' + iface, 'ipv4', 'address']) | list }}"
    zookeeper_version: 3.4.12

- name: install Archiver
  hosts: archiver
  become: yes
  become_method: sudo
  roles:
  - role: "archiver"
    archiver_zookeeper_servers: "{{ groups['zookeeper'] | map('extract', hostvars, ['ansible_' + iface, 'ipv4', 'address']) | list }}"
    archiver_input_folder_path: "/shared/to-archive"
    archiver_output_folder_path: "/shared/archived"
    archiver_tick_period_in_seconds: 10
    archiver_lock_timeout_in_seconds: 1
{% endraw %}
```

As you can see, it works great on our two Vagrant boxes (it takes some time
because of the downloads of Java and ZooKeeper, but if you skip to the end...
Everything goes fine!) :

<script type="text/javascript" src="https://asciinema.org/a/186568.js" id="asciicast-186568" async></script>

## The Use-Case

### First Try

As we said before, a perfect use-case of Ansible Container is to leverage on
all the roles which have already been created in order to Dockerize existing
applications. So let’s do it: we’re going to containerize ZooKeeper and our
Archiver application...

We first write a container.yml file like this:

```yaml
---
version: "2"
settings:
  conductor:
    base: ubuntu:xenial
  project_name: ansible-container-blog
services:
  zookeeper:
    from: ubuntu:xenial
    roles:
    - role: "AnsibleShipyard.ansible-zookeeper"
    zookeeper_version: 3.4.12
  archiver:
    from: ubuntu:xenial
    roles:
    - role: "archiver"
        archiver_zookeeper_servers: [ "zookeeper" ]
        archiver_input_folder_path: "/shared/to-archive"
        archiver_output_folder_path: "/shared/archived"
        archiver_tick_period_in_seconds: 10
        archiver_lock_timeout_in_seconds: 1
    depends_on:
    - zookeeper
    links:
    - zookeeper
    volumes:
    - /tmp/shared:/shared
```

Let’s try it, and see what’s going on!

<script type="text/javascript" src="https://asciinema.org/a/186571.js" id="asciicast-186571" async></script>

It does not work, because we need to add some stuff in our role in order to
make it Docker compliant: Instead of having systemd to start a daemon, we need
to provide a Docker CMD.

If we take a step back, it’s easy to say that most of your roles are not ready
to be used as-is in a container using Ansible Container: multiple tasks are
relevant only in the context of classic servers (systemd services, firewall,
mounts, etc.). It’s due to the fact that Ansible is more that a tool to install
applications: it goes way beyond this simple use case... which is not relevant
in a Docker context.

Note that Ansible is aware of this problematic and that’s why the notion of
Container-Enabled Role has been created:
https://docs.ansible.com/ansible-container/roles/galaxy.html. So when you use
Ansible Galaxy, be aware of that!

### Second Try

Fine... We’re going to make our role compliant:
- First, add when: ansible_env.ANSIBLE_CONTAINER is not defined in the step
  which are not relevant in a container context (so in our case, everything
  which is related to systemd)
- Then add a meta/container.yml file in our Ansible role in order to tell
  Ansible Container what is the actual CMD which needs to be run:

```yaml
---
from: "ubuntu:xenial"
user: "archiver"
command: [ "java", "-jar", "/usr/lib/archiver/archiver.jar" ]
```

And here we go again!

<script type="text/javascript" src="https://asciinema.org/a/186576.js" id="asciicast-186576" async></script>

It’s alive! You can even see the Docker images which have been created by
Ansible Container (everything is properly named and tagged, which is pretty
nice) and the Conductor images (which are used by Ansible Container under the
hood to provision the containers):

<script type="text/javascript" src="https://asciinema.org/a/186578.js" id="asciicast-186578" async></script>

Just for you to know: we lied to you. We actually didn’t use the
AnsibleShipyard.ansible-zookeeper role as-is: we had to patch it for this
particular reason in order to continue our trial of Ansible Container:
https://gitlab.octo.com/abesnard/ansible-container-zookeeper-article/blob/build-containers-after-changes/ansible/roles/AnsibleShipyard.ansible-zookeeper.patch.

Ansible Container even allows us to launch everything it created by creating an
Ansible playbook which actually starts the containers... Well, let’s do it!

<script type="text/javascript" src="https://asciinema.org/a/186580.js" id="asciicast-186580" async></script>

Pretty neat, right?

## Reusage

### As-Is
We just saw that with a few minor modifications of our role, we’re now capable
of using Ansible Container in order to produce Docker images instead of
actually deploying our role to some virtual machines.

Before going straight ahead to a Kubernetes cluster, we want to be sure that we
can reuse our newly created Docker image using Docker Compose. Easy, let’s
define our docker-compose.yml file:

```yaml
---
version: "3"
services:
  zookeeper:
    image: "zookeeper:latest"
    ports:
    - 2181:2181
  archiver:
    image: "ansible-container-blog-archiver"
    depends_on:
    - "zookeeper"
    volumes:
    - "/tmp/shared:/shared:rw"
```

You can see that instead of leveraging of the ansible-container-blog-zookeeper
image, we’re going to use the official Docker image of ZooKeeper: it’s totally
possible because of the plug’n’play spirit of these images.

And run start Docker Compose:

<script type="text/javascript" src="https://asciinema.org/a/186582.js" id="asciicast-186582" async></script>

Everything is fine!

### Update configuration

And now, what I want to do is to change the frequency of the file scan.

Well... we can’t actually do this without building the images using Ansible
Container again. And for us, this is the main issue of Ansible Container: an
Ansible role is fundamentally different from a Dockerfile.

#### Build Time V.S. Run Time

And here we are... using our role (which heavily leverages Ansible’s template
module), we created a Docker image that is designed in order to work only in
the context of the architecture described in the container.yml file: the Docker
image we created cannot be used in a plug’n’play fashion. You cannot easily
reuse a Docker image which have been created with Ansible Container.

The cause of this is written in the /etc/archiver.conf file, all the value are
hardcoded in the Docker image:

```conf
archiver {
  input-folder-path = "/shared/to-archive"
  output-folder-path = "/shared/archived"
  tick-period = 10 seconds
}

zookeeper.servers = [
  zookeeper
]

lock.timeout = 1 seconds
```

The only way to update theses properties is to change the container.yml file
like this and rebuild everything... And we do think that it’s not a good
practice in a Docker context: we usually use environment variables to set or
override properties.

## Wrap Up

### Limitations

Ansible Container is not a bad tool and we actually think that it’s a good
idea: writing a Dockerfile is often a pain, and leveraging on Ansible could
have been a good idea.

But provisioning with Ansible heavily rely on the template module which sets the
properties during the provisioning, but do not permit to modify them afterward.
There is no such thing as Run Time with Ansible.

We didn’t cover that in this article, but Ansible Container is also bad at
caching stuff, which is a shame because it’s one of the best things that the
different Layers boughts by Docker provide...

### Alternatives

There are multiple ways to bypass this limitation:
- The best way is to update your application in order to make it aware of the
  environment variables (this kind of behavior is native with multiple
  configuration framework, like Spring :
  https://docs.spring.io/spring-boot/docs/current/reference/html/boot-features-external-config.html
  or Typesafe Config : https://github.com/lightbend/config) ;
- Otherwise, before starting your application in your entrypoint.sh file, you
  can use:
  - The envsubst program which will allow you to replace reference to any
    environment variable by its value when called:
    https://linux.die.net/man/1/envsubst
  - The confd program which is also a tool to fill a template using values,
    except this time the values can come from other sources like Consul, etc.:
    https://github.com/kelseyhightower/confd.

Please also note that if your Dockerfile is a mess because of the multiple
scripts it embeds, you still can put all the logic in a clean separate python
file... maybe this simple solution can also be a good start.

[1]: https://blog.octo.com/author/adrien-besnard-bes/
