require('dotenv').config();
const config = require('../defaultConfig.json');
const {Api} = require('../api');
const sampleSubmission = require('./sample-data/sample_submission.json')
const longSubmission = require('./sample-data/long_submission.json')
const htmlSubmission = require('./sample-data/html_submission.json')
const jsonSubmission = require('./sample-data/json_submission.json')

describe('Unbabel LanguageOS API Tests', () => {
    const apiParams = {
        client_id: process.env.UNBABEL_CLIENT_ID,
        username: process.env.UNBABEL_TEST_LANGUAGEOS_USERNAME,
        password: `${process.env.UNBABEL_TEST_LANGUAGEOS_PASSWORD}#`,//hack to workaround dotenv eating the #
        customer_id: process.env.UNBABEL_TEST_LANGUAGEOS_CUSTOMER_ID
    };

    const api = new Api(apiParams);

    beforeAll(async () => {
        await api.getTokenFromUsernamePassword();
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an tokens', async () => {
            expect(api.access_token).not.toBeNull();
            expect(api.refresh_token).not.toBeNull();
        });
    });

    describe('Pipeline requests', () => {
        it('List all Pipelines', async () => {
            const response = await api.listPipelines();
            expect(response).toHaveProperty('pipelines');
        });
    })

    describe('Translation requests', () => {
        it('Search for translations', async () => {
            const body = {
                "source_language": "en"
            };
            const response = await api.searchTranslations(body);
            expect(response).toHaveProperty('results');
        });


        let submissionUID;
        it('Submit a translation', async () => {
            //jsonSubmission.source_text = JSON.stringify(jsonSubmission.source_text);
            const response = await api.submitTranslation(htmlSubmission);
            expect(response).toBeDefined();
            expect(response).toHaveProperty('translation_uid');
            submissionUID = response.translation_uid;
        });
        it('Fetch a translation', async () => {
            const response = await api.getTranslation(submissionUID);
            expect(response).toBeDefined();
        });
        it('Fetch a translation until it is complete', async () => {
            let response = await api.getTranslation(submissionUID);
            expect(response).toBeDefined();
            while (response.status!== 'completed') {
                await new Promise(resolve => setTimeout(resolve, 1000));
                response = await api.getTranslation(submissionUID);
            }
            expect(response).toBeDefined();
            expect(response).toHaveProperty('translation_uid');
            expect(response.status).toEqual('completed');

        });

        it('Submit a translation with callback', async () => {
            const response = await api.submitTranslation(sampleSubmission,
                'https://webhook.site/ceb1e633-d047-4c5e-8e1d-5338df54edbf; rel="delivery-callback');
            expect(response).toBeDefined();
            expect(response).toHaveProperty('translation_uid');
        });

        // for now cancel will fail because the translation completes before we can cancel
        // once we have pipeline ids for pipelines with a human step, we should be good to test
        it.skip('Cancel a translation', async () => {
            const submission = await api.submitTranslation(sampleSubmission);
            expect(submission).toBeDefined();
            expect(submission).toHaveProperty('translation_uid');
            const response = await api.cancelTranslation(submission.translation_uid);
            expect(response).toBeDefined();
        });


    })
})
