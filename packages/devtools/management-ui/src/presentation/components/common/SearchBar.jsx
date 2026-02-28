import React, { useState } from 'react'
import { Search, Filter, X } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../../lib/utils'

const SearchBar = ({
  placeholder = "Search integrations...",
  onSearch,
  onFilter,
  filters = [],
  activeFilters = [],
  className
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)
    onSearch?.(value)
  }

  const handleFilterToggle = (filter) => {
    const isActive = activeFilters.includes(filter.id)
    const newFilters = isActive
      ? activeFilters.filter(f => f !== filter.id)
      : [...activeFilters, filter.id]
    onFilter?.(newFilters)
  }

  const clearSearch = () => {
    setSearchTerm('')
    onSearch?.('')
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={handleSearchChange}
          className={cn(
            'w-full pl-10 pr-10 py-2 border border-input rounded-md',
            'bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
            'transition-colors duration-200'
          )}
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Filter Controls */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter className="w-3 h-3" />
            Filters
            {activeFilters.length > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {activeFilters.length}
              </span>
            )}
          </Button>

          {/* Active Filter Tags */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {activeFilters.map(filterId => {
                const filter = filters.find(f => f.id === filterId)
                return filter ? (
                  <span
                    key={filterId}
                    className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-md"
                  >
                    {filter.label}
                    <button
                      onClick={() => handleFilterToggle(filter)}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ) : null
              })}
            </div>
          )}
        </div>
      )}

      {/* Filter Dropdown */}
      {showFilters && filters.length > 0 && (
        <div className="border border-border rounded-md bg-card p-3 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {filters.map(filter => (
              <label
                key={filter.id}
                className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={activeFilters.includes(filter.id)}
                  onChange={() => handleFilterToggle(filter)}
                  className="w-4 h-4 text-primary border-border rounded focus:ring-ring"
                />
                <span className="text-sm">{filter.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchBar