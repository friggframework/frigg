import {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  emitSocketEvent
} from '../utils/responseHelpers.js'
import { asyncHandler } from '../utils/controllerWrapper.js'

/**
 * Controller for Git operations
 * Handles branch management and repository status
 *
 * Uses response helpers and asyncHandler to reduce boilerplate
 */
export class GitController {
  constructor({ gitService }) {
    this.gitService = gitService

    // Bind methods to preserve 'this' context when used with asyncHandler
    this.getRepository = asyncHandler(this._getRepository.bind(this))
    this.getStatus = asyncHandler(this._getStatus.bind(this))
    this.listBranches = asyncHandler(this._listBranches.bind(this))
    this.createBranch = asyncHandler(this._createBranch.bind(this))
    this.switchBranch = asyncHandler(this._switchBranch.bind(this))
    this.deleteBranch = asyncHandler(this._deleteBranch.bind(this))
    this.stashChanges = asyncHandler(this._stashChanges.bind(this))
    this.applyStash = asyncHandler(this._applyStash.bind(this))
    this.syncBranch = asyncHandler(this._syncBranch.bind(this))
  }

  async _getRepository() {
    const repository = await this.gitService.getRepositoryStatus()
    return repository
  }

  async _getStatus(req, res) {
    const { path } = req.body

    if (!path) {
      sendBadRequest(res, 'Path is required')
      return
    }

    const repository = await this.gitService.getRepositoryStatus()

    sendSuccess(res, {
      branch: repository.currentBranch,
      status: repository.status,
      hasChanges: Object.values(repository.status).some(arr =>
        Array.isArray(arr) && arr.length > 0
      )
    })
  }

  async _listBranches() {
    const repository = await this.gitService.getRepositoryStatus()
    return {
      current: repository.currentBranch,
      branches: repository.branches,
      workflow: repository.workflow
    }
  }

  async _createBranch(req, res) {
    const { name, baseBranch, type, description } = req.body

    if (!name && (!type || !description)) {
      sendBadRequest(res, 'Either branch name or type+description is required')
      return
    }

    const result = await this.gitService.createBranch({
      name,
      baseBranch,
      type,
      description
    })

    emitSocketEvent(req, 'git:branch-created', result)
    sendCreated(res, result)
  }

  async _switchBranch(req, res) {
    const { branch } = req.params
    const { autoStash = false } = req.body

    const result = await this.gitService.switchBranch(branch, autoStash)

    emitSocketEvent(req, 'git:branch-switched', result)
    sendSuccess(res, result)
  }

  async _deleteBranch(req, res) {
    const { branch } = req.params
    const { force = false } = req.body

    const result = await this.gitService.deleteBranch(branch, force)

    emitSocketEvent(req, 'git:branch-deleted', result)
    sendSuccess(res, result)
  }

  async _stashChanges(req) {
    const { message } = req.body
    return await this.gitService.stashChanges(message)
  }

  async _applyStash(req) {
    const { stashId } = req.body
    return await this.gitService.applyStash(stashId)
  }

  async _syncBranch(req, res) {
    const { branch } = req.params
    const { operation = 'pull' } = req.body

    const result = await this.gitService.syncBranch(branch, operation)

    emitSocketEvent(req, 'git:branch-synced', result)
    sendSuccess(res, result)
  }
}