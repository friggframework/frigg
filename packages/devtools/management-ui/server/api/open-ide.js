import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default async function(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { path } = req.body

  if (!path) {
    return res.status(400).json({ error: 'Path is required' })
  }

  try {
    // Try to open in VS Code first
    await execAsync(`code "${path}"`)
    res.json({ success: true, method: 'vscode' })
  } catch {
    try {
      // Fallback to open command (macOS/Linux)
      const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
      await execAsync(`${command} "${path}"`)
      res.json({ success: true, method: 'system' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to open in IDE', details: error.message })
    }
  }
}