#!/usr/bin/env node
/**
 * Frigg Framework Integration Validation Suite
 * RFC Phase 4 - Comprehensive framework integration testing
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IntegrationValidator {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      packages: {},
      consistency: {},
      buildTests: {},
      typeValidation: {},
      templateTests: {},
      performance: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };
    
    this.packagesDir = path.resolve(__dirname, 'packages');
    this.templatesDir = path.resolve(__dirname, 'packages/devtools/frigg-cli/templates');
  }

  async run() {
    console.log('🚀 Starting Frigg Framework Integration Validation...\n');
    
    try {
      await this.validatePackageStructure();
      await this.validateAPIConsistency();
      await this.validateTypeDefinitions();
      await this.validateBuildConfigurations();
      await this.validateTemplateSystem();
      await this.generateReport();
      
      console.log('\n✅ Validation complete! Check integration-validation-report.json');
      
    } catch (error) {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    }
  }

  async validatePackageStructure() {
    console.log('📦 Validating package structures...');
    
    const expectedPackages = [
      'ui-core',
      'ui-vue', 
      'ui-svelte',
      'ui-angular',
      'ui' // React UI
    ];

    for (const pkg of expectedPackages) {
      const packagePath = path.join(this.packagesDir, pkg);
      const packageJsonPath = path.join(packagePath, 'package.json');
      
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        
        this.results.packages[pkg] = {
          exists: true,
          version: packageJson.version,
          name: packageJson.name,
          dependencies: Object.keys(packageJson.dependencies || {}),
          devDependencies: Object.keys(packageJson.devDependencies || {}),
          peerDependencies: Object.keys(packageJson.peerDependencies || {}),
          scripts: Object.keys(packageJson.scripts || {}),
          exports: packageJson.exports || null,
          type: packageJson.type || 'commonjs'
        };
        
        this.results.summary.total++;
        this.results.summary.passed++;
        
      } catch (error) {
        this.results.packages[pkg] = {
          exists: false,
          error: error.message
        };
        
        this.results.summary.total++;
        this.results.summary.failed++;
      }
    }
  }

  async validateAPIConsistency() {
    console.log('🔍 Validating API consistency...');
    
    const frameworks = ['vue', 'svelte', 'angular'];
    const coreAPI = await this.extractAPIFromPackage('ui-core');
    
    this.results.consistency.coreAPI = coreAPI;
    this.results.consistency.frameworks = {};
    
    for (const framework of frameworks) {
      try {
        const frameworkAPI = await this.extractAPIFromPackage(`ui-${framework}`);
        const consistency = this.compareAPIs(coreAPI, frameworkAPI);
        
        this.results.consistency.frameworks[framework] = {
          api: frameworkAPI,
          consistency,
          score: this.calculateConsistencyScore(consistency)
        };
        
        if (consistency.score >= 0.8) {
          this.results.summary.passed++;
        } else if (consistency.score >= 0.6) {
          this.results.summary.warnings++;
        } else {
          this.results.summary.failed++;
        }
        
        this.results.summary.total++;
        
      } catch (error) {
        this.results.consistency.frameworks[framework] = {
          error: error.message
        };
        this.results.summary.failed++;
        this.results.summary.total++;
      }
    }
  }

  async extractAPIFromPackage(packageName) {
    const packagePath = path.join(this.packagesDir, packageName);
    const srcPath = path.join(packagePath, 'src');
    
    try {
      const indexFile = await this.findIndexFile(srcPath);
      const content = await fs.readFile(indexFile, 'utf8');
      
      // Extract exports using regex (simplified approach)
      const exports = this.extractExports(content);
      const classes = this.extractClasses(content);
      const functions = this.extractFunctions(content);
      
      return {
        exports,
        classes,
        functions,
        hasTypeDefinitions: await this.hasTypeDefinitions(packagePath),
        hasPlugin: await this.hasPluginSystem(srcPath)
      };
      
    } catch (error) {
      throw new Error(`Failed to analyze ${packageName}: ${error.message}`);
    }
  }

  async findIndexFile(srcPath) {
    const candidates = ['index.js', 'index.ts', 'lib/index.js', 'main.js'];
    
    for (const candidate of candidates) {
      const filePath = path.join(srcPath, candidate);
      try {
        await fs.access(filePath);
        return filePath;
      } catch {}
    }
    
    throw new Error('No index file found');
  }

  extractExports(content) {
    const exportRegex = /export\s+(?:{[^}]+}|(?:default\s+)?(?:class|function|const|let|var)\s+\w+)/g;
    return (content.match(exportRegex) || []).map(exp => exp.trim());
  }

  extractClasses(content) {
    const classRegex = /(?:export\s+)?(?:default\s+)?class\s+(\w+)/g;
    const matches = [];
    let match;
    
    while ((match = classRegex.exec(content)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  extractFunctions(content) {
    const functionRegex = /(?:export\s+)?(?:default\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*{|function))/g;
    const matches = [];
    let match;
    
    while ((match = functionRegex.exec(content)) !== null) {
      matches.push(match[1] || match[2]);
    }
    
    return matches.filter(Boolean);
  }

  async hasTypeDefinitions(packagePath) {
    try {
      const files = await fs.readdir(packagePath, { recursive: true });
      return files.some(file => file.endsWith('.d.ts'));
    } catch {
      return false;
    }
  }

  async hasPluginSystem(srcPath) {
    try {
      const pluginsPath = path.join(srcPath, 'plugins');
      await fs.access(pluginsPath);
      return true;
    } catch {
      return false;
    }
  }

  compareAPIs(coreAPI, frameworkAPI) {
    const comparison = {
      coreExports: coreAPI.exports.length,
      frameworkExports: frameworkAPI.exports.length,
      commonExports: 0,
      missingInFramework: [],
      extraInFramework: [],
      pluginSystemConsistent: coreAPI.hasPlugin === frameworkAPI.hasPlugin,
      typeDefinitionsConsistent: coreAPI.hasTypeDefinitions === frameworkAPI.hasTypeDefinitions
    };
    
    // Simple comparison - in real implementation, would be more sophisticated
    const coreSet = new Set(coreAPI.exports);
    const frameworkSet = new Set(frameworkAPI.exports);
    
    comparison.commonExports = [...coreSet].filter(x => frameworkSet.has(x)).length;
    comparison.missingInFramework = [...coreSet].filter(x => !frameworkSet.has(x));
    comparison.extraInFramework = [...frameworkSet].filter(x => !coreSet.has(x));
    
    return comparison;
  }

  calculateConsistencyScore(comparison) {
    let score = 0;
    let maxScore = 0;
    
    // Export consistency (40%)
    if (comparison.coreExports > 0) {
      score += (comparison.commonExports / comparison.coreExports) * 0.4;
    }
    maxScore += 0.4;
    
    // Plugin system consistency (30%)
    if (comparison.pluginSystemConsistent) {
      score += 0.3;
    }
    maxScore += 0.3;
    
    // Type definitions consistency (30%)
    if (comparison.typeDefinitionsConsistent) {
      score += 0.3;
    }
    maxScore += 0.3;
    
    return score / maxScore;
  }

  async validateTypeDefinitions() {
    console.log('📝 Validating TypeScript definitions...');
    
    const packages = ['ui-core', 'ui-vue', 'ui-svelte', 'ui-angular'];
    
    for (const pkg of packages) {
      const packagePath = path.join(this.packagesDir, pkg);
      const tsconfigPath = path.join(packagePath, 'tsconfig.json');
      
      try {
        const tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));
        
        this.results.typeValidation[pkg] = {
          exists: true,
          target: tsconfig.compilerOptions?.target,
          module: tsconfig.compilerOptions?.module,
          strict: tsconfig.compilerOptions?.strict,
          declaration: tsconfig.compilerOptions?.declaration,
          lib: tsconfig.compilerOptions?.lib,
          moduleResolution: tsconfig.compilerOptions?.moduleResolution
        };
        
        this.results.summary.total++;
        this.results.summary.passed++;
        
      } catch (error) {
        this.results.typeValidation[pkg] = {
          exists: false,
          error: error.message
        };
        
        this.results.summary.total++;
        this.results.summary.failed++;
      }
    }
  }

  async validateBuildConfigurations() {
    console.log('🔧 Validating build configurations...');
    
    const buildConfigs = [
      { package: 'ui-core', config: 'vite.config.js' },
      { package: 'ui-vue', config: 'vite.config.js' },
      { package: 'ui-svelte', config: 'vite.config.js' },
      { package: 'ui-angular', config: 'angular.json' }
    ];
    
    for (const { package: pkg, config } of buildConfigs) {
      const configPath = path.join(this.packagesDir, pkg, config);
      
      try {
        await fs.access(configPath);
        
        this.results.buildTests[pkg] = {
          configExists: true,
          configFile: config,
          // Add more detailed build config analysis here
        };
        
        this.results.summary.total++;
        this.results.summary.passed++;
        
      } catch (error) {
        this.results.buildTests[pkg] = {
          configExists: false,
          error: error.message
        };
        
        this.results.summary.total++;
        this.results.summary.failed++;
      }
    }
  }

  async validateTemplateSystem() {
    console.log('📋 Validating template system...');
    
    const templates = ['react', 'vue', 'svelte', 'angular'];
    
    for (const template of templates) {
      const templatePath = path.join(this.templatesDir, template);
      
      try {
        const packageJsonPath = path.join(templatePath, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        
        this.results.templateTests[template] = {
          exists: true,
          name: packageJson.name,
          version: packageJson.version,
          dependencies: Object.keys(packageJson.dependencies || {}),
          scripts: Object.keys(packageJson.scripts || {}),
          hasViteConfig: await this.fileExists(path.join(templatePath, 'vite.config.js')),
          hasTSConfig: await this.fileExists(path.join(templatePath, 'tsconfig.json')),
          hasReadme: await this.fileExists(path.join(templatePath, 'README.md'))
        };
        
        this.results.summary.total++;
        this.results.summary.passed++;
        
      } catch (error) {
        this.results.templateTests[template] = {
          exists: false,
          error: error.message
        };
        
        this.results.summary.total++;
        this.results.summary.failed++;
      }
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async generateReport() {
    console.log('📊 Generating validation report...');
    
    // Calculate overall health score
    const successRate = this.results.summary.passed / this.results.summary.total;
    const warningRate = this.results.summary.warnings / this.results.summary.total;
    
    this.results.healthScore = {
      overall: successRate,
      grade: this.calculateGrade(successRate),
      warnings: warningRate,
      recommendations: this.generateRecommendations()
    };
    
    // Write detailed report
    const reportPath = path.join(__dirname, 'integration-validation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
    
    // Write summary report
    const summaryPath = path.join(__dirname, 'validation-summary.md');
    await this.writeSummaryReport(summaryPath);
  }

  calculateGrade(score) {
    if (score >= 0.9) return 'A';
    if (score >= 0.8) return 'B';
    if (score >= 0.7) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
  }

  generateRecommendations() {
    const recommendations = [];
    
    // Version consistency
    const versions = Object.values(this.results.packages)
      .map(pkg => pkg.version)
      .filter(Boolean);
    
    if (new Set(versions).size > 1) {
      recommendations.push('Standardize package versions across all framework bindings');
    }
    
    // Build configuration consistency
    const buildIssues = Object.values(this.results.buildTests)
      .filter(test => !test.configExists);
    
    if (buildIssues.length > 0) {
      recommendations.push('Fix missing build configurations');
    }
    
    // API consistency
    const lowConsistencyFrameworks = Object.entries(this.results.consistency.frameworks || {})
      .filter(([, data]) => data.consistency?.score < 0.8)
      .map(([framework]) => framework);
    
    if (lowConsistencyFrameworks.length > 0) {
      recommendations.push(`Improve API consistency for: ${lowConsistencyFrameworks.join(', ')}`);
    }
    
    return recommendations;
  }

  async writeSummaryReport(filePath) {
    const summary = `# Frigg Framework Integration Validation Report

## Summary
- **Overall Health Score**: ${(this.results.healthScore.overall * 100).toFixed(1)}% (Grade: ${this.results.healthScore.grade})
- **Tests Passed**: ${this.results.summary.passed}/${this.results.summary.total}
- **Warnings**: ${this.results.summary.warnings}
- **Failed**: ${this.results.summary.failed}

## Package Status
${Object.entries(this.results.packages).map(([pkg, data]) => 
  `- **${pkg}**: ${data.exists ? '✅' : '❌'} v${data.version || 'N/A'}`
).join('\n')}

## API Consistency
${Object.entries(this.results.consistency.frameworks || {}).map(([framework, data]) => 
  `- **${framework}**: ${data.consistency ? (data.consistency.score * 100).toFixed(1) + '%' : 'Error'}`
).join('\n')}

## Recommendations
${this.results.healthScore.recommendations.map(rec => `- ${rec}`).join('\n')}

## Detailed Results
See \`integration-validation-report.json\` for complete analysis.

Generated on: ${this.results.timestamp}
`;

    await fs.writeFile(filePath, summary);
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new IntegrationValidator();
  validator.run().catch(console.error);
}

export default IntegrationValidator;