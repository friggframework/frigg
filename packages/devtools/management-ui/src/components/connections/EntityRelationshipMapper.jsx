import React, { useState, useEffect, useRef } from 'react'
import { Button } from '../Button'
import LoadingSpinner from '../LoadingSpinner'
import api from '../../services/api'

const EntityRelationshipMapper = ({ connectionId }) => {
  const [entities, setEntities] = useState([])
  const [relationships, setRelationships] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [viewMode, setViewMode] = useState('graph') // graph or list
  const canvasRef = useRef(null)

  useEffect(() => {
    fetchEntityData()
  }, [connectionId])

  useEffect(() => {
    if (viewMode === 'graph' && entities.length > 0) {
      drawEntityGraph()
    }
  }, [entities, relationships, viewMode, selectedEntity])

  const fetchEntityData = async () => {
    setLoading(true)
    try {
      const [entitiesRes, relationshipsRes] = await Promise.all([
        api.get(`/api/connections/${connectionId}/entities`),
        api.get(`/api/connections/${connectionId}/relationships`)
      ])

      setEntities(entitiesRes.data.entities || [])
      setRelationships(relationshipsRes.data.relationships || [])
    } catch (error) {
      console.error('Failed to fetch entity data:', error)
    } finally {
      setLoading(false)
    }
  }

  const drawEntityGraph = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width = canvas.offsetWidth
    const height = canvas.height = canvas.offsetHeight

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Calculate positions for entities (simple circular layout)
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) * 0.35

    const entityPositions = {}
    entities.forEach((entity, index) => {
      const angle = (index / entities.length) * 2 * Math.PI
      entityPositions[entity.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        entity
      }
    })

    // Draw relationships (lines)
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    relationships.forEach(rel => {
      const from = entityPositions[rel.fromId]
      const to = entityPositions[rel.toId]
      if (from && to) {
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()

        // Draw relationship label
        const midX = (from.x + to.x) / 2
        const midY = (from.y + to.y) / 2
        ctx.fillStyle = '#6b7280'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(rel.type, midX, midY)
      }
    })

    // Draw entities (circles)
    Object.values(entityPositions).forEach(({ x, y, entity }) => {
      const isSelected = selectedEntity?.id === entity.id
      
      // Draw circle
      ctx.beginPath()
      ctx.arc(x, y, 30, 0, 2 * Math.PI)
      ctx.fillStyle = isSelected ? '#2563eb' : '#ffffff'
      ctx.fill()
      ctx.strokeStyle = isSelected ? '#2563eb' : '#d1d5db'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw entity name
      ctx.fillStyle = isSelected ? '#ffffff' : '#111827'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(entity.name || entity.type, x, y)

      // Draw entity type
      ctx.fillStyle = isSelected ? '#dbeafe' : '#6b7280'
      ctx.font = '10px sans-serif'
      ctx.fillText(entity.type, x, y + 40)
    })
  }

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Check if click is on an entity
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const radius = Math.min(canvas.width, canvas.height) * 0.35

    entities.forEach((entity, index) => {
      const angle = (index / entities.length) * 2 * Math.PI
      const entityX = centerX + radius * Math.cos(angle)
      const entityY = centerY + radius * Math.sin(angle)

      const distance = Math.sqrt(Math.pow(x - entityX, 2) + Math.pow(y - entityY, 2))
      if (distance <= 30) {
        setSelectedEntity(entity)
      }
    })
  }

  const syncEntities = async () => {
    setLoading(true)
    try {
      await api.post(`/api/connections/${connectionId}/sync`)
      await fetchEntityData()
    } catch (error) {
      console.error('Failed to sync entities:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Entity Relationships</h3>
        <div className="flex space-x-2">
          <div className="flex rounded-md shadow-sm">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-3 py-1 text-sm font-medium rounded-l-md ${
                viewMode === 'graph'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-sm font-medium rounded-r-md ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              List
            </button>
          </div>
          <Button onClick={syncEntities} size="sm" variant="secondary">
            Sync Entities
          </Button>
        </div>
      </div>

      {entities.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">No entities found for this connection.</p>
          <Button onClick={syncEntities} variant="primary">
            Sync Entities Now
          </Button>
        </div>
      ) : (
        <>
          {viewMode === 'graph' ? (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={600}
                height={400}
                className="w-full h-96 border border-gray-200 rounded-lg cursor-pointer"
                onClick={handleCanvasClick}
              />
              
              {selectedEntity && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">
                    {selectedEntity.name || selectedEntity.id}
                  </h4>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-gray-500">Type:</dt>
                    <dd className="text-gray-900">{selectedEntity.type}</dd>
                    <dt className="text-gray-500">External ID:</dt>
                    <dd className="text-gray-900 font-mono text-xs">
                      {selectedEntity.externalId}
                    </dd>
                    <dt className="text-gray-500">Created:</dt>
                    <dd className="text-gray-900">
                      {new Date(selectedEntity.createdAt).toLocaleDateString()}
                    </dd>
                  </dl>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {entities.map((entity) => (
                <div
                  key={entity.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedEntity(entity)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {entity.name || entity.id}
                      </h4>
                      <p className="text-sm text-gray-500">
                        Type: {entity.type} | External ID: {entity.externalId}
                      </p>
                    </div>
                    <div className="text-sm text-gray-500">
                      {relationships.filter(r => 
                        r.fromId === entity.id || r.toId === entity.id
                      ).length} relationships
                    </div>
                  </div>
                  
                  {selectedEntity?.id === entity.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h5 className="text-sm font-medium text-gray-900 mb-2">
                        Relationships:
                      </h5>
                      <div className="space-y-1">
                        {relationships
                          .filter(r => r.fromId === entity.id || r.toId === entity.id)
                          .map((rel, index) => (
                            <p key={index} className="text-sm text-gray-600">
                              {rel.fromId === entity.id ? 'Has' : 'Is'} {rel.type} 
                              {' '}
                              {rel.fromId === entity.id 
                                ? entities.find(e => e.id === rel.toId)?.name || rel.toId
                                : entities.find(e => e.id === rel.fromId)?.name || rel.fromId
                              }
                            </p>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Total: {entities.length} entities, {relationships.length} relationships
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default EntityRelationshipMapper