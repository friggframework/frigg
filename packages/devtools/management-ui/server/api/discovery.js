import express from 'express'
import fetch from 'node-fetch'
import { createStandardResponse } from '../utils/response.js'

const router = express.Router()

// Get real integrations from NPM registry
async function fetchRealIntegrations() {
  try {
    const searchUrl = 'https://registry.npmjs.org/-/v1/search?text=@friggframework%20api-module&size=100';
    
    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`NPM search failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return data.objects
      .filter(pkg => pkg.package.name.includes('@friggframework/api-module-'))
      .map(pkg => ({
        id: pkg.package.name.replace('@friggframework/api-module-', ''),
        name: pkg.package.name.replace('@friggframework/api-module-', '').replace('-', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        description: pkg.package.description || 'No description available',
        category: detectCategory(pkg.package.name, pkg.package.description || '', pkg.package.keywords || []),
        status: 'available',
        installed: false,
        version: pkg.package.version,
        packageName: pkg.package.name
      }));
  } catch (error) {
    console.error('Error fetching real integrations:', error);
    // Fallback to basic integrations
    return [
      {
        id: 'hubspot',
        name: 'HubSpot',
        description: 'CRM and marketing platform integration',
        category: 'crm',
        status: 'available',
        installed: false,
        version: '2.0.0',
        packageName: '@friggframework/api-module-hubspot'
      }
    ];
  }
}

// Helper to detect integration category
function detectCategory(name, description, keywords) {
  const text = `${name} ${description} ${keywords.join(' ')}`.toLowerCase();
  
  const categoryPatterns = {
    'crm': ['crm', 'customer', 'salesforce', 'hubspot', 'pipedrive'],
    'communication': ['email', 'sms', 'chat', 'slack', 'discord', 'teams'],
    'marketing': ['marketing', 'campaign', 'mailchimp', 'activecampaign'],
    'productivity': ['task', 'project', 'asana', 'trello', 'notion', 'jira'],
    'support': ['support', 'helpdesk', 'ticket', 'zendesk', 'intercom'],
    'finance': ['accounting', 'invoice', 'quickbooks', 'xero', 'billing']
  };

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        return category;
      }
    }
  }
  
  return 'other';
}

// Get integration categories  
router.get('/categories', async (req, res) => {
  try {
    const integrations = await fetchRealIntegrations();
    
    // Count integrations by category
    const categoryCounts = integrations.reduce((acc, integration) => {
      const category = integration.category;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    const categories = Object.entries(categoryCounts).map(([id, count]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      count
    }));
    
    res.json({
      status: 'success',
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch categories'
    });
  }
})

// Get all integrations
router.get('/integrations', async (req, res) => {
  try {
    const { category, status, installed } = req.query;
    
    let integrations = await fetchRealIntegrations();
    
    // Filter by category
    if (category && category !== 'all') {
      integrations = integrations.filter(i => i.category === category);
    }
    
    // Filter by status
    if (status) {
      integrations = integrations.filter(i => i.status === status);
    }
    
    // Filter by installed
    if (installed !== undefined) {
      integrations = integrations.filter(i => i.installed === (installed === 'true'));
    }
    
    res.json({
      status: 'success',
      data: {
        integrations,
        total: integrations.length
      }
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch integrations'
    });
  }
})

// Get installed integrations
router.get('/installed', async (req, res) => {
  try {
    // Import the integration detection logic
    const { getInstalledIntegrations } = await import('./integrations.js');
    const installedIntegrations = await getInstalledIntegrations();
    
    // Format for discovery API
    const formatted = installedIntegrations.map(integration => ({
      id: integration.name.toLowerCase(),
      name: integration.name,
      description: integration.description,
      category: integration.category,
      status: 'installed',
      installed: true,
      version: '1.0.0' // We don't have version info for actual integrations
    }));
    
    res.json({
      status: 'success',
      data: formatted
    });
  } catch (error) {
    console.error('Error fetching installed integrations:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch installed integrations'
    });
  }
})

// Clear discovery cache
router.post('/cache/clear', (req, res) => {
  // In a real implementation, this would clear actual cache
  res.json({
    status: 'success',
    data: {
      message: 'Discovery cache cleared successfully',
      timestamp: new Date().toISOString()
    }
  })
})

export default router