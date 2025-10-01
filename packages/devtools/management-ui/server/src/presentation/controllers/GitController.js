/**
 * Controller for Git operations
 * Handles branch management and repository status
 */
export class GitController {
  constructor({ gitService }) {
    this.gitService = gitService
  }

  async getRepository(req, res, next) {
    try {
      const repository = await this.gitService.getRepositoryStatus()

      res.json({
        success: true,
        data: repository
      })
    } catch (error) {
      next(error)
    }
  }

  async getStatus(req, res, next) {
    try {
      const { path } = req.body

      if (!path) {
        return res.status(400).json({
          success: false,
          error: 'Path is required'
        })
      }

      // Use the existing gitService but with a different project path
      // For now, let's use the existing repository endpoint logic
      const repository = await this.gitService.getRepositoryStatus()

      res.json({
        success: true,
        branch: repository.currentBranch,
        status: repository.status,
        hasChanges: Object.values(repository.status).some(arr =>
          Array.isArray(arr) && arr.length > 0
        )
      })
    } catch (error) {
      next(error)
    }
  }

  async listBranches(req, res, next) {
    try {
      const repository = await this.gitService.getRepositoryStatus()

      res.json({
        success: true,
        data: {
          current: repository.currentBranch,
          branches: repository.branches,
          workflow: repository.workflow
        }
      })
    } catch (error) {
      next(error)
    }
  }

  async createBranch(req, res, next) {
    try {
      const { name, baseBranch, type, description } = req.body

      if (!name && (!type || !description)) {
        return res.status(400).json({
          success: false,
          error: 'Either branch name or type+description is required'
        })
      }

      const result = await this.gitService.createBranch({
        name,
        baseBranch,
        type,
        description
      })

      // Emit WebSocket event for branch change
      const io = req.app.get('io')
      if (io) {
        io.emit('git:branch-created', result)
      }

      res.status(201).json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  }

  async switchBranch(req, res, next) {
    try {
      const { branch } = req.params
      const { autoStash = false } = req.body

      const result = await this.gitService.switchBranch(branch, autoStash)

      // Emit WebSocket event
      const io = req.app.get('io')
      if (io) {
        io.emit('git:branch-switched', result)
      }

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  }

  async deleteBranch(req, res, next) {
    try {
      const { branch } = req.params
      const { force = false } = req.body

      const result = await this.gitService.deleteBranch(branch, force)

      // Emit WebSocket event
      const io = req.app.get('io')
      if (io) {
        io.emit('git:branch-deleted', result)
      }

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  }

  async stashChanges(req, res, next) {
    try {
      const { message } = req.body

      const result = await this.gitService.stashChanges(message)

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  }

  async applyStash(req, res, next) {
    try {
      const { stashId } = req.body

      const result = await this.gitService.applyStash(stashId)

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  }

  async syncBranch(req, res, next) {
    try {
      const { branch } = req.params
      const { operation = 'pull' } = req.body

      const result = await this.gitService.syncBranch(branch, operation)

      // Emit WebSocket event
      const io = req.app.get('io')
      if (io) {
        io.emit('git:branch-synced', result)
      }

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  }
}