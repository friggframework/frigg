/**
 * TestFixtures - Centralized test data and fixtures
 * Provides consistent test data across all CLI tests
 */
class TestFixtures {
  /**
   * Get sample package.json configurations
   */
  static get packageConfigs() {
    return {
      valid: {
        name: 'test-frigg-app',
        version: '1.0.0',
        description: 'Test Frigg application',
        main: 'index.js',
        scripts: {
          start: 'node index.js',
          test: 'jest',
          build: 'webpack --mode production'
        },
        dependencies: {
          '@friggframework/core': '^1.0.0',
          'express': '^4.18.0'
        },
        devDependencies: {
          'jest': '^29.0.0',
          'webpack': '^5.0.0'
        },
        frigg: {
          stage: 'dev',
          region: 'us-east-1'
        }
      },
      
      invalid: {
        name: '', // Invalid name
        version: 'not-semver', // Invalid version
        main: 'non-existent.js'
      },
      
      minimal: {
        name: 'minimal-app',
        version: '1.0.0',
        main: 'index.js'
      },
      
      withFriggConfig: {
        name: 'frigg-configured-app',
        version: '1.0.0',
        main: 'index.js',
        frigg: {
          stage: 'production',
          region: 'eu-west-1',
          profile: 'production',
          backend: {
            runtime: 'nodejs18.x',
            timeout: 30,
            memory: 256
          }
        }
      }
    };
  }

  /**
   * Get sample Frigg configuration files
   */
  static get friggConfigs() {
    return {
      development: {
        stage: 'dev',
        region: 'us-east-1',
        profile: 'default',
        backend: {
          runtime: 'nodejs18.x',
          timeout: 30,
          memory: 128,
          environment: {
            NODE_ENV: 'development',
            DEBUG: 'true'
          }
        },
        frontend: {
          framework: 'react',
          buildCommand: 'npm run build',
          outputDir: 'dist',
          environment: {
            REACT_APP_API_URL: 'http://localhost:3000'
          }
        }
      },
      
      production: {
        stage: 'prod',
        region: 'us-east-1',
        profile: 'production',
        backend: {
          runtime: 'nodejs18.x',
          timeout: 30,
          memory: 256,
          environment: {
            NODE_ENV: 'production'
          }
        },
        frontend: {
          framework: 'react',
          buildCommand: 'npm run build:prod',
          outputDir: 'build',
          environment: {
            REACT_APP_API_URL: 'https://api.example.com'
          }
        },
        monitoring: {
          enabled: true,
          logLevel: 'info'
        }
      },
      
      multiStage: {
        stages: {
          dev: {
            region: 'us-east-1',
            profile: 'dev',
            backend: {
              memory: 128
            }
          },
          staging: {
            region: 'us-west-2',
            profile: 'staging',
            backend: {
              memory: 256
            }
          },
          prod: {
            region: 'eu-west-1',
            profile: 'production',
            backend: {
              memory: 512
            }
          }
        }
      }
    };
  }

  /**
   * Get sample directory structures
   */
  static get directoryStructures() {
    return {
      basicFriggApp: {
        'package.json': JSON.stringify(this.packageConfigs.valid, null, 2),
        'frigg.config.json': JSON.stringify(this.friggConfigs.development, null, 2),
        'backend/': {
          'index.js': 'module.exports = { handler: () => {} };',
          'package.json': JSON.stringify({
            name: 'backend',
            version: '1.0.0',
            main: 'index.js'
          }, null, 2)
        },
        'frontend/': {
          'package.json': JSON.stringify({
            name: 'frontend',
            version: '1.0.0',
            main: 'src/index.js'
          }, null, 2),
          'src/': {
            'index.js': 'console.log("Hello Frigg");'
          }
        }
      },
      
      backendOnly: {
        'package.json': JSON.stringify(this.packageConfigs.minimal, null, 2),
        'backend/': {
          'index.js': 'module.exports = { handler: () => {} };',
          'package.json': JSON.stringify({
            name: 'backend',
            version: '1.0.0',
            main: 'index.js'
          }, null, 2)
        }
      },
      
      emptyProject: {
        'package.json': JSON.stringify(this.packageConfigs.minimal, null, 2)
      }
    };
  }

  /**
   * Get sample API module configurations
   */
  static get apiModules() {
    return {
      valid: {
        name: 'salesforce',
        packageName: '@friggframework/api-module-salesforce',
        version: '1.0.0',
        description: 'Salesforce API integration',
        dependencies: {
          '@friggframework/core': '^1.0.0',
          'jsforce': '^2.0.0'
        }
      },
      
      invalid: {
        name: 'non-existent-module',
        packageName: '@friggframework/api-module-non-existent',
        error: 'Package not found'
      },
      
      deprecated: {
        name: 'old-module',
        packageName: '@friggframework/api-module-old',
        version: '0.5.0',
        deprecated: true,
        replacement: '@friggframework/api-module-new'
      }
    };
  }

  /**
   * Get sample command arguments and options
   */
  static get commandArgs() {
    return {
      install: {
        valid: [
          ['salesforce'],
          ['hubspot', '--app-path', '/custom/path'],
          ['slack', '--config', '/custom/config.json']
        ],
        invalid: [
          [], // Missing module name
          [''], // Empty module name
          ['invalid-@characters']
        ]
      },
      
      build: {
        valid: [
          [],
          ['--stage', 'production'],
          ['--verbose'],
          ['--stage', 'dev', '--verbose']
        ],
        invalid: [
          ['--stage', ''], // Empty stage
          ['--invalid-option']
        ]
      },
      
      deploy: {
        valid: [
          [],
          ['--stage', 'production'],
          ['--verbose'],
          ['--stage', 'staging', '--verbose']
        ],
        invalid: [
          ['--stage', 'invalid-stage']
        ]
      },
      
      generate: {
        valid: [
          ['--provider', 'aws'],
          ['--provider', 'azure', '--format', 'arm'],
          ['--provider', 'gcp', '--format', 'terraform']
        ],
        invalid: [
          [], // Missing provider
          ['--provider', 'invalid-provider'],
          ['--format', 'invalid-format']
        ]
      }
    };
  }

  /**
   * Get sample environment variables
   */
  static get environments() {
    return {
      development: {
        NODE_ENV: 'development',
        DEBUG: 'true',
        AWS_PROFILE: 'default',
        AWS_REGION: 'us-east-1'
      },
      
      production: {
        NODE_ENV: 'production',
        AWS_PROFILE: 'production',
        AWS_REGION: 'us-east-1'
      },
      
      testing: {
        NODE_ENV: 'test',
        DEBUG: 'false',
        AWS_PROFILE: 'test',
        AWS_REGION: 'us-east-1'
      }
    };
  }

  /**
   * Get sample file contents
   */
  static get fileContents() {
    return {
      validJson: '{"valid": true, "data": {"key": "value"}}',
      invalidJson: '{"invalid": json}',
      emptyJson: '{}',
      
      validYaml: `
        stage: dev
        region: us-east-1
        backend:
          runtime: nodejs18.x
          timeout: 30
      `,
      
      invalidYaml: `
        invalid: yaml: content
        - missing: structure
      `,
      
      basicJavaScript: `
        module.exports = {
          handler: async (event) => {
            return { statusCode: 200, body: 'Hello World' };
          }
        };
      `,
      
      packageJsonTemplate: `
        {
          "name": "{{name}}",
          "version": "{{version}}",
          "main": "{{main}}",
          "dependencies": {{dependencies}}
        }
      `
    };
  }

  /**
   * Get sample error scenarios
   */
  static get errorScenarios() {
    return {
      fileNotFound: {
        code: 'ENOENT',
        message: 'File not found',
        path: '/non/existent/file.json'
      },
      
      permissionDenied: {
        code: 'EACCES',
        message: 'Permission denied',
        path: '/protected/file.json'
      },
      
      networkError: {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
        address: '127.0.0.1',
        port: 8080
      },
      
      validationError: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid configuration',
        details: {
          field: 'stage',
          value: 'invalid-stage',
          allowed: ['dev', 'staging', 'prod']
        }
      },
      
      installationError: {
        code: 'INSTALLATION_ERROR',
        message: 'Failed to install package',
        package: '@friggframework/api-module-test',
        reason: 'Package not found in registry'
      }
    };
  }

  /**
   * Get sample network responses
   */
  static get networkResponses() {
    return {
      packageExists: {
        status: 200,
        data: {
          name: '@friggframework/api-module-test',
          version: '1.0.0',
          description: 'Test API module'
        }
      },
      
      packageNotFound: {
        status: 404,
        data: {
          error: 'Package not found'
        }
      },
      
      registryError: {
        status: 500,
        data: {
          error: 'Internal server error'
        }
      }
    };
  }

  /**
   * Create a temporary file structure for testing
   * @param {object} structure - Directory structure object
   * @returns {string} - Temporary directory path
   */
  static createTempStructure(structure) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-test-'));
    
    const createFiles = (dir, structure) => {
      for (const [name, content] of Object.entries(structure)) {
        const fullPath = path.join(dir, name);
        
        if (typeof content === 'object' && content !== null) {
          fs.mkdirSync(fullPath, { recursive: true });
          createFiles(fullPath, content);
        } else {
          fs.writeFileSync(fullPath, content);
        }
      }
    };
    
    createFiles(tempDir, structure);
    return tempDir;
  }

  /**
   * Clean up temporary directory
   * @param {string} tempDir - Temporary directory path
   */
  static cleanupTempStructure(tempDir) {
    const fs = require('fs');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { TestFixtures };