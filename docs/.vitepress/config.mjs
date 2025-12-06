import { defineConfig } from 'vitepress'
import { transformGitBookMarkdown } from './markdown-gitbook.js'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Frigg Framework",
  description: "The open source serverless framework for developing integrations at scale",

  // Transform GitBook markdown syntax to VitePress format
  markdown: {
    config: (md) => {
      // Wrap the render function to transform GitBook syntax
      const originalRender = md.render.bind(md)
      md.render = (src, env) => {
        const transformed = transformGitBookMarkdown(src)
        return originalRender(transformed, env)
      }
    }
  },

  // Ignore dead links during build (GitBook has some internal link formats)
  ignoreDeadLinks: true, // Allow dead links for now during GitBook migration

  // Exclude GitBook-specific files
  srcExclude: ['**/SUMMARY.md'],

  // Map README.md files to index routes (GitBook convention)
  rewrites: {
    ':dir/README.md': ':dir/index.md',
    ':dir/:subdir/README.md': ':dir/:subdir/index.md',
    ':dir/:subdir/:subsubdir/README.md': ':dir/:subdir/:subsubdir/index.md'
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/FriggLogo.svg' }],
    ['meta', { name: 'theme-color', content: '#5f67ee' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'Frigg Framework | Integrations as quick as npm install' }],
    ['meta', { property: 'og:site_name', content: 'Frigg Framework' }],
    ['meta', { property: 'og:url', content: 'https://friggframework.org/' }],
  ],

  cleanUrls: true,

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/FriggLogo.svg',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Quick Start', link: '/tutorials/quick-start/' },
      { text: 'Guides', link: '/guides/cooking-with-frigg' },
      { text: 'Reference', link: '/reference/core-concepts' },
      { text: 'API Modules', link: '/api-module-library/overview' },
      {
        text: 'Community',
        items: [
          { text: 'Contributing', link: '/contributing/contributing/' },
          { text: 'Support', link: '/support/support' },
          { text: 'Roadmap', link: '/roadmap/page-1' }
        ]
      }
    ],

    sidebar: {
      '/tutorials/': [
        {
          text: 'Tutorials',
          items: [
            { text: 'Learning Frigg', link: '/tutorials/overview' },
            {
              text: 'Quick Start',
              collapsed: false,
              items: [
                { text: 'Overview', link: '/tutorials/quick-start/' },
                { text: 'Initialize with CFA', link: '/tutorials/quick-start/create-frigg-app' },
                { text: 'Configuration', link: '/tutorials/quick-start/configuration' },
                { text: 'Start Your App', link: '/tutorials/quick-start/start-your-frigg-app' },
                { text: 'Connecting Live Data', link: '/tutorials/quick-start/connecting-and-seeing-live-data' },
                { text: 'Updating Integration Logic', link: '/tutorials/quick-start/updating-the-integration-logic' }
              ]
            },
            {
              text: 'Advanced Tutorials',
              collapsed: true,
              items: [
                { text: 'Overview', link: '/tutorials/advanced-tutorials/' },
                { text: 'Deploying to AWS', link: '/tutorials/advanced-tutorials/deploying-your-frigg-application/deploying-to-aws' }
              ]
            }
          ]
        }
      ],
      '/guides/': [
        {
          text: 'How-To Guides',
          items: [
            { text: 'Cooking with Frigg', link: '/guides/cooking-with-frigg' }
          ]
        }
      ],
      '/explanation/': [
        {
          text: 'Explanation',
          items: [
            { text: 'Technical Decisions', link: '/explanation/the-why-of-frigg-technical-decisions' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Core Concepts', link: '/reference/core-concepts' },
            { text: 'API Module Definition', link: '/reference/api-module-definition-and-functions' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Data Model', link: '/reference/data-model' },
            { text: 'API Reference', link: '/reference/api-reference' }
          ]
        }
      ],
      '/api-module-library/': [
        {
          text: 'API Modules',
          items: [
            { text: 'Overview', link: '/api-module-library/overview' },
            { text: 'Building Your Own Module', link: '/api-module-library/building-your-own-module' },
            {
              text: 'Module Library',
              collapsed: false,
              items: [
                { text: 'Asana', link: '/api-modules/module-list/asana/' },
                { text: 'Canva Connect', link: '/api-modules/module-list/canva-connect/' },
                { text: 'ConnectWise PSA', link: '/api-module-library/module-list/connectwise/' },
                { text: 'Contentful', link: '/api-modules/module-list/contentful/' },
                { text: 'Contentstack', link: '/api-modules/module-list/contentstack/' },
                { text: 'Deel', link: '/api-modules/module-list/deel/' },
                { text: 'Google Calendar', link: '/api-modules/module-list/google-calendar/' },
                { text: 'Google Drive', link: '/api-modules/module-list/google-drive/' },
                { text: 'Help Scout', link: '/api-module-library/module-list/helpscout/' },
                { text: 'HubSpot', link: '/api-module-library/module-list/hubspot/' },
                { text: 'Ironclad', link: '/api-modules/module-list/hubspot-1/' },
                { text: 'Linear', link: '/api-modules/module-list/hubspot-2/' },
                { text: 'Microsoft Teams', link: '/api-modules/module-list/hubspot-3/' },
                { text: 'QuickBooks Online', link: '/api-modules/module-list/hubspot-4/' },
                { text: 'Salesforce', link: '/api-module-library/module-list/salesforce/' },
                { text: 'Slack', link: '/api-modules/module-list/slack/' },
                { text: 'Stripe', link: '/api-modules/module-list/stripe/' },
                { text: 'Unbabel', link: '/api-modules/module-list/unbabel/' },
                { text: 'Zoho CRM', link: '/api-modules/module-list/zoho-crm/' },
                { text: 'Zoom', link: '/api-modules/module-list/zoom/' }
              ]
            }
          ]
        }
      ],
      '/contributing/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Overview', link: '/contributing/contributing/' },
            { text: 'Code of Conduct', link: '/contributing/contributing/code_of_conduct' },
            { text: 'Pull Request Template', link: '/contributing/contributing/pull_request_template' }
          ]
        }
      ],
      '/support/': [
        {
          text: 'Support',
          items: [
            { text: 'Contact', link: '/support/support' },
            { text: 'FAQs', link: '/support/frequently-asked-questions' }
          ]
        }
      ],
      '/roadmap/': [
        {
          text: 'Roadmap',
          items: [
            { text: 'Overview', link: '/roadmap/page-1' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/friggframework/frigg' },
      { icon: 'slack', link: 'https://friggframework.slack.com' }
    ],

    editLink: {
      pattern: 'https://github.com/friggframework/frigg/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2023-present Frigg Framework Contributors'
    },

    search: {
      provider: 'local'
    }
  }
})
