const chai = require('chai');
const { HaltError } = require('./HaltError');

const { expect } = chai;

describe('HaltError', () => {
    it('can be instantiated', () => {
        const rootError = new Error('Gremlinoids!!');
        const error = new HaltError('STOP', { cause: rootError });
        expect(error).to.have.property('message', 'STOP');
        expect(error).to.have.property('cause', rootError);
        expect(error).to.have.property('isHaltError', true);
    });
});
