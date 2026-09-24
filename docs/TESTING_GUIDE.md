# Frigg Framework Testing Guide

## Testing Philosophy

**Yes, all repository and use case code should be testable and mockable!**

## Prisma Testing Strategies

### 1. **Mock Prisma Client** (Unit Tests)

```javascript
// __mocks__/@prisma/client.js
export const prisma = {
    user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    }
};
```

**Usage in tests:**
```javascript
const { UserRepositoryMongo } = require('./user-repository-mongo');
const { prisma } = require('@prisma/client');

jest.mock('@prisma/client');

describe('UserRepositoryMongo', () => {
    it('should create a user', async () => {
        const mockUser = { id: '1', username: 'test', email: 'test@test.com' };
        prisma.user.create.mockResolvedValue(mockUser);

        const repo = new UserRepositoryMongo({ prismaClient: prisma });
        const result = await repo.createIndividualUser({
            username: 'test',
            email: 'test@test.com',
            hashword: 'hashed'
        });

        expect(result).toEqual(mockUser);
        expect(prisma.user.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ username: 'test' })
        });
    });
});
```

### 2. **In-Memory SQLite** (Integration Tests)

```javascript
// prisma/schema.prisma
datasource db {
  provider = "sqlite"  // For testing
  url      = "file:./test.db"
}
```

```javascript
// tests/integration/setup.js
const { PrismaClient } = require('@prisma/client');

let prisma;

beforeAll(async () => {
    process.env.DATABASE_URL = 'file:./test.db';
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
});

afterAll(async () => {
    await prisma.$disconnect();
});
```

### 3. **Test Containers** (Full Integration)

```javascript
const { GenericContainer } = require('testcontainers');

let container;
let prisma;

beforeAll(async () => {
    container = await new GenericContainer('mongo:latest')
        .withExposedPorts(27017)
        .withCommand(['--replSet', 'rs0'])
        .start();

    const connectionString = `mongodb://localhost:${container.getMappedPort(27017)}/test?replicaSet=rs0`;
    process.env.DATABASE_URL = connectionString;

    prisma = new PrismaClient();
});
```

### 4. **Dependency Injection Pattern** (Best Practice)

**Repository with DI:**
```javascript
class UserRepositoryMongo {
    constructor({ prismaClient = prisma, tokenRepository = null }) {
        this.prisma = prismaClient;  // Injectable!
        this.tokenRepository = tokenRepository || createTokenRepository(prismaClient);
    }
}
```

**Test with mock:**
```javascript
const mockPrisma = {
    user: {
        create: jest.fn().mockResolvedValue({ id: '1', username: 'test' })
    }
};

const repo = new UserRepositoryMongo({ prismaClient: mockPrisma });
```

## Current Testing Gaps

### ❌ Missing Tests
- Admin router endpoints
- User repository admin methods (`findAllUsers`, `searchUsers`, etc.)
- Module repository methods
- Integration tests for full request/response cycle

### ✅ Existing Tests
- User use cases (CreateIndividualUser, LoginUser)
- Token repository
- Health check endpoints

## Recommended Test Structure

```
tests/
├── unit/
│   ├── repositories/
│   │   ├── user-repository-mongo.test.js
│   │   ├── user-repository-postgres.test.js
│   │   └── module-repository.test.js
│   ├── use-cases/
│   │   ├── create-individual-user.test.js
│   │   └── login-user.test.js
│   └── handlers/
│       ├── admin.test.js
│       └── user.test.js
├── integration/
│   ├── admin-endpoints.test.js
│   ├── user-endpoints.test.js
│   └── auth-flow.test.js
└── e2e/
    └── complete-user-journey.test.js
```

## Example: Testing Admin User Creation

```javascript
// tests/unit/handlers/admin.test.js
const request = require('supertest');
const { router } = require('../../../packages/core/handlers/routers/admin');
const express = require('express');

// Mock the repository
jest.mock('../../../packages/core/user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({
        findIndividualUserByUsername: jest.fn().mockResolvedValue(null),
        findIndividualUserByEmail: jest.fn().mockResolvedValue(null),
        createIndividualUser: jest.fn().mockResolvedValue({
            id: '1',
            username: 'testuser',
            email: 'test@test.com',
            type: 'INDIVIDUAL'
        }),
        findAllUsers: jest.fn().mockResolvedValue([]),
        countUsers: jest.fn().mockResolvedValue(0)
    })
}));

describe('POST /api/admin/users', () => {
    const app = express();
    app.use(express.json());
    app.use(router);

    it('should create a new user', async () => {
        const response = await request(app)
            .post('/api/admin/users')
            .send({
                username: 'testuser',
                email: 'test@test.com',
                password: 'password123'
            })
            .expect(201);

        expect(response.body.user).toMatchObject({
            username: 'testuser',
            email: 'test@test.com'
        });
        expect(response.body.user.hashword).toBeUndefined();
    });

    it('should return 409 for duplicate username', async () => {
        // Setup mock to return existing user
        const { createUserRepository } = require('../../../packages/core/user/repositories/user-repository-factory');
        const mockRepo = createUserRepository();
        mockRepo.findIndividualUserByUsername.mockResolvedValueOnce({ id: '1' });

        await request(app)
            .post('/api/admin/users')
            .send({
                username: 'duplicate',
                email: 'new@test.com',
                password: 'password123'
            })
            .expect(409);
    });
});
```

## Testing Best Practices

### ✅ DO
- Mock external dependencies (databases, APIs)
- Test business logic in isolation
- Use dependency injection
- Test error cases
- Verify security (no password leaks)
- Test pagination and edge cases

### ❌ DON'T
- Test Prisma itself (trust the library)
- Use real databases in unit tests
- Hardcode test data in production code
- Skip error case testing
- Forget to clean up test data

## Running Tests

```bash
# Unit tests only
npm test -- --testPathPattern=unit

# Integration tests
npm test -- --testPathPattern=integration

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific file
npm test packages/core/handlers/routers/admin.test.js
```

## MongoDB Replica Set for Tests

For integration tests that need MongoDB:

```javascript
// tests/integration/mongodb-setup.js
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongoServer;

module.exports = {
    async start() {
        mongoServer = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        process.env.DATABASE_URL = mongoServer.getUri('test-db');
    },

    async stop() {
        await mongoServer.stop();
    }
};
```

## Next Steps

1. Add unit tests for new admin endpoints
2. Add integration tests for full request flows
3. Set up test coverage reporting (>80% target)
4. Add CI/CD pipeline with automated testing
5. Document test patterns in each module
