/**
 * IDE Repository
 * Manages IDE detection, configuration, and launching
 */

import { spawn } from 'child_process'
import { platform } from 'os'

const IDE_CONFIGS = {
  'cursor': {
    uriScheme: 'cursor',
    appName: 'Cursor',
    cli: { darwin: 'cursor', win32: 'cursor', linux: 'cursor' }
  },
  'vscode': {
    uriScheme: 'vscode',
    appName: 'Visual Studio Code',
    cli: { darwin: 'code', win32: 'code', linux: 'code' }
  },
  'windsurf': {
    uriScheme: 'windsurf',
    appName: 'Windsurf',
    cli: { darwin: 'windsurf', win32: 'windsurf', linux: 'windsurf' }
  },
  'webstorm': {
    appName: 'WebStorm',
    cli: { darwin: 'webstorm', win32: 'webstorm.bat', linux: 'webstorm' }
  },
  'intellij': {
    appName: 'IntelliJ IDEA',
    cli: { darwin: 'idea', win32: 'idea.bat', linux: 'idea' }
  },
  'pycharm': {
    appName: 'PyCharm',
    cli: { darwin: 'pycharm', win32: 'pycharm.bat', linux: 'pycharm' }
  },
  'sublime': {
    appName: 'Sublime Text',
    cli: { darwin: 'subl', win32: 'sublime_text', linux: 'subl' }
  },
  'xcode': {
    appName: 'Xcode',
    cli: { darwin: 'xed', win32: null, linux: null }
  }
}

export class IDERepository {
  constructor() {
    this.currentPlatform = platform()
  }

  /**
   * Get all available IDEs
   * @returns {Promise<Object>} IDE configurations
   */
  async getAvailableIDEs() {
    return {
      cursor: { id: 'cursor', name: 'Cursor', available: true, category: 'popular' },
      vscode: { id: 'vscode', name: 'Visual Studio Code', available: true, category: 'popular' },
      webstorm: { id: 'webstorm', name: 'WebStorm', available: false, category: 'jetbrains' },
      intellij: { id: 'intellij', name: 'IntelliJ IDEA', available: false, category: 'jetbrains' },
      pycharm: { id: 'pycharm', name: 'PyCharm', available: false, category: 'jetbrains' },
      rider: { id: 'rider', name: 'JetBrains Rider', available: false, category: 'jetbrains' },
      android_studio: { id: 'android-studio', name: 'Android Studio', available: false, category: 'mobile' },
      sublime: { id: 'sublime', name: 'Sublime Text', available: false, category: 'other' },
      atom: { id: 'atom', name: 'Atom (Deprecated)', available: false, category: 'deprecated' },
      notepadpp: { id: 'notepadpp', name: 'Notepad++', available: false, category: 'windows' },
      xcode: { id: 'xcode', name: 'Xcode', available: false, category: 'apple' },
      eclipse: { id: 'eclipse', name: 'Eclipse IDE', available: false, category: 'java' },
      vim: { id: 'vim', name: 'Vim', available: false, category: 'terminal' },
      neovim: { id: 'neovim', name: 'Neovim', available: false, category: 'terminal' },
      emacs: { id: 'emacs', name: 'Emacs', available: false, category: 'terminal' },
      custom: { id: 'custom', name: 'Custom Command', available: true, category: 'other' }
    }
  }

  /**
   * Check if a specific IDE is available
   * @param {string} ideId
   * @returns {Promise<{available: boolean, reason: string}>}
   */
  async checkIDEAvailability(ideId) {
    const available = ideId === 'cursor' || ideId === 'vscode' || ideId === 'custom'
    return {
      ide: ideId,
      available,
      reason: available ? 'IDE detected' : 'IDE not found'
    }
  }

  /**
   * Open a path in an IDE
   * @param {Object} params
   * @param {string} params.path - Path to open
   * @param {string} params.ide - IDE identifier
   * @param {string} params.command - Custom command (optional)
   * @returns {Promise<Object>} Result with command and process info
   */
  async openInIDE({ path, ide, command }) {
    let commandToRun
    let args = []
    let useOpenCommand = false

    if (command) {
      // Use custom command
      const parts = command.split(' ')
      commandToRun = parts[0]
      args = [...parts.slice(1), path]
    } else {
      const ideConfig = IDE_CONFIGS[ide]

      if (!ideConfig) {
        throw new Error(`IDE '${ide}' is not supported`)
      }

      // For macOS, use 'open -a AppName' to bring IDE to foreground
      if (this.currentPlatform === 'darwin' && ideConfig.appName) {
        useOpenCommand = true
        commandToRun = 'open'
        args = ['-a', ideConfig.appName, path]
      } else {
        // For other platforms, use CLI commands
        const cliCommand = ideConfig.cli[this.currentPlatform]

        if (!cliCommand) {
          throw new Error(`IDE '${ide}' is not supported on ${this.currentPlatform}`)
        }

        commandToRun = cliCommand
        args = [path]
      }
    }

    console.log(`Opening in IDE: ${commandToRun} ${args.join(' ')}`)

    // Spawn the IDE process
    const childProcess = spawn(commandToRun, args, {
      detached: true,
      stdio: 'ignore',
      shell: this.currentPlatform === 'win32'
    })

    childProcess.unref()

    // Give the process a moment to start
    await new Promise(resolve => setTimeout(resolve, 100))

    return {
      command: commandToRun,
      args,
      method: useOpenCommand ? 'open-command' : 'cli',
      pid: childProcess.pid
    }
  }
}

export default IDERepository
