import { useState, useCallback, useRef, useEffect } from 'react'

const DEFAULT_MIN_HEIGHT = 100
const DEFAULT_MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 256
const KEYBOARD_STEP = 20

export function useResizable({
  initialHeight = DEFAULT_HEIGHT,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  storageKey = null,
  direction = 'vertical'
} = {}) {
  const [height, setHeight] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) return Math.max(minHeight, Math.min(maxHeight, parseInt(saved, 10)))
      } catch { /* localStorage may not be available */ }
    }
    return initialHeight
  })

  const isDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(height)
  const currentHeight = useRef(height)

  // Keep currentHeight ref in sync with state for cleanup
  useEffect(() => {
    currentHeight.current = height
  }, [height])

  const saveToStorage = useCallback((h) => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, h.toString())
      } catch { /* localStorage may not be available */ }
    }
  }, [storageKey])

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true
    startY.current = e.clientY
    startHeight.current = currentHeight.current
    document.body.style.cursor = direction === 'vertical' ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [direction])

  // Keyboard support for accessibility
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = e.key === 'ArrowUp' ? KEYBOARD_STEP : -KEYBOARD_STEP
      setHeight(h => {
        const newHeight = Math.max(minHeight, Math.min(maxHeight, h + step))
        saveToStorage(newHeight)
        return newHeight
      })
    }
  }, [minHeight, maxHeight, saveToStorage])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return

      const delta = direction === 'vertical'
        ? startY.current - e.clientY
        : e.clientX - startY.current

      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight.current + delta))
      setHeight(newHeight)
    }

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        saveToStorage(currentHeight.current)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // Cleanup: Reset cursor if component unmounts during drag
      if (isDragging.current) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        isDragging.current = false
      }
    }
  }, [minHeight, maxHeight, direction, saveToStorage])

  return {
    height,
    setHeight,
    handleMouseDown,
    handleKeyDown,
    isDragging: isDragging.current
  }
}

export default useResizable
