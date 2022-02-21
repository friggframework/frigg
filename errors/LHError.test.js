const { LHError } = require('./LHError');

describe('LHError', () => {
    it('can be inherited and instantiated', () => {
        class XyzError extends LHError {}
        const error = new XyzError();
        expect(error).toHaveProperty('message', '');
        expect(error).toHaveProperty('stack');
        expect(error.stack).toContain('XyzError');
        expect(error.stack).toContain('at new XyzError');
        expect(error.stack).toContain('LHError.test.js:');
    });

    it('can set the error message', () => {
        class TestError extends LHError {}
        const error = new TestError('Goblins!');
        expect(error).toHaveProperty('message', 'Goblins!');
    });

    it('sets the error name correctly', () => {
        class TestError extends LHError {}
        const error = new TestError();
        expect(error).toHaveProperty('name', 'TestError');
    });

    it('can set the parent cause', () => {
        class TestError extends LHError {}
        const rootError = new Error('Davros!');
        const error = new TestError('Daleks!', { cause: rootError });
        expect(error).toHaveProperty('cause', rootError);
    });
});
