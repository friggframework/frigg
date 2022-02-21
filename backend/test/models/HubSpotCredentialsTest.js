const LHBaseModelObjectTest = require('../base/BaseModelObjectTest');

class HubSpotCredentialsTest extends LHBaseModelObjectTest {
    constructor(params) {
        super(params);
    }

    test() {
        super.test();
        this.run({
            name: this.name,
        });
    }
}

// const testObject = new HubSpotCredentialsTest(
//     {
//         portal_id: '16854218',
//         portal_name: 'Miguel97',

//         // HS Access Details
//         access_token: 'jwt',
//         refresh_token: 'jwt referesh',
//         expires_in: '2020-07-12',
//         expires_at: Date.now(),
//         auth_created_at: Date.now(),
//         authorized: true,
//         auth_is_valid: true,
//         user_name: 'Miguel',
//     },
// );
// testObject.test();

module.exports = HubSpotCredentialsTest;
