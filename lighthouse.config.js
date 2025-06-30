module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --headless --disable-gpu',
        preset: 'desktop',
        throttling: {
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0,
          cpuSlowdownMultiplier: 1,
        },
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        formFactor: 'desktop',
      },
    },
    assert: {
      assertions: {
        // Performance thresholds
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.8 }],
        
        // Core Web Vitals
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        
        // Resource optimization
        'unused-javascript': ['warn', { maxLength: 1 }],
        'unused-css-rules': ['warn', { maxLength: 1 }],
        'unminified-javascript': ['error', { maxLength: 0 }],
        'unminified-css': ['error', { maxLength: 0 }],
        
        // Bundle size related
        'total-byte-weight': ['error', { maxNumericValue: 1000000 }], // 1MB
        'dom-size': ['warn', { maxNumericValue: 1500 }],
        
        // Network efficiency
        'uses-text-compression': ['error', { minScore: 1 }],
        'uses-responsive-images': ['warn', { minScore: 0.8 }],
        'modern-image-formats': ['warn', { minScore: 0.8 }],
        
        // JavaScript performance
        'bootup-time': ['warn', { maxNumericValue: 3000 }],
        'mainthread-work-breakdown': ['warn', { maxNumericValue: 4000 }],
        
        // Progressive Web App (if applicable)
        'installable-manifest': 'off',
        'splash-screen': 'off',
        'themed-omnibox': 'off',
        'content-width': 'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
      reportFilenamePattern: 'lighthouse-%%PATHNAME%%-%%DATETIME%%.%%EXTENSION%%',
    },
  },
};