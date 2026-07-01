# GitBook Git-Sync block syntax — full reference

Literal markdown forms GitBook uses in synced `.md` files. Every opener needs its
matching closer. When unsure, cross-check the official GitBook skill.md linked in
`../SKILL.md`, or fetch any GitBook docs page with `.md` appended to see its source.

## Hints / callouts

```
{% hint style="info" %}    ← info | warning | danger | success
Body markdown (supports **bold**, links, lists, code).
{% endhint %}
```

## Tabs

```
{% tabs %}
{% tab title="First" %}
Content for tab one.
{% endtab %}

{% tab title="Second" %}
Content for tab two.
{% endtab %}
{% endtabs %}
```

## Code blocks

Plain fenced code works natively. For a title, wrapping, or line numbers, wrap a
fenced block in `{% code %}`:

```
{% code title="handler.js" overflow="wrap" lineNumbers="true" %}
```javascript
module.exports.handler = async (event) => { /* ... */ };
```
{% endcode %}
```

Attributes: `title="..."`, `lineNumbers="true"`, `overflow="wrap"` (or `scroll`).

## Page-reference cards (content-ref)

Render a link to another page as a card. Provide the visible fallback link inside:

```
{% content-ref url="reference/cli.md" %}
[cli.md](reference/cli.md)
{% endcontent-ref %}
```

## Steppers

```
{% stepper %}
{% step %}
### Step one heading
Step body.
{% endstep %}

{% step %}
### Step two heading
Step body.
{% endstep %}
{% endstepper %}
```

## Embeds

```
{% embed url="https://www.youtube.com/watch?v=xxxx" %}
```

Works for videos, tweets, CodeSandbox, and generic URLs (renders an OG card).

## Images and files

Store assets under `docs/.gitbook/assets/`. Simple image:

```
![Alt text](.gitbook/assets/diagram.png)
```

Image with caption / sizing uses the `<figure>` form:

```
<figure>
  <img src=".gitbook/assets/diagram.png" alt="Alt text">
  <figcaption><p>Optional caption</p></figcaption>
</figure>
```

## Expandable sections

Standard HTML `<details>` renders as a GitBook expandable. Leave blank lines
around inner markdown so it parses:

```
<details>
<summary>Click to expand</summary>

Inner markdown here.

</details>
```

## Tables

Standard GitHub-flavored markdown tables render as GitBook table blocks — no
special syntax needed:

```
| Command | Description |
| ------- | ----------- |
| `frigg` | Interactive CLI |
```

## Cards grid

A row of cards is authored as a table with a header GitBook recognizes, or via
the UI. For Git Sync, prefer `{% content-ref %}` cards or a plain table unless
you specifically need the visual card grid.

## SUMMARY.md (navigation)

`docs/SUMMARY.md` is a nested markdown list of links, relative to `docs/`. The
order and nesting define the sidebar. Example:

```
# Table of contents

* [Welcome](README.md)

## Getting Started

* [Quick Start](getting-started/quick-start.md)
* [Installation](getting-started/installation.md)

## Reference

* [CLI](reference/cli.md)
* [API Modules](api-modules/README.md)
  * [HubSpot](api-modules/hubspot/README.md)
```

Rules:
- A page must be listed here to appear in the site nav.
- Use `##` group headings to create sidebar sections.
- Keep paths relative and pointing at real files (broken paths → `broken-reference`).

## .gitbook.yaml

Repo-root config. For this monorepo:

```yaml
root: ./docs/
```

Optional keys (only if needed): `structure.readme` and `structure.summary` to
point at non-default filenames, and `redirects:` for moved pages
(`redirects: old/path: new/path.md`).

## Variables (optional)

Define reusable values in `docs/.gitbook/vars.yaml` and reference them:

```
{% hint style="info" %}
Current version: {{ vars.version }}
{% endhint %}
```
