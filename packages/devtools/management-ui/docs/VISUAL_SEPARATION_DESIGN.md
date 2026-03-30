# Management UI Visual Separation Design

## Purpose

Create clear visual distinction between:
1. **Normal User Flow** - What end-users of Frigg integrations see
2. **Testing/Development Area** - Tools for developers testing integrations

## Core Principle

> **"If you're building an integration for your customers, the normal user flow shows what THEY will see. The testing area is YOUR developer playground."**

## Current Structure Problem

Currently, the Management UI mixes these concerns:
- Integration connection flows (user-facing)
- Testing tools (developer-facing)
- Admin tools (developer-facing)

This makes it unclear what's meant for end-users vs. developers.

## Proposed Solution

### Two-Mode Interface

```
┌─────────────────────────────────────────────────────────────┐
│ Frigg Management UI                    [Mode Selector]      │
│                                         ○ User View         │
│                                         ● Developer View    │
└─────────────────────────────────────────────────────────────┘
```

### Mode 1: User View (End-User Flow)

**Purpose**: Shows exactly what your integration users will experience

**Components**:
- Integration connection screens
- OAuth authorization flows
- Form-based authorization (email/password, API keys)
- Entity selection
- Integration configuration
- Success/error states

**Visual Style**:
- Clean, simple, customer-facing UI
- Minimal technical jargon
- Focused on the task at hand
- Production-ready styling

**Header**:
```
┌──────────────────────────────────────────────────────────────┐
│ 👤 User View                                                 │
│ This is what your integration users will see                 │
└──────────────────────────────────────────────────────────────┘
```

**Example Screens**:
1. **Connect Integration**: "Connect to Slack"
2. **Authorize**: OAuth or form authorization
3. **Configure**: Select channels, set preferences
4. **Connected**: "Your Slack workspace is connected"

### Mode 2: Developer View (Testing & Admin)

**Purpose**: Developer tools for testing, debugging, and exploring integrations

**Components**:
- User impersonation/selection
- Environment switcher (local/staging/prod)
- Testing dashboard with system actions
- API endpoint testing
- Integration health monitoring
- Logs and debugging tools

**Visual Style**:
- Technical, information-dense
- Development-focused colors (darker theme optional)
- Clear labeling as "developer tools"
- Not meant for end-users

**Header**:
```
┌──────────────────────────────────────────────────────────────┐
│ 🔧 Developer View                                            │
│ Testing and admin tools for integration development          │
│                                                               │
│ Environment: [Local ▼]  User: [Alice (alice@test.com) ▼]   │
└──────────────────────────────────────────────────────────────┘
```

**Sections**:
1. **Testing Zone**: SystemActionsTester, UserActionTester, TestingDashboard
2. **Entity Explorer**: View all entities, credentials, integrations
3. **API Playground**: Test endpoints directly
4. **Logs & Debug**: View real-time logs and errors

## Visual Design

### Color Coding

**User View** (Customer-Facing):
- Primary: Blue (#3B82F6) - Trust, professionalism
- Background: White/Light Gray - Clean, simple
- Accents: Green (success), Red (errors)
- Badge: 🟢 "User View"

**Developer View** (Technical):
- Primary: Purple (#8B5CF6) - Technical, developer-focused
- Background: Slightly darker gray - Signals technical area
- Accents: Orange (warnings), Yellow (testing)
- Badge: 🟡 "Developer View"

### Mode Switcher Component

```jsx
┌────────────────────────────────────────────────────┐
│  [ User View ]  [ Developer View ]                 │
│      🟢              🟡                             │
└────────────────────────────────────────────────────┘
```

When hovering:
- User View: "See what your integration users experience"
- Developer View: "Test and debug your integrations"

### Layout Examples

#### User View Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header: 👤 User View                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Connect Your Integration                                   │
│                                                              │
│  [Slack Logo]                                               │
│  Slack                                                      │
│  Connect your Slack workspace to receive notifications      │
│                                                              │
│  [Connect to Slack Button]                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Developer View Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header: 🔧 Developer View                                    │
│ Environment: Local  |  User: Alice                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─── Testing Zone ─────────────────────────────────────┐  │
│ │                                                        │  │
│ │ [User Actions] [System Actions] [API Playground]      │  │
│ │                                                        │  │
│ │ Selected: Slack Integration                           │  │
│ │ Status: Connected                                     │  │
│ │                                                        │  │
│ │ Available Actions:                                    │  │
│ │ - Send Message                                        │  │
│ │ - List Channels                                       │  │
│ │ - Trigger Webhook                                     │  │
│ │                                                        │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌─── Recent Activity ────────────────────────────────────┐  │
│ │ 10:30 AM - Webhook received from Slack                │  │
│ │ 10:28 AM - User action executed: Send Message         │  │
│ │ 10:25 AM - Entity connected: workspace-123            │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Navigation Structure

### User View Routes

```
/user                              - Home (select integration to connect)
/user/connect/:integrationName     - Connection flow
/user/authorize/:integrationName   - Authorization (OAuth or form)
/user/configure/:integrationName   - Configuration
/user/connected/:integrationName   - Success state
```

### Developer View Routes

```
/dev                               - Developer home
/dev/testing                       - Testing zone
/dev/entities                      - Entity explorer
/dev/playground                    - API playground
/dev/logs                          - Logs and debugging
/dev/settings                      - Environment settings
```

## Implementation Components

### 1. ModeSwitcher Component

**Location**: `src/presentation/components/common/ModeSwitcher.jsx`

```jsx
<ModeSwitcher
  currentMode={mode}
  onChange={setMode}
  modes={[
    { id: 'user', label: 'User View', icon: User, color: 'blue' },
    { id: 'developer', label: 'Developer View', icon: Code, color: 'purple' }
  ]}
/>
```

### 2. ModeHeader Component

**Location**: `src/presentation/components/common/ModeHeader.jsx`

```jsx
<ModeHeader
  mode="user"
  title="Connect Your Integration"
  description="This is what your users will see"
/>
```

### 3. UserViewLayout Component

**Location**: `src/presentation/layouts/UserViewLayout.jsx`

Wraps user-facing screens with consistent styling and navigation.

### 4. DeveloperViewLayout Component

**Location**: `src/presentation/layouts/DeveloperViewLayout.jsx`

Wraps developer tools with technical styling and advanced navigation.

## Migration Plan

### Phase 1: Create Layouts (2 hours)

1. Create `ModeSwitcher` component
2. Create `ModeHeader` component
3. Create `UserViewLayout` component
4. Create `DeveloperViewLayout` component
5. Add mode state management (context or zustand)

### Phase 2: Migrate Existing Screens (4 hours)

**User View**:
- Move IntegrationBuilder screens → `/user/connect/*`
- Move OAuth flows → `/user/authorize/*`
- Move success states → `/user/connected/*`

**Developer View**:
- Move TestingZone → `/dev/testing`
- Move admin tools → `/dev/*`
- Add environment switcher → Developer view only

### Phase 3: Polish & Documentation (2 hours)

- Add tooltips explaining each mode
- Create user guide documentation
- Add mode persistence (localStorage)
- Add quick mode toggle hotkey (Ctrl+Shift+D)

## Success Criteria

✅ **Clear Distinction**: Anyone can immediately tell which mode they're in
✅ **Purpose Clear**: Mode headers explain what each view is for
✅ **Easy Switching**: One click to switch between modes
✅ **Consistent Styling**: Each mode has its own cohesive design
✅ **Documentation**: Developers understand when to use each mode

## Benefits

**For Integration Developers**:
- ✅ See exactly what users will experience
- ✅ Test without polluting the user experience
- ✅ Clear mental model: "user view" vs "my tools"

**For End-Users** (when they see the integration):
- ✅ Clean, professional UI
- ✅ No confusing developer tools
- ✅ Focused experience

**For Frigg**:
- ✅ Management UI becomes demo-ready
- ✅ Clearer onboarding for new developers
- ✅ Foundation for future multi-tenant features

## Next Steps

1. Get approval on design direction
2. Implement Phase 1 (layouts and components)
3. Migrate existing screens to new structure
4. Polish and document

---

**Questions for Review**:
1. Does this separation make sense for your use case?
2. Are there other "modes" we should consider?
3. Should the mode switcher be always visible or contextual?
4. Any specific branding/styling preferences?
