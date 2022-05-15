const nock = require('nock');
const path = require('path');

const PersonioApiClass = require('../api');
const faker = require('faker');
const moment = require('moment');

describe.skip('Personio API', () => {
    let testedApi;

    beforeAll(async () => {
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
            expect(employee.data).toHaveProperty('id');
            // TODO - test for new token in response
            // employee.should.have.property('email', 'jonathandoe@example.com');
        });

        it('retrieve a employee', async () => {
            // Should carry the token from the previous request
            const res = await testedApi.retrieveEmployee(employeeId);
            const data = res.data.attributes;
            // Should it be data[arg1]?
            const retrievedEmployee = testedApi.assignAttributes(data);

            expect(retrievedEmployee).toHaveProperty('id', 4481308);
        });

        it('update a employee', async () => {
            const res = await testedApi.updateEmployee(employeeId, {
                last_name: 'Updateddoe',
            });

            const data = res.data;
            const updatedEmployee = data;
            expect(updatedEmployee).toHaveProperty('id', 4481308);
        });

        it('list employees', async () => {
            const res = await testedApi.listEmployees();
            const data = res.data;
            let employees = [];
            for (let i = 0; i < data.length; i++) {
                employees.push(testedApi.assignAttributes(data[i].attributes));
            }
            expect(employees[0]).toHaveProperty('id');
        });

        it('lists employee custom attributes', async () => {
            const res = await testedApi.listEmployeeCustomAttributes();
            let attributes = [];
            // for (let i = 0; i < res.data.length; i++) {
            //     attributes.push(testedApi.assignAttributes(res.data[i]));
            // }
            // attributes[0].should.have.property('id');
            expect(res).toHaveProperty('success', true);
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
            expect(attendance.data).toHaveProperty('id');
        });

        it('retrieve an attendance', async () => {
            const res = await testedApi.retrieveAttendance(attendanceId);
            const data = res.data;
            const retrievedAttendance = testedApi.assignAttributes(data);

            expect(retrievedAttendance).toHaveProperty('date');
            expect(retrievedAttendance).toHaveProperty('id');
        });

        it('update an attendance', async () => {
            const res = await testedApi.updateAttendance(attendanceId, {
                date: '2021-07-20',
                start_time: '08:00',
                end_time: '11:00',
                break: 20,
                comment: faker.lorem.word(),
            });

            expect(res).toHaveProperty('success', true);
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
            expect(attendances[0]).toHaveProperty('id');
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
            expect(returnedTypes[0]).toHaveProperty('id');
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
            expect(absence.data).toHaveProperty('id');
        });

        // TODO - response is mangled - parse out objects individually
        it('retrieve an absence', async () => {
            const res = await testedApi.retrieveAbsence(absenceId);
            const data = res.data.attributes;
            const retrievedAbsence = testedApi.assignAttributes(data);

            expect(retrievedAbsence).toHaveProperty('start_date');
            expect(retrievedAbsence).toHaveProperty('end_date');
            expect(retrievedAbsence).toHaveProperty('half_day_start');
            expect(retrievedAbsence).toHaveProperty('half_day_end');
        });

        it('update an absence', async () => {
            const res = await testedApi.updateAbsence(absenceId, {
                comment: 'Updated comment',
            });

            const data = res.data;
            const updatedAbsence = testedApi.assignAttributes(data);
            expect(updatedAbsence).toHaveProperty('comment', 'Updated comment');
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
            expect(absences[0]).toHaveProperty('id');
        });
    });

    describe('recruitment CRUD', () => {
        const jobPositionId = 402249;

        it('lists job postings', async () => {
            const res = await testedApi.listOpenPositions();
            expect(res[0]).toHaveProperty('id');
            expect(res[0]).toHaveProperty('name');
            expect(res[0]).toHaveProperty('employment_type');
            expect(res[0]).toHaveProperty('description');
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
            expect(res).toHaveProperty('success');
        });
    });
});
