import React, { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '../ui/button'
import SettingsModal from './SettingsModal'

const SettingsButton = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsSettingsOpen(true)}
        className="hover:bg-accent hover:border-accent transition-all duration-200"
        title="Settings"
      >
        <Settings className="h-[1.2rem] w-[1.2rem] transition-transform hover:rotate-45 duration-300" />
        <span className="sr-only">Open settings</span>
      </Button>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  )
}

export default SettingsButton