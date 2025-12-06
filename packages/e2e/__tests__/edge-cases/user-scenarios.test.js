const request = require('supertest');
const { TestServer } = require('../helpers/test-server');
const { createFixture } = require('../helpers/fixtures');

describe('User Scenarios', () => {
    let server;
    let app;
    let fixture;

    beforeAll(async () => {
        server = new TestServer();
        await server.start();
        app = server.getApp();
    });

    afterAll(async () => {
        await server.stop();
    });

    beforeEach(() => {
        fixture = createFixture(app);
    });

    describe('User Creation', () => {
        it('should create a new user', async () => {
            const res = await request(app)
                .post('/user/create')
                .send({
                    username: `newuser-${Date.now()}@example.com`,
                    password: 'securepass123',
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('id');
        });

        it('should reject duplicate username', async () => {
            const username = `duplicate-${Date.now()}@example.com`;

            await request(app)
                .post('/user/create')
                .send({ username, password: 'password123' });

            const res = await request(app)
                .post('/user/create')
                .send({ username, password: 'password456' });

            expect(res.status).toBe(400);
        });

        it('should reject missing username', async () => {
            const res = await request(app)
                .post('/user/create')
                .send({ password: 'password123' });

            expect(res.status).toBe(400);
        });

        it('should reject missing password', async () => {
            const res = await request(app)
                .post('/user/create')
                .send({ username: 'test@example.com' });

            expect(res.status).toBe(400);
        });
    });

    describe('User Login', () => {
        it('should login with correct credentials', async () => {
            const username = `login-${Date.now()}@example.com`;
            const password = 'correctpassword';

            await request(app)
                .post('/user/create')
                .send({ username, password });

            const res = await request(app)
                .post('/user/login')
                .send({ username, password });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('token');
        });

        it('should reject incorrect password', async () => {
            const username = `wrongpass-${Date.now()}@example.com`;

            await request(app)
                .post('/user/create')
                .send({ username, password: 'correctpassword' });

            const res = await request(app)
                .post('/user/login')
                .send({ username, password: 'wrongpassword' });

            expect(res.status).toBe(401);
        });

        it('should reject nonexistent user', async () => {
            const res = await request(app)
                .post('/user/login')
                .send({
                    username: 'nonexistent@example.com',
                    password: 'anypassword',
                });

            expect(res.status).toBe(401);
        });
    });

    describe('User Session', () => {
        it('should maintain user context across requests', async () => {
            const { userId, token } = await fixture.createUser();
            const { entityId } = await fixture.createOAuthEntity(userId);

            const getEntitiesRes = await request(app)
                .get('/api/entities')
                .set('Authorization', `Bearer ${token}`);

            expect(getEntitiesRes.status).toBe(200);
            expect(getEntitiesRes.body.entities.some((e) => e.id === entityId)).toBe(true);
        });

        it('should isolate user data between users', async () => {
            const { userId: user1Id, token: token1 } = await fixture.createUser();
            const { token: token2 } = await fixture.createUser();

            await fixture.createOAuthEntity(user1Id);

            const user1Entities = await request(app)
                .get('/api/entities')
                .set('Authorization', `Bearer ${token1}`);

            const user2Entities = await request(app)
                .get('/api/entities')
                .set('Authorization', `Bearer ${token2}`);

            expect(user1Entities.body.entities.length).toBeGreaterThan(0);
            expect(user2Entities.body.entities).toHaveLength(0);
        });
    });
});
