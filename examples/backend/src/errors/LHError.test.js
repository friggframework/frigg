const chai = require('chai');
const { LHError } = require('./LHError');

const { expect } = chai;

describe('LHError', () => {
    it('can be inherited and instantiated', () => {
        class XyzError extends LHError {}
        const error = new XyzError();
        expect(error).to.have.property('message', '');
        expect(error).to.have.property('stack');
        expect(error.stack).to.include('XyzError\n    at new XyzError');
        expect(error.stack).to.include('backend/src/errors/LHError.test.js:');
    });

    it('can set the error message', () => {
        class TestError extends LHError {}
        const error = new TestError('Goblins!');
        expect(error).to.have.property('message', 'Goblins!');
    });

    it('sets the error name correctly', () => {
        class TestError extends LHError {}
        const error = new TestError();
        expect(error).to.have.property('name', 'TestError');
    });

    it('can set the parent cause', () => {
        class TestError extends LHError {}
        const rootError = new Error('Davros!');
        const error = new TestError('Daleks!', { cause: rootError });
        expect(error).to.have.property('cause', rootError);
    });
});
