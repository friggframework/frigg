---
name: gitbook-docs
description: >-
  Author and edit the Frigg documentation that publishes to
  docs.friggframework.org. Use whenever you add, rewrite, restructure, or fix
  files under docs/ in this repo — including landing pages, guides, tutorials,
  reference, API-module docs, and the SUMMARY.md navigation. Covers GitBook
  Git-Sync conventions (custom blocks, page frontmatter, SUMMARY.md,
  .gitbook/assets) so generated markdown renders correctly instead of leaking
  raw {% %} tags or broken references.
license: MIT
---

# Writing Frigg docs for GitBook (Git Sync)

The `docs/` folder in this repository is the source of truth for
**docs.friggframework.org**. GitBook is connected via **Git Sync**, so editing
the markdown here and merging is what updates the live docs site — there is no
separate publish step and no copy-paste into the GitBook UI.

## The setup (verified facts about this repo)

- **Sync branch:** GitBook syncs from **`main`**. GitBook's own edits land as
  commits prefixed `GITBOOK-NN:` (visible in `main`'s history). Doc changes only
  go live once they reach `main`.
- **Root:** `.gitbook.yaml` sets `root: ./docs/`. Only files under `docs/` are
  part of the published site. Markdown elsewhere in the monorepo (package
  READMEs, `CLAUDE.md`, root reports) is **not** published.
- **Navigation:** `docs/SUMMARY.md` is the sidebar tree. **A page does not
  appear on the site unless it is listed in `SUMMARY.md`.** When you add or move
  a page, update `SUMMARY.md` in the same change, keeping paths relative to
  `docs/`.
- **Assets:** images/files live in `docs/.gitbook/assets/`. Reference them with a
  relative path, not an absolute URL.

## Golden rules

1. **Never invent GitBook edits in the UI** — everything is Git Sync. Edit files.
2. **Every new/renamed page must be added to `docs/SUMMARY.md`** or it 404s in nav.
3. **Close every custom block.** An unclosed `{% ... %}` breaks the whole page
   render. Match each opener with its `{% end... %}`.
4. **Use relative links between docs pages** (`../guides/foo.md`), not full URLs.
   Broken/absolute links surface as `broken-reference` on the site.
5. **Prefer plain markdown; reach for custom blocks only when they add value.**
   Standard markdown tables, headings, lists, and fenced code all render natively.
6. **Review the rendered output.** AI-generated GitBook markdown is prone to
   unclosed blocks and stale links — spot-check after editing.

## Page frontmatter

Optional YAML at the very top of a page controls layout and the page
description shown under the title:

```yaml
---
description: One-line summary shown under the page title and in search.
icon: rocket            # optional GitBook/Font Awesome icon slug
cover: .gitbook/assets/cover.png   # optional hero image
layout:
  title:            { visible: true }
  description:      { visible: true }
  tableOfContents:  { visible: true }
  outline:          { visible: true }
  pagination:       { visible: true }
---
```

## Custom block syntax (Git-Sync markdown)

Use these literal forms. See `references/block-syntax.md` for the full set and
examples; the essentials:

**Hint / callout** — styles: `info`, `warning`, `danger`, `success`
```
{% hint style="warning" %}
Frigg 2.0 requires Node >= 22 and npm >= 10.
{% endhint %}
```

**Tabs**
```
{% tabs %}
{% tab title="npm" %}
`npm install @friggframework/core`
{% endtab %}
{% tab title="yarn" %}
`yarn add @friggframework/core`
{% endtab %}
{% endtabs %}
```

**Code block with a title / line numbers**
```
{% code title="serverless.yml" overflow="wrap" lineNumbers="true" %}
```yaml
service: my-frigg-app
```
{% endcode %}
```

**Page-reference card** (link to another doc as a card)
```
{% content-ref url="getting-started/quick-start.md" %}
[quick-start.md](getting-started/quick-start.md)
{% endcontent-ref %}
```

**Stepper** (numbered steps)
```
{% stepper %}
{% step %}
### Install the CLI
`npm i -g @friggframework/devtools`
{% endstep %}
{% step %}
### Create an app
Run `frigg` and follow the prompts.
{% endstep %}
{% endstepper %}
```

**Embed** (video, tweet, external page)
```
{% embed url="https://www.youtube.com/watch?v=..." %}
```

**Image with caption**
```
<figure><img src=".gitbook/assets/architecture.png" alt="Frigg architecture"><figcaption><p>Frigg request flow</p></figcaption></figure>
```

**Expandable** — standard HTML `<details>` renders as a collapsible block:
```
<details>
<summary>Show the full config</summary>

...content...

</details>
```

## Authoritative references (keep this skill honest)

GitBook maintains and updates its own artifacts — prefer them when in doubt:

- **Official GitBook `skill.md`** for AI coding assistants — the canonical, always-current
  block/config reference: <https://gitbook.com/docs/creating-content/ai-coding-assistants-and-skillmd>
- **GitBook Skill Generator** — generate a `SKILL.md` grounded in *our own* live
  docs (paste `docs.friggframework.org`): <https://www.gitbook.com/skill-generator>
- Blocks reference (append `.md` to any docs URL for the markdown source):
  <https://gitbook.com/docs/creating-content/blocks>

If GitBook syntax here ever conflicts with the official skill.md, the official
one wins — update this file.

## Frigg doc conventions (from the docs audit)

- Canonical structure: `getting-started/`, `tutorials/`, `guides/`,
  `reference/`, `api-modules/`, `explanation/`, `architecture-decisions/`,
  `contributing/`, `support/`. See `docs/DOCS-AUDIT-PROPOSAL.md`.
- **One canonical location per topic.** Don't duplicate (`docs/api-modules/` is
  canonical; `docs/api-module-library/` is being retired).
- Retire, don't scatter: move obsolete docs to `docs/_archive/` (not in
  `SUMMARY.md`) rather than leaving stale files in the tree.
- Keep `CLAUDE.md` version facts current (Node >= 22, npm >= 10).
