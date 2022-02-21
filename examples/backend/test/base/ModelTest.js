const chai = require('chai');

const { expect } = chai;
const mongoose = require('mongoose');
const ModelTestUtils = require('../utils/ModelTestUtils');
const TestUtils = require('../utils/TestUtils');
const BaseClass = require('../../src/base/LHBaseClass');

class ModelTest extends BaseClass {
    constructor(params) {
        super(params);
        this.testObjectArr = this.getParam(params, 'testObjectArr');
        this.modelObject = this.getParam(params, 'modelObject');
        this.name = this.getParam(params, 'name');
        this.beforeMethod = this.getParam(params, 'beforeMethod', () => {});
        this.afterMethod = this.getParam(params, 'afterMethod', () => {});
    }

    run(params) {
        const name = this.getParam(params, 'name', this.name);
        const tests = this.getParam(params, 'tests', () => {});
        const localBeforeMethod = this.getParam(
            params,
            'beforeMethod',
            () => {}
        );
        const localAfterMethod = this.getParam(params, 'afterMethod', () => {});

        const _this = this;
        describe(name, async () => {
            beforeEach(async () => {
                this.testObjectArr = _this.testObjectArr;
                this.modelObject = _this.modelObject;
                await _this.beforeMethod.call(this);
                expect(this.testObjectArr.length).to.be.greaterThan(1);
                this.firstTestObject = this.testObjectArr[0];
                localBeforeMethod();
            });
            afterEach(async () => {
                await _this.afterMethod.call(this);
                await this.modelObject.model.deleteMany();
                localAfterMethod();
            });
            tests.call(this);
        });
    }

    test() {}
}

module.exports = ModelTest;
