const { messagesOfType, toMessageItem } = require('./message-item-shared');

describe('toMessageItem', () => {
    it('builds an item from the positional form', () => {
        expect(toMessageItem('Title', 'body', 1000)).toEqual({
            title: 'Title',
            message: 'body',
            timestamp: 1000,
        });
    });

    it('keeps an item object with its extra keys', () => {
        const item = {
            title: 'Rate limit reached',
            message: 'It resets at noon.',
            timestamp: 1000,
            code: 'RATE_LIMITED',
            actions: [{ type: 'RETRY_WHEN_READY' }],
        };

        expect(toMessageItem(item)).toEqual(item);
    });

    it('returns a copy of the item, not the object it was given', () => {
        const item = { title: 'Title', message: 'body', timestamp: 1000 };

        expect(toMessageItem(item)).not.toBe(item);
    });

    it('ignores the positional arguments when it is given an item', () => {
        const item = { title: 'Title', message: 'body', timestamp: 1000 };

        expect(toMessageItem(item, 'other body', 2000)).toEqual(item);
    });

    it.each([[null], [undefined], [''], ['Title']])(
        'reads %p as a title',
        (title) => {
            expect(toMessageItem(title, 'body', 1000)).toEqual({
                title,
                message: 'body',
                timestamp: 1000,
            });
        }
    );
});

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
