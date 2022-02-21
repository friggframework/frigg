const chai = require('chai');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(require('chai-url'));

chai.use(chaiAsPromised);
const _ = require('lodash');

// const app = require('../../app.js');
// const auth = require('../../src/routers/auth');
// const user = require('../../src/routers/user');

// app.use(auth);
// app.use(user);

const Authenticator = require('../utils/Authenticator');
const UserManager = require('../../src/managers/UserManager');
const CrossbeamManager = require('../../src/managers/entities/CrossbeamManager.js');

const loginCredentials = { username: 'test', password: 'test' };

describe.skip('Crossbeam API 3', async () => {
    let xbeamManager;
    before(async () => {
        // await (new User()).model.deleteMany();
        // this.userManager = await UserManager.createUser(loginCredentials);
        try {
            this.userManager = await UserManager.loginUser(loginCredentials);
        } catch (e) {
            // User may not exist
            this.userManager = await UserManager.createUser(loginCredentials);
        }
        // const loginRes = await chai.request(app)
        //     .post('/user/login')
        //     .set('Content-Type', 'application/json')
        //     .send(loginCredentials);
        // this.token = loginRes.body.token;

        // let res = await chai.request(app)
        //     .get('/api/authorize')
        //     .set('Content-Type', 'application/json')
        //     .set('Authorization', `Bearer ${this.token}`)
        //     .query({entityType: "crossbeam", connectingEntityType: "crossbeam"});
        // res.status.should.equal(200);
        xbeamManager = await CrossbeamManager.getInstance({
            userId: this.userManager.getUserId(),
        });
        const res = await xbeamManager.getAuthorizationRequirements();

        chai.assert.hasAnyKeys(res, ['url', 'type']);
        const { url } = res;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        // res = await chai.request(app)
        //     .post('/api/authorize')
        //     .set('Content-Type', 'application/json')
        //     .set('Authorization', `Bearer ${this.token}`)
        //     .send(response);
        const ids = await xbeamManager.processAuthorizationCallback({
            userId: 0,
            data: response.data,
        });
        chai.assert.hasAnyKeys(ids, ['credential', 'entity', 'type']);

        // res = await chai.request(app)
        //     .get(`/api/entity/options/${ids.credential_id}`)
        //     .set('Content-Type', 'application/json')
        //     .set('Authorization', `Bearer ${this.token}`)
        //     .query({entityType: "crossbeam"});
        const options = await xbeamManager.getEntityOptions();

        // res = await chai.request(app)
        //     .post('/api/entity')
        //     .set('Content-Type', 'application/json')
        //     .set('Authorization', `Bearer ${this.token}`)
        //     .send({
        //         entityType: 'crossbeam',
        //         data: {
        //             credential_id: ids.credential_id,
        //             [options[0].key]: options[0].choices[0]
        //             //organization_id: ""
        //         }
        //     });
        const entity = await xbeamManager.findOrCreateEntity({
            credential_id: ids.credential_id,
            [options[0].key]: options[0].choices[0],
            // organization_id: ""
        });

        const user_id = this.userManager.getUserId();
        xbeamManager = await CrossbeamManager.getInstance({
            entityId: entity._id,
            userId: user_id,
        });
    });

    it('should go through Oauth flow', async () => {
        xbeamManager.should.have.property('userId');
        xbeamManager.should.have.property('entity');
    });

    it('should refresh and update invalid token', async () => {
        const pretoken = xbeamManager.api.access_token;
        xbeamManager.api.access_token = 'nolongervalid';
        const response = await xbeamManager.api.getUserDetails();
        response.should.have.property('user');
        response.should.have.property('authorizations');
        response.should.have.property('is_user_linkable');
        response.should.have.property('pending_invitations');

        const posttoken = xbeamManager.api.access_token;
        pretoken.should.not.equal(posttoken);
        const credential = await xbeamManager.credentialMO.get(
            xbeamManager.entity.credential
        );
        credential.access_token.should.equal(posttoken);

        return response;
    });

    it('should fail to refresh token and mark auth as invalid', async () => {
        try {
            xbeamManager.api.access_token = 'nolongervalid';
            xbeamManager.api.refresh_token = 'nolongervalideither';
            const response = await xbeamManager.api.getUserDetails();
        } catch (e) {
            e.message.should.equal(
                'CrossbeamAPI -- Error: Error Refreshing Credentials'
            );
            const credential = await xbeamManager.credentialMO.get(
                xbeamManager.entity.credential
            );
            credential.auth_is_valid.should.equal(false);
        }
    });
});
