const { HaltError } = require('./halt-error');

describe('HaltError', () => {
    it('can be instantiated', () => {
        const rootError = new Error('Gremlinoids!!');
        const error = new HaltError('STOP', { cause: rootError });
        expect(error).toHaveProperty('message', 'STOP');
        expect(error).toHaveProperty('cause', rootError);
        expect(error).toHaveProperty('isHaltError', true);
    });
});
