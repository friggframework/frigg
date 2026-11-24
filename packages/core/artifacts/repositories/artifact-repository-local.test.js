/**
 * Tests for ArtifactRepositoryLocal (filesystem adapter — no network).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    ArtifactRepositoryLocal,
} = require('./artifact-repository-local');

describe('ArtifactRepositoryLocal', () => {
    let baseDir;
    let repo;

    beforeEach(() => {
        baseDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'frigg-artifacts-test-')
        );
        repo = new ArtifactRepositoryLocal({ baseDir });
    });

    afterEach(() => {
        fs.rmSync(baseDir, { recursive: true, force: true });
    });

    it('put() writes the body under baseDir and returns a reference', async () => {
        const ref = await repo.put(
            'reports/exec-1/sales.csv',
            'a,b\n1,2\n',
            'text/csv'
        );

        expect(ref).toEqual({ bucket: baseDir, key: 'reports/exec-1/sales.csv' });
        const written = fs.readFileSync(
            path.join(baseDir, 'reports/exec-1/sales.csv'),
            'utf8'
        );
        expect(written).toBe('a,b\n1,2\n');
    });

    it('get() reads back what put() wrote', async () => {
        await repo.put('reports/exec-1/sales.csv', 'hello', 'text/csv');
        const body = await repo.get('reports/exec-1/sales.csv');
        expect(body).toBe('hello');
    });

    it('signedUrl() returns a file:// URL for the key', async () => {
        const ref = await repo.put('reports/exec-1/sales.csv', 'x', 'text/csv');
        const url = await repo.signedUrl(ref);
        expect(url).toBe(
            `file://${path.join(baseDir, 'reports/exec-1/sales.csv')}`
        );
    });
});
