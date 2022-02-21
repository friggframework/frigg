const chai = require('chai');
const SalesRightAPI = require('../Api');

const { expect } = chai;
require('dotenv').config();

// Make sure that quote's properties are all there and the correct type
function validateQuote(quoteData) {
    expect(quoteData.id).to.be.a('string');
    expect(quoteData.organizationId).to.be.a('string');
    expect(quoteData.sourceType).to.be.a('string');
    expect(quoteData.updatedAt).to.be.a('string');
    expect(quoteData.createdAt).to.be.a('string');
}

// Make sure that webhook's properties are all there and the correct type
function validateWebhook(webhookData) {
    expect(webhookData.id).to.be.a('string');
    expect(webhookData.updatedAt).to.be.a('string');
    expect(webhookData.createdAt).to.be.a('string');
}

// Create quote body from Postman example
const createQuoteBody = {
    name: 'CloudCompany Product Pricing',
    sourceType: '',
    sourceDocumentId: '',
    sourceOpportunityId: '',
    sourceUserId: '',
    sourceUsername: '',
    expiresAt: '2020-07-18T14:43:38+0000',
    limitViews: '',
    passwordProtect: '',
    tiers: [
        {
            id: 'tierId-1234',
            title: 'Tier 1',
            description: 'Description of Tier 1',
            parentSourceDocumentId: '',
            recurringPeriod: 'Monthly',
            recurringType: 'Recurring',
            currency: 'USD',
            price: '20000',
            quantity: '1',
            discount: '3000',
            totalPrice: '17000',
        },
    ],
    services: [
        {
            description:
                '3 x 90 minute on-boarding sessions with one our specialists',
            parentSourceDocumentId: '',
        },
    ],
};

// Update quote body that updates the quote's sourceType to be 'Hi'
const updateQuoteBody = {
    sourceType: 'Hi',
};

// Not used currently -- a quote that has an activity attached
// used to test getting activities for a certain quote
const quoteIdWithActivity = '2wrGRi71m';

describe('FastSpringIQ API Class', async () => {
    let newQuoteId; // assigned the new quote's id when a quote is created
    let quoteWithTitle; // a quote that has a title, and the title should be queryable when searched for in quotes/search endpoint
    let createdQuoteWebhookId; // assigned the new webhook's id when a webhook is created for quotes/create
    let updatedQuoteWebhookId; // assigned the new webhook's id when a webhook is created for quotes/update
    let quoteActivityWebhookId; // assigned the new webhook's id when a webhook is created for activities/create
    const createdQuoteWebhookUrl =
        'https://webhook.site/e6fb747c-903d-43f0-a02f-32bf6a8b738c'; // sample webhook url to use for a created quote webhook url

    const api = new SalesRightAPI(
        process.env.FASTSPRING_IQ_EMAIL,
        process.env.FASTSPRING_IQ_PASSWORD
    );

    it('Should set an access token', async () => {
        const res = await api.authorization();
        api.setAccessToken(res.jwt);
        expect(api.accessToken).equal(res.jwt);
        expect(res.email).equal(api.email);
    });

    it('Should return basic user information', async () => {
        const res = await api.getUserInfo();
        expect(res.organization.api_key).equal(api.apiKey);
        expect(res.organization.id).equal(api.organizationId);
    });

    it('Should list activities', async () => {
        const res = await api.listActivities();
        expect(res).instanceOf(Array);
    });

    it('Should list quotes', async () => {
        const res = await api.listQuotes();
        expect(res).instanceOf(Array);
        const actualTitles = res.filter((quote) => quote.title !== undefined);
        actualTitles.length >= 1
            ? (quoteWithTitle = actualTitles[0].title)
            : (quoteWithTitle = 'No quotes with titles found');
        res.forEach((quote) => validateQuote(quote));
    });

    it('Should create a webhook for a created activity', async () => {
        const res = await api.quoteActivityWebhook(
            'https://webhook.site/20e4783c-27c3-497d-8dc8-7221b9ab897d'
        );
        expect(res.topic).equal('activities/create');
        validateWebhook(res);
        quoteActivityWebhookId = res.id;
    });

    it('Should create a webhook for a created quote', async () => {
        const res = await api.createdQuoteWebhook(createdQuoteWebhookUrl);
        expect(res).instanceOf(Object);
        expect(res.topic).equal('quotes/create');
        createdQuoteWebhookId = res.id;
        validateWebhook(res);
    });

    it('Should create a webhook for an updated quote', async () => {
        const res = await api.updatedQuoteWebhook(
            'https://webhook.site/faeeb098-14be-4120-ab3b-f4cb69856359'
        );
        expect(res.topic).equal('quotes/update');
        updatedQuoteWebhookId = res.id;
        validateWebhook(res);
    });

    it('Should create a quote', async () => {
        const res = await api.createQuote(createQuoteBody);
        validateQuote(res);
        newQuoteId = res.id;
    });

    it('Should Update a Quote', async () => {
        const res = await api.updateQuote(newQuoteId, updateQuoteBody);
        expect(res.id).equal(newQuoteId);
        expect(res.sourceType).equal(updateQuoteBody.sourceType);
        validateQuote(res);
    });

    // Endpoint under construction
    // it('Should find a Quote', async () => {
    //     const arr = quoteWithTitle.split(' '); // array of words seperate by spaces
    //     let res = await api.findQuote(arr[0]);
    //     expect(res).instanceOf(Array);
    // });

    /* Not in Zapier app
    it('Should get activities for a given quote', async () => {
        let res = await api.getActivitiesForQuote(quoteIdWithActivity);
        expect(res).instanceOf(Array);
        expect(res[0].quoteId).equal(quoteIdWithActivity);
    });
    */

    it('Should delete webhooks', async () => {
        const res = await api.deleteWebhook(createdQuoteWebhookId); // No response
        expect(res.status).equal(204);
        await api.deleteWebhook(updatedQuoteWebhookId);
        await api.deleteWebhook(quoteActivityWebhookId);
    });
});
