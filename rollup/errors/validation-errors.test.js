const {
    RequiredPropertyError,
    ParameterTypeError,
} = require('./validation-errors');

describe('RequiredPropertyError', () => {
    it('can be instantiated with default arguments', () => {
        const error = new RequiredPropertyError();
        expect(error).toHaveProperty(
            'message',
            'Key "" is a required parameter.'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('allows setting the key name of the error', () => {
        const error = new RequiredPropertyError({ key: 'abc' });
        expect(error).toHaveProperty(
            'message',
            'Key "abc" is a required parameter.'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('allows setting the parent of the error', () => {
        const error = new RequiredPropertyError({ parent: class Xyz {} });
        expect(error).toHaveProperty(
            'message',
            '(Xyz) Key "" is a required parameter.'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('passes cause through to the Error parent class', () => {
        const error = new RequiredPropertyError(
            {
                parent: class Qrs {},
                key: 'def',
            },
            { cause: new Error('Gremlins!!') }
        );
        const expectedMessage = '(Qrs) Key "def" is a required parameter.';
        expect(error).toHaveProperty('message', expectedMessage);
        expect(error).toHaveProperty('cause');
        expect(error.cause).toHaveProperty('message', 'Gremlins!!');
    });
});

describe('ParameterTypeError', () => {
    it('can be instantiated with default arguments', () => {
        const error = new ParameterTypeError();
        expect(error).toHaveProperty(
            'message',
            'Expected value "" to be of type ""'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('allows setting the key name of the error', () => {
        const error = new ParameterTypeError({ key: 'abc' });
        expect(error).toHaveProperty(
            'message',
            'Expected key "abc" with value "" to be of type ""'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('allows setting the parent of the error', () => {
        const error = new ParameterTypeError({ parent: class Xyz {} });
        expect(error).toHaveProperty(
            'message',
            '(Xyz) Expected value "" to be of type ""'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('allows setting the value of the error', () => {
        const error = new ParameterTypeError({ value: 1 });
        expect(error).toHaveProperty(
            'message',
            'Expected value "1" to be of type ""'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('allows setting the expected type of the error', () => {
        const error = new ParameterTypeError({ expectedType: class Xyz {} });
        expect(error).toHaveProperty(
            'message',
            'Expected value "" to be of type "Xyz"'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('allows setting the expected type of the error to Array', () => {
        const error = new ParameterTypeError({ expectedType: Array });
        expect(error).toHaveProperty(
            'message',
            'Expected value "" to be of type "Array"'
        );
        expect(error).not.toHaveProperty('cause');
    });

    it('passes cause through to the Error parent class', () => {
        const rootError = new Error('Gremlins!!');
        const error = new ParameterTypeError(
            {
                parent: class Parent {},
                key: 'clé',
                expectedType: class Expected {},
                value: 'schmalue',
            },
            { cause: rootError }
        );
        const expectedMessage =
            '(Parent) Expected key "clé" with value "schmalue" to be of type "Expected"';
        expect(error).toHaveProperty('message', expectedMessage);
        expect(error).toHaveProperty('cause', rootError);
    });
});
