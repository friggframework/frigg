const { connectToDatabase } = require('@friggframework/core');
/**
 * @group interactive
 */

const chai = require('chai');
const chaiHttp = require('chai-http');
const should = chai.should();

chai.use(chaiHttp);

const { createApp } = require('../../app.js');
const auth = require('../../src/routers/auth');
const user = require('../../src/routers/user');

const app = createApp((app) => {
    app.use(auth);
    app.use(user);
});

const Authenticator = require('../utils/Authenticator');
const UserManager = require('../../src/managers/UserManager');
const User = require('../../src/models/User');

const loginCredentials = { username: 'test' + Date.now(), password: 'test' };
const primaryDetails = {
    entityType: 'connectwise',
    data: {
        site: process.env.CWISE_SITE,
        company_id: process.env.CWISE_COMPANY_ID,
        public_key: process.env.CWISE_PUBLIC_KEY,
        private_key: process.env.CWISE_SECRET_KEY
    }
}
const EntityPairs = [
    { entityType: 'salesforce'}
];

describe('auth router', () => {
    let testContext;

    beforeAll(async () => {
        await connectToDatabase()
        testContext = {};
    });

    beforeAll(async () => {
        // await (new User()).model.deleteMany();
        // this.userManager = await UserManager.createUser(loginCredentials);
        try {
            testContext.userManager = await UserManager.loginUser(
                loginCredentials
            );
        } catch {
            // User may not exist
            testContext.userManager = await UserManager.createIndividualUser(
                loginCredentials
            );
        }
        const res = await chai
            .request(app)
            .post('/user/login')
            .set('Content-Type', 'application/json')
            .send(loginCredentials);
        testContext.token = res.body.token;

        const options = await chai
            .request(app)
            .get('/api/authorize')
            .query({
                entityType: primaryDetails.entityType
            })
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${testContext.token}`);


    });

    it('should get the integration options', async () => {
        const res = await chai
            .request(app)
            .get('/api/integrations')
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${testContext.token}`);

        res.status.should.equal(200);
        chai.assert.hasAnyKeys(res.body, ['entities', 'integrations']);
        chai.assert.hasAnyKeys(res.body.entities, [
            'primary',
            'options',
            'authorized',
        ]);
    });

    it('test auth redirect/callback', async () => {
        for (const pair of EntityPairs) {
            // Oauth/oauth2 approach
            const authOptions = await chai
                .request(app)
                .get('/api/authorize')
                .query({
                    entityType: pair.entityType,
                    connectingEntityType: pair.connectingEntityType
                })
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${testContext.token}`);
            let authBody;
            if(authOptions.body.type === 'oauth2') {
                const response = await Authenticator.oauth2(authOptions.body.url);
                const baseArr = response.base.split('/');
                response.entityType = baseArr[baseArr.length - 1];
                delete response.base;
                authBody = response
            } else {
                // Assume dev has provided a valid set of auth keys needed for the given integration and pass it in
                authBody = pair
            }
            const res = await chai
                .request(app)
                .post('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${testContext.token}`)
                .send(authBody);

            chai.assert.hasAnyKeys(res.body, ['credential', 'entity', 'type']);
            pair.credential = res.body.credential_id;
            if (res.body.entity_id) {
                pair.entity = res.body.entity_id;
            }
        }
    });

    it('should get entity options by credential', async () => {
        for (const pair of EntityPairs) {
            if (!pair.entity) {
                const res = await chai
                    .request(app)
                    .get(`/api/entity/options/${pair.credential}`)
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${testContext.token}`)
                    .query(pair);
                pair.choice_keys = res.body.map((field) => field.key);
                pair.first_choice_values = res.body.map(
                    (field) => field.choices[0]
                );
                pair.choice_keys.length.should.equal(
                    pair.first_choice_values.length
                );
            }
        }
    });

    it('should create an entity', async () => {
        for (const pair of EntityPairs) {
            if (!pair.entity) {
                const data = {
                    credential_id: pair.credential,
                };
                for (let i = 0; i < pair.choice_keys.length; i++) {
                    data[pair.choice_keys[i]] = pair.first_choice_values[i];
                }

                res = await chai
                    .request(app)
                    .post('/api/entity')
                    .set('Content-Type', 'application/json')
                    .set('Authorization', `Bearer ${testContext.token}`)
                    .send({
                        entityType: pair.entityType,
                        data,
                    });

                pair.entity = res.body._id;
            }
        }
    });
});
