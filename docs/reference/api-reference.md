---
hidden: true
---

# API Reference

Management API

## Behaviour notes for 2.0.1

Source: `packages/core/user/use-cases/get-user-from-bearer-token.js`, `packages/core/modules/utils/to-credential-id.js`.

| Area | Behaviour | PR |
|---|---|---|
| Bearer token auth | The request's user is the token row's owner (`userId`). A token row with no owner id fails with `401 Session Token Has No User`. | #691 |
| `credentialId` in the entities list (`GetEntitiesForUser`) | The credential id as a string, or `null`. | #688 |
| `credentialId` from entity commands (`createEntityCommands()`) | The credential id as a string, or `null`. | #688 |

## Authorization

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/authorize" method="get" expanded="false" fullWidth="false" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/authorize" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

## Integrations

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}" method="patch" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}" method="delete" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/config/options" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/config/options/refresh" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions/{actionId}/options" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions/{actionId}/options/refresh" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/actions/{actionId}" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/integrations/{integrationId}/test-auth" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

## Entities

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entity" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entity/options/{credentialId}" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}/test-auth" method="get" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}/options" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/Frigg Management API.yml" path="/api/entities/{entityId}/options/refresh" method="post" %}
[Frigg Management API.yml](<../.gitbook/assets/Frigg Management API.yml>)
{% endswagger %}
