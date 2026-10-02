# Frigg Management UI

A modern React-based management interface for Frigg development environment. Built with Vite, React, and Tailwind CSS, this application provides developers with a comprehensive dashboard to manage integrations, users, connections, and environment variables.

## Features

- **Dashboard**: Server control, metrics, and activity monitoring
- **Integration Discovery**: Browse, install, and manage Frigg integrations
- **Environment Management**: Configure environment variables and settings
- **User Management**: Create and manage test users
- **Connection Management**: Monitor and manage integration connections
- **Real-time Updates**: WebSocket-based live updates
- **Responsive Design**: Mobile-friendly interface
- **Error Boundaries**: Robust error handling

## Tech Stack

- **React 18.3**: Modern React with hooks and functional components
- **Vite**: Fast development and build tooling
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Modern icon library
- **Socket.io**: Real-time communication
- **Axios**: HTTP client
- **@friggframework/ui**: Shared UI components

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Running Frigg backend server

### Installation

```bash
# Install dependencies
npm install

# Start development server (frontend only)
npm run dev

# Start both frontend and backend
npm run dev:server

# Build for production
npm run build
```

### Available Scripts

- `npm run dev` - Start Vite development server
- `npm run dev:server` - Start both frontend and backend concurrently
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run server` - Start backend server only
- `npm run server:dev` - Start backend server with nodemon
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run typecheck` - Run TypeScript type checking

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Button.jsx      # Custom button component
│   ├── Card.jsx        # Card container components
│   ├── ErrorBoundary.jsx
│   ├── IntegrationCard.jsx
│   ├── Layout.jsx      # Main layout component
│   ├── LoadingSpinner.jsx
│   ├── StatusBadge.jsx
│   └── index.js        # Component exports
├── hooks/              # React hooks
│   ├── useFrigg.jsx    # Main Frigg state management
│   └── useSocket.jsx   # WebSocket connection
├── pages/              # Page components
│   ├── Dashboard.jsx   # Main dashboard
│   ├── Integrations.jsx
│   ├── Environment.jsx
│   ├── Users.jsx
│   └── Connections.jsx
├── services/           # API services
│   └── api.js          # Axios configuration
├── utils/              # Utility functions
│   └── cn.js           # Class name utility
├── App.jsx             # Root component
├── main.jsx            # Application entry point
└── index.css           # Global styles

server/
├── api/                # Backend API routes
├── middleware/         # Express middleware
├── utils/              # Server utilities
├── websocket/          # WebSocket handlers
└── index.js            # Server entry point
```

## Component Architecture

### Layout Components
- **Layout**: Main application layout with responsive sidebar
- **ErrorBoundary**: Catches and displays errors gracefully

### UI Components
- **Button**: Customizable button with variants and sizes
- **Card**: Container components for content sections
- **StatusBadge**: Displays server status with color coding
- **LoadingSpinner**: Loading indicators
- **IntegrationCard**: Rich integration display component

### State Management
- **useFrigg**: Central state management for Frigg data
- **useSocket**: WebSocket connection and real-time updates

## API Integration

The management UI communicates with the Frigg backend through:

1. **REST API**: Standard CRUD operations
2. **WebSocket**: Real-time updates and notifications

### API Endpoints

- `GET /api/frigg/status` - Server status
- `POST /api/frigg/start` - Start Frigg server
- `POST /api/frigg/stop` - Stop Frigg server
- `GET /api/integrations` - List integrations
- `POST /api/integrations/install` - Install integration
- `GET /api/environment` - Environment variables
- `PUT /api/environment` - Update environment variables
- `GET /api/users` - List test users
- `POST /api/users` - Create test user
- `GET /api/connections` - List connections

## Styling

This project uses Tailwind CSS for styling with:

- **Design System**: Consistent spacing, colors, and typography
- **Responsive Design**: Mobile-first approach
- **Component Variants**: Button and component style variants
- **Dark Mode Ready**: CSS custom properties for theming

### Custom Utilities

- `cn()`: Utility for combining Tailwind classes with conditional logic

## Error Handling

- **Error Boundaries**: React error boundaries catch component errors
- **API Error Handling**: Axios interceptors handle API errors
- **Loading States**: Loading spinners and disabled states
- **Validation**: Form validation and user feedback

## Development

### Code Style

- **ESLint**: Linting with React and React Hooks rules
- **Prettier**: Code formatting (recommended)
- **TypeScript Ready**: Prepared for TypeScript migration

### Best Practices

- Functional components with hooks
- Component composition over inheritance
- Separation of concerns (UI, state, logic)
- Error boundaries for robustness
- Loading states for better UX
- Responsive design principles

## Building and Deployment

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The build output will be in the `dist/` directory and can be served by any static file server.

## Environment Variables

The application automatically detects the environment:

- **Development**: API calls to `http://localhost:3001`
- **Production**: API calls to the same origin

## Contributing

1. Follow the existing code style and patterns
2. Add error handling for new features
3. Include loading states for async operations
4. Write tests for new components (when testing is set up)
5. Update documentation for significant changes

## License

This project is part of the Frigg Framework and follows the same licensing terms.