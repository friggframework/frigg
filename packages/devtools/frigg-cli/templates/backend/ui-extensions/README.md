# UI Extensions

This directory contains custom UI extensions for external platform integrations. Each subdirectory represents a separate integration-specific package.

## Purpose

When integrating with platforms that provide their own UI extension frameworks (like Attio, HubSpot, Salesforce, etc.), you can build and manage those extension packages here.

## Directory Structure

```
ui-extensions/
├── README.md               # This file
├── attio/                  # Attio UI extension (if using Attio)
├── hubspot/                # HubSpot UI extension (if using HubSpot)
├── salesforce/             # Salesforce Lightning component (if using Salesforce)
└── <platform>/             # Other platform-specific extensions
```

## Getting Started

Each platform extension is a separate npm package. To create one:

1. **Create the extension directory:**
   ```bash
   mkdir ui-extensions/<platform-name>
   cd ui-extensions/<platform-name>
   ```

2. **Initialize the package:**
   Follow the platform's SDK documentation to set up the extension package.

3. **Develop and test:**
   Each extension has its own build and development scripts.

## Example: Attio Extension

```bash
cd ui-extensions/attio
npm install
npm run dev    # Start development server
npm run build  # Build for production
```

## Example: HubSpot Extension

```bash
cd ui-extensions/hubspot
npm install
npx hs project create --template=react-app
npm run dev
```

## Workspace Integration

Add extensions as workspaces in the root `package.json`:

```json
{
    "workspaces": [
        "ui-extensions/*"
    ]
}
```

## Platform Documentation

- [Attio Apps](https://developers.attio.com)
- [HubSpot UI Extensions](https://developers.hubspot.com/docs/platform/ui-extensions-overview)
- [Salesforce Lightning Components](https://developer.salesforce.com/docs/atlas.en-us.lightning.meta)
- [Monday.com Apps](https://developer.monday.com/apps)

## Notes

- Each extension is independent and can be deployed separately
- Extensions typically have their own build tools and test suites
- Keep platform-specific code isolated to its respective directory
