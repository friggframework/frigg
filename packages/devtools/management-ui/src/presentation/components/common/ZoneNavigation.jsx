import React from 'react'
import { Button } from '../ui/button'
import { cn } from '../../../lib/utils'
import { Code, TestTube, Settings, Play } from 'lucide-react'

const ZoneNavigation = ({ activeZone, onZoneChange, className }) => {
  const zones = [
    {
      id: 'definitions',
      name: 'Definitions Zone',
      description: 'Build & Configure',
      icon: Code,
      color: 'bg-blue-500/10 text-blue-600 border-blue-200',
      activeColor: 'bg-blue-500 text-white border-blue-500'
    },
    {
      id: 'testing',
      name: 'Test Area',
      description: 'Live Run & Test',
      icon: TestTube,
      color: 'bg-green-500/10 text-green-600 border-green-200',
      activeColor: 'bg-green-500 text-white border-green-500'
    }
  ]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex bg-muted/50 p-1 rounded-lg border">
        {zones.map((zone) => {
          const Icon = zone.icon
          const isActive = activeZone === zone.id

          return (
            <Button
              key={zone.id}
              variant="ghost"
              onClick={() => onZoneChange(zone.id)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200',
                'hover:bg-background/80',
                isActive && 'bg-background shadow-sm border'
              )}
            >
              <Icon className={cn(
                'w-4 h-4 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )} />
              <div className="flex flex-col items-start">
                <span className={cn(
                  'text-sm font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {zone.name}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  {zone.description}
                </span>
              </div>
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