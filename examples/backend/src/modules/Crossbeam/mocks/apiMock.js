class MockApi {
    constructor() {}

    async getUserDetails() {
        return require('./getUserDetails');
    }

    async getPartners() {
        return require('./Partners/getPartners');
    }

    async getPartnerPopulations() {
        return require('./Partners/getPartnerPopulations');
    }

    async getPartnerRecords() {
        return require('./Partners/getPartnerRecords');
    }

    async getPopulations() {
        return require('./Partners/getPopulations');
    }

    async getReports() {
        return require('./Reports/getReports');
    }

    async getReportData() {
        return require('./Reports/getReportData');
    }

    // async search() {
    //     return require('');
    // }

    async getThreads() {
        return require('./Threads/getThreads');
    }

    async getThreadTimelines() {
        return require('./Threads/getThreadTimelines');
    }
}

module.exports = MockApi;
