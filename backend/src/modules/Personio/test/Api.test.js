require('../../../../setupEnv');

const chai = require('chai');
const nock = require('nock');
const path = require('path');

const should = chai.should();
const PersonioApiClass = require('../Api');
const faker = require('faker');
const moment = require('moment');

describe('Personio API', () => {
    let testedApi;

    before(async () => {
        await testedApi.getToken();
    });

    describe('employee CRUD', () => {
        testedApi = new PersonioApiClass({
            clientId: process.env.PERSONIO_CLIENT_ID,
            clientSecret: process.env.PERSONIO_CLIENT_SECRET,
            companyId: process.env.PERSONIO_COMPANY_ID,
            subdomain: process.env.PERSONIO_SUBDOMAIN,
            recruitingApiKey: process.env.PERSONIO_RECRUITING_API_KEY,
        });

        const employeeId = 4481308;

        it('creates a employee', async () => {
            const employee = await testedApi.createEmployee({
                email: faker.internet.email(),
                first_name: faker.name.firstName(),
                last_name: faker.name.lastName(),
            });
            employee.data.should.have.property('id');
            // TODO - test for new token in response
            // employee.should.have.property('email', 'jonathandoe@example.com');
        });

        it('retrieve a employee', async () => {
            // Should carry the token from the previous request
            const res = await testedApi.retrieveEmployee(employeeId);
            const data = res.data.attributes;
            // Should it be data[arg1]?
            const retrievedEmployee = testedApi.assignAttributes(data);

            retrievedEmployee.should.have.property('id', 4481308);
        });

        it('update a employee', async () => {
            const res = await testedApi.updateEmployee(employeeId, {
                last_name: 'Updateddoe',
            });

            const data = res.data;
            const updatedEmployee = data;
            updatedEmployee.should.have.property('id', 4481308);
        });

        it('list employees', async () => {
            const res = await testedApi.listEmployees();
            const data = res.data;
            let employees = [];
            for (let i = 0; i < data.length; i++) {
                employees.push(testedApi.assignAttributes(data[i].attributes));
            }
            employees[0].should.have.property('id');
        });

        it('lists employee custom attributes', async () => {
            const res = await testedApi.listEmployeeCustomAttributes();
            let attributes = [];
            // for (let i = 0; i < res.data.length; i++) {
            //     attributes.push(testedApi.assignAttributes(res.data[i]));
            // }
            // attributes[0].should.have.property('id');
            res.should.have.property('success', true);
        });
    });

    describe('attendance CRUD', () => {
        testedApi = new PersonioApiClass({
            clientId: process.env.PERSONIO_CLIENT_ID,
            clientSecret: process.env.PERSONIO_CLIENT_SECRET,
            companyId: process.env.PERSONIO_COMPANY_ID,
            accessToken: process.env.PERSONIO_ACCESS_TOKEN,
            subdomain: process.env.PERSONIO_SUBDOMAIN,
        });

        const attendanceId = 61258036;

        it('creates an attendance', async () => {
            const date = faker.date.past();
            const modifiedDate = moment(date).format('YYYY-MM-DD');

            // TODO - add a method to pad the times so its always 'HH:MM'
            const attendance = await testedApi.createAttendance({
                employee: 4106894,
                date: modifiedDate,
                start_time: '08:00',
                end_time: '11:00',
                break: 15,
                comment: 'Test attendance',
            });
            attendance.data.should.have.property('id');
        });

        it('retrieve an attendance', async () => {
            const res = await testedApi.retrieveAttendance(attendanceId);
            const data = res.data;
            const retrievedAttendance = testedApi.assignAttributes(data);

            retrievedAttendance.should.have.property('date');
            retrievedAttendance.should.have.property('id');
        });

        it('update an attendance', async () => {
            const res = await testedApi.updateAttendance(attendanceId, {
                date: '2021-07-20',
                start_time: '08:00',
                end_time: '11:00',
                break: 20,
                comment: faker.lorem.word(),
            });

            res.should.have.property('success', true);
        });

        // TODO
        it('delete an attendance', async () => {
            const res = await testedApi.deleteAttendance(attendanceId);
            // res.should.have.property('status', 200);
        });

        it('list attendances', async () => {
            const res = await testedApi.listAttendances();
            const data = res.data;
            let attendances = [];
            for (let i = 0; i < data.length; i++) {
                attendances.push(testedApi.assignAttributes(data[i]));
            }
            attendances[0].should.have.property('id');
        });
    });

    describe('absence CRUD', () => {
        const absenceId = 61258036;
        const timeOffTypeId = 364144;

        it('retrieves time off types', async () => {
            const types = await testedApi.listAbsenceRequestTypes();
            let returnedTypes = [];
            for (let i = 0; i < types.data.length; i++) {
                let type = testedApi.assignAttributes(types.data[i].attributes);
                returnedTypes.push(type);
            }
            returnedTypes[0].should.have.property('id');
        });

        it('creates an absence', async () => {
            const absence = await testedApi.createAbsence({
                employee_id: 4106894,
                time_off_type_id: timeOffTypeId,
                start_date: '2023-01-12',
                end_date: '2023-01-19',
                half_day_start: true,
                half_day_end: true,
            });
            absence.data.should.have.property('id');
        });

        // TODO - response is mangled - parse out objects individually
        it('retrieve an absence', async () => {
            const res = await testedApi.retrieveAbsence(absenceId);
            const data = res.data.attributes;
            const retrievedAbsence = testedApi.assignAttributes(data);

            retrievedAbsence.should.have.property('start_date');
            retrievedAbsence.should.have.property('end_date');
            retrievedAbsence.should.have.property('half_day_start');
            retrievedAbsence.should.have.property('half_day_end');
        });

        it('update an absence', async () => {
            const res = await testedApi.updateAbsence(absenceId, {
                comment: 'Updated comment',
            });

            const data = res.data;
            const updatedAbsence = testedApi.assignAttributes(data);
            updatedAbsence.should.have.property('comment', 'Updated comment');
        });

        it('delete an absence', async () => {
            const res = await testedApi.deleteAbsence(absenceId);
            // res.should.have.property('status', 200);
        });

        it('list absences', async () => {
            const res = await testedApi.listAbsences();
            const data = res.data;
            let absences = [];
            for (let i = 0; i < data.length; i++) {
                absences.push(testedApi.assignAttributes(data[i]));
            }
            absences[0].should.have.property('id');
        });
    });

    describe('recruitment CRUD', () => {
        const jobPositionId = 402249;

        it('lists job postings', async () => {
            const res = await testedApi.listOpenPositions();
            res[0].should.have.property('id');
            res[0].should.have.property('name');
            res[0].should.have.property('employment_type');
            res[0].should.have.property('description');
        });

        it('creates an applicant', async () => {
            const res = await testedApi.createApplicant({
                company_id: testedApi.COMPANY_ID,
                access_token: testedApi.ACCESS_TOKEN,
                job_position_id: jobPositionId,
                first_name: faker.name.firstName(),
                last_name: faker.name.lastName(),
                email: faker.internet.email(),
            });
            res.should.have.property('success');
        });
    });
});
