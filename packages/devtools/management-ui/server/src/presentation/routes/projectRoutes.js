import { Router } from 'express'
import { ProjectId } from '../../domain/value-objects/ProjectId.js'

/**
 * Routes for project management following clean API structure
 * All routes are project-centric with deterministic IDs
 */
export function createProjectRoutes(projectController) {
  const router = Router()

  // Bind controller methods
  const controller = {
    listProjects: projectController.getRepositories.bind(projectController),
    getProject: projectController.getProjectById.bind(projectController),
    switchRepository: projectController.switchRepository.bind(projectController),
    getProjectDefinition: projectController.getProjectDefinition.bind(projectController),

    // Git operations
    getGitBranches: projectController.getGitBranches.bind(projectController),
    getGitStatus: projectController.getGitStatus.bind(projectController),
    switchGitBranch: projectController.switchGitBranch.bind(projectController),

    // IDE operations
    createIDESession: projectController.openInIDE.bind(projectController),
    getAvailableIDEs: projectController.getAvailableIDEs.bind(projectController),

    // Frigg process management
    startFriggExecution: projectController.startProject.bind(projectController),
    stopFriggExecution: projectController.stopProject.bind(projectController),
    getFriggExecutionStatus: projectController.getStatus.bind(projectController),

    // Legacy endpoints for compatibility
    getEnvironment: projectController.getEnvironment.bind(projectController),
    debugRepository: projectController.debugRepository.bind(projectController)
  }

  // ============================================
  // Projects
  // ============================================

  /**
   * GET /api/projects
   * List all discovered Frigg projects with deterministic IDs
   */
  router.get('/', async (req, res, next) => {
    try {
      // Get repositories from controller
      await controller.listProjects(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/projects/{id}
   * Get complete project details by deterministic ID
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params

      // Validate project ID format
      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      // Get the project by ID
      await controller.getProject(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  // ============================================
  // Git Operations
  // ============================================

  /**
   * GET /api/projects/{id}/git/branches
   * List all git branches for a project
   */
  router.get('/:id/git/branches', async (req, res, next) => {
    try {
      const { id } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      await controller.getGitBranches(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/projects/{id}/git/status
   * Get git working directory status
   */
  router.get('/:id/git/status', async (req, res, next) => {
    try {
      const { id } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      await controller.getGitStatus(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  /**
   * PATCH /api/projects/{id}/git/current-branch
   * Switch to a different git branch
   */
  router.patch('/:id/git/current-branch', async (req, res, next) => {
    try {
      const { id } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      await controller.switchGitBranch(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  // ============================================
  // IDE Sessions
  // ============================================

  /**
   * POST /api/projects/:id/ide-sessions
   * Open project/file in IDE
   */
  router.post('/:id/ide-sessions', async (req, res, next) => {
    try {
      const { id } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      // Find project path
      const projectPath = await projectController._findProjectPathById(id)
      if (!projectPath) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        })
      }

      // Use the path from request body or default to project root
      if (!req.body.path) {
        req.body.path = projectPath
      }

      await projectController.openInIDE(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/projects/ides/available
   * Get list of available IDEs (not project-specific)
   */
  router.get('/ides/available', (req, res, next) => controller.getAvailableIDEs(req, res, next))

  // ============================================
  // Frigg Process Management
  // ============================================

  /**
   * POST /api/projects/{id}/frigg/executions
   * Start a new Frigg process for this project
   */
  router.post('/:id/frigg/executions', async (req, res, next) => {
    try {
      const { id } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      await controller.startFriggExecution(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  /**
   * DELETE /api/projects/{id}/frigg/executions/{execution-id}
   * Stop a specific Frigg execution
   */
  router.delete('/:id/frigg/executions/:executionId', async (req, res, next) => {
    try {
      const { id, executionId } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      await controller.stopFriggExecution(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  /**
   * DELETE /api/projects/{id}/frigg/executions/current
   * Convenience endpoint: Stop the currently running Frigg process
   */
  router.delete('/:id/frigg/executions/current', async (req, res, next) => {
    try {
      const { id } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      await controller.stopFriggExecution(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/projects/{id}/frigg/executions/{execution-id}/status
   * Get status of a specific Frigg execution
   */
  router.get('/:id/frigg/executions/:executionId/status', async (req, res, next) => {
    try {
      const { id, executionId } = req.params

      if (!ProjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid project ID format'
        })
      }

      await controller.getFriggExecutionStatus(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  return router
}