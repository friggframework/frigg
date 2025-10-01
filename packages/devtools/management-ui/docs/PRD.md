# Frigg Management UI - Lenny's 1-Pager PRD

## Description

The Frigg Management UI is a local desktop application that provides visual exploration and testing capabilities for Frigg-based integration code and definitions. Unlike traditional CLI-only workflows, this UI enables both developers and less technical team members to inspect, understand, and test-drive Frigg integrations through an intuitive interface without requiring deep command-line expertise. The application runs locally alongside development environments, focusing on code surfacing, service management, and local 'test-drive' validation workflows.

## Problem

Teams building with Frigg integrations struggle to effectively collaborate on integration development and validation because current workflows require all team members to have deep CLI and code familiarity, creating barriers for product managers, designers, and less technical contributors who need to understand and validate integration definitions.

This problem specifically excludes broader DevOps orchestration, production deployment management, or replacing existing IDE functionality. Instead, it focuses on the collaboration gap that emerges when technical and non-technical team members need to work together on integration logic understanding, service management, and behavioral validation during local development phases.

## Why

Strong hypotheses based on observed team pain points and handoff cycles suggest this is a critical collaboration bottleneck:

**CLI-only workflows create knowledge silos** where only developers can effectively inspect or validate integration configurations, forcing non-technical team members to rely entirely on developer mediation rather than direct interaction with integration definitions.

**Integration handoff cycles are unnecessarily complex** as modern applications require sophisticated data transformations, conditional routing, and multi-step workflows that benefit from visual representation and collaborative validation rather than code-only access.

**Context-switching overhead is significant** when developers must constantly translate technical integration definitions into business-friendly explanations, disrupting flow states and creating bottlenecks in validation cycles.

**Visual exploration and testing tools are absent** from current Frigg workflows, making it difficult for non-technical team members to confidently participate in integration testing and approval processes.

## Success

Success will be measured by **reducing integration feedback cycle time by 40% within teams using the Management UI** compared to CLI-only workflows, measured from initial integration development to stakeholder approval and handoff confidence.

Concretely, success looks like product managers being able to independently inspect integration configurations and test-drive user scenarios, designers understanding integration definitions for UX decisions, and developers spending significantly less time in explanatory meetings while maintaining development velocity. Teams should demonstrate clear evidence of non-technical members actively participating in integration validation without requiring developer mediation.

A secondary success indicator would be **75% adoption rate among teams that trial the tool for 30+ days**, suggesting the tool provides genuine value in collaborative integration development workflows.

## Audience

**Primary audience:** Hybrid development teams with 3-8 members that include both technical developers (backend/integration specialists) and product-oriented roles (product managers, designers, technical product owners) working on applications with Frigg-based integrations.

**Key secondary audience:** Solo developers or small technical teams who want faster visual feedback loops for their own integration development, particularly those building customer-facing applications where integration behavior directly impacts user experience.

Both audiences share the need for faster validation cycles, clearer communication about integration definitions, and reduced friction in moving from integration development to confident stakeholder handoff.

## Layout Overview

The Frigg Management UI uses a structured dual-zone layout that provides consistent navigation and clear visual separation between code exploration and testing capabilities.

### Global Header Layout

The application header contains persistent branding and application context elements spanning the full width of the interface. The left section displays the Frigg logo and current application name with branch status indicator. The right section houses the IDE/dark-light mode toggle, providing quick access to theme preferences and development environment handoff.

### Main Navigation Pattern

The primary navigation uses a prominent tab-based system positioned directly below the global header, offering clear access to the two primary zones: "Definitions" and "Test Area." Tab styling provides immediate visual feedback for the active zone, with consistent state indicators showing zone availability and current status.

### Definitions Zone Content Structure

The Definitions zone occupies the full application viewport and features a comprehensive file and configuration explorer. The interface includes application settings controls, integration configuration panels, and a persistent search bar positioned prominently at the top. Integration definitions appear as organized cards or list items, with each displaying essential metadata, status indicators, and quick-access controls for viewing detailed configurations and opening files in external IDEs.

### Test Area Content Architecture

The Test Area implements an app-within-app visual framework with distinct styling that immediately communicates the sandbox nature of the environment. A service status banner appears at the top, clearly indicating Frigg service availability and current operational state. Below this, the impersonated user selector provides context for all testing activities. The central content area features the Integration Gallery in a responsive grid layout, with a persistent search bar enabling quick filtering across all available integrations. Individual integration cards expand to reveal testing controls and entity configuration options without losing the broader gallery context. A collapsible live log stream panel positions at the bottom or side, providing real-time integration activity visibility.

### Disabled State Overlays

When Frigg services are not running, the interface applies consistent overlay patterns across relevant zones. The Test Area displays a prominent lock screen with clear messaging about service requirements and actionable start buttons. Individual integration cards show disabled states with informative tooltips explaining availability requirements. The Definitions zone remains fully accessible during service downtime, maintaining its "always available" functionality.

### Persistent Structural Elements

Key interface elements maintain consistent positioning and behavior across all application states. The global search functionality remains accessible from any zone with unified results and context-aware filtering. Navigation breadcrumbs and zone indicators provide constant situational awareness. User impersonation status and service connectivity indicators appear consistently in their designated header positions. Mode indicators and current user context display persistently in the Test Area to maintain clear testing context throughout all interactions.

## What

The Frigg Management UI provides a desktop application with two distinct zones structured as an app-within-app architecture. The interface uses clear visual and behavioral separation to ensure users always understand their current context and available capabilities.

### Global UI Preferences & Navigation

**Global Dark/Light Mode Toggle** provides system-wide theme control:

* Header-positioned toggle button with persistent user preference storage

* System preference detection with manual override capability

* Smooth theme transitions across all interface zones

* Preference persistence across application sessions

**Persistent Navigation Context** ensures users maintain situational awareness:

* Breadcrumb navigation showing current zone and sub-context

* Global search functionality accessible from any zone

* User impersonation status always visible when test services are active

* Connection status indicators for all dependent services

### Definitions Zone (Always Available)

The Definitions zone provides **always-on access** to code exploration with clear "Available" status indicators:

**Visual Integration Inspector** displays all local integration definitions with clear structure visualization, configuration details, and dependency mapping. Users can explore integration code through an intuitive interface without terminal access. The interface shows file hierarchies, configuration schemas, and integration flow diagrams in an organized, searchable format.

**Open in IDE Integration** provides seamless development handoff:

* Dynamic "Open in IDE" button always visible in Definitions zone UI

* Automatic detection of user's preferred IDE (VS Code, IntelliJ, etc.)

* Context-aware file opening (opens specific integration files when selected)

* Preference management for IDE selection and custom editor paths

**Branch Management Interface** enables users to switch between git branches and explore different versions of integration configurations. A dropdown selector shows all available branches with clear indicators for current branch, recent changes, and merge status.

**Microcopy for Definitions Zone:**

* Header: "App Definitions - Code Exploration Always Available"

* Status indicator: "✓ Ready to explore • Current user: \[Username\] • Branch: \[branch-name\]"

* Search placeholder: "Search integration definitions, configurations, and dependencies..."

* IDE button: "Open in \[VS Code/IntelliJ/etc.\]"

* Branch selector tooltip: "Switch branches to explore different versions of your integrations"

* File browser placeholder: "Select an integration file to view its configuration and dependencies"

* Empty state: "No integration definitions found. Make sure you're in a Frigg project directory."

### Integration Gallery/Test Area (App-Within-App)

The Test Area launches as an **Integration Gallery** providing app-within-app testing capabilities with scalable integration management:

**Integration Gallery Card Interface** displays available integrations:

* **Card/Grid layout** matching real application UI patterns for familiarity

* **Integration cards** show: icon (if configured), integration name, short description, enable/configure/test actions, and current status

* **Status indicators:** "Enabled for current user," "Available," "Configuration needed," "Testing in progress"

* **Persistent search bar** with instant filtering by integration name

* **Scale-optimized search** works seamlessly with large integration catalogs

**Expandable Integration Testing** provides contextual workflows:

* **Card expansion** reveals test controls and workflows specific to selected integration

* **Slide-in panels** show integration-specific testing interface without losing gallery context

* **User-specific testing** with controls contextual to current user/impersonation settings

* **Live integration preview** within expanded card interface

**Test-Area-as-App-Within-App Architecture:**

* **Visually distinct sandbox environment** with clear framing

* **Mock browser interface** with address bar showing "localhost:3000"

* **Distinctive border styling** separating test area from definitions zone

* **"Integration Testing Mode" banner** persistently visible

* **Current user/impersonation status** always displayed in test area header

**Live Log Streaming** displays in collapsible panel:

* **Real-time integration activity logs** with color-coded severity levels

* **Integration-specific filtering** based on selected test integration

* **User context filtering** showing logs relevant to current impersonation

* **Correlation tracking** linking user actions to integration responses

**Microcopy for Integration Gallery/Test Area:**

*Gallery View:*

* Header: "Integration Gallery - Test Your App's Integrations"

* Search placeholder: "Filter integrations by name..."

* Status line: "Testing as: \[Current User\] • \[X\] integrations available • App status: \[Running/Stopped\]"

* Card actions: "Enable," "Configure," "Test Now," "View Logs"

*Locked State (Service Not Running):*

* Lock screen: "Start your Frigg app to access integration testing"

* CTA button: "Start Frigg Services"

* Help text: "The Integration Gallery lets you test integrations individually and see real-time behavior"

*Active Testing State:*

* Expanded card header: "Testing: \[Integration Name\] as \[Current User\]"

* Integration status: "🟢 Connected and responding"

* Log panel header: "Live Integration Logs - \[Integration Name\]"

* User selector: "Switch test user: \[User Dropdown\] - See how this integration behaves for different user types"

*Search and Filter States:*

* Search results: "Showing \[X\] integrations matching '\[search term\]'"

* No results: "No integrations found for '\[search term\]' - Try different keywords"

* Loading: "⏳ Loading integrations..."

*Error/Edge States:*

* Connection failed: "❌ Unable to connect to integration services. Check that your Frigg app is running"

* Integration error: "⚠️ \[Integration Name\] failed to respond - View logs for troubleshooting details"

* No integrations: "No integrations detected in your Frigg app. Add integrations to test them here"

### UX Flow Integration Across Zones

**Seamless Zone Transitions** maintain user context:

* **Search persistence** across zone switches with unified search bar

* **User impersonation continuity** when moving between definitions exploration and testing

* **Integration context preservation** when switching from definition viewing to testing

* **Dynamic action availability** based on current zone and service status

**Context-Aware State Management:**

* **Smart defaults** for user selection and integration filtering

* **Breadcrumb navigation** showing path through definitions → integration selection → testing

* **Quick-switch capabilities** between related integrations during testing sessions

* **Recent activity tracking** for faster return to previous work contexts

### Phase 1 Scope & Limitations

All editing capabilities are clearly marked as **"Coming Soon"** with consistent styling:

**Coming Soon Features** (prominently displayed with roadmap context):

* Integration definition editing: "Coming Soon - Phase 2"

* Integration gallery customization: "Coming Soon - Custom gallery layouts and grouping"

* Advanced user management: "Coming Soon - Add/edit test users in Phase 2"

* Integration configuration modifications: "Coming Soon - Currently read-only for safety"

* Bulk integration testing: "Coming Soon - Test multiple integrations simultaneously"

**Coming Soon UI Elements:**

* Disabled buttons with "Coming Soon" tooltips

* Overlay messages: "✨ Feature in development - Subscribe for updates"

* Roadmap links: "See what's next in our development roadmap"

* Beta program CTA: "Want early access? Join our beta program"

### User Stories

**As a product manager**, I want to browse the integration gallery and test-drive specific integrations with different user personas so that I can validate business logic requirements without requiring developer interpretation sessions.

**As a developer**, I want to provide stakeholders with an integration gallery they can explore and test independently, with seamless handoff to my preferred IDE, so that I can get faster feedback on configurations and reduce handoff friction.

**As a designer**, I want to explore integration definitions and test user flows in the integration gallery so that I can design accurate UI components and understand integration behavior without constantly requesting developer specifications.

**As a technical product owner**, I want to filter and test specific integrations with different user scenarios so that I can ensure product requirements are properly implemented before final handoff.

**As a backend developer**, I want to enable visual exploration of integration code with one-click IDE access and provide a scalable integration testing gallery so that team members can confidently validate and test integration behavior independently.

## How

The application will be built as an Electron-based desktop app providing native performance while leveraging web technologies for rapid UI development. The architecture will focus on clean separation between code browsing capabilities and test-driving functionality, with clear gating between zones based on service availability.

**Key UX Delivery Principles:**

**Integration Gallery Architecture** ensures scalable testing workflows:

* **Card-based interface** matching modern application UI patterns for immediate familiarity

* **Instant search and filtering** optimized for large integration catalogs without performance degradation

* **Context-preserving expansion** allowing deep integration testing without losing gallery overview

* **Status-aware interactions** with clear visual feedback for integration availability and testing states

**Mode Separation Best Practices** ensure users always understand their current context:

* **Persistent mode headers** with current zone, user context, and service status

* **Dynamic UI adaptation** based on service availability and current integration testing state

* **Clear state transitions** with appropriate loading and success feedback

* **Contextual action availability** showing relevant capabilities for current context

**Progressive Disclosure Implementation** accommodates different user skill levels:

* **Layered integration information** from overview cards to detailed testing interfaces

* **Smart search and filtering** helping users find relevant integrations quickly

* **Context-sensitive help** explaining mode-specific capabilities without overwhelming interface

* **Expandable testing workflows** providing simple entry points with advanced capabilities on demand

**Technical Architecture Approach:**

**Integration Gallery API Design** provides scalable integration management:

* **Card-based data structure** optimizing for fast gallery rendering and instant search

* **Integration metadata caching** ensuring responsive UI with large integration catalogs

* **Real-time status updates** maintaining accurate integration availability across user sessions

* **Context-aware testing APIs** providing user-specific integration testing capabilities

**Dual-zone architecture** clearly separates always-available code exploration from service-dependent testing capabilities, with seamless transitions preserving user context and search states.

**Direct API integration** connects to local Frigg APIs and leverages existing Frigg schemas for integration definition parsing, gallery population, and test-area presentation.

**Safe sandbox testing** integrates with running Frigg instances to provide controlled environments where users can test specific integrations with different user contexts without affecting development or production systems.

**Development Process:**

**Rapid prototyping approach** with early feedback from target user personas, ensuring the integration gallery interface truly serves both technical and non-technical needs for integration discovery and validation workflows.

**User-centered design validation** through regular testing with actual product managers, designers, and developers to ensure the gallery approach effectively reduces collaboration friction and scales with integration complexity.

**Iterative refinement** of search, filtering, and testing workflows based on observed usage patterns and feedback from beta users working with varying integration catalog sizes.