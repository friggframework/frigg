require('../../setupEnv.js');

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();

chai.use(chaiHttp);

let OngoingSyncWorker = require('../../src/workers/examples/WebHookSync');

describe.skip('Webhook Handler Tests', async () => {
    beforeEach(async () => {
        this.worker = await new OngoingSyncWorker();
    });

    it('should process Square payment webhook body', async () => {
        let body = require('./SQSMessages/squarePaymentCreatedWebhook.json');
        await this.worker.run(body);
    });

    it('should stop Square payment because its incomplete', async () => {
        let body = require('./SQSMessages/incompleteSquarePayment.json');
        await this.worker.run(body);
    });

    it('should be unable to find integration', async () => {
        let body = require('./SQSMessages/squarePaymentCreatedWebhook.json');
        let json = JSON.parse(body.Records[0].body);
        json.obj.data.object.payment.location_id = 'somethingSilly';
        body.Records[0].body = JSON.stringify(json);
        await this.worker.run(body);
    });

    it('should process Square refund webhook', async () => {
        let body = require('./SQSMessages/squareRefundCreatedWebhook.js');
        // let json = JSON.parse(body.Records[0].body);
        // body.Records[0].body = JSON.stringify(json);
        await this.worker.run(body);
    });
});
