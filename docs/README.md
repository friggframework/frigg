# Introduction to Frigg

<details>

<summary><mark style="background-color:purple;">Frigg Explained to Partnership Leaders &#x26; Non-Technical People</mark></summary>

The Frigg Integration Framework is a software development tool built to help engineers build integrations faster.

While we all know that new "tech partnerships" unlock business opportunities, integration development is a complex, product-driven process performed by engineers and designers. Partnership leaders can't conjure new integrations into existence; product & engineering resources must be engaged and supported.

Given these dynamics, partnership leaders often seek external vendors and tools to get integrations built. This search brings them to Frigg and [Left Hook](https://lefthook.com).

Before they can bring Frigg to their engineering colleagues, partnership leaders should understand Frigg at a non-technical level. Our [Non-Technical Overview Doc](https://docs.google.com/document/d/e/2PACX-1vRzCTIUhUj5NC5CKIOhn36NGu6TbUPMwMF5-hFLJ2fuhfrCJ2VXnabtxqE429iP1CxPPgPyhzez41jk/pub) is intended to provide this context and support your advocacy for using Frigg.

Meanwhile, Frigg's documentation site is targeted at engineers and product leaders who will need to understand the framework as a development tool.&#x20;

If you're ready to introduce Frigg to your technical colleagues, share this documentation site. Our [live demo site](https://demo.friggframework.,org) is also instructive to both technical and non-technical audiences as well.

Have questions? Chat with us

</details>

<details>

<summary>Frigg: What's in a name?</summary>

Frigg Defintion:

* Frigg \*\*\*\*is the Norse goddess of **marriage** and **partnerships**
* Frigg means **“Beloved”** in Old Norse
* She flies the earthly skies as a falcon
* She is known in folklore as the **“weaver of the clouds”**

The Frigg Integration Framework powers integrations between software companies, the majority of which are in the cloud, speeding up time to live on tech partnerships.

</details>

### Frigg Explained to Developers&#x20;

The Frigg Framework is an opinionated integration framework built with modern software development teams in mind. The aim of the framework is to have you up and running out of the box with a flexible set of tools to help rapidly add integrations to your software that your end users can manage individually without any intervention.&#x20;

The framework handles integration listing, authentication, and configuration "out of the box," built on a scalable serverless architecture with a growing library of prebuilt API Modules to greatly reduce time to wow. Along with the core "out of the box" features, the framework contains primitives to help address and flex to any use case. Here's a quick list:

* Eventing
  * Webhooks/Callbacks
  * Scheduled/Polling
  * User initiated
* Syncing
  * Bi-directional
  * Field-level selection
* Easy Route Creation
* Internal facing APIs
* External facing APIs
* Queues
* Associations

#### Basic Architecture

A Frigg Application is predominantly a backend microservice, with an optional frontend. Most Frigg adopters already have an existing frontend UI built using a framework of their choice, or will bake integration UX into their product's core code. Frigg ships with a simple library of components to get you started quickly. See more details about frontend options here.

In the backend, Frigg is based on the serverless.com framework. This key piece of technology and the underlying compute/architecture under the hood provides a number of advantages:

* Infrastructure-as-Code- The need to manually configure resources on the host provider is greatly reduced
* Deployable to your favorite host- AWS, GCP, Azure, any a list of many more are available
* Horizontal Scalability
* Pay as you go

## Contributing Developers

See [CONTRIBUTING.md](getting-started/contributing/) for details about getting started as a Frigg contributor.
