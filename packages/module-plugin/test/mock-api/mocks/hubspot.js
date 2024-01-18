const authorizeResponse = {
    "base": "/redirect/hubspot",
    "data": {
        "code": "test-code",
        "state": "null"
    }
}

const tokenResponse = {
    "token_type": "bearer",
    "refresh_token": "test-refresh-token",
    "access_token": "test-access-token",
    "expires_in": 1800
}

const userDetailsResponse = {
    "portalId": 111111111,
    "timeZone": "US/Eastern",
    "accountType": "DEVELOPER_TEST",
    "currency": "USD",
    "utcOffset": "-05:00",
    "utcOffsetMilliseconds": -18000000,
    "token": "test-token",
    "user": "projectteam@lefthook.co",
    "hub_domain": "Testing Object Things-dev-44613847.com",
    "scopes": [
        "content",
        "oauth",
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.companies.write",
        "crm.objects.companies.read",
        "crm.objects.deals.read",
        "crm.schemas.deals.read"
    ],
    "hub_id": 111111111,
    "app_id": 22222222,
    "expires_in": 1704,
    "user_id": 33333333,
    "token_type": "access"
}

module.exports = { authorizeResponse, tokenResponse, userDetailsResponse }
