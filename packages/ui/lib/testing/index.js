// Testing infrastructure exports
export { TestingDashboard } from './components/TestingDashboard';
export { UserManagementPanel } from './components/UserManagementPanel';
export { ConnectionTester } from './components/ConnectionTester';
export { EntityManager } from './components/EntityManager';
export { TestDataGenerator } from './components/TestDataGenerator';
export { IntegrationTester } from './components/IntegrationTester';
export { TestResults } from './components/TestResults';

// Models
export { DummyUser, DummyUserManager, dummyUserManager } from './models/DummyUser';

// Testing utilities
export const TestingUtils = {
  // Generate random test data
  generateTestData: (type, count = 10) => {
    const generators = {
      user: (i) => ({
        email: `test${i}@example.com`,
        name: `Test User ${i}`,
        password: 'test123'
      }),
      contact: (i) => ({
        firstName: `First${i}`,
        lastName: `Last${i}`,
        email: `contact${i}@example.com`,
        phone: `+1-555-${String(i).padStart(4, '0')}`
      }),
      task: (i) => ({
        title: `Task ${i}`,
        description: `Description for task ${i}`,
        dueDate: new Date(Date.now() + i * 86400000).toISOString(),
        status: ['todo', 'in_progress', 'done'][i % 3]
      })
    };

    const generator = generators[type] || (() => ({}));
    return Array.from({ length: count }, (_, i) => generator(i));
  },

  // Simulate API responses
  mockApiResponse: (success = true, data = {}, delay = 500) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (success) {
          resolve({
            status: 200,
            data,
            headers: {
              'content-type': 'application/json',
              'x-rate-limit-remaining': Math.floor(Math.random() * 5000)
            }
          });
        } else {
          reject({
            status: 400 + Math.floor(Math.random() * 100),
            message: 'Mock API error',
            data: {}
          });
        }
      }, delay);
    });
  },

  // Validate integration credentials
  validateCredentials: (integration, credentials) => {
    const requiredFields = {
      oauth2: ['access_token', 'refresh_token'],
      api_key: ['api_key'],
      basic: ['username', 'password']
    };

    const authType = integration.config?.authType || 'oauth2';
    const required = requiredFields[authType] || [];

    return required.every(field => credentials[field]);
  }
};