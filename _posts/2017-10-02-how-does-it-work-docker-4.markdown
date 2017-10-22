---
title:  "How does it work? Docker! Episode 4 - Control your Swarm!"
layout: post
date:   2017-10-02 20:19:02 +0100
tag:
- architecure
- docker
- infrastructure as code
category: blog
author: sebiwi
---

## Code, please!

Yay, code!

First of all, we will need the actual virtual machines where our
cluster will run. We will create these using Vagrant. If you don’t
know what Vagrant is, or why are we using it, [check out this article][1].

For this deployment, we will have three Manager nodes, and three
worker nodes.  Why three Manager nodes you say? It may seem overkill,
but in order to have High Availability you need to have an odd number
of Manager nodes, otherwise, you will not get consensus from Raft. We
will see this in action later on.

We do not need an etcd cluster, since the key-value datastore is
already included in the internals of the Docker Engine, and therefore,
we will not include any machines for it.

First of all, I’ll describe the amount of machines I want and their
configurations as variables:

```ruby
# General cluster configuration
$swarm_manager_instances = 3
$swarm_manager_instance_memory = 2048
$swarm_manager_instance_cpus = 1
$swarm_worker_instances = 3
$swarm_worker_instance_memory = 2048
$swarm_worker_instance_cpus = 1
```

Afterwards, I’ll specify that I want to use the CoreOs (Contaner
Linux) Vagrant box, from an URL:

```ruby
# Box management: CoreOS
config.vm.box = "coreos-stable"
config.vm.box_url = "https://storage.googleapis.com/stable.release.core-os.net/amd64-usr/current/coreos_production_vagrant.json"
```

Just a little reminder, Container Linux is a lightweight Linux
distribution that uses container to run applications. It ships with
basic GNU utilities so you can do all your business, and some other
interesting things, like kubelet, Docker, etcd and flannel. We’ll only
be using Docker for this part. In short, CoreOS’s Container Linux is
an OS specially designed to run containers, and we’re going to profit
from that in our context. If you wanna know more about CoreOS, [check
this article][1].

We’ll configure our Manager nodes with the variables we previously
defined:

```ruby
# Swarm manager instances configuration
(1..$swarm_manager_instances).each do |i|
  config.vm.define vm_name = "swarm-manager-%02d" % i do |master|
    # Name
    master.vm.hostname = vm_name

    # RAM, CPU
    master.vm.provider :virtualbox do |vb|
      vb.gui = false
      vb.memory = $swarm_manager_instance_memory
      vb.cpus = $swarm_manager_instance_cpus
    end

    # IP
    master.vm.network :private_network, ip: "10.0.0.#{i+110}"
  end
end
```

And then we’ll do the same thing with our Worker nodes:

```ruby
# Swarm worker instances configuration
(1..$swarm_worker_instances).each do |i|
  config.vm.define vm_name = "swarm-worker-%02d" % i do |worker|
    # Name
    worker.vm.hostname = vm_name

    # RAM, CPU
    worker.vm.provider :virtualbox do |vb|
      vb.gui = false
      vb.memory = $swarm_worker_instance_memory
      vb.cpus = $swarm_worker_instance_cpus
    end

    # IP
    worker.vm.network :private_network, ip: "10.0.0.#{i+120}"
  end
end
```

Easy. If you wanna take a look at the Vagrantfile, it’s right here. Moving on.

<script type="text/javascript" src="https://asciinema.org/a/qCbprH0VYRFHDhDhXGvDUXDkE.js" id="asciicast-qCbprH0VYRFHDhDhXGvDUXDkE" async height="5"></script>

Next up, I’ll set up a Makefile with a Vagrant target, which will
create all the virtual machines, and generate a configuration file
with the SSH configuration needed to interact with them. Ill also add
a clean target, which will destroy all the machines, and it will
delete the SSH configuration file, if it exists.

```raw
.PHONY: vagrant clean

vagrant:
    "@vagrant up"
    @vagrant ssh-config > ssh.config

clean:
    @vagrant destroy -f
    @[ ! -f ssh.config ] || rm ssh.config
```

I’ll also put in a list of phony targets, since the targets previously
defined are just actions and don’t really generate files.

We’ve got the virtual machines, and the SSH configuration. For the
Ansible part, we’ll start by creating an inventory with all our six
nodes in it, separated by groups:

```
[swarm-leader]
swarm-manager-01

[swarm-manager]
swarm-manager-01
swarm-manager-02
swarm-manager-03

[swarm-worker]
swarm-worker-01
swarm-worker-02
swarm-worker-03
```

You will probably notice there is a `swarm-leader` group in the
inventory, which contains a single host. Like I said in the first
article, there might be many Managers in a cluster; Nevertheless,
there is only one Leader at any given moment. We will use this group
to launch specific actions for the Leader, common actions for all
Manager nodes using the swarm-manager group, and actions destined for
the non-Leader Manager nodes using the swarm-manager group, and
subtracting the swarm-leader group from it. This may seem complex, but
it is actually super easy, you will see.

No IP configurations over here, we’ll just use the SSH configuration
file we generated earlier. In order to do that, we have to specify it
on our ansible.cfg file. No ansible.cfg file? Just create it:

```ini
[defaults]
ansible_managed = Please do not modify this file directly as it is managed by Ansible and could be overwritten.
retry_files_enabled = false
remote_user = core

[ssh_connection]
ssh_args = -F ssh.config
```

We’ll also disable retry_files, and specify that we want to use the
“core” user when connecting to the machines using SSH.

I’ve already said this before, but CoreOS only ships with basic GNU
utilities, which means no Python. And no Python means no Ansible,
except for the raw module, the script module and the synchronize
module. What we’re going to do is that we’re going to install a
lightweight Python implementation called PyPy using only those
modules, and then use that Python implementation in order to execute
the rest of our playbook. Neat huh?

We’ll use the same role we used for the Kubernetes provisioning
project. [If you want to read more about it, like the technical
explanation behind it, you can find all the information here][2].

So basically, we’ve got a role now under
roles/bootstrap/ansible-bootstrap, which has 3 files under the tasks
directory: main.yml, configure.yml and test.yml. The configure.yml
file holds all the tasks necessary in order to install PyPy. The
test.yml file verifies if Python is correctly installed by doing
`python --version`. The main.yml file wraps these two files, adding
the `test` tag to the test.yml part:

```yaml
# filename: roles/bootstrap/ansible-bootstrap/tasks/main.yml
---

- name: Install and configure PyPy
  include: configure.yml

- name: Test PyPy installation
  include: test.yml
  tags: [ test ]

- name: Gather ansible facts
  setup:
```

I’ll follow this approach for each role on this project, so each role
will have a smoketest, which will be enough to tell us if the
component is correctly installed. This is pretty useful in order to
test the already deployed infrastructure, as a conformance test, and
check for deltas which might need to be corrected.

Now that we have our first role, it’s time to create a playbook. Since
we’ll be deploying a Swarm cluster, I’ll just name it swam.yml:

```yaml
---

- name: Bootstrap coreos hosts
  hosts: all
  gather_facts: false
  roles:
    - role: bootstrap/ansible-bootstrap
      tags: [ ansible-bootstrap ]
```

It’s quite straightforward so far, I’ll just launch the recently
created role on each hosts, without gathering facts, since Python is
not yet installed on the machines. Facts will be gathered at the end
of the role though, as seen on the previous code snippet.

Next up, tests. We’ll use molecule for the win. [I spoke to you all
about molecule on a previous article][1]. It is basically a testing tool
for Ansible code. It creates ephemeral infrastructure (either virtual
machines or containers), tests your roles on it (not only the
execution of the roles, but also the syntax and their idempotence),
and then it destroys it. Since there are no CoreOS containers, and
Virtualbox virtual machines through Vagrant being the target platform,
I’ll just use the Vagrant driver.

In order to test with molecule, I’m going to create a molecule.yml
file, in which I’m going to define the Ansible files to use for the
test, as well as the Vagrant machine’s specification and
configuration.

First, I’ll specify which Ansible configuration to use, and which
playbook to run:

```yaml
---
ansible:
  config_file: ./ansible.cfg
  playbook: swarm.yml
```

Then, I’ll specify which Vagrant box to use for the virtual machines:

```yaml
platforms:
- name: coreOS
  box: coreos-stable
  config.vm.box_url: https://storage.googleapis.com/stable.release.core-os.net/amd64-usr/current/coreos_production_vagrant.json
```

Then, what will my provider be, and how much physical resources will be used by each instance:

```yaml
providers:
- name: virtualbox
  type: virtualbox
  options:
    memory: 2048
    cpus: 1
```

After that, I’ll define the specifics of each instance, including both
hostname and IP addresses:

```yaml
instances:
- name: swarm-manager-01
  ansible_groups:
    - swarm-leader
    - swarm-manager
  interfaces:
    - network_name: private_network
      type: static
      ip: 10.0.0.101
      auto_config: true
  options:
    append_platform_to_hostname: no
- name: swarm-manager-02
  ansible_groups:
    - swarm-manager
  interfaces:
    - network_name: private_network
      type: static
      ip: 10.0.0.102
      auto_config: true
  options:
    append_platform_to_hostname: no
- name: swarm-manager-03
  ansible_groups:
    - swarm-manager
  interfaces:
    - network_name: private_network
      type: static
      ip: 10.0.0.103
      auto_config: true
  options:
    append_platform_to_hostname: no
- name: swarm-worker-01
  ansible_groups:
    - swarm-worker
  interfaces:
    - network_name: private_network
      type: static
      ip: 10.0.0.121
      auto_config: true
  options:
    append_platform_to_hostname: no
...
```

With that in place, I just need to run `molecule test` in order to
test that my infrastructure is created and configured correctly. This
is actually an oversimplification of everything that can be done using
molecule, but since [I already wrote about it on a previous
article][2],
just can just head there and read about it if you’re really
interested.

And with that, I also get to add two new (phony) Makefile target:

```
smoketest:
    @ansible-playbook -i inventories/vagrant.ini swarm.yml --tags test

test:
    @molecule test
```

The smoketest target allows me to run a conformance test on all the
already deployed infrastructure, to check for deltas and see if
something’s wrong whenever I want, and the test target allows me to
test the code on fresh, newly created infrastructure, and to check for
Ansible-specific good practices. Remember, this uses Molecule V1, so
if you try to run it using Molecule V2 it will probably not work.

Tests are set up thusly. Moving on.

## Manage: Lead and follow

Next up, we need to setup the three Manager nodes. I’ll start by
creating a swarm-leader role, under the configuration roles directory:

    roles/
    ├── bootstrap
    │   └── ansible-bootstrap
    └── configure
        └── swarm-leader
             └── tasks
                 ├── configure.yml
                 ├── main.yml
                 └── test.yml

And for this role, we’ll use the same task division strategy we used
before in order to add our smoketest.

First, the main.yml file, which is fairly simple, and only includes
the other two yaml files, using a tag for the test file:

```yaml
---

- name: Create Manager Leader
  include: configure.yml

- name: Test Manager Leader
  include: test.yml
  tags: [ test ]
```

The configure file first checks if the cluster is already on Swarm
mode. If it is, it doesn’t do anything else. If it isn’t, it creates
the first Swarm node, creating thus the Swarm cluster, which will be
joined by the subsequent nodes. It also disables scheduling on the
Leader, making sure that the Leader does not handle any workload and
that it concentrates its resources on leading the cluster:

```yaml
---

- name: Check if Swarm Mode is already activated
  command: docker info
  register: docker_info
  changed_when: false

- name: Create Swarm Manager Leader if it is not activated
  command: docker swarm init --advertise-addr {{ hostvars[groups['swarm-leader'][0]]['ansible_env']['COREOS_PUBLIC_IPV4'] }}
  when: "'Swarm: active' not in docker_info.stdout"

- name: Disable Leader scheduling
  command: docker node update --availability drain {{ groups['swarm-leader'][0] }}
  when: "'Swarm: active' not in docker_info.stdout and disable_leader_scheduling"
```

This last part is not actually necessary, specially for small
clusters. Nevertheless it is usually a good practice, since the leader
election process can be really intensive in terms of resource
consumption. The `disable_leader_scheduling` variable is defined on
the role’s defaults, and you can override it if you want your Leader
to handle workloads.

Fairly simple. Notice the `changed_when: false` parameter on the first
command task. It is there because running  `docker info` will not
change the state of the cluster, and it is therefore not a real
action, just a way of collecting information.

Next, for the smoketest, I’ll verify if the created Manager node is in
fact a Leader (which it should be, since it was the first Manager node
to be created), and whether its status is “Drain”, since the Leader
node is not supposed to handle any workload:

```yaml
---

- name: Check if Manager node is Leader
  shell: docker node ls | grep {{ ansible_hostname }}
  register: docker_info
  changed_when: false

- name: Fail if Manager node is not Leader
  assert:
    that:
      - "'Leader' in docker_info.stdout"
      - "'Active' in docker_info.stdout"
```

Now that the role is set, I’ll just add it to the swarm.yml playbook:

```yaml
- name: Create Swarm Leader node
  hosts: swarm-leader
  roles:
    - role: configure/swarm-leader
      tags: [ swarm-leader ]
```

Using the host group we discussed earlier, and the proper tag in order
to identify the action. And that’s it for the Manager Leader. We need
some non-Manager Leader for that High Availability though!

So we’ll just repeat the previous process, we’ll create a
swarm-manager role up next, with the same structure of the previous
role (main.yml, configure.yml, test.yml).

I won’t show you the main.yml: it is basically the same one we saw
before. The configure.yml file, on the other hand, checks if Swarm
mode is activated on the node, the same way the Leader role does, but
if it isn’t, it recovers the token needed to join the cluster as a
Manager node from the Leader node, and joins the cluster with it. If
Swarm mode is already activated, it does nothing:

```yaml
---

- name: Check if Swarm Mode is already activated
  command: docker info
  register: docker_info
  changed_when: false

- name: Recover Swarm Leader token
  shell: docker swarm join-token manager | grep token | cut -d ' ' -f 6
  register: leader_token
  when: "'Swarm: active' not in docker_info.stdout"
  delegate_to: "{{ groups['swarm-leader'][0] }}"

- name: Join Swarm Cluster as Manager
  command: docker swarm join --token {{ leader_token.stdout }} {{ hostvars[groups['swarm-leader'][0]]['ansible_env']['COREOS_PUBLIC_IPV4'] }}
  when: "'Swarm: active' not in docker_info.stdout"

- name: Disable Manager scheduling
  command: docker node update --availability drain {{ ansible_hostname }}
  when: "'Swarm: active' not in docker_info.stdout and disable_manager_scheduling"
```

Notice the `delegate_to` option on the token recovery task. This needs
to be done because the token must be recovered from the Leader node
and the Leader node only. Scheduling is also disabled on these nodes,
by default, because of the reason specified above on the Leader node.
This time, the `disable_manager_scheduling` variable is also defined
on the role’s defaults. You can override this variable if you want
your Managers to handle workloads.

The test file verifies different  things as well:

```yaml
---

- name: Check if node is Manager
  shell: docker node ls | grep {{ ansible_hostname }}
  register: docker_info
  changed_when: false

- name: Fail if node is not Manager
  assert:
    that:
      - "'Reachable' in docker_info.stdout"
      - "'Drain' in docker_info.stdout"
```

It recovers the nodes information, and then it verifies that the node
Manager type is `Reachable` rather than `Leader`, as it was for the
Leader node. It also verifies that the nodes are “drained” since we
don’t want them to run containers.

Finally, once the role is ready, I’ll add it to the swarm.yml file:

```yaml
- name: Create Swarm Manager nodes
  hosts: swarm-manager:!swarm-leader
  roles:
    - role: configure/swarm-manager
      tags: [ swarm-manager ]
```

Notice the `!` sign on the hosts part of the play. This specifies that
we want to run the role on every node on the swarm-manager group, that
isn’t in the swarm-leader group, thus preventing the Leader node to
try to join the cluster as a non-Leader Manager. Sweet!

Once we finish all this, we should have everything we need
Manager-wise. Time to get some Workers running! I’ll probably talk to
you about that on the next article though.

Stay in touch!

[1]: https://sebiwi.github.io/how-does-it-work-kube-3/
[2]: https://sebiwi.github.io/how-does-it-work-kube-4/
