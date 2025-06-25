import React from 'react';
import { 
  Users, MessageCircle, ShoppingCart, Megaphone, CheckSquare,
  BarChart, HelpCircle, DollarSign, Code, Share2, Grid,
  Package
} from 'lucide-react';

const CategoryFilter = ({
  categories,
  selectedCategory,
  onCategoryChange,
  integrationCounts,
  installedCount
}) => {
  // Icon mapping for categories
  const categoryIcons = {
    'crm': Users,
    'communication': MessageCircle,
    'ecommerce': ShoppingCart,
    'marketing': Megaphone,
    'productivity': CheckSquare,
    'analytics': BarChart,
    'support': HelpCircle,
    'finance': DollarSign,
    'developer-tools': Code,
    'social-media': Share2,
    'other': Grid
  };

  // Get count for a category
  const getCategoryCount = (categoryId) => {
    if (categoryId === 'all') {
      return Object.values(integrationCounts).reduce((sum, arr) => sum + arr.length, 0);
    }
    if (categoryId === 'installed') {
      return installedCount;
    }
    
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      return integrationCounts[category.name]?.length || 0;
    }
    return 0;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* All category */}
      <button
        onClick={() => onCategoryChange('all')}
        className={`
          px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors
          ${selectedCategory === 'all'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }
        `}
      >
        <Grid className="h-4 w-4" />
        <span>All</span>
        <span className="ml-1 text-xs opacity-75">
          ({getCategoryCount('all')})
        </span>
      </button>

      {/* Installed category */}
      <button
        onClick={() => onCategoryChange('installed')}
        className={`
          px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors
          ${selectedCategory === 'installed'
            ? 'bg-green-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }
        `}
      >
        <Package className="h-4 w-4" />
        <span>Installed</span>
        <span className="ml-1 text-xs opacity-75">
          ({installedCount})
        </span>
      </button>

      <div className="w-px bg-gray-300 mx-1" />

      {/* Dynamic categories */}
      {categories.map(category => {
        const Icon = categoryIcons[category.id] || Grid;
        const count = getCategoryCount(category.id);

        return (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.name)}
            className={`
              px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors
              ${selectedCategory === category.name
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            <Icon className="h-4 w-4" />
            <span>{category.name}</span>
            {count > 0 && (
              <span className="ml-1 text-xs opacity-75">
                ({count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryFilter;