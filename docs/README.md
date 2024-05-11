---
description: Developing integrations as easy as `npm install`
layout: landing
---

# 🥳 Welcome to Frigg!

## Integrations shouldn't be that hard to build and maintain...

Frigg was built with the core principles that user-facing self-serve software integrations should be:

* Easy to Develop
* Inexpensive
* Modular and Extensible
* Scalable

This is our answer to the question "hasn't this already been done before?"

Modern stack; easy to understand; fast to develop and deploy; comprehensive enough to cover any use case; fully open source. Interoperability, the way it should be.

## Navigating the Docs

These docs should be your go-to resource for all things Frigg related. Secondary are GitHub READMEs and Slack community channels.

We are attempting to embrace a [Diátaxis](https://diataxis.fr/) approach to documenting Frigg. Any recommendations are welcome!

In general, there are four main areas of the docs, and four supplemental sections

### Main Documentation Areas

<table data-view="cards"><thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead><tbody><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="1f9d1-1f4bb">🧑‍💻</span> Tutorials (Learning)</td><td>Hands-on activities to learn how to use Frigg, and how to think about and build high quality integrations.</td><td><a href="broken-reference">Broken link</a></td></tr><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="2705">✅</span> How-To Guides (Goals)</td><td>In-depth directions for achieving different integration goals with Frigg, both general and specific to marketplaces.</td><td><a href="broken-reference">Broken link</a></td></tr><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="1f4d6">📖</span> Reference (Information)</td><td>Technical definitions for all things Frigg. Classes, Objects, Methods, APIs, and more</td><td><a href="broken-reference">Broken link</a></td></tr><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="1f4ad">💭</span> Explanation (Understanding)</td><td>Here you'll find our thought processes for building Frigg the way we have, and for how we think about integration development</td><td><a href="broken-reference">Broken link</a></td></tr></tbody></table>

### Supplemental Documentation Areas

<table data-view="cards"><thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead><tbody><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="1f50c">🔌</span> API Modules</td><td>Documentation for each API module published in Frigg's main library.</td><td><a href="broken-reference">Broken link</a></td></tr><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="1f91d">🤝</span> Contributing</td><td>All things contributing to Frigg from as little as a typo-fixer to as deep as a core maintainer.</td><td><a href="broken-reference">Broken link</a></td></tr><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="1f4de">📞</span> Support</td><td>Notes about how to get support</td><td><a href="broken-reference">Broken link</a></td></tr><tr><td><span data-gb-custom-inline data-tag="emoji" data-code="1f5fa">🗺️</span> Roadmap</td><td>The short, medium, and long term features and opportunities roadmap for Frigg</td><td><a href="broken-reference">Broken link</a></td></tr></tbody></table>



## Before you go any further, some quick FAQs

<details>

<summary>How does Frigg define "Integration"?</summary>

Application Programming Interfaces (APIs) are everywhere in software development. They can be made for SDKs, hardware, internal modules, HTTP requests to external systems, and more.

Frigg is focused on building integrations between separate software systems, powered the majority of the time via HTTP APIs.&#x20;

An integration, then, is the code that is used to "glue" these APIs together; an integration record is state managed by the software to keep track of which accounts and what settings a user desires.

At it's core, Frigg is intended to help developers build all types of integrations. And as we grow our footprint and community, we are undoubtedly going to see support added for enhanced features depending on your type of integration.&#x20;

To start, however, our roadmap and framework is focused on one specific use case - software teams building native integrations to external systems for end-user integration. **In a phrase: rapidly enabling technology partnerships.**

</details>

<details>

<summary>Who is Frigg For... Internal Integrations? Powering your Software? Enabling your Users?</summary>

There are three potential use cases for Frigg that we currently use internally at Left Hook.

* **Internal Business Process Automation-** This is the kind where you get notifications from GitHub to your Slack account; or where you have a cron job that every week summarizes and creates a report in Google Sheets, and emails out to relevant audiences; really, anything to help your backoffice flow smoother. This is squarely in the realm of iPaaS tools today. \
  \
  The primary audience for these integrations are internal users of your organization.\

* **Product and Productized Service Automation-** We view these as integrations that are powering your own software or service. Twilio integration to send text message alerts whenever a given event happens in your app. Webform piping to a database kicking off a drip campaign in your onboarding tool. Project completion kicking off an invoice to your clients with a summary of hours spent to date pulled from your time tracking software. \
  \
  There's a potential overlap with the first category, but it's most helpful to think of integrations to tools that eventually impact end users/customers of your software or service. \

* **End User Integration Enablement-** These are the integrations powering technology partnerships. Allowing users to connect their Slack account to your app, or their HubSpot account, or their Salesforce account, or go on down the line. By doing so, they adopt prebuilt workflows and automations that you've product managed to optimize the "better together" experience.&#x20;

Should you desire to use Frigg for each of these, we recommend creating 3 separate Frigg applications, as each one has a different user base, compute needs, and risk profile.

For now, it's critical to call out that Frigg is focused on the last bucket- End User Integration Enablement. Frigg is focused on powering your integration directory, and power the integrations your users choose to enable and configure.

Over time, there will be documentation and features focused on the other two buckets. So keep an eye on this space! But keep that in mind as you read on.

</details>

<details>

<summary>Frigg Explained to Partnership Leaders &#x26; Non-Technical People</summary>

The Frigg Integration Framework is a software development tool intended to help engineers build integrations faster.

While we all know that new "tech partnerships" unlock business opportunities, integration development is a complex, product-driven process performed by engineers and designers. Partnership leaders can't conjure new integrations into existence; product & engineering resources must be engaged and supported.

Given these dynamics, partnership leaders often seek _external_ vendors and tools to get integrations built. This search brings them to Frigg and [Left Hook](https://lefthook.com).

Before you introduce Frigg to your engineering colleagues, partnership leaders should understand Frigg at a non-technical level. Our [Non-Technical Overview Doc](https://docs.google.com/document/d/e/2PACX-1vRzCTIUhUj5NC5CKIOhn36NGu6TbUPMwMF5-hFLJ2fuhfrCJ2VXnabtxqE429iP1CxPPgPyhzez41jk/pub) is intended to provide this context and support your internal advocacy for Frigg.

Meanwhile, Frigg's documentation site is targeted at engineers and product leaders who will need to understand the framework as a development tool.

If you're ready to introduce Frigg to your technical colleagues, share this documentation site. Our [live demo site](https://demo.friggframework.,org) is also instructive to both technical and non-technical audiences as well.

Have questions? Let's [connect](support/support.md)!

</details>

<details>

<summary>Frigg: What's in a name?</summary>

* Frigg is Odin's wife in Norse mythology
* Goddess of **marriage** and **partnerships**
* She flies the earthly skies as a falcon
* She is known in folklore as the **“weaver of clouds”**

The Frigg Integration Framework powers integrations between software companies, the majority of which are in the cloud, speeding up time to live on tech partnerships.

Read more about Frigg on [Wikipedia](https://en.wikipedia.org/wiki/Frigg).

</details>

## Frigg Explained to Developers

Simply put- Frigg is what you would build to rapidly develop integrations if you had unlimited resources and time. The added difference is the promise of Open Source-- not just your company, but a community of developers collaborating to solve the same core set of problems over and over again. Something you could never do internally.

The Frigg Framework is an opinionated set of development tools, modules, classes, and plugins built with modern software development teams in mind. The aim of the framework is to have you up and running out of the box with a flexible set of tools to help rapidly add integrations to your software that your end users can manage individually without any intervention.

The framework handles integration listing, authentication, and configuration "out of the box," built on a scalable serverless architecture with a growing library of prebuilt API Modules to greatly reduce time to wow. Along with the core "out of the box" features, the framework contains primitives to help address and flex to any use case.

{% hint style="info" %}
#### A Note on Basic Architecture

A Frigg Application is predominantly a backend microservice, with an optional frontend. Most Frigg adopters already have an existing frontend UI built using a framework of their choice, or will bake integration UX into their product's core code. Frigg ships with a simple library of components to get you started quickly. See more details about frontend options here.

In the backend, Frigg is based on the serverless.com framework. This key piece of technology and the underlying compute/architecture under the hood provides a number of advantages:

* Infrastructure-as-Code- The need to manually configure resources on the host provider is greatly reduced
* Deployable to your favorite host- AWS, GCP, Azure, any a list of many more are available
* Horizontal Scalability
* Pay as you go
{% endhint %}
