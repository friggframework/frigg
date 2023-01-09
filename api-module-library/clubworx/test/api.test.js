const chai = require('chai');
const should = chai.should();
const { Api } = require('../api');
require('dotenv').config();
const { expect } = require('chai');

describe('Clubworx API class', () => {
    const api = new Api({
        accountKey: process.env.CLUBWORX_ACCOUNT_KEY,
    });

    describe('Webhooks', () => {
        let webhookID;

        it('should create a webhook', async () => {
            const event = 'member_created';
            const targetURL = process.env.CLUBWORX_WEBHOOK_URL;
            const response = await api.createWebhook(event, targetURL);
            expect(response).to.have.property('webhook_id');
            webhookID = response.webhook_id;
        });

        it('should delete a webhook', async () => {
            const response = await api.deleteWebhook(webhookID);
            expect(response.status).to.equal(200);
        });
    });

    describe('Members', () => {
        let memberID;
        let membershipPlanID;

        it('should create a member', async () => {
            const datetime = Date.now().toString();
            const body = {
                first_name: 'Test',
                last_name: `Member ${datetime}`,
                email: `sheehan.khan+${datetime}@lefthook.com`,
                phone: '7702980791',
                dob: '1989-05-29',
                member_number: datetime,
            };

            const response = await api.createMember(body);
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
            expect(response).to.have.property('member_number');
            expect(response.first_name).to.equal(body.first_name);
            expect(response.last_name).to.equal(body.last_name);
            expect(response.email).to.equal(body.email);
            expect(response.member_number).to.equal(body.member_number);
            memberID = response.contact_key;
        });

        it('should get a single member', async () => {
            const response = await api.retrieveMember(memberID);
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
            expect(response).to.have.property('member_number');
        });

        it('should list all members', async () => {
            const response = await api.listAllMembers();
            expect(response).to.be.an('array');
            expect(response[0]).to.have.property('first_name');
            expect(response[0]).to.have.property('last_name');
            expect(response[0]).to.have.property('email');
            expect(response[0]).to.have.property('member_number');
        });

        it('should update a member', async () => {
            const body = {
                first_name: 'Updated Test',
            };
            const response = await api.updateMember(memberID, body);
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
            expect(response).to.have.property('member_number');
            expect(response.first_name).to.equal(body.first_name);
        });

        it('should list all membership plans', async () => {
            const response = await api.listAllMembershipPlans();
            expect(response).to.be.an('array');
            expect(response[0]).to.have.property('id');
            expect(response[0]).to.have.property('name');
            expect(response[0]).to.have.property('upfront_payment_amount');
            expect(response[0]).to.have.property('recurring_payment_amount');
            expect(response[0]).to.have.property('recurring_payment_frequency');
            expect(response[0]).to.have.property('membership_duration');
            membershipPlanID = response[0].id;
        });

        it('should add a membership', async () => {
            const body = {
                contact_key: memberID,
                membership_plan_id: membershipPlanID,
                start_date: '2022-11-14',
            };
            const response = await api.addMembership(body);
            expect(response).to.have.property('membership_plan_id');
            expect(response).to.have.property('name');
            expect(response).to.have.property('start_date');
            expect(response).to.have.property('expiration_date');
            expect(response.membership_plan_id).to.equal(
                body.membership_plan_id
            );
        });
    });

    describe('Prospects', () => {
        let prospectID;

        it('should create a prospect', async () => {
            const datetime = Date.now().toString();
            const body = {
                first_name: 'Test',
                last_name: `Prospect ${datetime}`,
                email: `sheehan.khan+${datetime}@lefthook.com`,
                phone: '7702980791',
                dob: '1989-05-29',
            };

            const response = await api.createProspect(body);
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
            expect(response.first_name).to.equal(body.first_name);
            expect(response.last_name).to.equal(body.last_name);
            expect(response.email).to.equal(body.email);
            prospectID = response.contact_key;
        });

        it('should get a single prospect', async () => {
            const response = await api.retrieveProspect(prospectID);
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
        });

        it('should list all prospects', async () => {
            const response = await api.listAllProspects();
            expect(response).to.be.an('array');
            expect(response[0]).to.have.property('first_name');
            expect(response[0]).to.have.property('last_name');
            expect(response[0]).to.have.property('email');
        });

        it('should update a prospect', async () => {
            const body = {
                first_name: 'Updated Test',
            };
            const response = await api.updateProspect(prospectID, body);
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
            expect(response.first_name).to.equal(body.first_name);
        });
    });

    describe('Prospect Statuses', () => {
        it('should list all prospect statuses', async () => {
            const response = await api.listAllProspectStatuses();
            expect(response).to.be.an('array');
            expect(response[0]).to.be.a('string');
        });
    });

    describe('Non-Attending Contacts', () => {
        let nonAttendingContactID;

        it('should create a non-attending contact', async () => {
            const datetime = Date.now().toString();
            const body = {
                first_name: 'Test',
                last_name: `Contact ${datetime}`,
                email: `sheehan.khan+${datetime}@lefthook.com`,
                phone: '7702980791',
                dob: '1989-05-29',
            };

            const response = await api.createNonAttendingContact(body);
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
            expect(response.first_name).to.equal(body.first_name);
            expect(response.last_name).to.equal(body.last_name);
            expect(response.email).to.equal(body.email);
            nonAttendingContactID = response.contact_key;
        });

        it('should get a single non-attending contact', async () => {
            const response = await api.retrieveNonAttendingContact(
                nonAttendingContactID
            );
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
        });

        it('should list all non-attending contacts', async () => {
            const response = await api.listAllNonAttendingContacts();
            expect(response).to.be.an('array');
            expect(response[0]).to.have.property('first_name');
            expect(response[0]).to.have.property('last_name');
            expect(response[0]).to.have.property('email');
        });

        it('should update a non-attending contact', async () => {
            const body = {
                first_name: 'Updated Test',
            };
            const response = await api.updateNonAttendingContact(
                nonAttendingContactID,
                body
            );
            expect(response).to.have.property('first_name');
            expect(response).to.have.property('last_name');
            expect(response).to.have.property('email');
            expect(response.first_name).to.equal(body.first_name);
        });
    });
});
