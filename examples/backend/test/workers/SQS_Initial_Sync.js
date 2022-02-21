require('../../setupEnv.js');

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();

let Data = require('../SQSMessages/InitialSync.json');
let InitialSyncWorker = require('../../src/workers/examples/InitialSync.js');

chai.use(chaiHttp);

let setIntegrationId = async (Data, integration_id) => {
    let body = JSON.parse(Data.Records[0].body);
    body.integration_id = integration_id;
    Data.Records[0].body = JSON.stringify(body);
    return Data;
};

describe('Should run an initial sync from SQS message', async () => {
    beforeEach(async () => {
        this.worker = await new InitialSyncWorker();
    });

    it.skip('should run an Etsy initial sync', async () => {
        Data = await setIntegrationId(Data, process.env.ETSY_INTEGRATION_ID);
        await this.worker.run(Data);
    });

    it.skip('should run a Square initial sync', async () => {
        Data = await setIntegrationId(Data, process.env.SQUARE_INTEGRATION_ID);
        // let body = JSON.parse(Data.Records[0].body);
        // body.integration_id = process.env.SQUARE_INTEGRATION_ID;
        // Data.Records[0].body = JSON.stringify(body);
        await this.worker.run(Data);
    });

    it.skip('should run a Stripe initial sync', async () => {
        Data = await setIntegrationId(Data, process.env.STRIPE_INTEGRATION_ID);
        // let body = JSON.parse(Data.Records[0].body);
        // body.integration_id = process.env.SQUARE_INTEGRATION_ID;
        // Data.Records[0].body = JSON.stringify(body);
        await this.worker.run(Data);
    });

    it.skip('shouldnt run initial sync with bad ID', async () => {
        Data = await setIntegrationId(Data, '5e8587a87ee4bf0008d04d51');
        // let body = JSON.parse(Data.Records[0].body);
        // body.integration_id = "5e8587a87ee4bf0008d04d51";
        // Data.Records[0].body = JSON.stringify(body);
        await this.worker.run(Data);
    });
});
