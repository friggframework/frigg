import React from 'react'
import { Button } from '../ui/button'
import { cn } from '../../../lib/utils'
import { Code, TestTube, Settings, Play, Bot } from 'lucide-react'

const ZoneNavigation = ({ activeZone, onZoneChange, className, compact = false }) => {
  const zones = [
    {
      id: 'definitions',
      name: 'Definitions',
      fullName: 'Definitions Zone',
      description: 'Build & Configure',
      icon: Code,
      color: 'bg-blue-500/10 text-blue-600 border-blue-200',
      activeColor: 'bg-blue-500 text-white border-blue-500'
    },
    {
      id: 'build',
      name: 'Build',
      fullName: 'Build Zone',
      description: 'AI-Assisted Dev',
      icon: Bot,
      color: 'bg-purple-500/10 text-purple-600 border-purple-200',
      activeColor: 'bg-purple-500 text-white border-purple-500'
    },
    {
      id: 'testing',
      name: 'Test',
      fullName: 'Test Area',
      description: 'Live Run & Test',
      icon: TestTube,
      color: 'bg-green-500/10 text-green-600 border-green-200',
      activeColor: 'bg-green-500 text-white border-green-500'
    }
  ]

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex bg-muted/50 p-1 rounded-lg border">
        {zones.map((zone) => {
          const Icon = zone.icon
          const isActive = activeZone === zone.id

          return (
            <Button
              key={zone.id}
              variant="ghost"
              onClick={() => onZoneChange(zone.id)}
              title={`${zone.fullName} - ${zone.description}`}
              style={{ '--tooltip-delay': '100ms' }}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-200 h-auto',
                'hover:bg-background/80',
                isActive && 'bg-background shadow-sm border'
              )}
            >
              <Icon className={cn(
                'w-4 h-4 transition-colors flex-shrink-0',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )} />
              <span className={cn(
                'text-sm font-medium transition-colors whitespace-nowrap',
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {zone.name}
              </span>
              {isActive && (
                <div className="absolute inset-0 bg-primary/5 rounded-md pointer-events-none" />
              )}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export default ZoneNavigation