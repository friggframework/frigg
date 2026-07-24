# friggframework.org marketing site

The public marketing site for the Frigg Integration Framework
(https://friggframework.org). It is a static site (HTML/CSS/JS built on
Bootstrap 4 + jQuery) with a small set of Netlify serverless functions for the
newsletter / Slack Connect signup flow.

Previously this site lived in the `lefthook--demo-frigg-application` repo. It
now lives here in the Frigg core monorepo so the site can be iterated on
alongside the framework and deployed from the `next` branch via Netlify.

## Layout

| Path | What it is |
|------|------------|
| `index.html` | The single-page marketing site |
| `css/`, `js/` | Site styles and scripts |
| `fonts/`, `plugins/`, `assets/` | Vendored fonts, jQuery/Bootstrap plugins, images |
| `accordions.json` | Copy for the "Why Frigg" accordion section |
| `friggframework-api/` | Netlify serverless functions (`subscribe`, `submission-created`) |
| `../netlify.toml` | Netlify build config (base = `website`) — lives at the repo root |

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
