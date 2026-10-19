# Capability manifests against the real API modules

Audit of every `*.capabilities.json` in this directory against the Api class it names (ADR-063 phase 4). The manifests
began as bundled mocks; for each module whose source could be found, every `method` was checked to exist on the real
Api class and every call shape was read against the method's real signature.

Re-run it (no network, nothing instantiated). **One run per module, with that module's checkout first**: the
api-module-library branches that carry the new methods are separate worktrees, and every worktree also holds an older copy
of the other modules, so a single run with several roots lets the first root's stale copy of (say) `stripe` win. The
roots below are the specific module directories, so nothing else can match:

```bash
M=packages/core/integrations/definitions/scripts/check-manifests.js
node $M --stub-missing ~/aml-hubspot/packages/v1-ready/hubspot        # hubspot   (PR #106)
node $M --stub-missing ~/aml-salesforce/packages/v1-ready/salesforce  # salesforce (PR #107)
node $M --stub-missing ~/aml-stripe/packages/v1-ready/stripe          # stripe    (PR #108)
node $M --stub-missing ~/aml-linear/packages/v1-ready/linear          # linear    (PR #109)
node $M --stub-missing ~/aml-small/packages/v1-ready                  # asana, fathom (PR #110)
node $M --stub-missing ~/aml-small/packages/needs-updating            # slack     (PR #110)
node $M --stub-missing <built pipedrive>                              # pipedrive (PR #110): src/api.ts has no dist, so
                                                                      # compile it first (tsc --outDir dist --noCheck)
node $M --stub-missing ~/quo--frigg/backend/src/api-modules           # quo (the deployed Left Hook module)
```

Each run reports every manifest, so read only the line for the module you are checking (the others resolve to nothing or
to an older copy). Run from the repo root: loading an Api pulls in `@friggframework/core`, which reads `package.json`
from the working directory. (`--stub-missing` stands in for dependencies that are not installed here, such as jsforce,
stripe and @linear/sdk, so the Api's methods can be read.)

## Methods that landed after this audit

The capabilities this file first marked unimplemented for hubspot, salesforce, stripe, linear, asana, pipedrive, fathom
and slack now have methods, on unmerged api-module-library branches: **#106 (hubspot), #107 (salesforce), #108 (stripe),
#109 (linear), #110 (asana, pipedrive, fathom, slack)**, stacked on #105. The manifests describe those methods, so **a
definition that uses them needs the module releases that carry those PRs**; against an older release the call fails at
runtime with "not a function". Exceptions that stay unimplemented: Salesforce's signed webhook (it has none: CDC arrives
over the Pub/Sub stream and Outbound Messages are unsigned), and Quo's `contact.search`, which is not part of that work.
Two shape notes:

- HubSpot `deal.search` was reshaped to the real `searchDeals({ filterGroups, sorts, props, limit, after, allProps })`;
  the old open/closeDateBefore/closeDateAfter/minAmount inputs never existed in the Api and are now `filterGroups`
  filters (`hs_is_closed`, `closedate`, `amount`). The Api returns HubSpot's `{ results, paging }` page, not a bare array,
  so a step that indexes the result as a list (`$.steps.deals[0]`) reads the page object: the `hubspot-slack` example still
  does and is a mock-era shape to revisit.
- HubSpot `deal.update` is `updateDeal({ dealId, properties })`: one object, so the input is now `dealId` (it was `id`).

## How to read this

- **ok**: the method exists on the Api class and the call is shaped as the method takes it.
- **unimplemented**: the real Api has no method that does this (or none that can be called as the capability is
  shaped). The manifest carries `"status": "unimplemented"` and a `note`; a definition that uses the capability
  validates with a **warning**, never an error. The capability name is unchanged so existing definitions keep validating.
- **unverified**: no source for the module was available; its manifest is unchanged from the mock.
- **Call shape**. A capability with no `args` is called `api.method(input)` with one object holding every input.
  Nearly every real method takes positional arguments instead (`getContactById(id)`, `updateContact(id, properties)`),
  so the manifest now carries `args`: an ordered list of input names, `"$rest"` (the inputs not named elsewhere, as
  one object) or `{ "value": x }` (a constant, e.g. the sObject name of Salesforce's generic `get(object, id)`).
  `runtime.js` `argumentsFor` spreads them. An input that is declared but never passed is refused by the manifest check,
  because it would be accepted and silently dropped.
- **Webhook verification.** Every manifest names `verifyWebhookSignature`. No real module has it (only clio, which has no
  manifest). Each real module's `webhook` block was marked `"status": "unimplemented"`; since api-module-library
  659b90d eight of them verify signatures (Salesforce has no signed webhook and stays unimplemented), and a workflow that triggers on
  its events validates with a warning: every delivery would fail signature verification.

## Summary

| Module | Source checked | Capabilities | Renamed method | Call shape fixed | Inputs changed | Unimplemented upstream |
|---|---|---|---|---|---|---|
| asana | ~/api-module-library/packages/v1-ready/asana | 6 | 3 | 1 | 2 | 0 |
| calendly | none found | 6 | - | - | - | - |
| docusign | none found | 5 | - | - | - | - |
| fathom | ~/api-module-library/packages/v1-ready/fathom | 5 | 2 | 2 | 0 | 0 |
| github | none found | 6 | - | - | - | - |
| hubspot | ~/api-module-library/packages/v1-ready/hubspot | 23 | 0 | 5 | 1 | 0 |
| jira | none found | 12 | - | - | - | - |
| klaviyo | none found | 14 | - | - | - | - |
| linear | ~/api-module-library/packages/v1-ready/linear | 9 | 0 | 0 | 0 | 0 |
| netsuite | none found | 15 | - | - | - | - |
| notion | none found | 6 | - | - | - | - |
| pipedrive | ~/aml-small/packages/v1-ready/pipedrive (compiled src/api.ts) | 11 | 4 | 3 | 1 | 0 |
| quickbooks | none found | 14 | - | - | - | - |
| quo | ~/quo--frigg/backend/src/api-modules/quo | 13 | 1 | 4 | 0 | 1 |
| salesforce | ~/api-module-library/packages/v1-ready/salesforce | 12 | 5 | 5 | 0 | 0 (webhook signing aside) |
| shopify | none found | 15 | - | - | - | - |
| slack | ~/api-module-library/packages/needs-updating/slack | 7 | 2 | 1 | 0 | 0 |
| stripe | ~/api-module-library/packages/v1-ready/stripe | 9 | 1 | 0 | 0 | 0 |
| tidewater | none found | 13 | - | - | - | - |
| webflow | none found | 5 | - | - | - | - |
| zendesk | none found | 8 | - | - | - | - |

Modules with no source to check against: calendly, docusign, github, jira, klaviyo, netsuite, notion, quickbooks, shopify, tidewater, webflow, zendesk. Their capabilities are still mock-shaped:
nothing in them is known to exist.

Where a module has two candidates the first root given wins. Quo is checked against the deployed
`quo--frigg/backend/src/api-modules/quo` (the Left Hook module: `createUnifiedWebhook`, `updateContact`). The library's `v1-ready/quo` 1.0.0 lacks `updateContact` and has `createCallWebhook` and friends
instead of one webhook method. Pipedrive is checked against the compiled TypeScript source of the api-module-library branch (the library copy has no `dist`).

Manifest versions in the files (for example HubSpot 1.4.0, Asana 1.5.1) are ahead of the module sources audited (HubSpot
1.1.7, Asana 1.1.5): the manifests describe modules that were never released as written.

## Asana (`asana`)

Checked against `~/api-module-library/packages/v1-ready/asana` (@friggframework/api-module-asana manifest 1.5.1).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `task.get` | `getTaskById` | ok | `getTaskById(id)` | Api.getTaskById(id) takes only the id; field selection (opt_fields) is not supported. (method was `getTask`; called with one object; now positional; inputs were taskGid, opt_fields) |
| `task.search` | `searchTasksInWorkspace` | ok (unreleased) | `searchTasksInWorkspace(workspaceId, params = {})` | Implemented in api-module-library #110; needs the release that includes it. |
| `project.list` | `listProjects` | ok | `listProjects(params)` | (method was `getProjects`; inputs were workspaceGid, archived) |
| `workspace.list` | `listWorkspaces` | ok | `listWorkspaces()` | (method was `getWorkspaces`) |
| `webhook.create` | `createWebhook` | ok (unreleased) | `createWebhook(resource, target, filters)` | Implemented in api-module-library #110; needs the release that includes it. |
| `webhook.delete` | `deleteWebhook` | ok (unreleased) | `deleteWebhook(webhookGid)` | Implemented in api-module-library #110; needs the release that includes it. |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## Calendly (`calendly`)

**No module source available** (No directory named calendly or api-module-calendly). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `invitee.get` | `getInvitee` | unverified |  |  |
| `event.get` | `getScheduledEvent` | unverified |  |  |
| `event.list` | `listScheduledEvents` | unverified |  |  |
| `eventType.list` | `listEventTypes` | unverified |  |  |
| `webhook.create` | `createWebhookSubscription` | unverified |  |  |
| `webhook.delete` | `deleteWebhookSubscription` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## DocuSign eSignature (`docusign`)

**No module source available** (No directory named docusign or api-module-docusign). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `envelope.get` | `getEnvelope` | unverified |  |  |
| `envelope.list` | `listStatusChanges` | unverified |  |  |
| `document.combined` | `getCombinedDocument` | unverified |  |  |
| `connect.create` | `createConnectConfiguration` | unverified |  |  |
| `connect.delete` | `deleteConnectConfiguration` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Fathom (`fathom`)

Checked against `~/api-module-library/packages/v1-ready/fathom` (@friggframework/api-module-fathom manifest 0.4.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `meeting.list` | `listMeetings` | ok | `listMeetings(params = {})` |  |
| `meeting.summary` | `getSummary` | ok | `getSummary(recordingId, params = {})` | (method was `getRecordingSummary`; called with one object; now positional) |
| `meeting.transcript` | `getTranscript` | ok | `getTranscript(recordingId, params = {})` | (method was `getRecordingTranscript`; called with one object; now positional) |
| `webhook.create` | `createWebhook` | ok | `createWebhook(data)` |  |
| `webhook.delete` | `deleteWebhook` | ok (unreleased) | `deleteWebhook(id)` | Implemented in api-module-library #110; needs the release that includes it. |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## GitHub (`github`)

**No module source available** (No directory named github or api-module-github). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `issue.get` | `getIssue` | unverified |  |  |
| `issue.list` | `listIssuesForRepo` | unverified |  |  |
| `issue.create` | `createIssue` | unverified |  |  |
| `issue.update` | `updateIssue` | unverified |  |  |
| `issue.comment` | `createIssueComment` | unverified |  |  |
| `repo.list` | `listInstallationRepos` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## HubSpot (`hubspot`)

Checked against `~/api-module-library/packages/v1-ready/hubspot` (@friggframework/api-module-hubspot manifest 1.4.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `contact.get` | `getContactById` | ok | `getContactById(contactId)` | Api.getContactById(id) always requests the portal's full property list; a properties argument is not supported. (called with one object; now positional; inputs were id, properties) |
| `contact.search` | `searchContacts` | ok (unreleased) | `searchContacts(params = {})` | Implemented in api-module-library #106; needs the release that includes it. |
| `contact.list` | `listContacts` | ok | `listContacts(params)` | Api.listContacts({ after, limit, properties }) has no modified-since filter, so updatedSince is ignored and a poll re-lists every contact. |
| `contact.create` | `createContact` | ok | `createContact(body)` | (called with one object; now positional) |
| `contact.update` | `updateContact` | ok | `updateContact(contactId, properties)` | (called with one object; now positional) |
| `deal.get` | `getDealById` | ok | `getDealById(dealId)` | (called with one object; now positional) |
| `deal.listForContact` | `listDealsForContact` | ok (unreleased) | `listDealsForContact(contactId, open)` | Implemented in api-module-library #106; needs the release that includes it. |
| `deal.contacts` | `listContactsForDeal` | ok (unreleased) | `listContactsForDeal(dealId)` | Implemented in api-module-library #106; needs the release that includes it. |
| `task.create` | `createTask` | ok (unreleased) | `createTask(properties, contactId)` | Implemented in api-module-library #106; needs the release that includes it. |
| `call.create` | `createCallEngagement` | ok (unreleased) | `createCallEngagement(properties, contactId)` | Implemented in api-module-library #106; needs the release that includes it. |
| `note.create` | `createNote` | ok (unreleased) | `createNote(properties, contactId, dealId)` | Implemented in api-module-library #106; needs the release that includes it. |
| `owner.list` | `listOwners` | ok (unreleased) | `listOwners()` | Implemented in api-module-library #106; needs the release that includes it. |
| `pipeline.stages` | `listDealStages` | ok (unreleased) | `listDealStages(pipelineId)` | Implemented in api-module-library #106; needs the release that includes it. |
| `contact.upsertByEmail` | `upsertContactByEmail` | ok (unreleased) | `upsertContactByEmail(email, properties)` | Implemented in api-module-library #106; needs the release that includes it. |
| `deal.update` | `updateDeal` | ok (unreleased) | `updateDeal(params)` | Api.updateDeal({ dealId, properties }) takes one object, so the input is dealId (it was id). Implemented in api-module-library #106; needs the release that includes it. |
| `deal.search` | `searchDeals` | ok (unreleased) | `searchDeals(params)` | Api.searchDeals takes HubSpot filterGroups ([{ filters: [{ propertyName, operator, value }] }]), sorts, props, limit, after and allProps (default true: every deal property when props is empty). The capability was reshaped from open/closeDateBefore/closeDateAfter/minAmount, which the Api never had; a definition expresses those as filterGroups. Implemented in api-module-library #106; needs the release that includes it. |
| `task.get` | `getTaskById` | ok (unreleased) | `getTaskById(id, properties)` | Implemented in api-module-library #106; needs the release that includes it. |
| `task.update` | `updateTask` | ok (unreleased) | `updateTask(id, properties)` | Implemented in api-module-library #106; needs the release that includes it. |
| `task.search` | `searchTasks` | ok (unreleased) | `searchTasks(params = {})` | Implemented in api-module-library #106; needs the release that includes it. |
| `owner.get` | `getOwnerById` | ok | `getOwnerById(ownerId)` | (called with one object; now positional) |
| `owner.findByEmail` | `getOwnerByEmail` | ok (unreleased) | `getOwnerByEmail(email)` | Implemented in api-module-library #106; needs the release that includes it. |
| `subscription.definitions` | `listSubscriptionDefinitions` | ok (unreleased) | `listSubscriptionDefinitions()` | Implemented in api-module-library #106; needs the release that includes it. |
| `subscription.unsubscribe` | `unsubscribeEmail` | ok (unreleased) | `unsubscribeEmail(emailAddress, subscriptionId, legalBasis, legalBasisExplanation)` | Implemented in api-module-library #106; needs the release that includes it. |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## Jira Cloud (`jira`)

**No module source available** (No directory named jira or api-module-jira). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `issue.create` | `createIssue` | unverified |  |  |
| `issue.get` | `getIssue` | unverified |  |  |
| `issue.update` | `editIssue` | unverified |  |  |
| `issue.addComment` | `addComment` | unverified |  |  |
| `issue.transition` | `transitionIssue` | unverified |  |  |
| `issue.search` | `searchJql` | unverified |  |  |
| `remoteLink.create` | `createRemoteLink` | unverified |  |  |
| `project.list` | `listProjects` | unverified |  |  |
| `issueType.list` | `listIssueTypes` | unverified |  |  |
| `webhook.register` | `registerDynamicWebhooks` | unverified |  |  |
| `webhook.refresh` | `refreshWebhooks` | unverified |  |  |
| `webhook.delete` | `deleteWebhooks` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Klaviyo (`klaviyo`)

**No module source available** (No directory named klaviyo or api-module-klaviyo). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `profile.get` | `getProfile` | unverified |  |  |
| `profile.search` | `getProfiles` | unverified |  |  |
| `profile.list` | `listProfiles` | unverified |  |  |
| `profile.create` | `createProfile` | unverified |  |  |
| `profile.update` | `updateProfile` | unverified |  |  |
| `profile.upsert` | `createOrUpdateProfile` | unverified |  |  |
| `profile.lists` | `getProfileLists` | unverified |  |  |
| `profile.subscribe` | `subscribeProfiles` | unverified |  |  |
| `profile.unsubscribe` | `unsubscribeProfiles` | unverified |  |  |
| `list.list` | `getLists` | unverified |  |  |
| `list.addProfiles` | `addProfilesToList` | unverified |  |  |
| `event.create` | `createEvent` | unverified |  |  |
| `webhook.create` | `createWebhook` | unverified |  |  |
| `webhook.delete` | `deleteWebhook` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Linear (`linear`)

Checked against `~/api-module-library/packages/v1-ready/linear` (@friggframework/api-module-linear manifest 1.1.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `issue.get` | `issue` | ok (unreleased) | `issue(id)` | Implemented in api-module-library #109; needs the release that includes it. |
| `issue.byIdentifier` | `issueByIdentifier` | ok (unreleased) | `issueByIdentifier(identifier)` | Implemented in api-module-library #109; needs the release that includes it. |
| `issue.search` | `searchIssues` | ok (unreleased) | `searchIssues(teamId, stateType, updatedBefore, first)` | Implemented in api-module-library #109; needs the release that includes it. |
| `issue.create` | `issueCreate` | ok (unreleased) | `issueCreate(teamId, title, description, priority, stateName, labelIds)` | Implemented in api-module-library #109; needs the release that includes it. |
| `issue.update` | `issueUpdate` | ok (unreleased) | `issueUpdate(id, input)` | Implemented in api-module-library #109; needs the release that includes it. |
| `comment.create` | `commentCreate` | ok (unreleased) | `commentCreate(issueId, body)` | Implemented in api-module-library #109; needs the release that includes it. |
| `attachment.link` | `attachmentLinkURL` | ok (unreleased) | `attachmentLinkURL(issueId, url, title)` | Implemented in api-module-library #109; needs the release that includes it. |
| `team.list` | `teams` | ok (unreleased) | `teams()` | Implemented in api-module-library #109; needs the release that includes it. |
| `workflowState.list` | `workflowStates` | ok (unreleased) | `workflowStates(teamId, name)` | Implemented in api-module-library #109; needs the release that includes it. |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## NetSuite (`netsuite`)

**No module source available** (No directory named netsuite or api-module-netsuite). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `customer.get` | `getCustomer` | unverified |  |  |
| `customer.search` | `searchCustomers` | unverified |  |  |
| `customer.list` | `listCustomers` | unverified |  |  |
| `customer.create` | `createCustomer` | unverified |  |  |
| `customer.update` | `updateCustomer` | unverified |  |  |
| `salesOrder.create` | `createSalesOrder` | unverified |  |  |
| `salesOrder.get` | `getSalesOrder` | unverified |  |  |
| `salesOrder.update` | `updateSalesOrder` | unverified |  |  |
| `salesOrder.search` | `searchSalesOrders` | unverified |  |  |
| `creditMemo.create` | `createCreditMemo` | unverified |  |  |
| `itemFulfillment.get` | `getItemFulfillment` | unverified |  |  |
| `itemFulfillment.list` | `listItemFulfillments` | unverified |  |  |
| `item.search` | `searchItems` | unverified |  |  |
| `subsidiary.list` | `listSubsidiaries` | unverified |  |  |
| `location.list` | `listLocations` | unverified |  |  |

## Notion (`notion`)

**No module source available** (No directory named notion or api-module-notion). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `page.create` | `createPage` | unverified |  |  |
| `page.get` | `retrievePage` | unverified |  |  |
| `page.update` | `updatePage` | unverified |  |  |
| `block.append` | `appendBlockChildren` | unverified |  |  |
| `database.query` | `queryDatabase` | unverified |  |  |
| `database.list` | `searchDatabases` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Pipedrive (`pipedrive`)

Checked against the api-module-library branch source `~/aml-small/packages/v1-ready/pipedrive` (src/api.ts, compiled; PR #110), manifest 2.1.0. The built 2.1.0 in `~/quo--frigg/backend/node_modules/@friggframework` predates `addPerson`/`updatePerson`.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `person.get` | `getPerson` | ok | `getPerson(personId, params)` | (called with one object; now positional) |
| `person.search` | `searchPersons` | ok | `searchPersons(params)` |  |
| `person.list` | `listPersons` | ok | `listPersons(params)` |  |
| `person.create` | `addPerson` | ok (unreleased) | `addPerson(person)` | Implemented in api-module-library #110; needs the release that includes it. |
| `person.update` | `updatePerson` | ok (unreleased) | `updatePerson(personId, person)` | Implemented in api-module-library #110; needs the release that includes it. |
| `activity.create` | `createActivity` | ok | `createActivity(params)` | (method was `addActivity`; called with one object; now positional) |
| `activity.list` | `listActivities` | ok | `listActivities(params)` |  |
| `deal.listForPerson` | `listDeals` | ok | `listDeals(params)` | (method was `listPersonDeals`; inputs were personId, status) |
| `user.list` | `listUsers` | ok | `listUsers()` | (method was `getUsers`) |
| `webhook.create` | `createWebhook` | ok | `createWebhook(params)` | (method was `addWebhook`) |
| `webhook.delete` | `deleteWebhook` | ok | `deleteWebhook(webhookId)` | (called with one object; now positional) |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## QuickBooks Online (`quickbooks`)

**No module source available** (No directory named quickbooks or api-module-quickbooks). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `customer.get` | `getCustomer` | unverified |  |  |
| `customer.query` | `queryCustomers` | unverified |  |  |
| `customer.list` | `listCustomers` | unverified |  |  |
| `customer.create` | `createCustomer` | unverified |  |  |
| `customer.update` | `updateCustomer` | unverified |  |  |
| `salesReceipt.create` | `createSalesReceipt` | unverified |  |  |
| `refundReceipt.create` | `createRefundReceipt` | unverified |  |  |
| `invoice.create` | `createInvoice` | unverified |  |  |
| `invoice.get` | `getInvoice` | unverified |  |  |
| `invoice.send` | `sendInvoice` | unverified |  |  |
| `payment.get` | `getPayment` | unverified |  |  |
| `deposit.create` | `createDeposit` | unverified |  |  |
| `item.list` | `listItems` | unverified |  |  |
| `account.list` | `listAccounts` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Quo (`quo`)

Checked against `~/quo--frigg/backend/src/api-modules/quo` (@lefthook/api-module-quo manifest 2.1.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `contact.get` | `getContact` | ok | `getContact(id)` | (called with one object; now positional) |
| `contact.search` | `searchContacts` | unimplemented | none | Api has no contact search; listContacts filters by externalIds and sources only. |
| `contact.list` | `listContacts` | ok | `listContacts(params = {})` |  |
| `contact.create` | `createContact` | ok | `createContact(data)` |  |
| `contact.update` | `updateContact` | ok | `updateContact(id, data)` | (called with one object; now positional) |
| `call.list` | `listCalls` | ok | `listCalls(params = {})` |  |
| `call.recording` | `getCallRecordings` | ok | `getCallRecordings(callId)` | (called with one object; now positional) |
| `message.send` | `sendMessage` | ok | `sendMessage(data)` |  |
| `message.list` | `listMessages` | ok | `listMessages(params = {})` |  |
| `phoneNumber.list` | `listPhoneNumbers` | ok | `listPhoneNumbers(params = {})` |  |
| `user.list` | `listUsers` | ok | `listUsers(params = {})` |  |
| `webhook.create` | `createUnifiedWebhook` | ok | `createUnifiedWebhook(data)` | (method was `createWebhook`) |
| `webhook.delete` | `deleteWebhook` | ok | `deleteWebhook(id)` | (called with one object; now positional) |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## Salesforce (`salesforce`)

Checked against `~/api-module-library/packages/v1-ready/salesforce` (@friggframework/api-module-salesforce manifest 3.0.2).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `lead.get` | `get` | ok | `get(object, id)` | (method was `getLead`; called with one object; now positional) |
| `lead.create` | `create` | ok | `create(object, data)` | (method was `createLead`; called with one object; now positional) |
| `lead.update` | `updateLead` | ok (unreleased) | `updateLead(id, fields)` | Implemented in api-module-library #107; needs the release that includes it. |
| `person.searchByEmail` | `searchPeopleByEmail` | ok (unreleased) | `searchPeopleByEmail(email)` | Implemented in api-module-library #107; needs the release that includes it. |
| `event.create` | `create` | ok | `create(object, data)` | (method was `createEvent`; called with one object; now positional) |
| `event.update` | `updateEvent` | ok (unreleased) | `updateEvent(id, fields)` | Implemented in api-module-library #107; needs the release that includes it. |
| `opportunity.get` | `get` | ok | `get(object, id)` | (method was `getOpportunity`; called with one object; now positional) |
| `opportunity.update` | `updateOpportunity` | ok (unreleased) | `updateOpportunity(id, fields)` | Implemented in api-module-library #107; needs the release that includes it. |
| `task.create` | `create` | ok | `create(object, data)` | (method was `createTask`; called with one object; now positional) |
| `file.attach` | `createContentVersion` | ok (unreleased) | `createContentVersion(title, pathOnClient, versionData, firstPublishLocationId)` | Implemented in api-module-library #107; needs the release that includes it. |
| `note.create` | `createContentNote` | ok (unreleased) | `createContentNote(title, content, linkedEntityId)` | Implemented in api-module-library #107; needs the release that includes it. |
| `user.list` | `listUsers` | ok (unreleased) | `listUsers(activeOnly = false)` | Implemented in api-module-library #107; needs the release that includes it. |
| `webhook.verify` | `verifyWebhookSignature` | unimplemented | | Not a webhook: CDC arrives over the Pub/Sub or CometD stream; Outbound Messages are unsigned (OrganizationId + IP allowlist). Deliveries are rejected. |

## Shopify (`shopify`)

**No module source available** (No directory named shopify or api-module-shopify). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `order.get` | `getOrder` | unverified |  |  |
| `order.list` | `listOrders` | unverified |  |  |
| `order.update` | `updateOrder` | unverified |  |  |
| `order.fulfillmentOrders` | `listFulfillmentOrders` | unverified |  |  |
| `fulfillment.create` | `createFulfillment` | unverified |  |  |
| `customer.get` | `getCustomer` | unverified |  |  |
| `customer.list` | `listCustomers` | unverified |  |  |
| `customer.search` | `searchCustomers` | unverified |  |  |
| `customer.create` | `createCustomer` | unverified |  |  |
| `customer.update` | `updateCustomer` | unverified |  |  |
| `checkout.list` | `listAbandonedCheckouts` | unverified |  |  |
| `variant.byInventoryItem` | `getVariantByInventoryItemId` | unverified |  |  |
| `location.list` | `listLocations` | unverified |  |  |
| `webhook.create` | `createWebhook` | unverified |  |  |
| `webhook.delete` | `deleteWebhook` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Slack (`slack`)

Checked against `~/api-module-library/packages/needs-updating/slack` (@friggframework/api-module-slack manifest 2.0.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `message.post` | `postMessage` | ok | `postMessage(body)` |  |
| `message.update` | `updateMessage` | ok | `updateMessage(body)` |  |
| `message.postEphemeral` | `postEphemeral` | ok | `postEphemeral(body)` |  |
| `message.permalink` | `getMessagePermalink` | ok | `getMessagePermalink(query)` | (method was `getPermalink`) |
| `channel.list` | `listChannels` | ok | `listChannels(query)` | (method was `listConversations`) |
| `user.list` | `listUsers` | ok (unreleased) | `listUsers(query = {})` | Implemented in api-module-library #110; needs the release that includes it. |
| `user.lookupByEmail` | `lookupUserByEmail` | ok | `lookupUserByEmail(email)` | (called with one object; now positional) |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## Stripe (`stripe`)

Checked against `~/api-module-library/packages/v1-ready/stripe` (@friggframework/api-module-stripe manifest 2.3.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `customer.get` | `retrieveCustomer` | ok (unreleased) | `retrieveCustomer(id, params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `customer.list` | `listCustomers` | ok (unreleased) | `listCustomers(params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `customer.search` | `searchCustomers` | ok (unreleased) | `searchCustomers(query, params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `customer.create` | `createCustomer` | ok (unreleased) | `createCustomer(params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `customer.update` | `updateCustomer` | ok (unreleased) | `updateCustomer(id, params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `paymentIntent.get` | `retrievePaymentIntent` | ok (unreleased) | `retrievePaymentIntent(id, params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `refund.get` | `retrieveRefund` | ok (unreleased) | `retrieveRefund(id, params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `payout.list` | `listPayouts` | ok (unreleased) | `listPayouts(params = {}, options = {})` | Implemented in api-module-library #108; needs the release that includes it. |
| `balanceTransaction.list` | `getBalanceTransactions` | ok | `getBalanceTransactions(params)` | (method was `listBalanceTransactions`) |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## Tidewater (`tidewater`)

**No module source available** (No directory named tidewater or api-module-tidewater). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `customer.get` | `getCustomer` | unverified |  |  |
| `customer.list` | `listCustomers` | unverified |  |  |
| `customer.create` | `createCustomer` | unverified |  |  |
| `customer.update` | `updateCustomer` | unverified |  |  |
| `job.get` | `getJob` | unverified |  |  |
| `job.search` | `searchJobs` | unverified |  |  |
| `job.lineItems` | `listJobLineItems` | unverified |  |  |
| `job.update` | `updateJob` | unverified |  |  |
| `job.markPaid` | `recordJobPayment` | unverified |  |  |
| `job.addNote` | `createJobNote` | unverified |  |  |
| `technician.list` | `listTechnicians` | unverified |  |  |
| `webhook.create` | `createWebhookSubscription` | unverified |  |  |
| `webhook.delete` | `deleteWebhookSubscription` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Webflow (`webflow`)

**No module source available** (No directory named webflow or api-module-webflow). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `site.list` | `listSites` | unverified |  |  |
| `form.list` | `listForms` | unverified |  |  |
| `form.submissions` | `listFormSubmissions` | unverified |  |  |
| `webhook.create` | `createWebhook` | unverified |  |  |
| `webhook.delete` | `deleteWebhook` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |

## Zendesk Support (`zendesk`)

**No module source available** (No directory named zendesk or api-module-zendesk). Nothing here is verified; the manifest is still a mock.

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `ticket.get` | `showTicket` | unverified |  |  |
| `ticket.update` | `updateTicket` | unverified |  |  |
| `ticket.addComment` | `addTicketComment` | unverified |  |  |
| `ticket.search` | `searchTickets` | unverified |  |  |
| `user.get` | `showUser` | unverified |  |  |
| `group.list` | `listGroups` | unverified |  |  |
| `webhook.create` | `createWebhook` | unverified |  |  |
| `webhook.delete` | `deleteWebhook` | unverified |  |  |
| `webhook.verify` | `verifyWebhookSignature` | unverified | |  |
