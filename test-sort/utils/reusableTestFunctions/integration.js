const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

const Authenticator = require('../Authenticator');
const IntegrationFactory = require('../../../src/managers/integrations/IntegrationManager');

const testCreds = {
    client_id: process.env.CROSSBEAM_TEST_CLIENT_ID,
    client_secret: process.env.CROSSBEAM_TEST_CLIENT_SECRET,
};

class IntegrationTests {
    constructor(params) {
        this.app = params.app;
    }

    async createIntegrationPerEntity(_this, EntityPairs, orgUuid) {
        for (const pair of EntityPairs) {
            let authUrl;
            let requiredData;
            const res = await chai
                .request(this.app)
                .get('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${_this.token}`)
                .set('organization_uuid', orgUuid)
                .query(pair);
            res.status.should.equal(200);
            chai.assert.hasAllKeys(res.body, ['url', 'type']);
            if (res.body.type === 'oauth1' || res.body.type === 'oauth2')
                authUrl = res.body.url;
            if (res.body.type !== 'oauth1' && res.body.type !== 'oauth2')
                requiredData = res.body.data;
            const authType = res.body.type;

            if (authType !== 'oauth1' && authType !== 'oauth2') this.skip();
            const response = await Authenticator.oauth2(authUrl);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;
            chai.assert.hasAllKeys(response, ['entityType', 'data']);
            expect(response).to.have.nested.property('data.code');

            // Oauth/oauth2 approach

            // Will need to figure out how to add other credential types
            // such as API keys on this step.

            const authorizeRes = await chai
                .request(this.app)
                .post('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${_this.token}`)
                .set('organization_uuid', orgUuid)
                .send(response);

            chai.assert.hasAllKeys(authorizeRes.body, [
                'credential_id',
                'entity_id',
                'type',
            ]);
            const credentialId = authorizeRes.body.credential_id;
            const entityId = authorizeRes.body.entity_id;
            const xbeamBody = {
                entityType: 'crossbeam',
                data: {
                    credentialType: pair.entityType,
                    ...testCreds,
                },
            };
            const xbeamAuthorizeRes = await chai
                .request(this.app)
                .post('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${_this.token}`)
                .set('organization_uuid', orgUuid)
                .send(xbeamBody);

            chai.assert.hasAllKeys(xbeamAuthorizeRes.body, [
                'credential_id',
                'entity_id',
                'type',
            ]);

            const xbeamCredentialId = xbeamAuthorizeRes.body.credential_id;
            const xbeamEntityId = xbeamAuthorizeRes.body.entity_id;

            const integrationCreateBody = {
                entities: [xbeamEntityId, entityId],
                config: {
                    type: pair.entityType,
                    category: 'Example',
                },
            };
            const integrationRes = await chai
                .request(this.app)
                .post('/api/integrations')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${_this.token}`)
                .set('organization_uuid', orgUuid)
                .send(integrationCreateBody);

            chai.assert.hasAnyKeys(integrationRes.body, ['id']);
            _this.integrations.push(integrationRes.body);

            if (pair.entityType === 'rollworks') {
                const integrationManagerInstance =
                    await IntegrationFactory.getInstanceFromIntegrationId({
                        integrationId: integrationRes.body.id,
                    });

                const reports =
                    await integrationManagerInstance.primaryInstance.api.getReports();
                if (reports.items.length > 0) {
                    _this.reportId = reports.items[0].id;
                    _this.reportName = reports.items[0].name;
                }
                const config = {
                    type: 'rollworks',
                    advertisable_eid: '267UUCEJFNDBXGGISDRVXV', // Crossbeam Test
                    reports: [{ id: _this.reportId, name: _this.reportName }],
                };
                await integrationManagerInstance.processUpdate({ config });
            }
        }
    }

    async disconnectIntegrations(_this, orgUuid) {
        const integrations = _this.integrations ?? [];

        for (const integration of integrations) {
            const res = await chai
                .request(this.app)
                .delete(`/api/integrations/${integration.id}`)
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${_this.token}`)
                .set('organization_uuid', orgUuid);
            res.status.should.equal(201);
        }
    }
}

module.exports = IntegrationTests;
