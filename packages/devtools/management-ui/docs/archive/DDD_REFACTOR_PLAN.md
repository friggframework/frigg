# DDD/Hexagonal Architecture Cleanup Plan

**Based on**: Existing ARCHITECTURE.md and DDD_VALIDATION_REPORT.md
**Status**: Phase 1 Complete (Infrastructure reorganized)
**Date**: 2025-09-30

## Context

The codebase already implements proper DDD/Hexagonal architecture with passing validation. However, there's **structural duplication** causing navigation confusion:

- ✅ DDD layers properly implemented (domain, application, infrastructure)
- ✅ Tests comprehensive and passing
- ✅ Architecture validated and production-ready
- ❌ **Duplicate directories**: Components, hooks, and UI exist in BOTH root `/src` and `/src/presentation`

## Current Issue: Directory Duplication

```
src/
├── components/           ❌ DUPLICATE - 14 files
│   ├── ui/              ❌ DUPLICATE - 7 files
│   └── *.jsx
├── hooks/               ❌ DUPLICATE - 5 files
├── pages/               ❌ DUPLICATE - 1 file
│
└── presentation/        ✅ CORRECT DDD LOCATION
    ├── components/      ✅ Some files here (DefinitionsZone, etc.)
    │   └── ui/         ✅ Some UI components (dialog.jsx)
    ├── hooks/          ✅ useFrigg.jsx here
    └── pages/          ✅ (empty)
```

### Which Files Are Where?

**Root `/src/components/` (14 files - OLD):**
- Layout.jsx, ThemeProvider.jsx, TestAreaContainer.jsx
- TestAreaWelcome.jsx, TestAreaUserSelection.jsx
- TestingZone.jsx, IntegrationGallery.jsx
- ZoneNavigation.jsx, SearchBar.jsx, LiveLogPanel.jsx
- IDESelector.jsx, OpenInIDEButton.jsx, SettingsModal.jsx
- index.js

**Root `/src/components/ui/` (7 files - OLD):**
- button.tsx, card.tsx, badge.tsx, skeleton.jsx
- dropdown-menu.tsx, select.tsx, input.jsx

**Root `/src/hooks/` (5 files - OLD):**
- useFrigg.jsx, useSocket.jsx, useIDE.js
- useIntegrations.js, useRepositories.js

**Presentation `/src/presentation/components/` (NEWER):**
- AppRouter.jsx, ErrorBoundary.jsx, Layout.jsx
- ThemeProvider.jsx, SettingsModal.jsx
- DefinitionsZone.jsx, BuildZone.jsx, LiveTestingZone.jsx
- TestAreaContainer.jsx, Welcome.jsx
- IntegrationGallery.jsx, IntegrationTester.jsx
- And more zone/feature-organized components

**Presentation `/src/presentation/components/ui/` (NEWER):**
- dialog.jsx, button.tsx, card.tsx, badge.tsx, etc.

## The Problem

**Developers must check TWO locations** to find components/hooks:
1. Old location: `/src/components`, `/src/hooks`
2. New location: `/src/presentation/components`, `/src/presentation/hooks`

Some files exist in BOTH places (like Layout.jsx, ThemeProvider.jsx).

---

## ✅ Phase 1: Infrastructure Cleanup (COMPLETED)

**Goal**: Move legacy `/src/services` to proper infrastructure locations

### Actions Taken:
- ✅ Created `/src/infrastructure/http/`, `/websocket/`, `/npm/`
- ✅ Moved `api.js` → `infrastructure/http/api-client.js`
- ✅ Moved `websocket-handlers.js` → `infrastructure/websocket/`
- ✅ Moved `apiModuleService.js` → `infrastructure/npm/npm-registry-client.js`
- ✅ Deleted empty `/src/services` directory

---

## 📋 Phase 2: Presentation Layer Consolidation (PENDING APPROVAL)

**Goal**: Single source of truth - everything in `/src/presentation/`

### Strategy: Keep the NEWER files

Since `/src/presentation/` has more recent work (like DefinitionsZone refactor, dialog component), we should:

1. **Merge** any unique old files into `/src/presentation/`
2. **Delete** duplicates in `/src/components` and `/src/hooks`
3. **Organize by feature** within presentation layer

### Proposed Final Structure

```
src/
├── main.jsx                    # Vite entry (stays)
├── container.js               # DI container (stays)
├── lib/                       # Shared utilities (stays)
│   └── utils.ts
│
├── domain/                    # ✅ Clean - no changes
├── application/              # ✅ Clean - no changes
├── infrastructure/           # ✅ Phase 1 complete
│   ├── adapters/            # ✅ Already organized
│   ├── http/                # ✅ New - api-client.js
│   ├── websocket/           # ✅ New - websocket-handlers.js
│   └── npm/                 # ✅ New - npm-registry-client.js
│
├── presentation/             # 🎯 CONSOLIDATE HERE
│   ├── App.jsx              # 🔄 Move from root
│   ├── components/
│   │   ├── ui/              # shadcn components
│   │   ├── layout/          # 🔄 Layout, AppRouter, ErrorBoundary
│   │   ├── theme/           # 🔄 ThemeProvider
│   │   ├── zones/           # 🔄 All zone components
│   │   ├── integrations/    # 🔄 Integration-related
│   │   ├── common/          # 🔄 Shared components
│   │   └── index.js         # Public exports
│   ├── hooks/               # 🔄 All hooks here
│   │   ├── useFrigg.jsx     # ✅ Already here
│   │   ├── useSocket.jsx    # 🔄 Move from root
│   │   ├── useIDE.js        # 🔄 Move from root
│   │   ├── useIntegrations.js
│   │   └── useRepositories.js
│   └── pages/               # 🔄 If needed
│       └── Settings.jsx
│
└── tests/                   # ✅ Clean - matches structure
```

### Component Organization Plan

**Within `/src/presentation/components/`:**

```
components/
├── ui/                      # shadcn/ui primitives
│   ├── button.tsx
│   ├── card.tsx
│   ├── badge.tsx
│   ├── dialog.jsx
│   ├── dropdown-menu.tsx
│   ├── select.tsx
│   ├── input.jsx
│   └── skeleton.jsx
│
├── layout/                  # App structure
│   ├── Layout.jsx
│   ├── AppRouter.jsx
│   └── ErrorBoundary.jsx
│
├── theme/                   # Theming
│   └── ThemeProvider.jsx
│
├── zones/                   # Zone screens
│   ├── DefinitionsZone.jsx
│   ├── BuildZone.jsx
│   ├── LiveTestingZone.jsx
│   ├── TestingZone.jsx
│   ├── TestAreaContainer.jsx
│   ├── TestAreaWelcome.jsx
│   └── TestAreaUserSelection.jsx
│
├── integrations/            # Integration features
│   ├── IntegrationGallery.jsx
│   └── IntegrationTester.jsx
│
└── common/                  # Shared across features
    ├── ZoneNavigation.jsx
    ├── SearchBar.jsx
    ├── LiveLogPanel.jsx
    ├── IDESelector.jsx
    ├── OpenInIDEButton.jsx
    ├── SettingsModal.jsx
    ├── ServiceStatus.jsx
    └── ProjectOverview.jsx
```

---

## Detailed Migration Actions

### A. Analyze for Duplicates
```bash
# Compare files to find duplicates vs unique content
diff /src/components/Layout.jsx /src/presentation/components/Layout.jsx
```

### B. Move Unique Components
For each file in `/src/components/` that doesn't exist in `/src/presentation/`:
- Move to appropriate subdirectory in `/src/presentation/components/`

### C. Organize by Feature
- Create subdirectories: `layout/`, `theme/`, `zones/`, `integrations/`, `common/`
- Move components to logical locations

### D. Consolidate Hooks
- Move all `/src/hooks/*` → `/src/presentation/hooks/`

### E. Move App.jsx
- Move `/src/App.jsx` → `/src/presentation/App.jsx`

### F. Delete Old Directories
- Remove `/src/components/`
- Remove `/src/hooks/`
- Remove `/src/pages/`

### G. Update Import Paths
Find and replace all imports:
```javascript
// Old patterns
from '../components/...'
from '../hooks/...'
from '../../components/...'

// New patterns
from '../presentation/components/...'
from '../presentation/hooks/...'
```

---

## Import Path Examples

### Before:
```javascript
import Layout from '../components/Layout'
import { useFrigg } from '../hooks/useFrigg'
import { Button } from '../components/ui/button'
import api from '../services/api'
```

### After:
```javascript
import Layout from '../presentation/components/layout/Layout'
import { useFrigg } from '../presentation/hooks/useFrigg'
import { Button } from '../presentation/components/ui/button'
import api from '../infrastructure/http/api-client'
```

---

## Testing Strategy

1. **Before Changes**: Run full test suite, note passing tests
2. **After Each Move**: Update imports, run tests
3. **After All Moves**: Full regression test
4. **Build Verification**: `npm run build` must succeed

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Broken imports | High | Update in phases, test after each |
| Merge conflicts | Medium | Coordinate with team, do in PR |
| Test failures | Medium | Fix imports in test files too |
| Build failures | High | Verify Vite config paths |

---

## Success Criteria

- ✅ All code in single DDD-compliant location
- ✅ No duplicate directories
- ✅ All tests passing
- ✅ Build succeeds
- ✅ Clear, navigable structure
- ✅ Updated imports throughout

---

## Next Steps

**AWAITING APPROVAL** before proceeding with Phase 2.

### If Approved:
1. Run comprehensive file comparison to identify duplicates
2. Create detailed file move manifest
3. Execute moves in controlled batches
4. Update imports systematically
5. Run tests after each batch
6. Final verification

### Questions for Review:
1. Proceed with consolidation into `/src/presentation/`?
2. Approve component categorization (layout, zones, integrations, common)?
3. Any components that should be handled differently?

---

**Status**: Phase 1 ✅ Complete | Phase 2 ⏸️ Awaiting Approval