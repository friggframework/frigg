const chai = require('chai');

const should = chai.should();
const Authenticator = require('../../../../test/utils/Authenticator');
const SalesloftAPI = require('../Api');

const TestUtils = require('../../../../test/utils/TestUtils');
require('dotenv').config();

describe('Salesloft API class', async () => {
    const api = new SalesloftAPI();
    before(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe('Get Team Info', async () => {
        it('should get user info', async () => {
            const response = await api.getTeam();
            response.data.should.have.property('id');
            response.data.should.have.property('name');
            return response;
        });
    });

    describe('People', async () => {
        it('should create a person', async () => {
            const person = {
                email_address: `${Date.now()}@test.com`,
                phone: '999 999 9999',
                first_name: 'Test9',
                last_name: 'Person',
            };
            const response = await api.createPerson(person);
            response.data.should.have.property('id');
            //response.data.email_address.should.equal(`${Date.now()}@test.com`);
            response.data.phone.should.equal('999 999 9999');
            response.data.first_name.should.equal('Test9');
            response.data.last_name.should.equal('Person');
            this.contact_id = response.data.id;
            return response;
        });

        it('should list all people', async () => {
            const response = await api.listPeople();
            response.data.length.should.above(0);
            response.data[0].should.have.property('id');
            return response;
        });

        it('should get person by id', async () => {
            const response = await api.getPersonById(this.contact_id);
            response.data.should.have.property('id');
            return response;
        });

        it('should list people by account', async () => {
            const accounts = await api.listAccounts();
            const account_id = accounts.data[0].id;
            const params = {
                account_id,
            };

            const response = await api.listPeople(params);
            response.data.should.exist;
            return response;
        });

        it('should update a person', async () => {
            const person = {
                email_address: `${Date.now()}@test.com`,
            };
            const response = await api.updatePerson(this.contact_id, person);
            response.data.email_address.should.exist;
            return response;
        });

        it.skip('should delete a person', async () => {
            const response = await api.deletePerson(this.contact_id);
            return response;
        });
    });

    describe('Accounts', async () => {
        it('should list accounts', async () => {
            const response = await api.listAccounts();
            response.data.length.should.above(0);
            response.data[0].should.have.property('id');
            this.account_id = response.data[0].id;
            return response;
        });

        it('should get accounts by id', async () => {
            const response = await api.getAccountsById(this.account_id);
            response.data.should.have.property('id');
            return response;
        });

        it('should get account by domain', async () => {
            const accounts = await api.listAccounts();
            const domain = accounts.data[0].domain;

            const params = {
                domain,
            };

            const response = await api.listAccounts(params);
            response.data[0].should.have.property('id');
            return response;
        });
    });

    describe('Users', async () => {
        it('should list all users', async () => {
            const response = await api.listUsers();
            response.data.length.should.above(0);
            response.data[0].should.have.property('id');
            this.user_id = response.data[0].id;
        });

        it('should get user by id', async () => {
            const response = await api.getUserById(this.user_id);
            response.data.should.have.property('id');
            return response;
        });
    });

    describe('Tasks', async () => {
        it('should create a tasks', async () => {
            const users = await api.listUsers();
            this.user_id = users.data[0].id;
            const people = await api.listPeople();
            this.contact_id = people.data[0].id;
            const task = {
                subject: 'some task',
                user_id: this.user_id,
                person_id: this.contact_id,
                task_type: 'call',
                due_date: '2022-09-01',
                current_state: 'pending_activity',
            };
            const response = await api.createTask(task);
            response.data.should.have.property('id');
            this.task_id = response.data.id;
            return response;
        });

        it('should get tasks', async () => {
            const response = await api.getTasks();
            response.data[0].should.have.property('id');
            response.data.length.should.above(0);
            return response;
        });

        it('should update a task', async () => {
            const task = {
                subject: 'another task',
            };
            const response = await api.updateTask(this.task_id, task);
            response.data.should.have.property('id');
            response.data.subject.should.equal('another task');
            return response;
        });

        it('should delete a task by id', async () => {
            const response = await api.deleteTask(this.task_id);
            return response;
        });
    });

    describe('Bad Auth', async () => {
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
                e.message.should.equal(
                    'SalesloftAPI -- Error: Error Refreshing Credentials'
                );
            }
        });
    });
});
