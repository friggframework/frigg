const chai = require('chai');

const { expect } = chai;
const ModelTestUtils = require('../utils/ModelTestUtils');
const TestUtils = require('../utils/TestUtils');
const ModelTest = require('./ModelTest');
const BaseModelObject = require('../../src/base/LHBaseModelObject');

class BaseModelObjectTest extends ModelTest {
    constructor(params) {
        super(params);
    }

    test() {
        super.test();
        // this.run({
        //     name: `${this.name} -BaseModelObject `,
        //     tests() {
        //         it.skip('should create', async () => {
        //             const obj = await this.modelObject.create(TestUtils.deepCopy(this.firstTestObject));
        //             ModelTestUtils.compareDBObjectWithObject(obj, this.firstTestObject);
        //         });
        //         describe('with one object created', () => {
        //             beforeEach(async () => {
        //                 this.firstTestModelObject = await this.modelObject.create(this.firstTestObject);

        //                 this.secondTestObject = this.testObjectArr[1];
        //             });
        //             it('should get first object', async () => {
        //                 const obj = await this.modelObject.get(this.firstTestModelObject.id);
        //                 expect(obj.id).to.equal(this.firstTestModelObject.id);
        //             });

        //             it('should delete first object', async () => {
        //                 const id = await this.modelObject.delete(this.firstTestModelObject.id);
        //                 const obj = await this.modelObject.get(this.firstTestModelObject.id);
        //                 expect(obj).to.equal(null);
        //             });

        //             it('should list one object', async () => {
        //                 const objArr = await this.modelObject.list();
        //                 expect(objArr.length).to.equal(1);
        //             });

        //             it('should list two objects after adding one', async () => {
        //                 const obj = await this.modelObject.create(this.secondTestObject);
        //                 const objArr = await this.modelObject.list();

        //                 expect(objArr.length).to.equal(2);
        //             });

        //             it.skip('should update db object with second object', async () => {
        //                 // deep copy because we dont want to have time stamp added to the object
        //                 const obj = await this.modelObject.update(this.firstTestModelObject.id, TestUtils.deepCopy(this.secondTestObject));

        //                 ModelTestUtils.compareDBObjectWithObject(obj, this.secondTestObject);
        //             });
        //         });
        //     },
        // });
    }
}

const testObject = new BaseModelObjectTest({
    testObjectArr: [{}, {}],
    name: 'BaseModelObject',
    modelObject: new BaseModelObject(),
});

testObject.test();

module.exports = BaseModelObjectTest;
