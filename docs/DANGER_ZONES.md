# ⚠️ DANGER ZONES - Handle With Extreme Care

**Quick Reference for Frigg Core Developers**
**Last Updated:** 2025-10-18

---

## 🔴 CRITICAL - DO NOT MODIFY WITHOUT BACKUP

### 1. `/packages/core/integrations/integration-router.js`
**Size:** 663 lines | **Complexity:** EXTREME

```
⚠️  DANGER: Every integration uses this file
⚠️  IMPACT: Breaking change affects ALL integrations
⚠️  TESTING: Minimal test coverage
⚠️  KNOWN ISSUES: Lines 574-575 (credential fishing concern)
```

**Before Modifying:**
1. Read the entire file (yes, all 663 lines)
2. Create comprehensive integration tests
3. Get 2+ senior developer reviews
4. Test against 5+ different integrations
5. Have rollback plan ready

**Known Landmines:**
- Lines 574-575: Credential security TODO
- Webhook handling mixed with HTTP routing
- Business logic embedded in routes
- Direct database access from router

**Scheduled for Refactoring:** Weeks 3-4 of tech debt plan

---

### 2. `/packages/core/database/encryption/`
**Recent Critical Fix:** 2025-01-06 | **Risk Level:** HIGH

```
⚠️  DANGER: Data corruption if encryption fails
⚠️  IMPACT: Unrecoverable data loss
⚠️  RECENT BUG: Objects were becoming "[object Object]"
⚠️  FIX STATUS: Patched, but fragile
```

**Before Modifying:**
1. Read `/packages/core/database/encryption/README.md`
2. Understand serialization/deserialization
3. Write round-trip tests for your changes
4. Test with real OAuth tokens
5. Verify encryption schema registry

**Recent Changes:**
```javascript
// CRITICAL FIX (2025-01-06)
_serializeForEncryption(value) {
    if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);  // Don't break this!
    }
    return String(value);
}
```

**Files to Handle Carefully:**
- `field-encryption-service.js` (225 lines)
- `prisma-encryption-extension.js`
- `encryption-schema-registry.js`

**Test Requirements:**
- Round-trip all data types
- Test nested objects
- Test arrays
- Test edge cases (null, undefined, empty string)

---

### 3. `/packages/core/integration-base.js`
**Size:** 506 lines | **Usage:** EVERY INTEGRATION EXTENDS THIS

```
⚠️  DANGER: Base class for ALL integrations
⚠️  IMPACT: Changes affect every integration ever built
⚠️  PATTERN: Template method + event system
⚠️  COMPLEXITY: High
```

**Before Modifying:**
1. Understand hexagonal architecture pattern
2. Review all lifecycle methods
3. Understand event registration system
4. Test with multiple integration types
5. Consider backward compatibility

**Key Lifecycle Methods:**
- `onCreate()` - Integration creation
- `onUpdate()` - Configuration changes
- `onDelete()` - Cleanup
- `onWebhook()` - Webhook processing

**Event System:**
```javascript
// Lines 102-143: Default event registration
this.defaultEvents = {
    ON_CREATE: { ... },
    ON_UPDATE: { ... },
    ON_DELETE: { ... },
    // etc...
};
```

**Common Mistakes:**
- Forgetting to call `super.onCreate()`
- Breaking event registration
- Changing Definition schema
- Modifying hydration logic

---

## 🟠 HIGH RISK - Proceed With Caution

### 4. Database Layer (Dual ORM)
**Status:** Migration to Prisma in progress

```
⚠️  DANGER: Two database systems active simultaneously
⚠️  CONFUSION: Which ORM to use?
⚠️  MIGRATION: In progress (Weeks 5-6)
```

**Current State:**
- **Mongoose:** Legacy, being phased out
- **Prisma:** Modern, target system
- **Factory Pattern:** Abstracts ORM choice

**Files to Watch:**
- `*-repository-factory.js` (7 factories)
- `mongoose.js` (connection management)
- `prisma.js` (client initialization)
- `database/models/*.js` (Mongoose models)

**Rules Until Migration Complete:**
1. Use factory pattern, not direct ORM
2. Don't add new Mongoose models
3. Prefer Prisma for new features
4. Test against both databases

**Migration Timeline:** Weeks 5-6

---

### 5. `/packages/core/syncs/manager.js`
**Size:** 489 lines | **Known Issues:** 2 TODOs

```
⚠️  DANGER: N+1 query problems
⚠️  PERFORMANCE: Suboptimal database access
⚠️  COMPLEXITY: High
```

**Known Issues:**
```javascript
// Lines 453-454
// TODO this is suboptimal because it does 2 DB requests where only 1 is needed
// TODO If you want to get even more optimized, batch any/all updates together.
```

**Before Modifying:**
1. Understand sync lifecycle
2. Review database query patterns
3. Add logging to track queries
4. Measure performance before/after
5. Test with large datasets

**Scheduled for Optimization:** Week 8

---

### 6. `/packages/core/handlers/routers/health.js`
**Size:** 518 lines | **Purpose:** Health checks + encryption verification

```
⚠️  DANGER: Critical for monitoring
⚠️  TESTING: Integration tests required
⚠️  ENCRYPTION: Tests encryption health
```

**Why It's Dangerous:**
- Used by production monitoring
- Tests encryption functionality
- Database health verification
- Breaking it breaks ops visibility

**Before Modifying:**
1. Read `HEALTHCHECK.md` in same directory
2. Understand DDD/hexagonal refactoring plan
3. Test against both databases
4. Verify encryption round-trips
5. Don't break monitoring

---

## 🟡 MEDIUM RISK - Review Carefully

### 7. Event System (`constantsToBeMigrated`)
**Status:** Temporary location | **Migration:** Planned

```
⚠️  CONFUSION: Events defined in multiple places
⚠️  NAMING: "constantsToBeMigrated" is temporary
⚠️  PATTERN: Observer pattern + event registry
```

**Files Involved:**
- `integration-base.js:15-33` (constants)
- `integration-base.js:102-143` (registration)
- Integration-specific event definitions

**Centralization Plan:** Week 8

---

### 8. Module System (`/packages/core/modules/`)
**Complexity:** HIGH | **Importance:** CRITICAL

```
⚠️  DANGER: OAuth flows, API credentials
⚠️  SECURITY: Credential encryption
⚠️  PATTERN: Factory pattern + repository
```

**Key Components:**
- `Credential` - API credentials domain entity
- `Entity` - External service connections
- `Requester` - HTTP client base
- `OAuth2Requester` - OAuth implementation

**Common Mistakes:**
- Exposing credentials in logs
- Breaking OAuth refresh flow
- Credential injection failures
- Module factory misconfiguration

---

## ✅ SAFETY CHECKLIST

Before modifying any danger zone file:

### Planning Phase
- [ ] Read related documentation (CLAUDE.md, READMEs)
- [ ] Understand current implementation fully
- [ ] Review related test files
- [ ] Check for TODOs or known issues
- [ ] Identify all files that import this file

### Development Phase
- [ ] Create feature branch
- [ ] Write tests FIRST (TDD)
- [ ] Make minimal changes
- [ ] Keep functions under 50 lines
- [ ] Add comments for complex logic
- [ ] Update related documentation

### Testing Phase
- [ ] All existing tests still pass
- [ ] New tests cover your changes
- [ ] Integration tests pass
- [ ] Manual testing with real integrations
- [ ] Test error scenarios
- [ ] Test edge cases

### Review Phase
- [ ] Self-review before creating PR
- [ ] Get 2+ developer reviews
- [ ] Address all review comments
- [ ] QA team testing (if available)
- [ ] Staging environment validation

### Deployment Phase
- [ ] Have rollback plan ready
- [ ] Deploy during low-traffic window
- [ ] Monitor logs closely
- [ ] Watch error rates
- [ ] Be available for hotfix

---

## 🚫 NEVER DO THIS

### In Danger Zone Files

❌ **Don't skip tests** - "It's a small change" is how bugs happen
❌ **Don't refactor and add features** - One thing at a time
❌ **Don't assume backward compatibility** - Test old integrations
❌ **Don't bypass architectural layers** - Use use cases, not repositories
❌ **Don't commit TODOs** - Create tickets instead
❌ **Don't merge without reviews** - Get 2+ approvals for danger zones
❌ **Don't disable linting** - Fix the issue properly
❌ **Don't use `any` types** - TypeScript strict mode

### In Production

❌ **Don't deploy on Friday** - Wait until Monday
❌ **Don't deploy without tests** - Green CI/CD required
❌ **Don't deploy without staging** - Test in staging first
❌ **Don't deploy without monitoring** - Watch logs/metrics
❌ **Don't deploy without rollback plan** - Know how to undo

---

## 📞 Who to Ask Before Modifying

### Integration Router (663 lines)
**Experts:** Architecture Team
**Before:** Review with 2+ senior devs
**Alternative:** Wait for Weeks 3-4 refactoring

### Encryption System
**Experts:** Security Team + Database Team
**Before:** Review encryption README
**Alternative:** Use existing patterns, don't create new ones

### Integration Base Class
**Experts:** Integration Team Leads
**Before:** Test against 5+ different integrations
**Alternative:** Extend via composition, not modification

### Database Layer
**Experts:** Database Team
**Before:** Understand dual ORM situation
**Alternative:** Wait for Prisma migration (Weeks 5-6)

---

## 🆘 Emergency Contacts

### If You Break Production

1. **Immediate Rollback**
   ```bash
   # Revert to last known good version
   git revert <commit-hash>
   git push origin main
   ```

2. **Alert Team**
   - Slack: `#frigg-incidents`
   - On-call: Check PagerDuty

3. **Preserve Evidence**
   - Don't delete logs
   - Screenshot errors
   - Save error messages

4. **Post-Mortem**
   - What happened
   - Why it happened
   - How to prevent
   - Update this document

---

## 📚 Required Reading

Before touching danger zones:

1. **Architecture:** `/CLAUDE.md` (project root)
2. **Core Patterns:** `/packages/core/CLAUDE.md`
3. **Encryption:** `/packages/core/database/encryption/README.md`
4. **Runtime:** `/packages/core/core/CLAUDE.md`
5. **Tech Debt:** `/docs/TECHNICAL_DEBT_ANALYSIS.md`

---

## 🎯 Quick Decision Tree

```
Do I need to modify a danger zone file?
│
├─ NO → Great! Use existing patterns instead
│
└─ YES → Can I wait for refactoring?
    │
    ├─ YES → Wait for scheduled refactoring
    │
    └─ NO → Is it truly critical?
        │
        ├─ NO → Reconsider your approach
        │
        └─ YES → Follow full safety checklist
            │
            ├─ Read all documentation
            ├─ Write tests first
            ├─ Get 2+ reviews
            ├─ Test in staging
            └─ Have rollback ready
```

---

**Remember:**
- **If in doubt, ask first!**
- **Tests are not optional in danger zones**
- **Documentation must be updated with code**
- **Rollback plan is mandatory**

**This document saves careers. Read it. Follow it. Update it.**

---

**Last Updated:** 2025-10-18
**Next Review:** After Week 4 refactoring
**Maintained By:** Architecture Team
