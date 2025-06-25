# Video Tutorial Script: Frigg Management GUI Complete Walkthrough

## Video Title: "Frigg Management GUI: Visual Integration Development Made Easy"

**Duration:** 10-12 minutes  
**Target Audience:** All Frigg developers

---

## INTRO (0:00-0:30)

**[Screen: Frigg Management GUI splash screen]**

**Narrator:** "Welcome to the complete walkthrough of the Frigg Management GUI! This powerful visual interface transforms how you develop and test integrations. Whether you're new to Frigg or an experienced developer, this GUI will supercharge your workflow."

**[Screen: Quick montage of GUI features]**

---

## SECTION 1: Launching the GUI (0:30-1:30)

**[Screen: Terminal]**

```bash
frigg ui
```

**Narrator:** "Starting the GUI is simple. Just run frigg ui in your project directory."

**[Screen: Browser opening with GUI]**

**Narrator:** "The GUI automatically detects your project, loads configurations, and connects to your local Frigg instance."

**[Screen: Dashboard overview]**

"Let's explore each section..."

---

## SECTION 2: Dashboard Overview (1:30-2:30)

**[Screen: Dashboard with annotations]**

**Narrator:** "The dashboard gives you an instant overview of your integration ecosystem:"

**[Mouse hover over each widget]**
- "Active integrations count"
- "Test users for development"  
- "API call metrics"
- "Quick action buttons"

**[Click on navigation menu]**

"The sidebar provides access to all features. Let's start with integration management."

---

## SECTION 3: Integration Browser (2:30-4:00)

**[Screen: Integration browser]**

**Narrator:** "The integration browser is your one-stop shop for discovering and installing modules."

**[Screen: Search for "CRM"]**

"Search by name, category, or functionality..."

**[Screen: Click on HubSpot]**

"Click any integration to see details, documentation, and requirements."

**[Screen: Click Install]**

"Installation is just one click. The GUI handles all dependencies."

**[Screen: Installation progress and success]**

---

## SECTION 4: Configuration Management (4:00-5:30)

**[Screen: HubSpot configuration page]**

**Narrator:** "After installation, configure your integrations visually."

**[Screen: Entering credentials]**

"Enter API credentials securely. Sensitive values are automatically masked."

**[Screen: Toggle options]**

"Enable features like webhooks, auto-refresh, and debug mode with simple toggles."

**[Screen: Test Connection button]**

"Always test your connection before proceeding."

**[Screen: Success message]**

---

## SECTION 5: Test User System (5:30-7:00)

**[Screen: Test Users page]**

**Narrator:** "Test users are crucial for safe development. Let's create one."

**[Screen: Create Test User form]**

```
Name: John Developer
Email: john@test.frigg
```

**Narrator:** "Test users are isolated from production data."

**[Screen: Connect integration to test user]**

"Now connect this user to our HubSpot integration..."

**[Screen: OAuth flow simulation]**

"The GUI simulates the entire OAuth flow for testing."

---

## SECTION 6: Connection Testing (7:00-8:30)

**[Screen: Connection Tester]**

**Narrator:** "The connection tester is where the magic happens. Test any API method interactively."

**[Screen: Select listContacts method]**

"Choose a method from the dropdown..."

**[Screen: Parameter input]**

```json
{
  "limit": 10,
  "properties": ["email", "firstname", "lastname"]
}
```

**[Screen: Run Test]**

"Execute the test and see real results..."

**[Screen: JSON response]**

"Perfect for debugging and understanding API responses."

---

## SECTION 7: Environment Variables (8:30-9:30)

**[Screen: Environment Variables page]**

**Narrator:** "Managing environment variables has never been easier."

**[Screen: Add new variable]**

"Add variables with the visual editor..."

**[Screen: Import .env button]**

"Or import existing .env files..."

**[Screen: Environment switcher]**

"Switch between local, staging, and production environments seamlessly."

**[Screen: Sync with AWS]**

"For production, sync directly with AWS Parameter Store."

---

## SECTION 8: Code Generation (9:30-10:30)

**[Screen: Code Generator]**

**Narrator:** "Turn visual configurations into production code instantly."

**[Screen: Select API Endpoint template]**

"Choose what to generate - endpoints, webhooks, or entire integrations."

**[Screen: Configure options]**

"Configure your requirements visually..."

**[Screen: Generated code preview]**

"Review the generated code with syntax highlighting..."

**[Screen: Copy to clipboard]**

"Copy and integrate into your project immediately."

---

## SECTION 9: Monitoring & Logs (10:30-11:30)

**[Screen: Monitoring dashboard]**

**Narrator:** "Real-time monitoring helps you understand performance."

**[Screen: Metrics graphs]**

"View API call volume, response times, and error rates."

**[Screen: Activity log]**

"See every API call with detailed information."

**[Screen: Filter options]**

"Filter by integration, status code, or time range."

---

## ADVANCED TIPS (11:30-12:00)

**[Screen: Keyboard shortcuts overlay]**

**Narrator:** "Pro tips for power users:"

- "Use Cmd+K for quick navigation"
- "Cmd+S saves configurations instantly"
- "Double-click logs to see full details"

**[Screen: Export configuration]**

"Export and share configurations with your team."

---

## CONCLUSION (12:00-12:30)

**[Screen: Frigg GUI with all sections visible]**

**Narrator:** "The Frigg Management GUI transforms integration development from command-line complexity to visual simplicity. Start exploring with frigg ui and discover how much faster you can build!"

**[Screen: Resources and links]**

"Find more tutorials, documentation, and our community in the links below. Happy building!"

---

## POST-PRODUCTION NOTES

- Use smooth zoom and pan effects
- Highlight clicked elements
- Add callout boxes for important features
- Include keyboard/mouse indicators
- Speed up repetitive actions
- Add chapters for easy navigation
- Include closed captions
- Background music: calm, focused