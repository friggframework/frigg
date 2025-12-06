---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Frigg Framework"
  text: "Integrations as quick as npm install"
  tagline: The open source serverless framework for developing integrations at scale
  image:
    src: /FriggLogo.svg
    alt: Frigg Framework Logo
  actions:
    - theme: brand
      text: Quick Start
      link: /tutorials/quick-start/
    - theme: alt
      text: View on GitHub
      link: https://github.com/friggframework/frigg

features:
  - icon:
      src: /.gitbook/assets/tutorials.png
    title: Tutorials
    details: Hands-on activities to learn how to use Frigg and build high quality integrations.
    link: /tutorials/overview
    linkText: Start Learning
  - icon:
      src: /.gitbook/assets/how-to guides.png
    title: How-To Guides
    details: In-depth directions for achieving different integration goals with Frigg.
    link: /guides/cooking-with-frigg
    linkText: View Guides
  - icon:
      src: /.gitbook/assets/reference.png
    title: Reference
    details: Technical definitions for all things Frigg - Classes, Objects, Methods, APIs, and more.
    link: /reference/core-concepts
    linkText: Browse Reference
  - icon:
      src: /.gitbook/assets/explanation.png
    title: Explanation
    details: Our thought processes for building Frigg and how we think about integration development.
    link: /explanation/the-why-of-frigg-technical-decisions
    linkText: Learn More
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #5f67ee 30%, #41d1ff);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #5f67ee 50%, #41d1ff 50%);
  --vp-home-hero-image-filter: blur(44px);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}
</style>

## Why Frigg?

Frigg was built with the core principles that user-facing self-serve software integrations should be:

- **Easy to Develop** - Modern stack, easy to understand, fast to develop
- **Inexpensive to Run** - Serverless architecture, pay as you go
- **Modular and Extensible** - Comprehensive enough to cover any use case
- **Easy to Scale** - Horizontal scalability built-in
- **Easy to Maintain** - Fully open source with community support

## Quick Start

Get up and running in minutes:

```bash
npx create-frigg-app my-integrations
cd my-integrations
npm run dev
```

Ready to dive deeper? Check out the [Quick Start Tutorial](/tutorials/quick-start/).

## API Module Library

Frigg includes a growing library of prebuilt API Modules to greatly reduce time to "wow":

<div class="api-modules-grid">

- [Asana](/api-modules/module-list/asana/)
- [HubSpot](/api-module-library/module-list/hubspot/)
- [Salesforce](/api-module-library/module-list/salesforce/)
- [Slack](/api-modules/module-list/slack/)
- [Zoom](/api-modules/module-list/zoom/)
- [And many more...](/api-module-library/overview)

</div>

## Community

Join the Frigg community:

- [GitHub Discussions](https://github.com/friggframework/frigg/discussions) - Ask questions and share ideas
- [Slack Community](https://friggframework.slack.com) - Real-time chat with the community
- [Contributing Guide](/contributing/contributing/) - Help build Frigg

---

<div style="text-align: center; margin-top: 2rem;">
  <p>Built with ❤️ by <a href="https://lefthook.com" target="_blank">Left Hook</a> and the Frigg community</p>
</div>
