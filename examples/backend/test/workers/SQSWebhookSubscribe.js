require('../../setupEnv.js');

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();

chai.use(chaiHttp);

let WebhookWorker = require('../../src/workers/examples/WebhookWorker.js');

describe.skip('Webhook Handler Tests', async () => {
    beforeEach(async () => {
        this.worker = await new WebhookWorker();
    });

    // it('should subscribe to a Stripe Webhook', async() => {
    //     let body = require('./SQSMessages/subscribeStripeWebhook.json');
    //     let json = JSON.parse(body.Records[0].body);
    //     json.integration_id = process.env.STRIPE_INTEGRATION_ID;
    //     body.Records[0].body = JSON.stringify(json);
    //     let res = await this.worker.run(body);
    //     return res;
    // });

    // it('should unsubscribe from a Stripe Webhook', async() => {
    //     let body = require('./SQSMessages/subscribeStripeWebhook.json');
    //     let json = JSON.parse(body.Records[0].body);
    //     json.integration_id = process.env.STRIPE_INTEGRATION_ID;
    //     json.switch = "off";
    //     body.Records[0].body = JSON.stringify(json);
    //     let res = await this.worker.run(body);
    //     return res;
    // });
});
