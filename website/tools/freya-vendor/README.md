# Vendored Freya runtime

The "Ask Freya" assistant (`friggframework-api/assistant.js`) runs on the
[Freya agent framework](https://github.com/lefthookhq/freya). Freya is an ESM,
pnpm-workspace monorepo of `@freyaframework/*` packages that is **not published
to npm**, so we vendor a prebuilt, self-contained bundle into the site instead of
depending on it at install time.

## What's here

| File | Role |
|---|---|
| `entry.mjs` | The bundling seed. Wires a minimal Freya runtime (Anthropic LLM + in-memory adapters + a small roadmap-retrieval tool surface) and exports `runTurn({ systemPrompt, model, messages, data }) → string`. |
| `build.mjs` | esbuild driver. Bundles `entry.mjs` + everything it imports from `@freyaframework/*` into the committed artifact below. |
| `../../friggframework-api/lib/freya-runtime.mjs` | **Generated, committed.** The self-contained bundle the Netlify function dynamic-imports. Do not edit by hand. |

## Regenerating the bundle

You need a built Freya checkout:

```bash
git clone https://github.com/lefthookhq/freya
cd freya && pnpm install && pnpm build
```

Then, from this repo:

```bash
FREYA_DIR=/path/to/freya node website/tools/freya-vendor/build.mjs
```

`FREYA_DIR` defaults to a sibling `../freya` next to the frigg checkout. Commit the
regenerated `friggframework-api/lib/freya-runtime.mjs`. Re-run whenever the pinned
Freya version should move.

## Design notes

- **Minimal graph.** `entry.mjs` deep-imports the specific adapters it needs
  (`AnthropicLLM`, the in-memory memory/session/ontology repos, `FakeEmbedding`)
  rather than the package barrels, keeping the transformers-js embedding adapter
  and the Postgres adapters out of the bundle. The only optional deps left
  external — `@huggingface/transformers`, `pg`, `onnxruntime-node`, `sharp` — are
  reached only through lazy `import()`s that this assistant never triggers.
- **Frigg-domain ontology.** `entry.mjs` defines a small typed ontology (Platform,
  ApiModule, Integration, Primitive, Capability, Adr, Visitor) that Freya renders
  into the system prompt each turn, so the agent reasons in Frigg's vocabulary.
  It's prompt-only grounding today; with the in-memory (ephemeral) store, post-turn
  memory capture is deterministic and effectively discarded on cold start. When the
  site gets a durable memory store (Freya's Supabase/Postgres adapters), the same
  typed entities make capture meaningful.
- **Stateless per request.** In-memory repos reset on cold start; the widget sends
  full history each call, so `runTurn` seeds a fresh session from that history and
  runs the final user turn against it.
- **The seam.** `assistant.js` calls `runTurn` at the `FREYA-SEAM`; the HTTP
  contract, rate limiter, and offline path are unchanged from the pre-Freya version.
