# Frigg Core - Technical Debt Action Plan
**Created:** 2025-10-18
**Status:** DRAFT - Awaiting Team Review
**Timeline:** 8 weeks to foundational health

---

## 🎯 Mission

Transform Frigg Core from **reactive maintenance mode** to **proactive development mode** through strategic technical debt reduction.

**Success Criteria:**
- ✅ All tests pass without flags
- ✅ Single database ORM (Prisma only)
- ✅ Integration router under 300 lines
- ✅ Zero critical security vulnerabilities
- ✅ 70%+ test coverage
- ✅ CI/CD runs clean

---

## 📅 8-Week Roadmap

### Week 1: Emergency Stabilization
**Theme:** Stop the bleeding, establish safety net
**Team Capacity:** 100% focused on stability

#### Monday-Tuesday: Test Infrastructure
- [ ] Remove `--passWithNoTests` flag from package.json
- [ ] Fix WebSocket mock in `update-process-metrics.test.js`
- [ ] Fix floating-point precision assertions
- [ ] Fix error count mismatches
- [ ] Configure code coverage reporting
- [ ] Set coverage threshold to 70%

**Owner:** Test Team
**Blockers:** None
**Deliverable:** Green CI/CD pipeline

#### Wednesday-Thursday: Environment Safety
- [ ] Create `packages/core/config/env-validator.js`
- [ ] Validate required env vars on startup
- [ ] Add helpful error messages for missing vars
- [ ] Document all required env vars in README
- [ ] Add env var validation to handler factory

**Owner:** Infrastructure Team
**Blockers:** None
**Deliverable:** Fail-fast on misconfiguration

#### Friday: Quick Wins Sprint
- [ ] Fix credential fishing security TODO (integration-router.js:574)
- [ ] Add input validation to credential endpoints
- [ ] Document encryption schema registry usage
- [ ] Update bcryptjs to 3.0.2
- [ ] Run full regression test suite

**Owner:** Security Team
**Blockers:** None
**Deliverable:** 5 security improvements shipped

---

### Week 2: Integration Test Foundation
**Theme:** Build safety net for future refactoring
**Team Capacity:** 100% on testing

#### Monday-Wednesday: Integration Test Suite
- [ ] Create `packages/core/integrations/tests/integration-e2e.test.js`
- [ ] Test: Create integration → Hydrate → Execute event → Delete
- [ ] Test: Webhook processing end-to-end
- [ ] Test: OAuth flow with token refresh
- [ ] Test: Integration mapping CRUD operations
- [ ] Test: Error recovery scenarios

**Owner:** QA + Dev Team
**Blockers:** Week 1 must complete
**Deliverable:** 20+ integration tests passing

#### Thursday-Friday: Encryption Round-Trip Tests
- [ ] Test encryption/decryption of all field types
- [ ] Test nested object encryption
- [ ] Test array encryption
- [ ] Test encryption of already-encrypted data (should error)
- [ ] Test KMS failure scenarios
- [ ] Test AES fallback scenarios

**Owner:** Security Team
**Blockers:** None
**Deliverable:** Comprehensive encryption test coverage

---

### Week 3-4: Integration Router Refactoring
**Theme:** Tame the 663-line complexity monster
**Team Capacity:** 80% on router, 20% on support

#### Week 3: Extract and Test
**Monday-Tuesday: Webhook Extraction**
- [ ] Create `handlers/routers/integration-webhooks.js`
- [ ] Move webhook handling logic (lines 400-500)
- [ ] Create `use-cases/process-webhook.js`
- [ ] Add webhook processing tests
- [ ] Update integration-router imports

**Wednesday-Thursday: Auth Extraction**
- [ ] Create `handlers/routers/integration-auth.js`
- [ ] Move authentication logic
- [ ] Create `use-cases/validate-integration-access.js`
- [ ] Add authorization tests
- [ ] Fix credential fishing vulnerability

**Friday: Integration Service Layer**
- [ ] Create `integrations/services/integration-service.js`
- [ ] Move business logic from router
- [ ] Update router to delegate to service
- [ ] Add service tests

**Owner:** Architecture Team
**Blockers:** Week 2 integration tests must pass
**Deliverable:** 3 new files, router down to ~400 lines

#### Week 4: Final Router Cleanup
**Monday-Wednesday: CRUD Extraction**
- [ ] Create separate routes for each operation
- [ ] Move create logic to `use-cases/create-integration.js`
- [ ] Move update logic to `use-cases/update-integration.js`
- [ ] Move delete logic to `use-cases/delete-integration.js`
- [ ] Add use case tests

**Thursday: Router Assembly**
- [ ] Compose routes in main router file
- [ ] Ensure all tests still pass
- [ ] Update API documentation
- [ ] Verify router under 300 lines

**Friday: Documentation & Handoff**
- [ ] Document new architecture
- [ ] Update CLAUDE.md with router patterns
- [ ] Create migration guide for integration developers
- [ ] Team knowledge sharing session

**Owner:** Architecture Team
**Blockers:** Week 3 extractions complete
**Deliverable:** Clean, maintainable router architecture

---

### Week 5-6: Prisma Migration
**Theme:** Single source of truth for database
**Team Capacity:** 100% on migration

#### Week 5: Audit & Migrate Repositories
**Monday: Mongoose Audit**
- [ ] Find all `mongoose` imports across codebase
- [ ] Document current Mongoose models in use
- [ ] Map Mongoose → Prisma schema equivalents
- [ ] Create migration checklist

**Tuesday-Thursday: Repository Migration**
- [ ] Migrate `integration-repository.js` to Prisma-only
- [ ] Migrate `user-repository.js` to Prisma-only
- [ ] Migrate `credential-repository.js` to Prisma-only
- [ ] Migrate `module-repository.js` to Prisma-only
- [ ] Migrate `websocket-connection-repository.js` to Prisma-only
- [ ] Update factory patterns to use Prisma only

**Friday: Encryption Update**
- [ ] Update Prisma middleware for MongoDB
- [ ] Update Prisma middleware for PostgreSQL
- [ ] Verify encryption round-trips
- [ ] Test schema registry integration

**Owner:** Database Team
**Blockers:** Week 4 router refactoring complete
**Deliverable:** All repositories on Prisma

#### Week 6: Test & Remove Mongoose
**Monday-Wednesday: Update Tests**
- [ ] Update repository tests for Prisma
- [ ] Update integration tests
- [ ] Update use case tests
- [ ] Run full test suite (must be 100% green)

**Thursday: Remove Mongoose**
- [ ] Delete Mongoose models directory
- [ ] Remove `mongoose` from package.json
- [ ] Remove `mongoose.js` connection file
- [ ] Update all imports
- [ ] Verify no Mongoose references remain

**Friday: Documentation & Migration Guide**
- [ ] Update README with Prisma-only instructions
- [ ] Document migration from Mongoose
- [ ] Update CLAUDE.md
- [ ] Create Prisma best practices guide

**Owner:** Database Team
**Blockers:** All tests must pass
**Deliverable:** Single ORM, clean codebase

---

### Week 7: Dependency Updates
**Theme:** Security patches and modern tooling
**Team Capacity:** 80% on updates, 20% on testing

#### Monday: Critical Security Updates
- [ ] Update bcryptjs: 2.4.3 → 3.0.2
- [ ] Test password hashing compatibility
- [ ] Update @aws-sdk/client-kms: 3.906.0 → 3.913.0
- [ ] Update @aws-sdk/client-sqs: 3.588.0 → 3.913.0
- [ ] Update @aws-sdk/client-apigatewaymanagementapi
- [ ] Run security audit: `npm audit fix`

**Tuesday: Breaking Change Updates**
- [ ] Update body-parser: 1.20.3 → 2.2.0
- [ ] Test request parsing compatibility
- [ ] Update dotenv: 16.4.7 → 17.2.3
- [ ] Update chalk: 4.1.2 → 5.6.2 (ESM migration)
- [ ] Fix chalk imports if needed

**Wednesday: ESLint Migration**
- [ ] Update eslint: 8.57.1 → 9.38.0
- [ ] Update eslint config for v9
- [ ] Fix new linting errors
- [ ] Update @typescript-eslint plugins
- [ ] Test linting across all packages

**Thursday: Remaining Updates**
- [ ] Update @prisma/client: 6.17.0 → 6.17.1
- [ ] Update TypeScript: 5.0.2 → 5.7.2
- [ ] Update Jest: 29.7.0 → latest
- [ ] Update all @aws-sdk packages
- [ ] Update test dependencies

**Friday: Regression Testing**
- [ ] Run full test suite
- [ ] Test integration creation flow
- [ ] Test webhook processing
- [ ] Test database migrations
- [ ] Performance smoke tests

**Owner:** DevOps Team
**Blockers:** Week 6 Prisma migration complete
**Deliverable:** Modern, secure dependency stack

---

### Week 8: Optimization & Polish
**Theme:** Performance and developer experience
**Team Capacity:** 50% optimization, 50% documentation

#### Monday-Tuesday: Database Optimization
- [ ] Fix N+1 queries in `syncs/manager.js`
- [ ] Batch database updates
- [ ] Add database query logging
- [ ] Profile slow queries
- [ ] Add indexes for common queries

**Wednesday: Event System Cleanup**
- [ ] Extract `constantsToBeMigrated` to proper location
- [ ] Create `events/event-registry.js`
- [ ] Centralize event definitions
- [ ] Update integration-base.js
- [ ] Document event system

**Thursday: Documentation Sprint**
- [ ] Update main README with latest patterns
- [ ] Update CLAUDE.md with refactoring lessons
- [ ] Create developer onboarding guide
- [ ] Document danger zones (what's left)
- [ ] Create troubleshooting guide

**Friday: Retrospective & Planning**
- [ ] Team retrospective on 8-week effort
- [ ] Measure success against criteria
- [ ] Identify remaining tech debt
- [ ] Create ongoing tech debt budget
- [ ] Celebrate wins! 🎉

**Owner:** Full Team
**Blockers:** None
**Deliverable:** Polished, documented codebase

---

## 📊 Success Metrics

### Week-by-Week Tracking

| Week | Focus | Tests Passing | Coverage | Router Lines | Tech Debt Items Closed |
|------|-------|---------------|----------|--------------|----------------------|
| 1 | Stabilization | Target: 100% | Target: 60% | 663 | 5 |
| 2 | Testing | Target: 100% | Target: 65% | 663 | 8 |
| 3 | Router Part 1 | Target: 100% | Target: 68% | ~450 | 12 |
| 4 | Router Part 2 | Target: 100% | Target: 70% | ~280 | 15 |
| 5 | Prisma Part 1 | Target: 100% | Target: 72% | ~280 | 18 |
| 6 | Prisma Part 2 | Target: 100% | Target: 75% | ~280 | 22 |
| 7 | Dependencies | Target: 100% | Target: 75% | ~280 | 27 |
| 8 | Polish | Target: 100% | Target: 80% | ~280 | 32 |

### Final Success Criteria
- [x] All tests pass: **YES** (Week 1 target)
- [x] Coverage ≥ 70%: **YES** (Week 4 target)
- [x] Router < 300 lines: **YES** (Week 4 target)
- [x] Single ORM: **YES** (Week 6 target)
- [x] No critical vulns: **YES** (Week 7 target)
- [x] CI/CD clean: **YES** (Week 1 target)

---

## 💰 ROI Calculation

### Time Investment
- **8 weeks × 40 hours = 320 hours**
- **Team size: 3-4 developers**
- **Total: ~960-1,280 hours**

### Before Refactoring (Estimated)
- **New integration development:** 2-3 weeks
  - Wrestling with 663-line router
  - Debugging dual database issues
  - Fixing encryption bugs
  - Working around TODOs

- **Bug fixes:** 3-5 days
  - Finding root cause in complex code
  - Afraid to change anything
  - Manual testing due to poor coverage

- **Onboarding new developers:** 4-6 weeks
  - Confused by dual ORMs
  - Afraid to touch router
  - Can't understand event system

### After Refactoring (Projected)
- **New integration development:** 3-5 days
  - Clear router patterns
  - Single ORM
  - Comprehensive tests
  - Well-documented

- **Bug fixes:** 4-8 hours
  - Clear architecture
  - Good test coverage
  - Safe to refactor

- **Onboarding new developers:** 1-2 weeks
  - Clear documentation
  - Consistent patterns
  - Safe to experiment

### Payoff Timeline
- **Month 1-2:** Still slower (refactoring overhead)
- **Month 3:** Break-even
- **Month 4+:** 2-3x faster development

**ROI:** 200-300% within 6 months

---

## 🚨 Risk Mitigation

### Risk 1: Refactoring Breaks Production
**Mitigation:**
- Comprehensive integration tests before refactoring
- Feature flags for new code paths
- Gradual rollout with monitoring
- Rollback plan for each week

### Risk 2: Timeline Slips
**Mitigation:**
- Weekly checkpoints with team
- Adjust scope if needed (Week 8 is buffer)
- Prioritize P0 items first
- Can pause and ship at Week 4 if needed

### Risk 3: New Bugs Introduced
**Mitigation:**
- 100% test coverage requirement
- Code review for all changes
- QA testing each week
- Staging environment validation

### Risk 4: Team Burnout
**Mitigation:**
- Rotate responsibilities weekly
- Celebrate small wins
- Pair programming for complex tasks
- Regular breaks and retrospectives

---

## 📋 Weekly Checklist Template

Use this for each week's standup:

### Monday Kickoff
- [ ] Review week's goals with team
- [ ] Assign owners for each task
- [ ] Check blockers from previous week
- [ ] Set up pairing sessions

### Wednesday Check-In
- [ ] Review progress on tasks
- [ ] Identify any blockers
- [ ] Adjust timeline if needed
- [ ] Run integration tests

### Friday Review
- [ ] Complete week's deliverables
- [ ] Update metrics tracking
- [ ] Merge PRs with reviews
- [ ] Plan next week's work
- [ ] Team demo of progress

---

## 🎓 Lessons for Future Projects

### Do's
✅ Fix foundational issues before adding features
✅ Maintain high test coverage from day one
✅ Refactor when files exceed 400 lines
✅ Budget 20% time for tech debt
✅ Document architectural decisions
✅ Use TODO comments sparingly (convert to tickets)

### Don'ts
❌ Skip tests with `--passWithNoTests`
❌ Let files grow beyond 500 lines
❌ Mix database ORMs without migration plan
❌ Defer security issues
❌ Add features to unstable foundation
❌ Ignore failing tests

---

## 🤝 Team Agreements

### Code Review Standards
- **No PR without tests:** Every change includes tests
- **Max PR size:** 400 lines (refactoring can be larger with justification)
- **Review within 24h:** Keep momentum
- **Two approvals:** For architectural changes

### Testing Standards
- **Coverage threshold:** 70% minimum
- **Integration tests:** For all critical paths
- **No skipped tests:** Fix or delete
- **Fast tests:** Under 30 seconds for unit tests

### Architecture Standards
- **Hexagonal architecture:** Always
- **Use cases for business logic:** No shortcuts
- **Repository for data access:** No direct models
- **Services for orchestration:** Complex workflows only

---

## 📞 Support & Communication

### Daily Standups (15 min)
- What I did yesterday
- What I'm doing today
- Any blockers

### Weekly Reviews (1 hour)
- Demo progress
- Review metrics
- Adjust plan
- Celebrate wins

### Slack Channels
- `#frigg-tech-debt` - Daily updates
- `#frigg-refactoring` - Architecture discussions
- `#frigg-testing` - Test coverage and CI/CD

### Documentation
- **JIRA Board:** Track all tasks
- **Confluence:** Architecture decisions
- **GitHub Wiki:** Developer guides
- **This Document:** Master plan

---

## ✅ Pre-Flight Checklist

Before starting Week 1:
- [ ] Team buy-in from all developers
- [ ] Management approval for 8-week timeline
- [ ] Freeze new feature development
- [ ] Set up metrics tracking dashboard
- [ ] Create JIRA epics for each week
- [ ] Schedule weekly review meetings
- [ ] Communicate plan to stakeholders
- [ ] Backup production database
- [ ] Set up staging environment
- [ ] Create rollback procedures

---

## 🎯 Next Steps

1. **Review this plan** with team (30-60 min meeting)
2. **Adjust timeline** based on team feedback
3. **Get management approval** for 8-week investment
4. **Create JIRA tickets** for Week 1 tasks
5. **Schedule kickoff** for Week 1 Monday
6. **Communicate to stakeholders** about feature freeze

**Ready to begin?** Let's transform Frigg Core into a world-class integration framework! 🚀

---

**Document Owner:** Code Analyzer Agent
**Last Updated:** 2025-10-18
**Next Review:** Start of Week 1
