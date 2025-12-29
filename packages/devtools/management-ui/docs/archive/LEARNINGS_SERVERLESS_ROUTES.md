# Critical Learning: Serverless Framework Route Patterns

**Date**: 2025-09-29
**Context**: Test Area Phase 2 - RESTful User Routes Implementation

---

## 🚨 The Problem

Added RESTful `/users` endpoints to core router but they weren't accessible. Route table only showed `/user/{proxy*}`, not `/users`.

---

## ❌ Wrong Assumption

**Assumed**: `/user/{proxy+}` is a wildcard pattern that matches anything starting with `/user`

**Expected**:
- `/user/{proxy+}` would match: `/user`, `/users`, `/user/login`, `/users/login`
- Regex-like behavior where `user` is a prefix

---

## ✅ Correct Understanding

**Reality**: `{proxy+}` does literal path prefix matching

**How it works**:
1. `{proxy+}` matches everything AFTER the literal path prefix
2. The prefix `/user` is matched literally, character-by-character
3. `/user` ≠ `/users` - they are different literal prefixes

**Examples**:

| Route Pattern | Matches | Doesn't Match |
|---------------|---------|---------------|
| `/user/{proxy+}` | `/user/login`<br>`/user/create`<br>`/user/anything` | `/users`<br>`/users/login`<br>`/userdata` |
| `/users/{proxy+}` | `/users/login`<br>`/users/create`<br>`/users/anything` | `/user`<br>`/user/login` |
| `/api/{proxy+}` | `/api/v1`<br>`/api/users`<br>`/api/anything/deep` | `/apiv1`<br>`/apis` |

---

## 🔧 The Fix

Added explicit routes for both singular and plural forms:

```javascript
// serverless-template.js
user: {
  handler: 'node_modules/@friggframework/core/handlers/routers/user.handler',
  events: [
    // Legacy singular routes
    { httpApi: { path: '/user/{proxy+}', method: 'ANY' } },

    // New plural routes (RESTful)
    { httpApi: { path: '/users', method: 'GET' } },       // List users
    { httpApi: { path: '/users/{proxy+}', method: 'ANY' } } // All other /users/* routes
  ],
}
```

**Why both**:
- `/users` (exact match) - Required for listing users (GET /users)
- `/users/{proxy+}` (prefix match) - Required for nested routes (/users/login, /users/search, etc.)

---

## 📚 Serverless Framework Route Syntax

### Exact Match
```javascript
{ httpApi: { path: '/users', method: 'GET' } }
```
- Matches ONLY: `GET /users`
- Doesn't match: `GET /users/123`, `POST /users`, `GET /user`

### Prefix Match with Proxy+
```javascript
{ httpApi: { path: '/users/{proxy+}', method: 'ANY' } }
```
- Matches: `ANY /users/anything/can/go/here`
- The `{proxy+}` captures everything after `/users/`
- Available in handler as `event.pathParameters.proxy`

### Path Parameters
```javascript
{ httpApi: { path: '/users/{id}', method: 'GET' } }
```
- Matches: `GET /users/123`, `GET /users/abc`
- Doesn't match: `GET /users/123/posts` (too deep)
- Available in handler as `event.pathParameters.id`

### Method Specificity
```javascript
// Specific method
{ httpApi: { path: '/users', method: 'GET' } }

// All methods
{ httpApi: { path: '/users', method: 'ANY' } }

// Multiple routes for different methods
{ httpApi: { path: '/users', method: 'GET' } },
{ httpApi: { path: '/users', method: 'POST' } }
```

---

## 🎯 Best Practices

### 1. Use Exact Matches for Collection Routes
```javascript
// ✅ GOOD - Explicit collection routes
{ httpApi: { path: '/users', method: 'GET' } },      // List
{ httpApi: { path: '/users', method: 'POST' } },     // Create

// ❌ BAD - Using proxy for collection
{ httpApi: { path: '/users/{proxy+}', method: 'ANY' } }  // Too broad
```

### 2. Use Proxy+ for Nested Resources
```javascript
// ✅ GOOD - Catch all nested routes
{ httpApi: { path: '/users/{proxy+}', method: 'ANY' } }
// Handles: /users/login, /users/search, /users/123/profile, etc.
```

### 3. Maintain Backward Compatibility
```javascript
// ✅ GOOD - Support both old and new routes
events: [
  { httpApi: { path: '/user/{proxy+}', method: 'ANY' } },     // Legacy
  { httpApi: { path: '/users', method: 'GET' } },              // New
  { httpApi: { path: '/users/{proxy+}', method: 'ANY' } }      // New
]
```

### 4. Order Doesn't Matter (for HTTP API)
- Serverless Framework HTTP API uses CloudFront-style routing
- More specific routes automatically take precedence
- `/users` exact match beats `/users/{proxy+}` when path is exactly `/users`

---

## 🧪 Testing Route Configuration

### Check Generated Config
After Frigg starts, the serverless.yml is generated. Route table appears in logs:

```bash
# Look for this in Frigg startup logs:
Route table:
  GET  | http://localhost:3001/users
  ANY  | http://localhost:3001/users/{proxy*}
  ANY  | http://localhost:3001/user/{proxy*}
```

### Test Endpoint Manually
```bash
# Test list users (exact match)
curl http://localhost:3001/users

# Test login (proxy+ match)
curl -X POST http://localhost:3001/users/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"pass"}'

# Test legacy route (backward compatibility)
curl -X POST http://localhost:3001/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"pass"}'
```

---

## 🐛 Common Mistakes

### Mistake 1: Assuming Wildcards
```javascript
// ❌ WRONG - Thinking this matches /users
{ httpApi: { path: '/user/{proxy+}', method: 'ANY' } }

// ✅ CORRECT - Need explicit route
{ httpApi: { path: '/users/{proxy+}', method: 'ANY' } }
```

### Mistake 2: Forgetting Exact Match for Collection
```javascript
// ❌ INCOMPLETE - GET /users might not work as expected
{ httpApi: { path: '/users/{proxy+}', method: 'ANY' } }

// ✅ COMPLETE - Explicit GET for collection
{ httpApi: { path: '/users', method: 'GET' } },
{ httpApi: { path: '/users/{proxy+}', method: 'ANY' } }
```

### Mistake 3: Not Restarting After Template Changes
```bash
# ❌ WRONG - Expecting changes without restart
# Edit serverless-template.js
# Continue using old Frigg process

# ✅ CORRECT - Restart to regenerate config
kill -9 $(lsof -ti:3001)
npm run dev  # Regenerates serverless.yml with new routes
```

---

## 📖 Related Documentation

- [Serverless Framework HTTP API Events](https://www.serverless.com/framework/docs/providers/aws/events/http-api)
- [API Gateway Proxy Integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-set-up-simple-proxy.html)
- Express Router (Frigg core uses Express under the hood)

---

## 💡 Key Takeaway

> **`{proxy+}` is NOT a regex wildcard - it's a literal path prefix with a greedy suffix matcher**

When designing REST APIs with Serverless Framework:
1. Define explicit routes for collection operations (`/users`)
2. Use `{proxy+}` only for nested/dynamic routes (`/users/{proxy+}`)
3. Maintain backward compatibility with legacy routes
4. Always restart the serverless process after template changes
5. Verify route table in startup logs

---

**This learning saved hours of debugging. Remember it!**