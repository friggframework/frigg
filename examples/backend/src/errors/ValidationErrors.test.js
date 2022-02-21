const chai = require('chai');
const {
    RequiredPropertyError,
    ParameterTypeError,
} = require('./ValidationErrors');

const { expect } = chai;

describe('RequiredPropertyError', () => {
    it('can be instantiated with default arguments', () => {
        const error = new RequiredPropertyError();
        expect(error).to.have.property(
            'message',
            'Key "" is a required parameter.'
        );
        expect(error).not.to.have.property('cause');
    });

    it('allows setting the key name of the error', () => {
        const error = new RequiredPropertyError({ key: 'abc' });
        expect(error).to.have.property(
            'message',
            'Key "abc" is a required parameter.'
        );
        expect(error).not.to.have.property('cause');
    });

    it('allows setting the parent of the error', () => {
        const error = new RequiredPropertyError({ parent: class Xyz {} });
        expect(error).to.have.property(
            'message',
            '(Xyz) Key "" is a required parameter.'
        );
        expect(error).not.to.have.property('cause');
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
        expect(error).to.have.property('message', expectedMessage);
        expect(error).to.have.property('cause');
        expect(error.cause).to.have.property('message', 'Gremlins!!');
    });
});

describe('ParameterTypeError', () => {
    it('can be instantiated with default arguments', () => {
        const error = new ParameterTypeError();
        expect(error).to.have.property(
            'message',
            'Expected value "" to be of type ""'
        );
        expect(error).not.to.have.property('cause');
    });

    it('allows setting the key name of the error', () => {
        const error = new ParameterTypeError({ key: 'abc' });
        expect(error).to.have.property(
            'message',
            'Expected key "abc" with value "" to be of type ""'
        );
        expect(error).not.to.have.property('cause');
    });

    it('allows setting the parent of the error', () => {
        const error = new ParameterTypeError({ parent: class Xyz {} });
        expect(error).to.have.property(
            'message',
            '(Xyz) Expected value "" to be of type ""'
        );
        expect(error).not.to.have.property('cause');
    });

    it('allows setting the value of the error', () => {
        const error = new ParameterTypeError({ value: 1 });
        expect(error).to.have.property(
            'message',
            'Expected value "1" to be of type ""'
        );
        expect(error).not.to.have.property('cause');
    });

    it('allows setting the expected type of the error', () => {
        const error = new ParameterTypeError({ expectedType: class Xyz {} });
        expect(error).to.have.property(
            'message',
            'Expected value "" to be of type "Xyz"'
        );
        expect(error).not.to.have.property('cause');
    });

    it('allows setting the expected type of the error to Array', () => {
        const error = new ParameterTypeError({ expectedType: Array });
        expect(error).to.have.property(
            'message',
            'Expected value "" to be of type "Array"'
        );
        expect(error).not.to.have.property('cause');
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
        expect(error).to.have.property('message', expectedMessage);
        expect(error).to.have.property('cause', rootError);
    });
});
