import React from 'react'
import { FolderOpen } from 'lucide-react'

export default function Welcome() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
            <FolderOpen className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome to Frigg Management UI
          </h1>
          <p className="text-xl text-muted-foreground">
            A modern development environment for managing integrations
          </p>
        </div>

        <div className="bg-card border rounded-lg p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Get Started</h2>
          <p className="text-muted-foreground">
            To begin, please select a Frigg project directory from your file system.
            This will initialize the management interface and allow you to:
          </p>
          <ul className="text-left space-y-2 max-w-md mx-auto">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Discover and install API modules</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Manage integrations and connections</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Test and debug your integrations</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Configure environment variables</span>
            </li>
          </ul>
        </div>

        <div className="text-sm text-muted-foreground">
          <p>Need help? Check out the <a href="https://docs.friggframework.org" className="text-primary hover:underline">documentation</a></p>
        </div>
      </div>
    </div>
  )
}
