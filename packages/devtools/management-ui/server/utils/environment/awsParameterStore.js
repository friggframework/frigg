import AWS from 'aws-sdk';

class AWSParameterStore {
  constructor(config = {}) {
    this.ssm = new AWS.SSM({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      ...config.awsConfig
    });
    this.prefix = config.prefix || '/frigg';
    this.kmsKeyId = config.kmsKeyId || process.env.AWS_KMS_KEY_ID;
  }

  /**
   * Get all parameters for a specific environment
   */
  async getParameters(environment) {
    const path = `${this.prefix}/${environment}`;
    const parameters = [];
    let nextToken;

    try {
      do {
        const params = {
          Path: path,
          Recursive: true,
          WithDecryption: true,
          MaxResults: 10,
          NextToken: nextToken
        };

        const response = await this.ssm.getParametersByPath(params).promise();
        
        for (const param of response.Parameters) {
          const key = this.extractKeyFromPath(param.Name, environment);
          parameters.push({
            id: `aws-${environment}-${key}`,
            key,
            value: param.Value,
            description: this.getTagValue(param, 'Description'),
            isSecret: param.Type === 'SecureString',
            environment,
            lastModified: param.LastModifiedDate,
            version: param.Version,
            awsName: param.Name
          });
        }

        nextToken = response.NextToken;
      } while (nextToken);

      return parameters;
    } catch (error) {
      console.error('Error fetching parameters from AWS:', error);
      throw new Error(`Failed to fetch parameters: ${error.message}`);
    }
  }

  /**
   * Set a parameter in AWS Parameter Store
   */
  async setParameter(environment, variable) {
    const parameterName = `${this.prefix}/${environment}/${variable.key}`;
    
    try {
      const params = {
        Name: parameterName,
        Value: variable.value,
        Type: variable.isSecret ? 'SecureString' : 'String',
        Overwrite: true,
        Description: variable.description || `${variable.key} for ${environment} environment`,
        Tags: [
          {
            Key: 'Environment',
            Value: environment
          },
          {
            Key: 'ManagedBy',
            Value: 'frigg'
          },
          {
            Key: 'Description',
            Value: variable.description || ''
          }
        ]
      };

      // Add KMS key for secure strings
      if (variable.isSecret && this.kmsKeyId) {
        params.KeyId = this.kmsKeyId;
      }

      const response = await this.ssm.putParameter(params).promise();
      
      return {
        success: true,
        version: response.Version,
        awsName: parameterName
      };
    } catch (error) {
      console.error('Error setting parameter in AWS:', error);
      throw new Error(`Failed to set parameter: ${error.message}`);
    }
  }

  /**
   * Delete a parameter from AWS Parameter Store
   */
  async deleteParameter(environment, key) {
    const parameterName = `${this.prefix}/${environment}/${key}`;
    
    try {
      await this.ssm.deleteParameter({ Name: parameterName }).promise();
      return { success: true };
    } catch (error) {
      if (error.code === 'ParameterNotFound') {
        return { success: true, notFound: true };
      }
      console.error('Error deleting parameter from AWS:', error);
      throw new Error(`Failed to delete parameter: ${error.message}`);
    }
  }

  /**
   * Sync all variables for an environment to AWS
   */
  async syncEnvironment(environment, variables) {
    const results = {
      created: [],
      updated: [],
      deleted: [],
      errors: []
    };

    try {
      // Get existing parameters
      const existingParams = await this.getParameters(environment);
      const existingKeys = new Set(existingParams.map(p => p.key));
      const newKeys = new Set(variables.map(v => v.key));

      // Update or create parameters
      for (const variable of variables) {
        try {
          const existing = existingParams.find(p => p.key === variable.key);
          const result = await this.setParameter(environment, variable);
          
          if (existing) {
            results.updated.push({ key: variable.key, ...result });
          } else {
            results.created.push({ key: variable.key, ...result });
          }
        } catch (error) {
          results.errors.push({
            key: variable.key,
            error: error.message
          });
        }
      }

      // Delete parameters that no longer exist
      for (const param of existingParams) {
        if (!newKeys.has(param.key)) {
          try {
            await this.deleteParameter(environment, param.key);
            results.deleted.push({ key: param.key });
          } catch (error) {
            results.errors.push({
              key: param.key,
              error: error.message
            });
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Error syncing environment:', error);
      throw new Error(`Failed to sync environment: ${error.message}`);
    }
  }

  /**
   * Extract key from parameter path
   */
  extractKeyFromPath(path, environment) {
    const prefix = `${this.prefix}/${environment}/`;
    return path.startsWith(prefix) ? path.substring(prefix.length) : path;
  }

  /**
   * Get tag value from parameter
   */
  getTagValue(parameter, tagKey) {
    // Note: Tags are not returned by getParametersByPath, would need separate call
    // This is a placeholder for when we implement tag fetching
    return '';
  }

  /**
   * Validate AWS credentials and permissions
   */
  async validateAccess() {
    try {
      // Try to list parameters to check access
      await this.ssm.describeParameters({ MaxResults: 1 }).promise();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * Export parameters to .env format
   */
  async exportToEnv(environment) {
    const parameters = await this.getParameters(environment);
    let content = `# AWS Parameter Store export for ${environment}\n`;
    content += `# Generated on ${new Date().toISOString()}\n\n`;

    const sorted = parameters.sort((a, b) => a.key.localeCompare(b.key));
    
    for (const param of sorted) {
      if (param.description) {
        content += `# ${param.description}\n`;
      }
      
      // Mask secret values in export
      const value = param.isSecret ? '**REDACTED**' : param.value;
      content += `${param.key}=${value}\n\n`;
    }

    return content;
  }

  /**
   * Get parameter history
   */
  async getParameterHistory(environment, key, maxResults = 10) {
    const parameterName = `${this.prefix}/${environment}/${key}`;
    
    try {
      const response = await this.ssm.getParameterHistory({
        Name: parameterName,
        WithDecryption: false,
        MaxResults: maxResults
      }).promise();

      return response.Parameters.map(p => ({
        version: p.Version,
        value: p.Type === 'SecureString' ? '**ENCRYPTED**' : p.Value,
        modifiedDate: p.LastModifiedDate,
        modifiedBy: p.LastModifiedUser
      }));
    } catch (error) {
      console.error('Error fetching parameter history:', error);
      throw new Error(`Failed to fetch parameter history: ${error.message}`);
    }
  }
}

export default AWSParameterStore;