module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'standard'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'commonjs'
  },
  rules: {
    // Enforce consistent indentation
    'indent': ['error', 2],
    
    // Enforce consistent spacing
    'space-before-function-paren': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    
    // Enforce semicolons for consistency
    'semi': ['error', 'always'],
    
    // Allow console.log in CLI applications
    'no-console': 'off',
    
    // Allow process.exit in CLI applications
    'no-process-exit': 'off',
    
    // Enforce consistent quote usage
    'quotes': ['error', 'single', { avoidEscape: true }],
    
    // Enforce consistent comma usage
    'comma-dangle': ['error', 'never'],
    
    // Enforce consistent line endings
    'eol-last': ['error', 'always'],
    
    // Enforce consistent spacing around operators
    'space-infix-ops': 'error',
    
    // Enforce consistent spacing in object literals
    'key-spacing': ['error', { beforeColon: false, afterColon: true }],
    
    // Enforce consistent spacing in arrays
    'array-bracket-spacing': ['error', 'never'],
    
    // Enforce consistent spacing in function calls
    'func-call-spacing': ['error', 'never'],
    
    // Enforce consistent spacing around keywords
    'keyword-spacing': ['error', { before: true, after: true }],
    
    // Enforce consistent line breaks
    'max-len': ['error', { 
      code: 120, 
      ignoreUrls: true, 
      ignoreStrings: true, 
      ignoreTemplateLiterals: true 
    }],
    
    // Enforce consistent naming conventions
    'camelcase': ['error', { properties: 'never' }],
    
    // Enforce consistent error handling
    'no-unused-vars': ['error', { 
      vars: 'all', 
      args: 'after-used', 
      ignoreRestSiblings: true 
    }],
    
    // Allow async without await for command handlers
    'require-await': 'off',
    
    // Enforce consistent return statements
    'consistent-return': 'error',
    
    // Enforce proper error handling
    'handle-callback-err': 'error',
    
    // Disallow modifying variables that are declared using const
    'no-const-assign': 'error',
    
    // Disallow duplicate imports
    'no-duplicate-imports': 'error',
    
    // Disallow unnecessary escape characters
    'no-useless-escape': 'error',
    
    // Enforce consistent use of template literals
    'prefer-template': 'error',
    
    // Enforce consistent use of destructuring
    'prefer-destructuring': ['error', {
      array: true,
      object: true
    }, {
      enforceForRenamedProperties: false
    }]
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true
      },
      rules: {
        // Allow longer lines in tests for readability
        'max-len': ['error', { code: 150 }],
        
        // Allow anonymous functions in tests
        'func-names': 'off',
        
        // Allow magic numbers in tests
        'no-magic-numbers': 'off',
        
        // Allow nested describe/it blocks
        'max-nested-callbacks': 'off',
        
        // Allow multiple expectations in tests
        'jest/prefer-expect-assertions': 'off'
      }
    },
    {
      files: ['index.js'],
      rules: {
        // Allow shebang in main CLI file
        'node/shebang': 'off'
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'dist/',
    'build/',
    '*.min.js'
  ]
};