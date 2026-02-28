/**
 * FileSystem Adapter
 * Provides file operations for the proposal approval workflow
 */

import fs from 'fs/promises'
import path from 'path'

export class FileSystemAdapter {
  constructor({ projectPath = process.cwd() } = {}) {
    this.projectPath = projectPath
  }

  /**
   * Resolve a file path relative to the project
   * @param {string} filePath
   */
  resolvePath(filePath) {
    // If it's already absolute, use as-is
    if (path.isAbsolute(filePath)) {
      return filePath
    }
    return path.resolve(this.projectPath, filePath)
  }

  /**
   * Write content to a file
   * @param {string} filePath - Path to the file
   * @param {string} content - Content to write
   */
  async writeFile(filePath, content) {
    const resolvedPath = this.resolvePath(filePath)

    // Ensure directory exists
    const dir = path.dirname(resolvedPath)
    await fs.mkdir(dir, { recursive: true })

    await fs.writeFile(resolvedPath, content, 'utf8')

    return {
      path: resolvedPath,
      size: content.length
    }
  }

  /**
   * Read content from a file
   * @param {string} filePath - Path to the file
   */
  async readFile(filePath) {
    const resolvedPath = this.resolvePath(filePath)
    return await fs.readFile(resolvedPath, 'utf8')
  }

  /**
   * Edit a file by replacing content
   * @param {string} filePath - Path to the file
   * @param {string} oldString - String to find
   * @param {string} newString - String to replace with
   * @param {boolean} replaceAll - Whether to replace all occurrences
   */
  async editFile(filePath, oldString, newString, replaceAll = false) {
    const resolvedPath = this.resolvePath(filePath)

    const content = await fs.readFile(resolvedPath, 'utf8')

    let newContent
    if (replaceAll) {
      newContent = content.split(oldString).join(newString)
    } else {
      const index = content.indexOf(oldString)
      if (index === -1) {
        throw new Error(`String not found in file: "${oldString.slice(0, 50)}..."`)
      }
      newContent = content.slice(0, index) + newString + content.slice(index + oldString.length)
    }

    if (content === newContent) {
      throw new Error('No changes were made - old string not found')
    }

    await fs.writeFile(resolvedPath, newContent, 'utf8')

    return {
      path: resolvedPath,
      originalSize: content.length,
      newSize: newContent.length
    }
  }

  /**
   * Delete a file
   * @param {string} filePath - Path to the file
   */
  async deleteFile(filePath) {
    const resolvedPath = this.resolvePath(filePath)

    // Check if file exists first
    try {
      await fs.access(resolvedPath)
    } catch {
      throw new Error(`File not found: ${resolvedPath}`)
    }

    await fs.unlink(resolvedPath)

    return {
      path: resolvedPath,
      deleted: true
    }
  }

  /**
   * Check if a file exists
   * @param {string} filePath - Path to the file
   */
  async exists(filePath) {
    const resolvedPath = this.resolvePath(filePath)
    try {
      await fs.access(resolvedPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get file info
   * @param {string} filePath - Path to the file
   */
  async getFileInfo(filePath) {
    const resolvedPath = this.resolvePath(filePath)
    const stats = await fs.stat(resolvedPath)

    return {
      path: resolvedPath,
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime
    }
  }
}

export default FileSystemAdapter
