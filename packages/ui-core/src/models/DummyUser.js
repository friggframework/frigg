/**
 * Dummy User Management System
 * Framework-agnostic user models for testing
 * Extracted from @friggframework/ui for multi-framework support
 */

export class DummyUser {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.email = data.email || `user_${this.id}@test.local`;
    this.name = data.name || `Test User ${this.id}`;
    this.password = data.password || 'test123';
    this.integrations = data.integrations || {};
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  generateId() {
    return Math.random().toString(36).substring(2, 9);
  }

  addIntegration(integrationName, credentials) {
    this.integrations[integrationName] = {
      credentials,
      connectedAt: new Date(),
      status: 'connected'
    };
    this.updatedAt = new Date();
    return this;
  }

  removeIntegration(integrationName) {
    delete this.integrations[integrationName];
    this.updatedAt = new Date();
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      integrations: this.integrations,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export class DummyUserManager {
  constructor() {
    this.users = new Map();
    this.initializeDefaultUsers();
  }

  initializeDefaultUsers() {
    // Create some default test users
    const defaultUsers = [
      {
        email: 'admin@test.local',
        name: 'Admin User',
        password: 'admin123',
        metadata: { role: 'admin' }
      },
      {
        email: 'test@test.local',
        name: 'Test User',
        password: 'test123',
        metadata: { role: 'user' }
      }
    ];

    defaultUsers.forEach(userData => {
      const user = new DummyUser(userData);
      this.users.set(user.id, user);
    });
  }

  // CRUD Operations
  create(userData) {
    const user = new DummyUser(userData);
    this.users.set(user.id, user);
    return user;
  }

  read(id) {
    return this.users.get(id);
  }

  readAll() {
    return Array.from(this.users.values());
  }

  update(id, updates) {
    const user = this.users.get(id);
    if (!user) return null;

    Object.assign(user, updates);
    user.updatedAt = new Date();
    return user;
  }

  delete(id) {
    return this.users.delete(id);
  }

  // Helper methods
  findByEmail(email) {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  authenticate(email, password) {
    const user = this.findByEmail(email);
    return user && user.password === password ? user : null;
  }

  getUsersWithIntegration(integrationName) {
    return Array.from(this.users.values()).filter(
      user => user.integrations[integrationName]
    );
  }

  generateTestUsers(count = 5) {
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push(this.create({
        email: `test${i}@test.local`,
        name: `Test User ${i}`,
        password: 'test123'
      }));
    }
    return users;
  }

  reset() {
    this.users.clear();
    this.initializeDefaultUsers();
  }

  export() {
    return {
      users: this.readAll().map(user => user.toJSON()),
      exportedAt: new Date()
    };
  }

  import(data) {
    if (!data.users) return false;
    
    this.users.clear();
    data.users.forEach(userData => {
      const user = new DummyUser(userData);
      this.users.set(user.id, user);
    });
    return true;
  }
}

// Singleton instance
export const dummyUserManager = new DummyUserManager();