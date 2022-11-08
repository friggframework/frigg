const chai = require('chai');
const should = chai.should();
const { Api } = require('../api');
require('dotenv').config();
const { expect } = require('chai');

describe('Clubworx API class', () => {
    const api = new Api({
        accountKey: process.env.CLUBWORX_ACCOUNT_KEY,
    });

    describe('Members', () => {
        let memberID;

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
