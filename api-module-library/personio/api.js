const { get, ApiKeyRequester } = require('@friggframework/core');
const moment = require('moment');

class Api extends ApiKeyRequester {
    constructor(params) {
        super(params);

        this.baseURL = 'https://api.personio.de';
        this.CLIENT_ID = get(params, 'clientId');
        this.CLIENT_SECRET = get(params, 'clientSecret');
        this.authorizationUri = `${this.baseURL}/v1/auth?client_id=${this.CLIENT_ID}&client_secret=${this.CLIENT_SECRET}`;

        this.API_KEY_NAME = 'Authorization';
        this.API_KEY_VALUE;

        this.COMPANY_ID = get(params, 'companyId');
        this.SUBDOMAIN = get(params, 'subdomain');
        this.RECRUITING_API_KEY = get(params, 'recruitingApiKey', null);

        this.openPositionsUri = `https://${this.SUBDOMAIN}.jobs.personio.de/search.json`;

        this.URLs = {
            employees: '/v1/company/employees',
            employeeById: (id) => `/v1/company/employees/${id}`,
            attendances: '/v1/company/attendances',
            attendanceById: (id) => `/v1/company/attendances/${id}`,
            absences: '/v1/company/time-offs',
            absenceById: (id) => `/v1/company/time-offs/${id}`,
            // Supporting calls
            employeeCustomAttributes: '/v1/company/employees/custom-attributes',
            absenceRequestTypes: '/v1/company/time-off-types',
            candidate: '/recruiting/applicant',
        };
    }

    // Overwrite parent's `this._request` method
    async _request(URL, options, i = 0) {
        if (!this.API_KEY_VALUE) await this.getToken();
        const res = await super._request(URL, options, i);
        // Set the access_token to be whatever is in the 'authorization' array in headers
        if (res.headers.raw().authorization) {
            // There is a value in the header
            const newAuthHeader = res.headers.get('authorization');

            this.API_KEY_VALUE = newAuthHeader.split(' ')[1]; // Trim Bearer to capture new token
        }
        return res;
    }

    // Makes a POST request to the auth url to get a token in JSON response
    // The token should be changed before each new request
    async getToken() {
        const options = {
            url: this.authorizationUri,
            method: 'POST',
            headers: {},
        };

        const res = await super._request(options.url, options);
        const resJson = await res.json();
        const { token } = resJson.data;
        this.API_KEY_VALUE = token;

        // After each request, set the API_KEY_VALUE
        return this.API_KEY_VALUE;
    }

    // Overrides `addAuthHeaders` in ApiKeyBase
    async addAuthHeaders(headers) {
        headers.Authorization = `Bearer ${this.API_KEY_VALUE}`;
        return headers;
    }

    async retrieveEmployee(id) {
        const options = {
            url: this.baseURL + this.URLs.employeeById(id),
        };
        const res = await this._get(options);
        return res;
    }

    async retrieveAbsence(id) {
        const options = {
            url: this.baseURL + this.URLs.absenceById(id),
        };

        const res = await this._get(options);
        return res;
    }

    async retrieveAttendance(id) {
        const formattedDate = moment().format('YYYY-MM-DD');
        const query = {
            start_date: '2010-01-01',
            end_date: formattedDate,
        };
        // First list all attendances, then find by ID
        const allAttendances = await this.listAttendances(query);
        const res = allAttendances.data;
        const findAttendance = res.filter((attendance) => attendance.id === id);
        const date = findAttendance[0].attributes.date;
        const idQuery = {
            start_date: date,
            end_date: date,
        };
        const idRes = await this.listAttendances(idQuery);
        return idRes;
    }

    async createEmployee(body) {
        const options = {
            url: this.baseURL + this.URLs.employees,
            body: {
                employee: body,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const res = await this._post(options);
        return res;
    }

    async updateEmployee(id, body) {
        const options = {
            url: this.baseURL + this.URLs.employeeById(id),
            body: {
                employee: body,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const res = await this._patch(options);
        return res;
    }

    async deleteEmployee(id) {
        const options = {
            url: this.baseURL + this.URLs.employeeById(id),
        };

        return await this._delete(options);
    }

    async createAbsence(body) {
        const options = {
            url: this.baseURL + this.URLs.absences,
            body,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        return await this._post(options);
    }

    async updateAbsence(id, body) {
        const options = {
            url: this.baseURL + this.URLs.absenceById(id),
            body,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        return await this._patch(options);
    }

    async deleteAbsence(id) {
        const options = {
            url: this.baseURL + this.URLs.absenceById(id),
        };

        return await this._delete(options);
    }

    async createAttendance(body) {
        const options = {
            url: this.baseURL + this.URLs.attendances,
            body: {
                attendances: [body],
            },
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const res = await this._post(options);
        return res;
    }

    async updateAttendance(id, body) {
        const options = {
            url: this.baseURL + this.URLs.attendanceById(id),
            body,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const res = await this._patch(options);
        return res;
    }

    async createApplicant(body) {
        const options = {
            url: this.baseURL + this.URLs.candidate,
            body,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const res = await this._post(options.url, options);
        return res;
    }

    async deleteAttendance(id) {
        const options = {
            url: this.baseURL + this.URLs.attendanceById(id),
        };

        return await this._delete(options);
    }

    async listOpenPositions() {
        const options = {
            url: this.openPositionsUri,
            headers: {
                Accept: 'application/xml',
            },
        };
        const res = await this._get(options);
        return res;
    }

    async listEmployees() {
        return await this._listAll(this.URLs.employees);
    }

    async listAbsences() {
        return await this._listAll(this.URLs.absences);
    }

    async listAttendances(query) {
        const options = {
            url: this.baseURL + this.URLs.attendances,
            query,
        };
        const res = await this._get(options);
        return res;
    }

    async listEmployeeCustomAttributes() {
        return await this._listAll(this.URLs.employeeCustomAttributes);
    }

    async listAbsenceRequestTypes() {
        return await this._listAll(this.URLs.absenceRequestTypes);
    }

    async _listAll(path, query) {
        const options = {
            url: this.baseURL + path,
            query,
        };
        return await this._get(options);
    }

    // Arranges the returned objects in a key:value format
    assignAttributes(result) {
        const entity = {};
        for (const [key, value] of Object.entries(result)) {
            entity[key] = value.value;
        }
        return entity;
    }
}

module.exports = { Api };
