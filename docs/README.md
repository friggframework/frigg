# 🥳 Introduction to Frigg

<details>

<summary>Frigg Explained to Partnership Leaders &#x26; Non-Technical People</summary>

The Frigg Integration Framework is a software development tool intended to help engineers build integrations faster.

While we all know that new "tech partnerships" unlock business opportunities, integration development is a complex, product-driven process performed by engineers and designers. Partnership leaders can't conjure new integrations into existence; product & engineering resources must be engaged and supported.

Given these dynamics, partnership leaders often seek _external_ vendors and tools to get integrations built. This search brings them to Frigg and [Left Hook](https://lefthook.com).

Before you introduce Frigg to your engineering colleagues, partnership leaders should understand Frigg at a non-technical level. Our [Non-Technical Overview Doc](https://docs.google.com/document/d/e/2PACX-1vRzCTIUhUj5NC5CKIOhn36NGu6TbUPMwMF5-hFLJ2fuhfrCJ2VXnabtxqE429iP1CxPPgPyhzez41jk/pub) is intended to provide this context and support your internal advocacy for Frigg.

Meanwhile, Frigg's documentation site is targeted at engineers and product leaders who will need to understand the framework as a development tool.&#x20;

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

Read more about Frigg on [Wikipedia](https://en.wikipedia.org/wiki/Frigg).&#x20;

</details>

## Frigg Explained to Developers&#x20;

Simply put- Frigg is what you would build into your product if you had unlimited resources and time, with the added benefit of being Open Source, where it's not just you but a community of developers collaborating to solve the same core set of problems over and over again. Something you could never do internally.

The Frigg Framework is an opinionated integration framework built with modern software development teams in mind. The aim of the framework is to have you up and running out of the box with a flexible set of tools to help rapidly add integrations to your software that your end users can manage individually without any intervention.&#x20;

The framework handles integration listing, authentication, and configuration "out of the box," built on a scalable serverless architecture with a growing library of prebuilt API Modules to greatly reduce time to wow. Along with the core "out of the box" features, the framework contains primitives to help address and flex to any use case.&#x20;

## Navigating the Docs

We've got a lot to unpack! These docs should be your go-to resource for all things Frigg related. Over time, there will doubtless be other properties and places (courses?) where you'll get more deep dives into topics and example implementations (and we expect example implementations contributed by the community?), but for now, this is the place.

In general, there are five main areas of the docs

{% content-ref url="broken-reference" %}
[Broken link](broken-reference)
{% endcontent-ref %}

^ Here you'll find Quick Start tutorials and examples, along with deeper dive documentation on how to develop integrations with Frigg.

{% content-ref url="broken-reference" %}
[Broken link](broken-reference)
{% endcontent-ref %}

^ This is the main area where you'll find documentation around all Frigg concepts

{% content-ref url="broken-reference" %}
[Broken link](broken-reference)
{% endcontent-ref %}

^ Here's where we lay out how to get involved in contributing to the Frigg core project. And oh boy are we glad to have you!

{% content-ref url="broken-reference" %}
[Broken link](broken-reference)
{% endcontent-ref %}

^ Ah, the ever-expanding documentation section! At some point when we've reached critical mass (read: 1,000+ API Modules), "we're going to need a bigger boat". But for now, basic docs around any specific module live here.

{% content-ref url="broken-reference" %}
[Broken link](broken-reference)
{% endcontent-ref %}

^ Yup, we all need support sometimes. When it comes to Frigg-related support, you've got a few options. Hit us up in those places! Or in person. Novel concept these days.

{% content-ref url="broken-reference" %}
[Broken link](broken-reference)
{% endcontent-ref %}

^ This is probably both the most exciting and most daunting part of the whole enterprise. So much possibility! We're using an external tool for now, so we're just linking out to there and giving a high level short-medium-long term road map on which you can anchor your expectations. Or if you want to sponsor pieces of the roadmap, you can greatly change its shape.

{% hint style="info" %}
<details>

<summary>A Note on Basic Architecture</summary>

A Frigg Application is predominantly a backend microservice, with an optional frontend. Most Frigg adopters already have an existing frontend UI built using a framework of their choice, or will bake integration UX into their product's core code. Frigg ships with a simple library of components to get you started quickly. See more details about frontend options here.

In the backend, Frigg is based on the serverless.com framework. This key piece of technology and the underlying compute/architecture under the hood provides a number of advantages:

* Infrastructure-as-Code- The need to manually configure resources on the host provider is greatly reduced
* Deployable to your favorite host- AWS, GCP, Azure, any a list of many more are available
* Horizontal Scalability
* Pay as you go

</details>
{% endhint %}



## Contributing Developers

See [CONTRIBUTING.md](contributing/contributing/) for details about getting started as a Frigg contributor.
