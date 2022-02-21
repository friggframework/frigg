const chai = require('chai');
const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const should = chai.should();
const TestUtils = require('../utils/TestUtils');
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

const EntityPairs = [
    // { entityType: 'crossbeam', connectingEntityType: 'crossbeam' },
];

describe('auth router', async function () {
    this.timeout(35_000);
    before(async () => {
        // await (new User()).model.deleteMany();
        // this.userManager = await UserManager.createUser(loginCredentials);
        try {
            this.userManager = await UserManager.loginUser(loginCredentials);
        } catch {
            // User may not exist
            this.userManager = await UserManager.createIndividualUser(
                loginCredentials
            );
        }
        const res = await chai
            .request(app)
            .post('/user/login')
            .set('Content-Type', 'application/json')
            .send(loginCredentials);
        this.token = res.body.token;
    });

    it('should get the integration options', async () => {
        const res = await chai
            .request(app)
            .get('/api/integrations')
            .set('Content-Type', 'application/json')
            .set('Authorization', `Bearer ${this.token}`);

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
            const response = await Authenticator.oauth2(pair.auth_url);
            const baseArr = response.base.split('/');
            response.entityType = baseArr[baseArr.length - 1];
            delete response.base;
            // Will need to figure out how to add other credential types
            // such as API keys on this step.

            const res = await chai
                .request(app)
                .post('/api/authorize')
                .set('Content-Type', 'application/json')
                .set('Authorization', `Bearer ${this.token}`)
                .send(response);

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
                    .set('Authorization', `Bearer ${this.token}`)
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
                    .set('Authorization', `Bearer ${this.token}`)
                    .send({
                        entityType: pair.entityType,
                        data,
                    });

                pair.entity = res.body._id;
            }
        }
    });
});
