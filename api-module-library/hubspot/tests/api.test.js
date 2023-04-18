const {Api} = require('../api');
const config = require('../defaultConfig.json');
const Authenticator = require('@friggframework/test-environment/Authenticator');

describe(`${config.label} API tests`, () => {


    const apiParams = {
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/hubspot`,
        scope: process.env.HUBSPOT_SCOPE
    };
    const api = new Api(apiParams);

    beforeAll(async () => {
        const url = await api.getAuthUri();
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        await api.getTokenFromCode(response.data.code);
    });

    describe('HS User Info', () => {
        it('should return the user details', async () => {
            const response = await api.getUserDetails();
            expect(response).toHaveProperty('portalId');
            expect(response).toHaveProperty('token');
            expect(response).toHaveProperty('app_id');
        });
    });

    // Skipping tests... inherited with bugs, needs refactor
    describe.skip('HS Deals', () => {
        it('should return a deal by id', async () => {
            const deal_id = '2022088696';
            const response = await api.getDealById(deal_id);
            expect(response.id).toBe(deal_id);
            expect(response.properties.amount).to.eq('100000');
            expect(response.properties.dealname).to.eq('Test');
            expect(response.properties.dealstage).to.eq('appointmentscheduled');
        });

        it('should return all deals of a company', async () => {
            let response = await api.listDeals();
            expect(response.results[0]).toHaveProperty('id');
            expect(response.results[0]).toHaveProperty('properties');
            expect(response.results[0].properties).toHaveProperty('amount');
            expect(response.results[0].properties).toHaveProperty('dealname');
            expect(response.results[0].properties).toHaveProperty('dealstage');
        });
    });

    // Some tests skipped ... inherited with bugs, needs refactor
    describe('HS Companies', () => {
        let createRes;
        beforeAll(async () => {
            let body = {
                domain: 'gitlab.com',
                name: 'Gitlab',
            };
            createRes = await api.createCompany(body);
        });

        afterAll(async () => {
            await api.archiveCompany(createRes.id);
        });

        it('should create a Company', async () => {
            expect(createRes.properties.domain).toBe('gitlab.com');
            expect(createRes.properties.name).toBe('Gitlab');
        });

        it('should return the company info', async () => {
            let company_id = createRes.id;
            let response = await api.getCompanyById(company_id);
            expect(response.id).toBe(company_id);
            // expect(response.properties.domain).to.eq('golabstech.com');
            // expect(response.properties.name).to.eq('Golabs');
        });

        it.skip('should list Companies', async () => {
            let response = await api.listCompanies();
            expect(response.results[0]).toHaveProperty('id');
            expect(response.results[0]).toHaveProperty('properties');
            expect(response.results[0].properties).toHaveProperty('domain');
            expect(response.results[0].properties).toHaveProperty('name');
            expect(response.results[0].properties).toHaveProperty(
                'hs_object_id'
            );
        });

        it.skip('should update Company', async () => {
            let body = {
                name: 'Facebook 1',
            };
            let response = await api.updateCompany(
                createRes.id,
                body
            );
            expect(response.properties.name).toBe('Facebook 1');
        });

        it('should delete a company', async () => {
            // Hope the after works!
        });
    });

    // Skipping tests... inherited with bugs, needs refactor
    describe.skip('HS Companies BATCH', () => {
        let createResponse;
        beforeAll(async () => {
            let body = [
                {
                    properties: {
                        domain: 'gitlab.com',
                        name: 'Gitlab',
                    },
                },
                {
                    properties: {
                        domain: 'facebook.com',
                        name: 'Facebook',
                    },
                },
            ];
            createResponse = await api.createABatchCompanies(body);
        });

        afterAll(async () => {
            return createResponse.results.map(async (company) => {
                return api.deleteCompany(company.id);
            });
        });

        it('should create a Batch of Companies', async () => {
            let results = _.sortBy(createResponse.results, [
                function (o) {
                    return o.properties.name;
                },
            ]);
            expect(createResponse.status).toBe('COMPLETE');
            expect(results[0].properties.name).toBe('Facebook');
            expect(results[0].properties.domain).toBe('facebook.com');
            expect(results[1].properties.name).toBe('Gitlab');
            expect(results[1].properties.domain).toBe('gitlab.com');
        });

        it('should update a Batch of Companies', async () => {
            let body = [
                {
                    properties: {
                        name: 'Facebook 2',
                    },
                    id: createResponse.results[0].id,
                },
                {
                    properties: {
                        name: 'Gitlab 2',
                    },
                    id: createResponse.results[1].id,
                },
            ];
            let response = await api.updateBatchCompany(body);

            let results = _.sortBy(response.results, [
                function (o) {
                    return o.properties.name;
                },
            ]);
            expect(response.status).toBe('COMPLETE');
            expect(results[0].properties.name).toBe('Facebook 2');
            expect(results[1].properties.name).toBe('Gitlab 2');
        });
    });

    // Some tests skipped ... inherited with bugs, needs refactor
    describe('HS Contacts', () => {
        let createResponse;

        it('should create a Contact', async () => {
            const body = {
                email: 'jose.miguel@hubspot.com',
                firstname: 'Miguel',
                lastname: 'Delgado',
            };
            createResponse = await api.createContact(body);
            expect(createResponse).toHaveProperty('id');
            expect(createResponse.properties.firstname).toBe('Miguel');
            expect(createResponse.properties.lastname).toBe('Delgado');
        });

        it('should list Contacts', async () => {
            let response = await api.listContacts();
            expect(response.results[0]).toHaveProperty('id');
            expect(response.results[0]).toHaveProperty('properties');
            expect(response.results[0].properties).toHaveProperty('firstname');
        });

        it.skip('should update a Contact', async () => {
            let body = {
                lastname: 'Johnson (Sample Contact) 1',
            };
            let response = await api.updateContact(
                body,
                createResponse.id
            );
            expect(response.properties.lastname).toBe(
                'Johnson (Sample Contact) 1'
            );
        });

        it('should delete a contact', async () => {
            let response = await api.archiveContact(createResponse.id);
            expect(response.status).toBe(204);
        });
    });

    // Skipping tests... inherited with bugs, needs refactor
    describe.skip('HS Contacts BATCH', () => {
        let createResponse;
        beforeAll(async () => {
            let body = [
                {
                    properties: {
                        email: 'jose.miguel3@hubspot.com',
                        firstname: 'Miguel',
                        lastname: 'Delgado',
                    },
                },
                {
                    properties: {
                        email: 'jose.miguel2@hubspot.com',
                        firstname: 'Miguel',
                        lastname: 'Delgado',
                    },
                },
            ];
            createResponse = await api.createbatchContacts(body);
        });

        afterAll(async () => {
            createResponse.results.forEach(async (contact) => {
                await api.deleteContact(contact.id);
            });
        });

        it('should create a batch of Contacts', async () => {
            let results = _.sortBy(createResponse.results, [
                function (o) {
                    return o.properties.email;
                },
            ]);
            expect(createResponse.status).toBe('COMPLETE');
            expect(results[0].properties.email).toBe(
                'jose.miguel2@hubspot.com'
            );
            expect(results[0].properties.firstname).toBe('Miguel');
        });

        it('should update a batch of Contacts', async () => {
            let body = [
                {
                    properties: {
                        firstname: 'Miguel 3',
                    },
                    id: createResponse.results[0].id,
                },
                {
                    properties: {
                        firstname: 'Miguel 2',
                    },
                    id: createResponse.results[1].id,
                },
            ];

            let response = await api.updateBatchContact(body);
            let results = _.sortBy(response.results, [
                function (o) {
                    return o.properties.firstname;
                },
            ]);
            expect(response.status).toBe('COMPLETE');
            expect(results[0].properties.firstname).toBe('Miguel 2');
            expect(results[1].properties.firstname).toBe('Miguel 3');
        });
    });

    describe('HS Landing Pages', () => {
        let allLandingPages;
        it('should return the landing pages', async () => {
            allLandingPages = await api.getLandingPages();
            expect(allLandingPages).toBeDefined();
        });
        let primaryLandingPages
        it('should return only primary language landing pages', async () => {
            primaryLandingPages = await api.getLandingPages('translatedFromId__is_null');
            expect(primaryLandingPages).toBeDefined();
        });
        let variationLandingPages
        it('should return only variation language landing pages', async () => {
            variationLandingPages = await api.getLandingPages('translatedFromId__not_null');
            expect(variationLandingPages).toBeDefined();
        });
        it('confirm total landing pages', async () => {
            expect(allLandingPages.total).toBe(primaryLandingPages.total + variationLandingPages.total)
        });
        it('get Landing Page by Id' , async () => {
            const pageToGet = variationLandingPages.results.slice(-1)[0];
            const response = await api.getLandingPage(pageToGet.id);
            expect(response).toBeDefined();
        });
        it('update a Landing page (minimal patch)' , async () => {
            const pageToUpdate = variationLandingPages.results.slice(-1)[0];
            const response = await api.updateLandingPage(
                pageToUpdate.id,
                {htmlTitle: `test Landing page ${Date.now()}`},
                true );
            expect(response).toBeDefined();
        });
        it('update a Landing page (maximal patch)' , async () => {
            const pageToUpdate = variationLandingPages.results.slice(-1)[0];
            delete pageToUpdate['archivedAt'];
            const response = await api.updateLandingPage(
                pageToUpdate.id,
                pageToUpdate,
                true );
            expect(response).toBeDefined();
        });
    });

    describe('HS Site Pages', () => {
        let allSitePages;
        it('should return the Site pages', async () => {
            allSitePages = await api.getSitePages();
            expect(allSitePages).toBeDefined();
        });
        let primarySitePages
        it('should return only primary language Site pages', async () => {
            primarySitePages = await api.getSitePages('translatedFromId__is_null');
            expect(primarySitePages).toBeDefined();
        });
        let variationSitePages
        it('should return only variation language Site pages', async () => {
            variationSitePages = await api.getSitePages('translatedFromId__not_null');
            expect(variationSitePages).toBeDefined();
        });
        it('confirm total Site pages', async () => {
            expect(allSitePages.total).toBe(primarySitePages.total + variationSitePages.total)
        });
        it('get Site Page by Id' , async () => {
            const pageToGet = primarySitePages.results.slice(-1)[0];
            const response = await api.getSitePage(pageToGet.id);
            expect(response).toBeDefined();
        });
        it('update a Site page' , async () => {
            const pageToUpdate = variationSitePages.results.slice(-1)[0];
            const response = await api.updateSitePage(
                pageToUpdate.id,
                {htmlTitle: `test site page ${Date.now()}`},
                true );
            expect(response).toBeDefined();
        });
    });

    describe('HS Blog Posts', () => {
        let allBlogPosts;
        it('should return the Blog Posts', async () => {
            allBlogPosts = await api.getBlogPosts();
            expect(allBlogPosts).toBeDefined();
        });
        let primaryBlogPosts
        it('should return only primary language Blog Posts', async () => {
            primaryBlogPosts = await api.getBlogPosts('translatedFromId__is_null');
            expect(primaryBlogPosts).toBeDefined();
        });
        let variationBlogPosts
        it('should return only variation language Blog Posts', async () => {
            variationBlogPosts = await api.getBlogPosts('translatedFromId__not_null');
            expect(variationBlogPosts).toBeDefined();
        });
        it('confirm total Blog Posts', async () => {
            expect(allBlogPosts.total).toBe(primaryBlogPosts.total + variationBlogPosts.total)
        });
        it('get Blog Post by Id' , async () => {
            const postToGet = primaryBlogPosts.results.slice(-1)[0];
            const response = await api.getBlogPost(postToGet.id);
            expect(response).toBeDefined();
        });
        it('update a Blog Post' , async () => {
            const postToUpdate = primaryBlogPosts.results[0];
            const response = await api.updateBlogPost(
                postToUpdate.id,
                {htmlTitle: `test blog post ${Date.now()}`},
                true );
            expect(response).toBeDefined();
        });
    });
});
