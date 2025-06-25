# Deprecation Notice: create-frigg-app

## Status: DEPRECATED

**Deprecation Date:** January 25, 2025  
**End of Support:** July 25, 2025  
**Replacement:** `frigg init` command in @friggframework/cli

---

## Important Notice

The `create-frigg-app` package is now deprecated in favor of the integrated `frigg init` command. This change consolidates all Frigg development tools into a single, powerful CLI with enhanced features.

## Timeline

- **Now - April 25, 2025**: Deprecation warnings displayed
- **April 25 - July 25, 2025**: Critical fixes only
- **After July 25, 2025**: Package archived, no further updates

## What This Means

### If You're Starting a New Project

**❌ Don't use:**
```bash
npx create-frigg-app my-app
```

**✅ Use instead:**
```bash
npm install -g @friggframework/cli
frigg init my-app
```

### If You Have an Existing Project

Your project will continue to work, but you should migrate to benefit from:
- Management GUI for visual development
- Enhanced CLI commands
- Better integration discovery
- Improved developer experience
- Ongoing support and updates

**Migration is simple:**
```bash
cd your-existing-app
npm install -g @friggframework/cli
frigg migrate --from-create-frigg-app
```

## Why This Change?

1. **Unified Developer Experience**: Single tool for all Frigg development
2. **Enhanced Features**: Visual GUI, better commands, improved workflows
3. **Clearer Positioning**: Frigg as a backend service framework
4. **Reduced Confusion**: No more frontend directory misunderstandings
5. **Better Maintenance**: Single codebase to maintain and improve

## New Features You'll Get

### 1. Management GUI
```bash
frigg ui
```
- Visual integration browser
- Connection testing
- Environment management
- Code generation

### 2. Enhanced Commands
```bash
frigg init          # Create projects
frigg create        # Create integrations
frigg manage        # Manage integrations
frigg monitor       # Monitor production
```

### 3. Better Development Workflow
- Interactive installation
- Visual configuration
- Test user management
- Real-time monitoring

## Migration Guide

### Automatic Migration

The easiest way to migrate:

```bash
# Install new CLI
npm install -g @friggframework/cli

# Navigate to your project
cd your-create-frigg-app-project

# Run migration
frigg migrate --from-create-frigg-app
```

### Manual Migration

If automatic migration doesn't work:

1. **Install the new CLI**
   ```bash
   npm install -g @friggframework/cli
   ```

2. **Create new project structure**
   ```bash
   frigg init my-app-new
   ```

3. **Copy your integrations**
   - Copy contents of `backend/integrations/` to `integrations/`
   - Copy any custom code from `backend/` to root
   - Copy environment variables

4. **Update package.json scripts**
   ```json
   {
     "scripts": {
       "start": "frigg start",
       "dev": "frigg start --with-ui",
       "build": "frigg build",
       "deploy": "frigg deploy"
     }
   }
   ```

5. **Test your migration**
   ```bash
   frigg start
   ```

## Frequently Asked Questions

### Q: Will my existing app break?
**A:** No, existing apps will continue to work. However, you won't receive updates after July 25, 2025.

### Q: Do I have to migrate immediately?
**A:** No, but we recommend migrating within the 6-month window to ensure continued support.

### Q: What about my custom code?
**A:** The migration tool preserves all custom code. Your integrations will work exactly as before.

### Q: Is the migration reversible?
**A:** Yes, the migration tool creates a backup by default. You can rollback if needed.

### Q: What if I have issues migrating?
**A:** We're here to help! Contact us through:
- GitHub Issues: https://github.com/friggframework/frigg/issues
- Slack: https://frigg-community.slack.com
- Email: support@frigg.io

## Support During Deprecation

### Phase 1: Active Deprecation (Now - April 2025)
- Deprecation warnings in terminal
- Full documentation support
- Community assistance
- Bug fixes as needed

### Phase 2: Maintenance Mode (April - July 2025)
- Critical security fixes only
- Limited support
- Strong migration encouragement

### Phase 3: End of Life (After July 2025)
- Package archived
- No further updates
- Recommend forking if still needed

## Take Action

1. **Install the new CLI today**: `npm install -g @friggframework/cli`
2. **Try the new features**: `frigg ui`
3. **Plan your migration**: Review our migration guide
4. **Get help if needed**: Join our Slack community

The future of Frigg development is here, and it's better than ever. Make the switch to `frigg init` and discover a more powerful, intuitive way to build integrations.

---

**Thank you** for being part of the Frigg community. We're excited to continue this journey with you using our new, improved tools!