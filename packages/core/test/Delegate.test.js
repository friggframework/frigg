const { Delegate } = require('../Delegate');

describe('Delegate tests', ()=> {
    describe('Test the delegate constructor', () => {
        it('Empty', ()=> {
            const delegate = new Delegate();
            expect(delegate.delegate).toBeDefined();
            expect(delegate.delegateTypes).toBeDefined();
            expect(delegate.delegateTypes).toHaveLength(0);
        });
        it('Supplied delegate', ()=> {
            const delegate1 = new Delegate();
            const delegate2 = new Delegate({delegate: delegate1})
            expect(delegate1.delegate).toBeDefined();
            expect(delegate2.delegate).toStrictEqual(delegate1)
            expect(delegate1.delegateTypes).toBeDefined();
            expect(delegate1.delegateTypes).toHaveLength(0);
        });
        it('Supplied events', ()=> {
            const delegate = new Delegate({events: ['anEvent','anotherEvent']})
            expect(delegate.delegate).toBeDefined();
            expect(delegate.delegateTypes).toBeDefined();
            expect(delegate.delegateTypes).toHaveLength(2);
        });

    })
})
