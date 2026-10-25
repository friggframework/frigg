# Release-versioned module documentation pilot

Implements the receiving half of [ADR-065](../../docs/architecture-decisions/065-release-versioned-module-documentation-and-catalog.md).
HubSpot is the only enrolled provider. No historical or synthetic releases are
pre-populated. `website/directory/` reads the generated catalog and initially
shows an empty state until a real published bundle is imported.

## Contract and trust boundary

`modules.json` fixes each module ID, npm package, and source package path. Receiver
events accept **only** `package` and `version`. The receiver fetches that exact
version from registry.npmjs.org, verifies the tarball's sha512 integrity, reads two
regular files directly from the tar archive without extracting it, and validates
the bundle against the published package metadata and allowlist. It never imports
the API module, installs its dependencies, runs lifecycle scripts, or checks out a
source ref supplied by the event.

The producer packs `module-docs.bundle.json` inside the published npm package.
That immutable package is the durable bundle store. The receiver adds the verified
npm integrity and bundle digest in `versions/<version>/release.json`; integrity
cannot be embedded in the tarball it hashes. The source input commit and resolved
package metadata together distinguish committed source from the version changes
made by auto/lerna. This is publisher/registry trust, not a new cryptographic npm
publisher-attestation system.

Keep `contract.cjs`, `registry.cjs`, and `modules.json` synchronized with the module
library. Contract v1 intentionally supports a bounded set of Markdown files and
PNG/JPEG/WebP assets, not arbitrary executable docs plugins or HTML. The producer
pilot currently supplies six Markdown pages. Links to local files and navigation
coverage are checked; external URL reachability and anchor rendering still need
the GitBook preview because they are not established by the offline validator.

## Import and retry

The workflow receives `module-docs-published-v1` or manual package/version inputs.
It starts from current `next`, re-verifies pending versions discovered from the
existing `docs/module-releases` PR against npm, then imports the new event. A single
concurrency group serializes changes; a force-with-lease update detects external
branch edits. Pending versions are replayed so a second event cannot discard an
unmerged release. A failed run is visible in Actions. Retry the manual workflow
with the same package/version, without republishing the package.

The concurrency group uses `queue: max` so new events do not replace the one
pending run under GitHub's default queue policy. GitHub still caps that queue at
100 pending runs; canceled/overflowed runs need the same manual retry path.

Exact duplicates produce no changes. Conflicting bytes for an existing identity
fail. An explicit docs-revision protocol is not implemented in this pilot, so
corrections to published snapshots must not be made by editing generated files.
Publish corrected docs with a new package version until a reviewed revision
protocol is added. Older releases cannot replace latest stable and prereleases
cannot promote themselves to stable. Unknown compatibility remains unknown.

The existing HubSpot landing page has an explicit generated-links region. Imports
preserve its authored configuration link and all other existing module paths.
`SUMMARY.md` has a separate generated region; unrelated navigation is preserved.
Every snapshot page is registered in that region so GitBook can import it. A
deterministic `hidden: true` frontmatter wrapper keeps historical snapshots out
of the sidebar; the module landing links to their permanent pages. The wrapper
does not alter the raw bundle preserved in the release manifest.

## Enable after reviewing both repository changes

1. Merge the receiver, validator, catalog UI and HubSpot landing-page enrollment
   into `next`. Ensure `next` requires the **Module docs contract** check before
   merging generated imports. This catches stale projections if next moves after
   an import PR is built; rerun delivery to rebuild the PR against the new base.
2. Bootstrap `.github/workflows/module-docs.yml` on the repository's **default
   branch**, currently `main`, as well. GitHub dispatch events require a workflow
   on the default branch. That workflow explicitly checks out trusted `next` for
   its implementation; copying this one workflow is sufficient. A change only on
   `next` cannot enable repository dispatch. Do not change the default branch as
   a workaround.
3. Install a GitHub App on `friggframework/frigg` with Contents read/write and
   Pull requests read/write. Set `MODULE_DOCS_APP_ID` as a repository variable and
   `MODULE_DOCS_APP_PRIVATE_KEY` as a secret in both repositories. The module
   library sender uses an installation token limited to the destination repo in
   a separate job; its package build job never receives that token.
4. Merge the producer pilot into the module library's `next`; port the tooling
   and HubSpot enrollment to its stable release branch before expecting stable
   bundles. Bootstrap its manual retry workflow on its default branch too.
5. Set `MODULE_DOCS_ENABLED=true` in the module library after the destination is
   ready. Release a new HubSpot package through the existing release process.
   Earlier npm versions without the bundle cannot be backfilled through this path.
6. Review the generated PR, check GitBook's page rendering/navigation and then
   confirm both GitBook publication and the Netlify directory deployment after
   merge. A successful dispatch, an imported PR, and a live page are distinct
   outcomes. The sender's Actions artifact records delivery status; npm preserves
   the bundle for later retries even after transient artifacts expire.

This implementation does not create the App, configure secrets, alter branch
protection, publish npm packages, or bootstrap `main` automatically.

## Local verification

```bash
node --test tools/module-docs/*.test.cjs
node tools/module-docs/check.cjs
```

For a verified release envelope already retrieved from npm:

```bash
node tools/module-docs/import.cjs /absolute/path/to/release.json
```

`check.cjs` compares generated projections without writing them. The receiver test
suite uses synthetic packages in temporary directories; none are site inventory.
Serve `website/` with a static HTTP server to inspect `/directory/`.
