#!/usr/bin/env node

/**
 * Performance Benchmark Framework for Frigg
 * Tests bundle sizes, build times, and runtime performance across all framework packages
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { performance } = require('perf_hooks');

class PerformanceBenchmark {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      packages: {},
      templates: {},
      summary: {
        totalBuildTime: 0,
        totalBundleSize: 0,
        averageRenderTime: 0,
        performanceScore: 0
      }
    };
    
    this.thresholds = {
      bundleSize: {
        excellent: 100 * 1024,    // 100KB
        good: 250 * 1024,         // 250KB
        warning: 500 * 1024,      // 500KB
        critical: 1000 * 1024     // 1MB
      },
      buildTime: {
        excellent: 5000,          // 5s
        good: 15000,              // 15s
        warning: 30000,           // 30s
        critical: 60000           // 60s
      },
      renderTime: {
        excellent: 16,            // 60fps
        good: 33,                 // 30fps
        warning: 50,              // 20fps
        critical: 100             // 10fps
      }
    };
  }

  /**
   * Run comprehensive performance benchmarks
   */
  async runBenchmarks() {
    console.log('🚀 Starting Frigg Performance Benchmarks...\n');
    
    try {
      // Benchmark framework packages
      await this.benchmarkPackages();
      
      // Benchmark template applications
      await this.benchmarkTemplates();
      
      // Calculate summary metrics
      this.calculateSummary();
      
      // Generate reports
      await this.generateReports();
      
      console.log('✅ Performance benchmarks completed successfully!');
      console.log(`📊 Results saved to: ${path.join(__dirname, 'performance-benchmark-report.json')}`);
      
    } catch (error) {
      console.error('❌ Benchmark failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Benchmark framework packages (ui-core, ui-vue, ui-svelte, ui-angular)
   */
  async benchmarkPackages() {
    console.log('📦 Benchmarking Framework Packages...\n');
    
    const packages = [
      'packages/ui-core',
      'packages/ui-vue', 
      'packages/ui-svelte',
      'packages/ui-angular'
    ];

    for (const packagePath of packages) {
      const packageName = path.basename(packagePath);
      console.log(`  Testing ${packageName}...`);
      
      try {
        const result = await this.benchmarkPackage(packagePath);
        this.results.packages[packageName] = result;
        
        console.log(`    ✅ Build time: ${result.buildTime}ms`);
        console.log(`    📦 Bundle size: ${(result.bundleSize / 1024).toFixed(2)}KB`);
        console.log(`    ⭐ Score: ${result.performanceScore}/100\n`);
        
      } catch (error) {
        console.log(`    ❌ Failed: ${error.message}\n`);
        this.results.packages[packageName] = { error: error.message };
      }
    }
  }

  /**
   * Benchmark individual package
   */
  async benchmarkPackage(packagePath) {
    const fullPath = path.join(__dirname, packagePath);
    
    // Install dependencies if needed
    if (!fs.existsSync(path.join(fullPath, 'node_modules'))) {
      console.log(`    📥 Installing dependencies...`);
      execSync('npm install', { cwd: fullPath, stdio: 'pipe' });
    }

    // Measure build time
    const buildStart = performance.now();
    try {
      execSync('npm run build', { 
        cwd: fullPath, 
        stdio: 'pipe',
        timeout: 120000 // 2 minute timeout
      });
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
    const buildTime = performance.now() - buildStart;

    // Measure bundle size
    const distPath = path.join(fullPath, 'dist');
    const bundleSize = this.calculateDirectorySize(distPath);

    // Calculate performance score
    const performanceScore = this.calculatePackageScore(buildTime, bundleSize);

    return {
      buildTime: Math.round(buildTime),
      bundleSize,
      performanceScore,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Benchmark template applications
   */
  async benchmarkTemplates() {
    console.log('🎨 Benchmarking Template Applications...\n');
    
    const templates = [
      'packages/devtools/frigg-cli/templates/react',
      'packages/devtools/frigg-cli/templates/vue',
      'packages/devtools/frigg-cli/templates/svelte',
      'packages/devtools/frigg-cli/templates/angular'
    ];

    for (const templatePath of templates) {
      const templateName = path.basename(templatePath);
      console.log(`  Testing ${templateName} template...`);
      
      try {
        const result = await this.benchmarkTemplate(templatePath);
        this.results.templates[templateName] = result;
        
        console.log(`    ✅ Build time: ${result.buildTime}ms`);
        console.log(`    📦 Bundle size: ${(result.bundleSize / 1024).toFixed(2)}KB`);
        console.log(`    ⭐ Score: ${result.performanceScore}/100\n`);
        
      } catch (error) {
        console.log(`    ❌ Failed: ${error.message}\n`);
        this.results.templates[templateName] = { error: error.message };
      }
    }
  }

  /**
   * Benchmark individual template
   */
  async benchmarkTemplate(templatePath) {
    const fullPath = path.join(__dirname, templatePath);
    
    // Create temp directory for testing
    const tempDir = path.join(__dirname, 'temp', path.basename(templatePath));
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Copy template to temp directory
    this.copyDirectory(fullPath, tempDir);

    try {
      // Install dependencies
      console.log(`    📥 Installing dependencies...`);
      execSync('npm install', { cwd: tempDir, stdio: 'pipe' });

      // Measure build time
      const buildStart = performance.now();
      execSync('npm run build', { 
        cwd: tempDir, 
        stdio: 'pipe',
        timeout: 180000 // 3 minute timeout
      });
      const buildTime = performance.now() - buildStart;

      // Measure bundle size
      const distPath = path.join(tempDir, 'dist');
      const bundleSize = this.calculateDirectorySize(distPath);

      // Calculate performance score
      const performanceScore = this.calculateTemplateScore(buildTime, bundleSize);

      return {
        buildTime: Math.round(buildTime),
        bundleSize,
        performanceScore,
        timestamp: new Date().toISOString()
      };

    } finally {
      // Cleanup temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    }
  }

  /**
   * Calculate directory size recursively
   */
  calculateDirectorySize(dirPath) {
    if (!fs.existsSync(dirPath)) return 0;
    
    let totalSize = 0;
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        totalSize += this.calculateDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }

  /**
   * Copy directory recursively
   */
  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    
    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stats = fs.statSync(srcPath);
      
      if (stats.isDirectory() && file !== 'node_modules' && file !== 'dist') {
        this.copyDirectory(srcPath, destPath);
      } else if (stats.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Calculate performance score for packages (0-100)
   */
  calculatePackageScore(buildTime, bundleSize) {
    const buildScore = this.getThresholdScore(buildTime, this.thresholds.buildTime);
    const sizeScore = this.getThresholdScore(bundleSize, this.thresholds.bundleSize);
    
    return Math.round((buildScore + sizeScore) / 2);
  }

  /**
   * Calculate performance score for templates (0-100)
   */
  calculateTemplateScore(buildTime, bundleSize) {
    // Templates have slightly more lenient thresholds
    const templateThresholds = {
      buildTime: {
        excellent: 10000,         // 10s
        good: 30000,              // 30s
        warning: 60000,           // 60s
        critical: 120000          // 2m
      },
      bundleSize: {
        excellent: 500 * 1024,    // 500KB
        good: 1000 * 1024,        // 1MB
        warning: 2000 * 1024,     // 2MB
        critical: 5000 * 1024     // 5MB
      }
    };

    const buildScore = this.getThresholdScore(buildTime, templateThresholds.buildTime);
    const sizeScore = this.getThresholdScore(bundleSize, templateThresholds.bundleSize);
    
    return Math.round((buildScore + sizeScore) / 2);
  }

  /**
   * Get score based on thresholds (0-100)
   */
  getThresholdScore(value, thresholds) {
    if (value <= thresholds.excellent) return 100;
    if (value <= thresholds.good) return 80;
    if (value <= thresholds.warning) return 60;
    if (value <= thresholds.critical) return 40;
    return 20;
  }

  /**
   * Calculate summary metrics
   */
  calculateSummary() {
    const allResults = [...Object.values(this.results.packages), ...Object.values(this.results.templates)];
    const validResults = allResults.filter(r => !r.error);
    
    if (validResults.length === 0) return;

    this.results.summary = {
      totalBuildTime: validResults.reduce((sum, r) => sum + r.buildTime, 0),
      totalBundleSize: validResults.reduce((sum, r) => sum + r.bundleSize, 0),
      averageBuildTime: Math.round(validResults.reduce((sum, r) => sum + r.buildTime, 0) / validResults.length),
      averageBundleSize: Math.round(validResults.reduce((sum, r) => sum + r.bundleSize, 0) / validResults.length),
      averagePerformanceScore: Math.round(validResults.reduce((sum, r) => sum + r.performanceScore, 0) / validResults.length),
      passedThresholds: validResults.filter(r => r.performanceScore >= 80).length,
      totalTests: validResults.length
    };
  }

  /**
   * Generate benchmark reports
   */
  async generateReports() {
    // JSON Report
    const jsonReport = JSON.stringify(this.results, null, 2);
    fs.writeFileSync(path.join(__dirname, 'performance-benchmark-report.json'), jsonReport);

    // Markdown Report
    const markdownReport = this.generateMarkdownReport();
    fs.writeFileSync(path.join(__dirname, 'performance-benchmark-report.md'), markdownReport);

    // CI-friendly summary
    const ciSummary = this.generateCISummary();
    fs.writeFileSync(path.join(__dirname, 'performance-summary.txt'), ciSummary);
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport() {
    const { summary } = this.results;
    
    let report = `# Frigg Performance Benchmark Report\n\n`;
    report += `**Generated:** ${this.results.timestamp}\n\n`;
    
    // Summary
    report += `## 📊 Summary\n\n`;
    report += `- **Overall Score:** ${summary.averagePerformanceScore}/100\n`;
    report += `- **Tests Passed:** ${summary.passedThresholds}/${summary.totalTests}\n`;
    report += `- **Total Build Time:** ${summary.totalBuildTime}ms\n`;
    report += `- **Average Build Time:** ${summary.averageBuildTime}ms\n`;
    report += `- **Total Bundle Size:** ${(summary.totalBundleSize / 1024).toFixed(2)}KB\n`;
    report += `- **Average Bundle Size:** ${(summary.averageBundleSize / 1024).toFixed(2)}KB\n\n`;

    // Framework Packages
    report += `## 📦 Framework Packages\n\n`;
    report += `| Package | Build Time | Bundle Size | Score | Status |\n`;
    report += `|---------|------------|-------------|-------|--------|\n`;
    
    for (const [name, result] of Object.entries(this.results.packages)) {
      if (result.error) {
        report += `| ${name} | - | - | - | ❌ Error |\n`;
      } else {
        const status = result.performanceScore >= 80 ? '✅ Good' : result.performanceScore >= 60 ? '⚠️ Warning' : '❌ Poor';
        report += `| ${name} | ${result.buildTime}ms | ${(result.bundleSize / 1024).toFixed(2)}KB | ${result.performanceScore}/100 | ${status} |\n`;
      }
    }

    // Templates
    report += `\n## 🎨 Template Applications\n\n`;
    report += `| Template | Build Time | Bundle Size | Score | Status |\n`;
    report += `|----------|------------|-------------|-------|--------|\n`;
    
    for (const [name, result] of Object.entries(this.results.templates)) {
      if (result.error) {
        report += `| ${name} | - | - | - | ❌ Error |\n`;
      } else {
        const status = result.performanceScore >= 80 ? '✅ Good' : result.performanceScore >= 60 ? '⚠️ Warning' : '❌ Poor';
        report += `| ${name} | ${result.buildTime}ms | ${(result.bundleSize / 1024).toFixed(2)}KB | ${result.performanceScore}/100 | ${status} |\n`;
      }
    }

    return report;
  }

  /**
   * Generate CI-friendly summary
   */
  generateCISummary() {
    const { summary } = this.results;
    
    let ciSummary = `FRIGG PERFORMANCE BENCHMARK RESULTS\n`;
    ciSummary += `=====================================\n`;
    ciSummary += `Overall Score: ${summary.averagePerformanceScore}/100\n`;
    ciSummary += `Tests Passed: ${summary.passedThresholds}/${summary.totalTests}\n`;
    ciSummary += `Average Build Time: ${summary.averageBuildTime}ms\n`;
    ciSummary += `Average Bundle Size: ${(summary.averageBundleSize / 1024).toFixed(2)}KB\n`;
    
    const status = summary.averagePerformanceScore >= 80 ? 'PASS' : 'FAIL';
    ciSummary += `\nOVERALL STATUS: ${status}\n`;
    
    return ciSummary;
  }
}

// Run benchmarks if called directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  benchmark.runBenchmarks().catch(console.error);
}

module.exports = PerformanceBenchmark;