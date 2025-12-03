---
title:  "Software Craftsmanship and OPS scripting: a love story"
date:   2018-08-16 07:19:02 +0100
tags:
- software craftsmanship
author: sebiwi
---

__This article was co-written by the great [Tanguy Patte][1]__.

Alright, story time fellas.

## TL;DR

We’re working with Terraform, layering and workspaces. This makes the standard
`terraform workspace select x` pretty cumbersome and dangerous. We wrote a Ruby
wrapper using Test-Driven Development. It allows us to have a tested,
maintainable and efficient solution to the aforementioned issue.

You can find the actual project here: [https://github.com/sebiwi/terraform-wrapper][2]

If you keep reading, we’re going to talk about scripting, Test-Driven
Development, Terraform and Ruby.

## In depth: Workspaces

If you’ve ever worked with Terraform, you will know that it’s quite a
particular tool. (Not so) recently, they started applying the concept of
Workspaces. This is pretty interesting, as it helps you maintain many different
infrastructure sets using the same code.

Our first impression when we started using Workspaces was that the name itself
(Workspaces) wasn’t clear enough. If you have the same feeling, please read the
following paragraph from the Terraform documentation:

> *__In the 0.9 line of Terraform releases, this concept was known as
> "environment". It was renamed in 0.10 based on feedback about confusion
> caused by the overloading of the word "environment" both within Terraform
> itself and within organizations that use Terraform.__*

So that’s that (shrug).

So why should we use Workspaces in real life? Let us take a look at some
standard Terraform code. Whereas before you would have something like this:

```
environments/
├── dev
│   ├── dev.tf
│   ├── dev.tfvars
│   └── variables.tf
├── prod
│   ├── prod.tf
│   ├── prod.tfvars
│   └── variables.tf
└── uat
    ├── uat.tf
    ├── uat.tfvars
    └── variables.tf
```

Now, you will have something like this:

```
terraform/
├── infrastructure.tf
├── dev.tfvars
├── prod.tfvars
├── uat.tfvars
└── variables.tf
```

With all the necessary `dev`, `uat` and `prod` Workspaces. You will still need
to create the Workspaces using Terraform itself, like so:

```bash
tf workspace new <workspace>
```

You can list all your Workspaces using the `terraform workspace list` command:

```bash
$ tf workspace list
    default
    dev
    prod
  * uat
```

For each Workspace, Terraform will create a new tfstate file, adding the
Workspace name as a suffix for the filename or the key name when using a remote
backend. If you don’t use Workspaces, you will still be using the `default`
Workspace.

This is phenomenal, as it allows us to reuse most of the code written for a
single environment, and not to repeat it for every single one of them. In other
words, it keeps our code [DRY][5]. We’re handling many different environments, so
we’re using this feature heavily.

## Layering

Have you ever heard about layering? It’s a Terraform code structuring pattern
in which you create “layers”, based on logical stacks.

For example, if you are working on a cloud provider, your first stack will
probably be the network stack, since most IaaS resources depend on it. Then,
you will probably create virtual machines that will run on the network layer.
You could call this the compute layer, for example.  At the end you will have
many layers in your scaffold, each one containing a specific logical group of
resources, that depends completely or partially on the previous layer. How?
Using references to the previous layer, using [Data Sources][4].

Once again, from the Terraform documentation:

> *__Data sources allow data to be fetched or computed for use elsewhere in
> Terraform configuration. Use of data sources allows a Terraform configuration
> to build on information defined outside of Terraform, or defined by another
> separate Terraform configuration.__*

The use of layering has many advantages:

* Reduced coupling: all your code will not be placed in the same directory. It
  will be separated into different logical groups. This will help you and your
  team understand the code better (as you will know that each layer corresponds
  to an isolated group of resources of your infrastructure), and it will make it
  easier for everyone to contribute to it as well. For example, adding a new
  component to your infrastructure is simple: you verify if the component you
  want to add fits into one of the existing layers, and you add it to it. If it
  doesn’t, you create a new layer. This also reduces the complexity of the
  development workflow when many people are working on the same codebase: each
  person can work on a different layer on different features without destroying
  the other person’s resources due to the fact that the code that allows their
  creation is not on their respective branches.
* Dependency on the previous layer: since each layer depends on the previous
  layer, you will be able to validate both the code of the previous layer
  (since it needs to be valid before the creation of the stack that depends on
  it) and its state (since the infrastructure state needs to be valid in order
  for it to be used as a datasource for the next layer).
* Reduced execution time: since each Terraform execution targets less code, the
  refresh time of the real state of your infrastructure using your cloud
  provider’s APIs diminishes, which means that the execution of the code is
  faster for certain steps.
* Reduced execution perimeter: each Terraform execution becomes atomic to the
  layer you’re executing it into. This creates a relatively isolated blast
  perimeter if something goes wrong.

Code-wise, we go from this:

```
terraform
├── README.md
├── cloud_init.tpl
├── config.tf
├── core_storage_gitlab_registry.tf
├── network.tf
├── prod.tfvars
├── resource_group.tf
├── security.tf
├── storage_backup.tf
├── storage_registry.tf
├── test.tfvars
├── variables.tf
├── vm_backup_rotation.tf
├── vm_bastion.tf
├── vm_elastic.tf
├── vm_gitlab.tf
├── vm_gitlab_runner.tf
├── vm_jenkins.tf
├── waf_internal.tf
├── test.tfvars
├── dev.tfvars
└── qa.tfvars
```

To this:

```
terraform
├── 00_resource_group
├── 01_dns
├── 02_tooling
├── 03_sandbox
├── 04_prod
├── 10_dns_record
├── prod.tfvars
├── qa.tfvars
└── test.tfvars
```

Each one of the numbered entries on the new directory structure represents a
different directory, each of which might contain many different files.

## Issues

Layering is thus quite useful, it allows you to decouple your code and to keep
things simple. When combining this technique with Workspaces, it allows you to
have structured code which you can apply to many different environments. Sweet!

*Note: from now on, we will start talking about environments. An environment is
defined by a distinct Terraform Workspace. Don’t get confused!*

Nevertheless, this does not come without a trade-off in complexity. You really
need to pay attention to the current workspace, on each layer. We can apply
changes or destroy resources on a layer using the wrong workspace if we are not
paying attention. In order for this to work, you need to select the right
workspace in each directory. There is no easy way to be sure on which
environment you are working when you go from a directory to another one. You
can do a `terraform workspace list` each time you change your current
directory, but this gets dull quite fast, and you will probably forget to do it
eventually and screw things up.

The other issue is that in order to apply changes you need to go through every
single layer and launch Terraform, and Terraform doesn’t know about the
existence of the different layers: each layer acts as an isolated Terraform
execution context. Doing this is slow. It is tedious. It can get frustrating
quite quickly.

## So… Solutions

The first solution we tried was to display the current workspace in our prompt.
This was fairly easy to do, since you can find the current workspace in the
.terraform/environment file. Using some bash foo, we managed to display it as
so:

```bash
function terraform_env_name (){
  if  [ -f .terraform/environment ]
  then
    TERRAFORM_ENV=`cat .terraform/environment`
    TERRAFORM_MESSAGE="(${TERRAFORM_ENV})"
  else
    TERRAFORM_MESSAGE=""
  fi
  echo -e  "$TERRAFORM_MESSAGE"
}
```

When you add this to your PS1 environment variable, your prompt will start
looking somewhat like this:

```bash
~/terraform/00_resource_group (development) $
```

But most of the time, this is not enough. It helps you prevent some mistakes
but it does not prevent you from screwing things up. And it does nothing about
the cumbersome aspect of going through every single layer of the infrastructure
and doing `terraform apply` commands everywhere. You will probably just go from
one directory to another and run your Terraform command from your bash history
without checking the selected workspace.

That is the reason why we wrote a wrapper. One of the purposes of the wrapper
is to check that we are working on the right workspace on every single layer.
So we started from what we would have loved to have. We imagined the right tool
and then we built it.

If we had an improved Terraform, called `tf`, and we would want to apply
changes on every layer, on the development workspace, we would love to have
something like this:

```bash
tf development apply
```

If the workspace does not match in any single one of the layers, [`tf` will stop
and tell you to select the right workspace before trying to apply your changes][3].
Needless to say, it will also provide you with a way to choose the right
workspace on every single layer, so you won’t have to go and do it manually on
every directory. In our minds, this would work like this:

```bash
tf workspace select <workspace>
```

And we would also love to have a way of creating new workspaces easily. This
should come in the form of:

```bash
tf workspace new production
```

With this somewhat flexible specification, we set our hands into coding!

## Implementation and Test-Driven Development

So how did we do it? First, we had to choose a language. After several
discussions, we decided to go with Ruby. Why? Because I had never done an
operations script using it. Most of the time when I have a task like this one,
I default to Python. So it was basically a “getting out of your comfort zone”
thing, even though I had already done Ruby on Rails development.

There are many other benefits of using Ruby. Handling arrays is extremely easy,
and the test framework ecosystem is pretty evolved.

Since we were using an interpreted language, doing Test-Driven Development was
almost an obligation. It allowed us to be sure of what we were building step by
step, and to have a certain level of confidence on what we were doing.
Therefore, we completely built the wrapper using it. It’s pretty rad, because
you can see in our test file how we progressively added features and our whole
thinking process.

We had to make some choices. The core functionality of our wrapper was the
ability to go through a set of folders in a certain order and apply Terraform
commands inside of each one of them. In order to do this, we had two choices:

* Mock every single directory changing task, knowing beforehand that we
  actually had to run assertions on the order of the visited directories, which
  adds complexity to the mocking procedure.
* Create mock directory structures that correspond to the cases that we’re
  trying to test. With this strategy, we would no longer be doing Unit Tests,
  but rather Integration Tests (which is fine, sometimes), as we would be using
  actual directories on the filesystem.

First, we started our code using the first strategy, since it seemed cleaner
and stricter.

```ruby
    subject { wrapper.get_layers }

    before do
      allow(wrapper).to receive(:list_dirs).and_return(list_dirs)
    end

    context 'when current directory is not a terraform dir' do
      let(:result) { ['00_network', '01_vm', '02_dns'] }
      let(:list_dirs) { ['00_network/.terraform/', '01_vm/.terraform/', '02_dns/.terraform/'] }
      it { is_expected.to eq result }
    end

    context 'when current directory is a terraform dir' do
      let(:result) { ['.', '00_network', '01_vm', '02_dns'] }
      let(:list_dirs) { ['.terraform', '00_network/.terraform/', '01_vm/.terraform/', '02_dns/.terraform/'] }
      it { is_expected.to eq result }
    end
```

Over time, we saw that the mock structures were becoming really complex, and
that it did not allow us to easily understand which case (or directory
structure) we were testing. Also, we needed to be able to test the order in
which the directories were being listed, which wasn’t that easy using the first
method.

Therefore, we refactored our code and went for the second approach, and created
different directory structures for different test scenarios. The directory
structures can be seen in the GitHub repository itself, but they look like
this:

```
▾ terraform_tests/
  ▾ test_flat/
    ▸ .terraform/
    ▸ modules/
    ▸ terraform.tfstate.d/
      config.tf
      prod.tfvars
  ▾ test_flat_no_var_file/
    ▸ .terraform/
    ▸ terraform.tfstate.d/
      config.tf
  ▾ test_layers/
    ▸ 00_rg/
    ▸ 01_network/
    ▸ 02_vms/
    ▸ modules/
      dev.tfvars
      prod.tfvars
```

Another interesting thing we did, in order to be able to test the order in
which the different directories were swept through, was that we mocked the
Terraform binary itself, like so:

```ruby
class Terraform

  def run params

    File.open('/tmp/terraform_mock_output', 'a') do |file|
      file.puts(Dir.getwd)
      file.puts(params)
    end
  end

end
```

Needless to say, this mocked binary implementation was tested too. We used it
to write the directory in which Terraform was launched and the parameters that
were used when Terraform was called into a temporary file.  We then ran
assertions on this file in order to test all our use cases. This solution
allowed us to keep the code simple, and enabled easy scenario additions  by
simply creating the required directory structure in the `terraform_tests`
directory. Maintainability for the win!

## Installation

Just [clone the project][2], and symlink the `tf.rb` file somewhere in your
path, like so:

```bash
ln -s <terraform_wrapper_directory>/tf.rb /usr/local/bin/tf
```

Remember to use the full path to your terraform-wrapper’s directory.

## Final thoughts

We had a lot of fun coding this thing. It allowed us to go back to classic
development for a while, which is something we don’t have the opportunity of
doing often enough, while working in Operations.

People usually say that it is impossible to bring Software Craftsmanship
practices to Operations. This is a common misconception, and we hope that
people that work in the same domain as us start moving in the same direction as
we do. Code is code!

Most people would have written a Bash script. We’ve all done it. The thing is
that Bash is a quirky language. It has a ton of non-usual behaviors, and it is
rarely tested, which makes adding features to the script a really painful
process. This is a problem for maintainability, and we created a critical tool
for our workflow. We can’t afford to be blocked in its development. That’s why
we choose not to do Bash anymore. We’re firm believers that we can do better,
and that we must therefore do better. To do otherwise is to create limitations
for ourselves.

I hope you had fun reading this. We sure had fun writing it!

See you next time!

[1]: https://blog.octo.com/author/tanguy-patte-tpa/
[2]: https://github.com/sebiwi/terraform-wrapper
[3]: https://github.com/sebiwi/terraform-wrapper/blob/master/terraform_wrapper.rb#L51
[4]: https://www.terraform.io/docs/configuration/data-sources.html
[5]: https://en.wikipedia.org/wiki/Don%27t_repeat_yourself
