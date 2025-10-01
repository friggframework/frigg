import { Router } from 'express'

/**
 * Routes for Git operations
 */
export function createGitRoutes(gitController) {
  const router = Router()

  // Bind controller methods
  const controller = {
    getRepository: gitController.getRepository.bind(gitController),
    getStatus: gitController.getStatus.bind(gitController),
    listBranches: gitController.listBranches.bind(gitController),
    createBranch: gitController.createBranch.bind(gitController),
    switchBranch: gitController.switchBranch.bind(gitController),
    deleteBranch: gitController.deleteBranch.bind(gitController),
    stashChanges: gitController.stashChanges.bind(gitController),
    applyStash: gitController.applyStash.bind(gitController),
    syncBranch: gitController.syncBranch.bind(gitController)
  }

  // Repository status
  router.get('/repository', controller.getRepository)
  router.post('/status', controller.getStatus)

  // Branch operations
  router.get('/branches', controller.listBranches)
  router.post('/branches', controller.createBranch)
  router.post('/branches/:branch/switch', controller.switchBranch)
  router.delete('/branches/:branch', controller.deleteBranch)
  router.post('/branches/:branch/sync', controller.syncBranch)

  // Stash operations
  router.post('/stash', controller.stashChanges)
  router.post('/stash/apply', controller.applyStash)

  return router
}