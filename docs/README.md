# 🥳 Introduction to Frigg

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

## Frigg Explained to Developers&#x20;

Simply put- Frigg is what you would build into your product if you had unlimited resources and time, with the added benefit of being Open Source, where it's not just you but a community of developers collaborating to solve the same core set of problems over and over again. Something you could never do internally.

The Frigg Framework is an opinionated integration framework built with modern software development teams in mind. The aim of the framework is to have you up and running out of the box with a flexible set of tools to help rapidly add integrations to your software that your end users can manage individually without any intervention.&#x20;

The framework handles integration listing, authentication, and configuration "out of the box," built on a scalable serverless architecture with a growing library of prebuilt API Modules to greatly reduce time to wow. Along with the core "out of the box" features, the framework contains primitives to help address and flex to any use case.&#x20;

## Navigating the Docs

We've got a lot to unpack!



In general, there are three areas of the docs.

Developing Integrations with Frigg

Here you'll find Quick Start tutorials and examples, along with deeper dive documentation on how to develop integrations with Frigg.

Frigg Reference

This is the main area where you'll find documentation around all Frigg concepts

Contributing to the Project

Here's where we lay out how to get involved in contributing to the Frigg core project.



#### Basic Architecture

A Frigg Application is predominantly a backend microservice, with an optional frontend. Most Frigg adopters already have an existing frontend UI built using a framework of their choice, or will bake integration UX into their product's core code. Frigg ships with a simple library of components to get you started quickly. See more details about frontend options here.

In the backend, Frigg is based on the serverless.com framework. This key piece of technology and the underlying compute/architecture under the hood provides a number of advantages:

* Infrastructure-as-Code- The need to manually configure resources on the host provider is greatly reduced
* Deployable to your favorite host- AWS, GCP, Azure, any a list of many more are available
* Horizontal Scalability
* Pay as you go

## Contributing Developers

See [CONTRIBUTING.md](contributing/contributing/) for details about getting started as a Frigg contributor.
