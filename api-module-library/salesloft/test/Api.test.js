/**
 * @group interactive
 */

const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('../api');

const TestUtils = require('../../../../test/utils/TestUtils');
require('dotenv').config();

describe('Salesloft API class', () => {
    let testContext;

    beforeEach(() => {
        testContext = {};
    });

    const api = new Api();
    beforeAll(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('Get Team Info', () => {
        it('should get user info', async () => {
            const response = await api.getTeam();
            expect(response.data).toHaveProperty('id');
            expect(response.data).toHaveProperty('name');
            return response;
        });
    });

    describe('People', () => {
        it('should create a person', async () => {
            const person = {
                email_address: `${Date.now()}@test.com`,
                phone: '999 999 9999',
                first_name: 'Test9',
                last_name: 'Person',
            };
            const response = await api.createPerson(person);
            expect(response.data).toHaveProperty('id');
            //response.data.email_address.should.equal(`${Date.now()}@test.com`);
            expect(response.data.phone).toBe('999 999 9999');
            expect(response.data.first_name).toBe('Test9');
            expect(response.data.last_name).toBe('Person');
            testContext.contact_id = response.data.id;
            return response;
        });

        it('should list all people', async () => {
            const response = await api.listPeople();
            expect(response.data.length).toBeGreaterThan(0);
            expect(response.data[0]).toHaveProperty('id');
            return response;
        });

        it('should get person by id', async () => {
            const response = await api.getPersonById(testContext.contact_id);
            expect(response.data).toHaveProperty('id');
            return response;
        });

        it('should list people by account', async () => {
            const accounts = await api.listAccounts();
            const account_id = accounts.data[0].id;
            const params = {
                account_id,
            };

            const response = await api.listPeople(params);
            expect(response.data).toBeDefined();
            return response;
        });

        it('should update a person', async () => {
            const person = {
                email_address: `${Date.now()}@test.com`,
            };
            const response = await api.updatePerson(
                testContext.contact_id,
                person
            );
            expect(response.data.email_address).toBeDefined();
            return response;
        });

        it.skip('should delete a person', async () => {
            const response = await api.deletePerson(this.contact_id);
            return response;
        });
    });

    describe('Accounts', () => {
        it('should list accounts', async () => {
            const response = await api.listAccounts();
            expect(response.data.length).toBeGreaterThan(0);
            expect(response.data[0]).toHaveProperty('id');
            testContext.account_id = response.data[0].id;
            return response;
        });

        it('should get accounts by id', async () => {
            const response = await api.getAccountsById(testContext.account_id);
            expect(response.data).toHaveProperty('id');
            return response;
        });

        it('should get account by domain', async () => {
            const accounts = await api.listAccounts();
            const domain = accounts.data[0].domain;

            const params = {
                domain,
            };

            const response = await api.listAccounts(params);
            expect(response.data[0]).toHaveProperty('id');
            return response;
        });
    });

    describe('Users', () => {
        it('should list all users', async () => {
            const response = await api.listUsers();
            expect(response.data.length).toBeGreaterThan(0);
            expect(response.data[0]).toHaveProperty('id');
            testContext.user_id = response.data[0].id;
        });

        it('should get user by id', async () => {
            const response = await api.getUserById(testContext.user_id);
            expect(response.data).toHaveProperty('id');
            return response;
        });
    });

    describe('Tasks', () => {
        it('should create a tasks', async () => {
            const users = await api.listUsers();
            testContext.user_id = users.data[0].id;
            const people = await api.listPeople();
            testContext.contact_id = people.data[0].id;
            const task = {
                subject: 'some task',
                user_id: testContext.user_id,
                person_id: testContext.contact_id,
                task_type: 'call',
                due_date: '2022-09-01',
                current_state: 'pending_activity',
            };
            const response = await api.createTask(task);
            expect(response.data).toHaveProperty('id');
            testContext.task_id = response.data.id;
            return response;
        });

        it('should get tasks', async () => {
            const response = await api.getTasks();
            expect(response.data[0]).toHaveProperty('id');
            expect(response.data.length).toBeGreaterThan(0);
            return response;
        });

        it('should update a task', async () => {
            const task = {
                subject: 'another task',
            };
            const response = await api.updateTask(testContext.task_id, task);
            expect(response.data).toHaveProperty('id');
            expect(response.data.subject).toBe('another task');
            return response;
        });

        it('should delete a task by id', async () => {
            const response = await api.deleteTask(testContext.task_id);
            return response;
        });
    });

    describe('Bad Auth', () => {
        it('should refresh bad auth token', async () => {
            api.access_token = 'nolongervalid';
            await api.listPeople();
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                api.access_token = 'nolongervalid';
                api.refresh_token = 'nolongervalid';
                await api.listPeople();
                throw new Error('did not fail');
            } catch (e) {
                expect(e.message).toBe(
                    'Api -- Error: Error Refreshing Credentials'
                );
            }
        });
    });
});
