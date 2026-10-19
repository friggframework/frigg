# Capability manifests against the real API modules

Audit of every `*.capabilities.json` in this directory against the Api class it names (ADR-063 phase 4). The manifests
began as bundled mocks; for each module whose source could be found, every `method` was checked to exist on the real
Api class and every call shape was read against the method's real signature.

Re-run it (no network, nothing instantiated):

```bash
node packages/core/integrations/definitions/scripts/check-manifests.js --stub-missing \
  ~/phone-app/backend/src/api-modules ~/phone-app/backend/node_modules/@friggframework \
  ~/api-module-library/packages/v1-ready ~/api-module-library/packages/needs-updating
```

(`--stub-missing` stands in for dependencies that are not installed here, such as jsforce, stripe and @linear/sdk, so
the Api's methods can be read. Roots are searched in order and the first module that loads wins.)

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
| asana | ~/api-module-library/packages/v1-ready/asana | 6 | 3 | 1 | 2 | 3 |
| calendly | none found | 6 | - | - | - | - |
| docusign | none found | 5 | - | - | - | - |
| fathom | ~/api-module-library/packages/v1-ready/fathom | 5 | 2 | 2 | 0 | 1 |
| github | none found | 6 | - | - | - | - |
| hubspot | ~/api-module-library/packages/v1-ready/hubspot | 23 | 0 | 5 | 1 | 17 |
| jira | none found | 12 | - | - | - | - |
| klaviyo | none found | 14 | - | - | - | - |
| linear | ~/api-module-library/packages/v1-ready/linear | 9 | 0 | 0 | 0 | 9 |
| netsuite | none found | 15 | - | - | - | - |
| notion | none found | 6 | - | - | - | - |
| pipedrive | ~/phone-app/backend/node_modules/@friggframework/api-module-pipedrive | 11 | 4 | 3 | 1 | 2 |
| quickbooks | none found | 14 | - | - | - | - |
| phone | ~/phone-app/backend/src/api-modules/phone | 13 | 1 | 4 | 0 | 1 |
| salesforce | ~/api-module-library/packages/v1-ready/salesforce | 12 | 5 | 5 | 0 | 7 |
| shopify | none found | 15 | - | - | - | - |
| slack | ~/api-module-library/packages/needs-updating/slack | 7 | 2 | 1 | 0 | 1 |
| stripe | ~/api-module-library/packages/v1-ready/stripe | 9 | 1 | 0 | 0 | 8 |
| acmeerp | none found | 13 | - | - | - | - |
| webflow | none found | 5 | - | - | - | - |
| zendesk | none found | 8 | - | - | - | - |

Modules with no source to check against: calendly, docusign, github, jira, klaviyo, netsuite, notion, quickbooks, shopify, acmeerp, webflow, zendesk. Their capabilities are still mock-shaped:
nothing in them is known to exist.

Where a module has two candidates the first root given wins. Phone is checked against the deployed
`phone-app/backend/src/api-modules/phone` (the app's own module: `createUnifiedWebhook`, `updateContact`). The library's `v1-ready/phone` 1.0.0 lacks `updateContact` and has `createCallWebhook` and friends
instead of one webhook method. Pipedrive is checked against the built `@friggframework/api-module-pipedrive`
2.1.0-next.7 (the library copy is TypeScript source with no `dist`).

Manifest versions in the files (for example HubSpot 1.4.0, Asana 1.5.1) are ahead of the module sources audited (HubSpot
1.1.7, Asana 1.1.5): the manifests describe modules that were never released as written.

## Asana (`asana`)

Checked against `~/api-module-library/packages/v1-ready/asana` (@friggframework/api-module-asana manifest 1.5.1).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `task.get` | `getTaskById` | ok | `getTaskById(id)` | Api.getTaskById(id) takes only the id; field selection (opt_fields) is not supported. (method was `getTask`; called with one object; now positional; inputs were taskGid, opt_fields) |
| `task.search` | `searchTasksInWorkspace` | unimplemented | none | Api.listTasks({ workspaceId, assigneeId }) filters by workspace and assignee only; due_on, completed, projects_any and limit have no equivalent. |
| `project.list` | `listProjects` | ok | `listProjects(params)` | (method was `getProjects`; inputs were workspaceGid, archived) |
| `workspace.list` | `listWorkspaces` | ok | `listWorkspaces()` | (method was `getWorkspaces`) |
| `webhook.create` | `createWebhook` | unimplemented | none | Api has no webhook methods. |
| `webhook.delete` | `deleteWebhook` | unimplemented | none | Api has no webhook methods. |
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
| `webhook.delete` | `deleteWebhook` | unimplemented | none | Api has createWebhook but no deleteWebhook. |
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
| `contact.search` | `searchContacts` | unimplemented | none | Api has no contact search (searchCompanies, searchDeals, searchCustomObjects and searchLists only). |
| `contact.list` | `listContacts` | ok | `listContacts(params)` | Api.listContacts({ after, limit, properties }) has no modified-since filter, so updatedSince is ignored and a poll re-lists every contact. |
| `contact.create` | `createContact` | ok | `createContact(body)` | (called with one object; now positional) |
| `contact.update` | `updateContact` | ok | `updateContact(contactId, properties)` | (called with one object; now positional) |
| `deal.get` | `getDealById` | ok | `getDealById(dealId)` | (called with one object; now positional) |
| `deal.listForContact` | `listDealsForContact` | unimplemented | none | Api has no per-contact deal listing; associations come from getBatchAssociations(from, to, inputs). |
| `deal.contacts` | `listContactsForDeal` | unimplemented | none | Api has no per-deal contact listing; associations come from getBatchAssociations(from, to, inputs). |
| `task.create` | `createTask` | unimplemented | none | Api has no engagement or task methods. |
| `call.create` | `createCallEngagement` | unimplemented | none | Api has no engagement or task methods. |
| `note.create` | `createNote` | unimplemented | none | Api has no engagement or task methods. |
| `owner.list` | `listOwners` | unimplemented | none | Api has getOwnerById only. |
| `pipeline.stages` | `listDealStages` | unimplemented | none | Api.getPipelineDetails(objType) returns every pipeline for an object type, not the stages of one pipeline. |
| `contact.upsertByEmail` | `upsertContactByEmail` | unimplemented | none | Api has no upsert and no contact search to build one from. |
| `deal.update` | `updateDeal` | unimplemented (a method of that name exists, unusable as the capability is shaped) | `updateDeal(params)` | Api.updateDeal({ dealId, properties }) reads this.URLs.getDealById, which is not defined (the table has dealById), so it throws before sending. Fixed in api-module-library (claude/shared-conversation-8hgmbr, 5961c9a); stays unimplemented here until a release carries it. |
| `deal.search` | `searchDeals` | unimplemented (a method of that name exists, unusable as the capability is shaped) | `searchDeals(params)` | Api.searchDeals takes HubSpot filterGroups, sorts, props, limit and after, not open/closeDate/amount filters. |
| `task.get` | `getTaskById` | unimplemented | none | Api has no engagement or task methods. |
| `task.update` | `updateTask` | unimplemented | none | Api has no engagement or task methods. |
| `task.search` | `searchTasks` | unimplemented | none | Api has no engagement or task methods. |
| `owner.get` | `getOwnerById` | ok | `getOwnerById(ownerId)` | (called with one object; now positional) |
| `owner.findByEmail` | `getOwnerByEmail` | unimplemented | none | Api has getOwnerById only. |
| `subscription.definitions` | `listSubscriptionDefinitions` | unimplemented | none | Api has no email subscription methods. |
| `subscription.unsubscribe` | `unsubscribeEmail` | unimplemented | none | Api has no email subscription methods. |
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
| `issue.get` | `issue` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `issue.byIdentifier` | `issueByIdentifier` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `issue.search` | `searchIssues` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `issue.create` | `issueCreate` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `issue.update` | `issueUpdate` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `comment.create` | `commentCreate` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `attachment.link` | `attachmentLinkURL` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `team.list` | `teams` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
| `workflowState.list` | `workflowStates` | unimplemented | none | Api exposes getClient() (a @linear/sdk LinearClient) plus getUsers, getProjects and getUserIssues; issues, comments, attachments, teams and workflow states are reached through the SDK client, not Api methods. |
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

Checked against `~/phone-app/backend/node_modules/@friggframework/api-module-pipedrive` (@friggframework/api-module-pipedrive manifest 2.1.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `person.get` | `getPerson` | ok | `getPerson(personId, params)` | (called with one object; now positional) |
| `person.search` | `searchPersons` | ok | `searchPersons(params)` |  |
| `person.list` | `listPersons` | ok | `listPersons(params)` |  |
| `person.create` | `addPerson` | unimplemented | none | Api has no addPerson (persons can be listed, fetched and searched only). |
| `person.update` | `updatePerson` | unimplemented | none | Api has no updatePerson. |
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

## Phone (`phone`)

Checked against `~/phone-app/backend/src/api-modules/phone` (@acme/api-module-phone manifest 2.1.0).

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
| `lead.update` | `updateLead` | unimplemented | none | Api.update(object, data) needs the record id inside data (data.Id); the capability passes the id separately, so there is no way to call it. |
| `person.searchByEmail` | `searchPeopleByEmail` | unimplemented | none | Api.find(object, filter) searches one sObject at a time; searching Lead and Contact together would need two calls. |
| `event.create` | `create` | ok | `create(object, data)` | (method was `createEvent`; called with one object; now positional) |
| `event.update` | `updateEvent` | unimplemented | none | Api.update(object, data) needs the record id inside data (data.Id); the capability passes the id separately, so there is no way to call it. |
| `opportunity.get` | `get` | ok | `get(object, id)` | (method was `getOpportunity`; called with one object; now positional) |
| `opportunity.update` | `updateOpportunity` | unimplemented | none | Api.update(object, data) needs the record id inside data (data.Id); the capability passes the id separately, so there is no way to call it. |
| `task.create` | `create` | ok | `create(object, data)` | (method was `createTask`; called with one object; now positional) |
| `file.attach` | `createContentVersion` | unimplemented | none | Api has the generic create(object, data) only; ContentVersion field names differ from this capability's inputs. |
| `note.create` | `createContentNote` | unimplemented | none | Api has the generic create(object, data) only; ContentNote field names differ from this capability's inputs. |
| `user.list` | `listUsers` | unimplemented | none | Api has find(object, filter) but no user listing with an activeOnly filter. |
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
| `user.list` | `listUsers` | unimplemented | none | Api has lookupUserByEmail, getUserById and getUserProfileById, but no user listing. |
| `user.lookupByEmail` | `lookupUserByEmail` | ok | `lookupUserByEmail(email)` | (called with one object; now positional) |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## Stripe (`stripe`)

Checked against `~/api-module-library/packages/v1-ready/stripe` (@friggframework/api-module-stripe manifest 2.3.0).

| Capability | Method | Status | Real signature | Note |
|---|---|---|---|---|
| `customer.get` | `retrieveCustomer` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `customer.list` | `listCustomers` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `customer.search` | `searchCustomers` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `customer.create` | `createCustomer` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `customer.update` | `updateCustomer` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `paymentIntent.get` | `retrievePaymentIntent` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `refund.get` | `retrieveRefund` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `payout.list` | `listPayouts` | unimplemented | none | Api wraps balance transactions, charges, accounts and webhook endpoints only; customers, payment intents, refunds and payouts are not exposed. |
| `balanceTransaction.list` | `getBalanceTransactions` | ok | `getBalanceTransactions(params)` | (method was `listBalanceTransactions`) |
| `webhook.verify` | `verifyWebhookSignature` | ok (unreleased) | `verifyWebhookSignature({ headers, body, rawBody, method?, url?, now? })` | Implemented in api-module-library 659b90d per the vendor's signing docs; needs the release that includes it. |

## Acme ERP (`acmeerp`)

**No module source available** (No directory named acmeerp or api-module-acmeerp). Nothing here is verified; the manifest is still a mock.

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
