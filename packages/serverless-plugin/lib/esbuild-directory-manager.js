/**
 * Infrastructure Service - ESBuild Directory Management
 *
 * Ensures .esbuild/.serverless directory exists to prevent ENOENT errors.
 */
class EsbuildDirectoryManager {
  constructor(fs, path) {
    this.fs = fs;
    this.path = path;
  }

  /**
   * @param {string} basePath - Base service path
   * @returns {string} Created directory path
   */
  ensureDirectory(basePath) {
    const esbuildDir = this.path.join(basePath, '.esbuild', '.serverless');

    if (!this.fs.existsSync(esbuildDir)) {
      this.fs.mkdirSync(esbuildDir, { recursive: true });
    }

    return esbuildDir;
  }
}

module.exports = { EsbuildDirectoryManager };
