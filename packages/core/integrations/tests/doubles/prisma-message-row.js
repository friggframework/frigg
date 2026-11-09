const copy = (value) => JSON.parse(JSON.stringify(value));

function withMessageRow(repo, id, stored = {}) {
    const row = {
        id,
        errors: [],
        warnings: [],
        info: [],
        logs: [],
        ...stored,
    };
    repo.prisma = {
        integration: {
            findUnique: jest.fn(async () => copy(row)),
            update: jest.fn(async ({ data }) => {
                Object.assign(row, copy(data));
                return copy(row);
            }),
        },
    };
    return { repo, row };
}

module.exports = { withMessageRow };
