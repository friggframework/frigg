import express from 'express';
import path from 'path';
import EnvFileManager from '../../utils/environment/envFileManager.js';
import AWSParameterStore from '../../utils/environment/awsParameterStore.js';

const router = express.Router();

// Initialize managers
const projectRoot = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '../../../');
const envManager = new EnvFileManager(projectRoot);
const awsManager = new AWSParameterStore({
  prefix: process.env.AWS_PARAMETER_PREFIX || '/frigg',
  region: process.env.AWS_REGION || 'us-east-1'
});

// Middleware to validate environment parameter
const validateEnvironment = (req, res, next) => {
  const validEnvironments = ['local', 'staging', 'production'];
  const { environment } = req.params;
  
  if (!validEnvironments.includes(environment)) {
    return res.status(400).json({
      error: 'Invalid environment',
      validEnvironments
    });
  }
  
  next();
};

// GET /api/environment/variables/:environment
router.get('/variables/:environment', validateEnvironment, async (req, res) => {
  try {
    const { environment } = req.params;
    const { includeAws } = req.query;
    
    // Get variables from .env file
    const fileVariables = await envManager.readEnvFile(environment);
    
    let variables = fileVariables;
    
    // Merge with AWS if requested and environment is production
    if (includeAws === 'true' && environment === 'production') {
      try {
        const awsVariables = await awsManager.getParameters(environment);
        variables = envManager.mergeVariables(fileVariables, awsVariables, true);
      } catch (awsError) {
        console.error('AWS fetch error:', awsError);
        // Continue with file variables only
      }
    }
    
    res.json({
      environment,
      variables,
      source: includeAws === 'true' ? 'merged' : 'file'
    });
  } catch (error) {
    console.error('Error fetching variables:', error);
    res.status(500).json({
      error: 'Failed to fetch environment variables',
      message: error.message
    });
  }
});

// PUT /api/environment/variables/:environment
router.put('/variables/:environment', validateEnvironment, async (req, res) => {
  try {
    const { environment } = req.params;
    const { variables } = req.body;
    
    if (!Array.isArray(variables)) {
      return res.status(400).json({
        error: 'Variables must be an array'
      });
    }
    
    // Validate variables
    const errors = envManager.validateVariables(variables);
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation errors',
        errors
      });
    }
    
    // Write to file
    const result = await envManager.writeEnvFile(environment, variables);
    
    res.json({
      success: true,
      environment,
      count: variables.length,
      ...result
    });
  } catch (error) {
    console.error('Error saving variables:', error);
    res.status(500).json({
      error: 'Failed to save environment variables',
      message: error.message
    });
  }
});

// POST /api/environment/sync/aws-parameter-store
router.post('/sync/aws-parameter-store', async (req, res) => {
  try {
    const { environment } = req.body;
    
    if (environment !== 'production') {
      return res.status(400).json({
        error: 'AWS sync is only available for production environment'
      });
    }
    
    // Validate AWS access
    const accessCheck = await awsManager.validateAccess();
    if (!accessCheck.valid) {
      return res.status(403).json({
        error: 'AWS access denied',
        message: accessCheck.error,
        code: accessCheck.code
      });
    }
    
    // Get variables from file
    const fileVariables = await envManager.readEnvFile(environment);
    
    // Sync to AWS
    const syncResult = await awsManager.syncEnvironment(environment, fileVariables);
    
    res.json({
      success: true,
      environment,
      count: fileVariables.length,
      ...syncResult
    });
  } catch (error) {
    console.error('Error syncing to AWS:', error);
    res.status(500).json({
      error: 'Failed to sync with AWS Parameter Store',
      message: error.message
    });
  }
});

// GET /api/environment/export/:environment
router.get('/export/:environment', validateEnvironment, async (req, res) => {
  try {
    const { environment } = req.params;
    const { format, excludeSecrets } = req.query;
    
    const variables = await envManager.readEnvFile(environment);
    
    let exportData;
    let contentType;
    let filename;
    
    if (format === 'json') {
      // Export as JSON
      const data = {};
      variables.forEach(v => {
        if (!excludeSecrets || !v.isSecret) {
          data[v.key] = v.value;
        }
      });
      
      exportData = JSON.stringify(data, null, 2);
      contentType = 'application/json';
      filename = `${environment}-env.json`;
    } else {
      // Export as .env format
      let content = `# Environment: ${environment}\n`;
      content += `# Exported: ${new Date().toISOString()}\n\n`;
      
      const sorted = variables.sort((a, b) => a.key.localeCompare(b.key));
      
      for (const v of sorted) {
        if (v.description) {
          content += `# ${v.description}\n`;
        }
        
        const value = (excludeSecrets === 'true' && v.isSecret) ? '**REDACTED**' : v.value;
        content += `${v.key}=${envManager.escapeValue(value)}\n\n`;
      }
      
      exportData = content.trim();
      contentType = 'text/plain';
      filename = environment === 'local' ? '.env' : `.env.${environment}`;
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    console.error('Error exporting variables:', error);
    res.status(500).json({
      error: 'Failed to export environment variables',
      message: error.message
    });
  }
});

// POST /api/environment/import/:environment
router.post('/import/:environment', validateEnvironment, async (req, res) => {
  try {
    const { environment } = req.params;
    const { data, format, merge } = req.body;
    
    if (!data) {
      return res.status(400).json({
        error: 'No data provided for import'
      });
    }
    
    let importedVariables = [];
    
    if (format === 'json') {
      // Import from JSON
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      importedVariables = Object.entries(parsed).map(([key, value]) => ({
        id: `${environment}-${key}-${Date.now()}`,
        key,
        value: String(value),
        description: '',
        isSecret: envManager.isSecretVariable(key),
        environment
      }));
    } else {
      // Import from .env format
      const lines = data.split('\n');
      let currentDescription = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('#')) {
          currentDescription = trimmed.substring(1).trim();
        } else if (trimmed && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          
          importedVariables.push({
            id: `${environment}-${key}-${Date.now()}`,
            key: key.trim(),
            value,
            description: currentDescription,
            isSecret: envManager.isSecretVariable(key),
            environment
          });
          
          currentDescription = '';
        }
      }
    }
    
    // Validate imported variables
    const errors = envManager.validateVariables(importedVariables);
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation errors in imported data',
        errors
      });
    }
    
    let finalVariables = importedVariables;
    
    // Merge with existing if requested
    if (merge === 'true') {
      const existing = await envManager.readEnvFile(environment);
      const merged = [...existing];
      
      importedVariables.forEach(importVar => {
        const existingIndex = merged.findIndex(v => v.key === importVar.key);
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...merged[existingIndex], value: importVar.value };
        } else {
          merged.push(importVar);
        }
      });
      
      finalVariables = merged;
    }
    
    // Save variables
    await envManager.writeEnvFile(environment, finalVariables);
    
    res.json({
      success: true,
      environment,
      imported: importedVariables.length,
      total: finalVariables.length
    });
  } catch (error) {
    console.error('Error importing variables:', error);
    res.status(500).json({
      error: 'Failed to import environment variables',
      message: error.message
    });
  }
});

// POST /api/environment/copy
router.post('/copy', async (req, res) => {
  try {
    const { source, target, excludeSecrets } = req.body;
    
    if (!source || !target) {
      return res.status(400).json({
        error: 'Source and target environments are required'
      });
    }
    
    const copiedVariables = await envManager.copyEnvironment(
      source,
      target,
      excludeSecrets === 'true'
    );
    
    res.json({
      success: true,
      source,
      target,
      count: copiedVariables.length,
      excludedSecrets: excludeSecrets === 'true'
    });
  } catch (error) {
    console.error('Error copying environment:', error);
    res.status(500).json({
      error: 'Failed to copy environment',
      message: error.message
    });
  }
});

// GET /api/environment/aws/validate
router.get('/aws/validate', async (req, res) => {
  try {
    const validation = await awsManager.validateAccess();
    res.json(validation);
  } catch (error) {
    console.error('Error validating AWS access:', error);
    res.status(500).json({
      error: 'Failed to validate AWS access',
      message: error.message
    });
  }
});

// GET /api/environment/history/:environment/:key
router.get('/history/:environment/:key', validateEnvironment, async (req, res) => {
  try {
    const { environment, key } = req.params;
    
    if (environment !== 'production') {
      return res.status(400).json({
        error: 'History is only available for production environment (AWS)'
      });
    }
    
    const history = await awsManager.getParameterHistory(environment, key);
    
    res.json({
      environment,
      key,
      history
    });
  } catch (error) {
    console.error('Error fetching parameter history:', error);
    res.status(500).json({
      error: 'Failed to fetch parameter history',
      message: error.message
    });
  }
});

export default router;