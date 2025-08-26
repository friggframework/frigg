# Architecture Decision Record: Migration Tool Design

## Status
Proposed

## Context
We need an automated tool to migrate projects from `create-frigg-app` to the new `frigg init` structure. This tool must handle various project configurations while preserving custom code and settings.

## Decision

### Migration Tool Architecture

```javascript
// packages/devtools/frigg-cli/migrate-command/index.js
class FriggMigrator {
  constructor(projectPath, options) {
    this.projectPath = projectPath;
    this.options = options;
    this.backup = options.backup !== false;
    this.dryRun = options.dryRun || false;
  }

  async migrate() {
    // 1. Detect project type
    const projectInfo = await this.detectProject();
    
    // 2. Create backup if requested
    if (this.backup && !this.dryRun) {
      await this.createBackup();
    }
    
    // 3. Run migration steps
    const steps = this.getMigrationSteps(projectInfo);
    for (const step of steps) {
      await this.runStep(step);
    }
    
    // 4. Validate migration
    await this.validate();
    
    // 5. Generate report
    return this.generateReport();
  }
}
```

### Migration Steps

1. **Project Detection**
   ```javascript
   async detectProject() {
     return {
       type: 'create-frigg-app',
       version: packageJson.version,
       hasCustomizations: await this.detectCustomizations(),
       integrations: await this.detectIntegrations(),
       structure: await this.analyzeStructure()
     };
   }
   ```

2. **Structure Migration**
   ```javascript
   const structureMigrations = {
     'create-frigg-app': {
       'frontend/': null, // Remove frontend directory
       'backend/': './', // Move backend to root
       'backend/node_modules/': null, // Remove before moving
       '.env.example': '.env.example',
       'README.md': 'README.md'
     }
   };
   ```

3. **Package.json Updates**
   ```javascript
   const packageUpdates = {
     scripts: {
       // Old scripts
       "start": "npm run start:backend",
       "start:backend": "cd backend && npm start",
       
       // New scripts
       "start": "frigg start",
       "dev": "frigg start --with-ui",
       "build": "frigg build",
       "deploy": "frigg deploy"
     },
     devDependencies: {
       "@friggframework/cli": "^2.0.0"
     }
   };
   ```

4. **Configuration Migration**
   ```javascript
   // Create frigg.config.js from existing settings
   const config = {
     project: {
       name: packageJson.name,
       version: packageJson.version
     },
     integrations: detectedIntegrations,
     deployment: existingServerlessConfig
   };
   ```

### Interactive Mode

```
$ frigg migrate --from-create-frigg-app

🔍 Analyzing your project...
  ✓ Detected create-frigg-app v1.x project
  ✓ Found 3 integrations: hubspot, salesforce, slack
  ✓ Custom code detected in 2 files

📋 Migration Plan:
  1. Create backup at ./backup-2024-01-25
  2. Restructure directories
  3. Update package.json
  4. Create frigg.config.js
  5. Update import paths
  6. Install new dependencies

⚠️  Custom modifications detected:
  - backend/custom-auth.js
  - backend/utils/helpers.js
  These files will be preserved.

Proceed with migration? (Y/n)
```

### Validation System

```javascript
class MigrationValidator {
  async validate(projectPath) {
    const checks = [
      this.checkStructure,
      this.checkDependencies,
      this.checkIntegrations,
      this.checkConfiguration,
      this.checkCustomCode
    ];
    
    const results = await Promise.all(
      checks.map(check => check.call(this, projectPath))
    );
    
    return {
      success: results.every(r => r.success),
      checks: results
    };
  }
}
```

### Rollback Capability

```javascript
async rollback(backupPath) {
  console.log('🔄 Rolling back migration...');
  
  // 1. Remove migrated files
  await fs.remove(this.projectPath);
  
  // 2. Restore from backup
  await fs.copy(backupPath, this.projectPath);
  
  // 3. Reinstall dependencies
  await exec('npm install', { cwd: this.projectPath });
  
  console.log('✅ Rollback complete');
}
```

## Implementation Plan

### Phase 1: Core Migration (Week 1)
- Project detection logic
- Basic file restructuring
- Package.json updates

### Phase 2: Smart Migration (Week 2)
- Custom code detection
- Import path updates
- Integration preservation

### Phase 3: Validation & Safety (Week 3)
- Comprehensive validation
- Rollback mechanism
- Dry-run mode

### Phase 4: Polish (Week 4)
- Interactive prompts
- Progress indicators
- Detailed reporting

## Migration Report Example

```markdown
# Migration Report

**Date:** 2024-01-25 10:30:00
**Project:** my-app-integrations
**Duration:** 45 seconds

## Summary
✅ Migration completed successfully

## Changes Made

### Structure
- Moved backend/ contents to root
- Removed frontend/ directory
- Created frigg.config.js

### Dependencies
- Added: @friggframework/cli@2.0.0
- Updated: 5 packages
- Removed: 3 packages

### Integrations
- ✅ HubSpot configuration migrated
- ✅ Salesforce configuration migrated
- ✅ Slack configuration migrated

### Custom Code
- Preserved: custom-auth.js
- Preserved: utils/helpers.js
- Updated: 12 import statements

## Next Steps
1. Run `frigg ui` to explore the Management GUI
2. Test your integrations with `frigg test`
3. Review frigg.config.js for additional options

## Backup Location
./backup-2024-01-25-103000
```

## Error Handling

```javascript
const migrationErrors = {
  UNSUPPORTED_VERSION: {
    message: 'Project version not supported for automatic migration',
    solution: 'Please update manually or contact support'
  },
  CORRUPTED_STRUCTURE: {
    message: 'Project structure does not match expected format',
    solution: 'Ensure this is a create-frigg-app project'
  },
  MISSING_DEPENDENCIES: {
    message: 'Required dependencies not found',
    solution: 'Run npm install before migration'
  }
};
```

## Consequences

### Positive
- Smooth transition for existing users
- Preserves custom code
- Comprehensive validation
- Safe with rollback option

### Negative
- Complex edge cases
- Maintenance burden
- Testing requirements

### Mitigation
- Extensive testing suite
- Community beta testing
- Clear documentation
- Support channels