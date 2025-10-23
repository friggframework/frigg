# SubType Removal - Database Migration Guide

## Summary

The `subType` field has been removed from the codebase as it was never used or set in any code path. This field was vestigial from the Mongoose → Prisma migration.

**Changes Made**:
- ✅ Removed from Prisma schemas (MongoDB & PostgreSQL)
- ✅ Removed from all repository methods
- ✅ Removed from use cases
- ✅ Removed from JSON schemas
- ✅ Removed from TypeScript types
- ✅ Removed from Mongoose models

## Database Migration Required

After deploying this code, you'll need to run database migrations to drop the `subType` columns.

### Step 1: Check for Existing Data

Before migrating, verify if any production data has `subType` values set:

**MongoDB:**
```javascript
db.Credential.countDocuments({ subType: { $exists: true, $ne: null } })
db.Entity.countDocuments({ subType: { $exists: true, $ne: null } })
```

**PostgreSQL:**
```sql
SELECT COUNT(*) FROM "Credential" WHERE "subType" IS NOT NULL;
SELECT COUNT(*) FROM "Entity" WHERE "subType" IS NOT NULL;
```

**Expected result**: 0 rows (field was never populated)

If you find data, investigate why/how it was set before proceeding.

### Step 2: Generate Prisma Migrations

**For MongoDB:**
```bash
cd packages/core
npx prisma migrate dev --schema=./prisma-mongodb/schema.prisma --name remove_subtype
```

**For PostgreSQL:**
```bash
cd packages/core
npx prisma migrate dev --schema=./prisma-postgresql/schema.prisma --name remove_subtype
```

This will generate migration files that drop the `subType` columns.

### Step 3: Review Generated Migrations

**MongoDB Migration** (approximate):
```javascript
// Migration will update the schema to remove subType
// MongoDB is schemaless so no ALTER needed, but Prisma tracks it
```

**PostgreSQL Migration** (approximate):
```sql
-- Drop subType column from Credential table
ALTER TABLE "Credential" DROP COLUMN "subType";

-- Drop subType column from Entity table
ALTER TABLE "Entity" DROP COLUMN "subType";
```

### Step 4: Deploy Migrations

**Development:**
```bash
# MongoDB
npx prisma migrate deploy --schema=./prisma-mongodb/schema.prisma

# PostgreSQL
npx prisma migrate deploy --schema=./prisma-postgresql/schema.prisma
```

**Production:**
Include migration deployment in your deployment pipeline:
```bash
npm run migrate:deploy
```

### Step 5: Verify Migration

After deployment, verify the columns are gone:

**MongoDB:**
```javascript
// Check schema doesn't reference subType
db.Credential.findOne()
db.Entity.findOne()
// Should not have subType field
```

**PostgreSQL:**
```sql
-- Verify column doesn't exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Credential' AND column_name = 'subType';
-- Should return 0 rows

SELECT column_name FROM information_schema.columns
WHERE table_name = 'Entity' AND column_name = 'subType';
-- Should return 0 rows
```

## Rollback Plan

If you need to rollback:

1. **Revert code changes:**
   ```bash
   git revert <commit-hash>
   ```

2. **Revert database migrations:**
   ```bash
   # MongoDB
   npx prisma migrate resolve --rolled-back <migration-name> --schema=./prisma-mongodb/schema.prisma

   # PostgreSQL
   npx prisma migrate resolve --rolled-back <migration-name> --schema=./prisma-postgresql/schema.prisma
   ```

3. **Manually restore columns (PostgreSQL only):**
   ```sql
   ALTER TABLE "Credential" ADD COLUMN "subType" VARCHAR(100);
   ALTER TABLE "Entity" ADD COLUMN "subType" VARCHAR(100);
   ```

## Testing

After migration, test key flows:

1. ✅ **OAuth Authorization:** `POST /api/authorize` should work without subType
2. ✅ **Entity Creation:** Entities created without subType field
3. ✅ **Module Retrieval:** `GET /api/entities/:id` returns entity without subType
4. ✅ **Repository Queries:** findEntity, updateEntity work without subType filters

## Impact Assessment

**Breaking Changes:**
- ❌ No breaking changes - field was never used

**Database Impact:**
- PostgreSQL: Column drop (safe - field was NULL)
- MongoDB: Schema update (safe - schemaless)

**Code Impact:**
- All subType references removed
- No code relied on this field
- moduleName serves the module type identification purpose

## Questions?

If you encounter issues:
1. Check if any custom code manually set subType values
2. Verify migration applied successfully
3. Check application logs for subType-related errors
4. Review commit history for context

## Related Documentation

- Original fix: `SUBTYPE_CRITICAL_FINDING.md` - Analysis of why subType was unused
- OAuth flow: `POST_AUTHORIZE_TRACE.md` - How authorization works without subType
- ModuleName: `MODULE_NAME_SOURCE_ANALYSIS.md` - How moduleName is determined
