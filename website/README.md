# friggframework.org marketing site

The public marketing site for the Frigg Integration Framework
(https://friggframework.org). It is a single, self-contained static page
(inline CSS + vanilla JS, no build step, no framework runtime) with a small set
of Netlify serverless functions for the newsletter / Slack Connect signup flow.

Previously this site lived in the `lefthook--demo-frigg-application` repo. It
now lives here in the Frigg core monorepo so the site can be iterated on
alongside the framework and deployed from the `next` branch via Netlify. The
page was rebuilt from the original Bootstrap/jQuery version into a modern,
dependency-free page with a light/dark/system theme toggle and messaging around
the current framework story (agents building integrations, integrations exposed
as MCP tools, owning your own stack).

## Layout

| Path | What it is |
|------|------------|
| `index.html` | The entire single-page site — inline CSS + JS, no build step |
| `fonts/webfonts/` | Self-hosted woff2 (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono) |
| `assets/img/` | Logo mark + integration icons used in the marquee |
| `friggframework-api/` | Netlify serverless functions (`subscribe`, `submission-created`) |
| `../netlify.toml` | Netlify build config (base = `website`) — lives at the repo root |

## Design notes

- **Theme**: tokens are CSS custom properties on `:root`; `prefers-color-scheme`
  sets the default and a header toggle stamps `data-theme="light|dark"` (stored
  in `localStorage`) which overrides the media query in both directions.
- **No external requests**: fonts are self-hosted; the only third-party scripts
  are the existing Google Analytics + PostHog snippets carried over from the
  original site.
- **Motion** (weave canvas, terminal typing, scroll reveals) is disabled under
  `prefers-reduced-motion`.
- The signup `<form>` keeps the exact field names (`email`, `slack-invite`,
  `update-emails`) and `form-name` that the `submission-created` function reads,
  so the Netlify Forms flow is unchanged.

## Netlify configuration

The Netlify build config is at the **repo root** (`../netlify.toml`) with
`base = "website"`, so every path in it is relative to this directory. The
functions directory is `friggframework-api/` and the publish directory is this
folder.

Redirects:

- `api.friggframework.org/*` → the deployed serverless functions
- `feedback.friggframework.org/*` → `roadmap.friggframework.org`

## Local development

From this directory:

```bash
npm install          # installs the functions' deps (node-fetch, dotenv)
netlify dev          # serves the static site + functions locally
```

The signup functions require these environment variables (set them in the
Netlify UI or a local `.env`, never commit them):

- `SLACK_TOKEN` — bot token used to invite signups to Slack Connect
- `SLACK_CONNECT_CHANNEL_ID` — target Slack channel
- `WEBHOOK_URL` — Zapier webhook the signup email is forwarded to
