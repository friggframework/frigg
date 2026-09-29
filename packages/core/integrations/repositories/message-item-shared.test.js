const { messagesOfType } = require('./message-item-shared');

describe('messagesOfType', () => {
    it('returns the stored list of the type', () => {
        const warnings = [
            { title: 'Stored', message: 'warning', timestamp: 1 },
        ];

        expect(messagesOfType({ warnings }, 'warnings')).toBe(warnings);
    });

    it.each([[undefined], [null], [{}], ['text']])(
        'returns an empty list when the type holds %p',
        (stored) => {
            expect(messagesOfType({ warnings: stored }, 'warnings')).toEqual(
                []
            );
        }
    );
});
