require('../../setupEnv.js');
const chai = require('chai');
const BaseModelObjectTest = require('../base/BaseModelObjectTest');
const ModelTestUtils = require('../utils/ModelTestUtils');
const User = require('../../src/models/User');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

class UserTest extends BaseModelObjectTest {
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

const testObject = new UserTest({
    testObjectArr: [
        {
            username: 'admin',
            hashword: 'test',
        },
        {
            username: 'user1',
            hashword: 'test2',
        },
    ],

    name: 'UserTest',
    modelObject: new User(),
});
testObject.test();

module.exports = UserTest;
