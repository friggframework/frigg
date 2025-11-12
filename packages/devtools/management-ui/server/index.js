/**
 * Management UI Server Entry Point
 * Uses DDD/Hexagonal Architecture from server/src/app.js
 */
import { startServer } from './src/app.js'

const port = process.env.PORT || 3210
const projectPath = process.env.PROJECT_PATH || process.cwd()

// Start the DDD-architected server
startServer(port, projectPath)
