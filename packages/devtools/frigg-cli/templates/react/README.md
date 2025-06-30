# Frigg React Application

This is a Frigg-powered React application created with the Frigg CLI.

## Getting Started

### Prerequisites

- Node.js 14.x or higher
- npm or yarn
- A running Frigg backend (see backend setup below)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The application will be available at http://localhost:3000

### Backend Setup

This frontend application requires a Frigg backend to be running. If you haven't set up the backend yet:

1. Navigate to the backend directory
2. Follow the backend README instructions
3. Ensure the backend is running on http://localhost:3001

### Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run preview` - Preview the production build
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Project Structure

```
src/
├── components/     # Reusable React components
├── pages/         # Page components (routes)
├── hooks/         # Custom React hooks
├── services/      # API services and utilities
├── utils/         # Utility functions
└── test/          # Test setup and utilities
```

## Features

- **Integration Management**: View and manage your Frigg integrations
- **Dashboard**: Overview of your integration status and metrics
- **Settings**: Configure environment variables and API settings
- **Responsive Design**: Works on desktop and mobile devices

## Customization

### Styling

This application uses Tailwind CSS for styling. You can customize the theme by modifying:
- `tailwind.config.js` - Tailwind configuration
- `src/index.css` - Global styles and CSS variables

### API Configuration

The API base URL can be configured via environment variables:

```bash
VITE_API_URL=http://localhost:3001/api
```

## Testing

Run the test suite with:

```bash
npm test
```

For UI testing mode:

```bash
npm run test:ui
```

## Building for Production

1. Build the application:
```bash
npm run build
```

2. Preview the production build:
```bash
npm run preview
```

3. Deploy the `dist` directory to your hosting provider

## Learn More

- [Frigg Documentation](https://docs.frigg.so)
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)