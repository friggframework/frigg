---
description: We all need a starting point
---

# Introduction to Frigg



<details>

<summary>"Frigg Explained" for Non-Technical People (TL;DR)</summary>

The Frigg Integration Framework is a software development tool targeted at SaaS leaders seeking to build tech partnerships with/to other ISVs.

While new integrations unlock fruitful business opportunities, their development is often challenging for the product/engineering team. A robust integration is usually required before two ISVs can co-promote or co-sell (aka forming a "tech partnership.")

But because integration development is a complex, product-driven process performed by engineers and designers, few partnership or sales leaders can get integrations built internally at optimal speed (if at all).

Given these dynamics, partnership/sales leaders often seek out external ways of getting an integration built. That desire often brings them to Frigg, which they then suggest to their colleagues in product & engineering for evaluation.

To help a non-technical audience understand Frigg and its potential, we wrote this [Overview Doc](https://docs.google.com/document/d/e/2PACX-1vRzCTIUhUj5NC5CKIOhn36NGu6TbUPMwMF5-hFLJ2fuhfrCJ2VXnabtxqE429iP1CxPPgPyhzez41jk/pub). It's not "documentation," but it will help you  understand and position Frigg to your product/engineering colleagues.

If you're ready to introduce Frigg to your product/engineering colleagues, this documentation site is the right place to point them. Our [live demo site](https://demo.friggframework.,org) is also instructive to both technical and non-technical audiences as well.

Have questions? Chat with us!

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

### Frigg for Developers&#x20;

The Frigg Framework is an opinionated integration framework built with modern software development teams in mind. The aim of the framework is to have you up and running out of the box with a flexible set of tools to help rapidly add integrations to your software that your end users can manage individually without any intervention.&#x20;

The framework handles integration listing, authentication, and configuration "out of the box", built on a scalable serverless architecture with a growing library of prebuilt API modules to greatly reduce time to wow. Along with the core "out of the box" features, the framework contains primitives to help address and flex to any use case. Here's a quick list:

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

Basic Architecture

A Frigg Application is predominantly a backend microservice, with an optional frontend. Most folks who adopt Frigg already have their frontend UI either built out in their framework of choice, or designed to be baked into their core code. We've built a simple library of components for you to use to get started quickly. See more details about frontend options here.

In the backend, Frigg is based on the serverless.com framework. This key piece of technology and the underlying compute/architecture under the hood provides a number of advantages:

* Infrastructure-as-Code- The need to manually configure resources on the host provider is greatly reduced
* Deployable to your favorite host- AWS, GCP, Azure, any a list of many more are available
* Horizontal Scalability
* Pay as you go



## Developers

See [CONTRIBUTING.md](getting-started/contributing/) for details about getting started as a Frigg contributor.
