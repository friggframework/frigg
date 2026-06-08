---
hidden: true
---

# API Reference

Management API

## Authorization

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/authorize" method="get" expanded="false" fullWidth="false" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/authorize" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

## Integrations

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}" method="patch" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}" method="delete" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}/config/options" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}/config/options/refresh" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}/actions" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}/actions/{actionId}/options" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}/actions/{actionId}/options/refresh" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}/actions/{actionId}" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/integrations/{integrationId}/test-auth" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

## Entities

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/entity" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/entity/options/{credentialId}" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/entities/{entityId}" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/entities/{entityId}/test-auth" method="get" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/entities/{entityId}/options" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}

{% swagger src="../.gitbook/assets/frigg-management-api.yml" path="/api/entities/{entityId}/options/refresh" method="post" %}
[frigg-management-api.yml](<../.gitbook/assets/frigg-management-api.yml>)
{% endswagger %}
