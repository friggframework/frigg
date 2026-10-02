/**
 * Tests for ArtifactRepositoryS3
 *
 * The aws-sdk clients are never hit over the network: an S3 client with a
 * mocked send() is injected, and the presigner module (not installed in this
 * workspace) is virtually mocked so signedUrl stays offline.
 */
jest.mock(
    '@aws-sdk/s3-request-presigner',
    () => ({ getSignedUrl: jest.fn() }),
    { virtual: true }
);

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { ArtifactRepositoryS3 } = require('./artifact-repository-s3');

describe('ArtifactRepositoryS3', () => {
    let s3Client;

    beforeEach(() => {
        s3Client = { send: jest.fn().mockResolvedValue({}) };
        getSignedUrl.mockReset();
    });

    describe('put()', () => {
        it('writes a private, SSE-encrypted object and returns {bucket, key}', async () => {
            const repo = new ArtifactRepositoryS3({
                bucket: 'my-bucket',
                s3Client,
            });

            const ref = await repo.put(
                'reports/exec-1/sales-2026.csv',
                'a,b\n1,2\n',
                'text/csv'
            );

            expect(ref).toEqual({
                bucket: 'my-bucket',
                key: 'reports/exec-1/sales-2026.csv',
            });
            expect(s3Client.send).toHaveBeenCalledTimes(1);
            const command = s3Client.send.mock.calls[0][0];
            expect(command.input).toMatchObject({
                Bucket: 'my-bucket',
                Key: 'reports/exec-1/sales-2026.csv',
                Body: 'a,b\n1,2\n',
                ContentType: 'text/csv',
                ServerSideEncryption: 'AES256',
            });
            // Private object: never set an ACL.
            expect(command.input.ACL).toBeUndefined();
        });

        it('throws when no bucket is configured', async () => {
            const repo = new ArtifactRepositoryS3({
                bucket: undefined,
                s3Client,
            });

            await expect(
                repo.put('k', 'body', 'text/csv')
            ).rejects.toThrow(/REPORT_ARTIFACT_BUCKET/);
            expect(s3Client.send).not.toHaveBeenCalled();
        });
    });

    describe('signedUrl()', () => {
        it('presigns a GET for the referenced object', async () => {
            getSignedUrl.mockResolvedValue('https://signed.example/object');
            const repo = new ArtifactRepositoryS3({
                bucket: 'my-bucket',
                s3Client,
            });

            const url = await repo.signedUrl(
                { bucket: 'my-bucket', key: 'reports/exec-1/sales-2026.csv' },
                { expiresIn: 120 }
            );

            expect(url).toBe('https://signed.example/object');
            expect(getSignedUrl).toHaveBeenCalledTimes(1);
            const [, command, options] = getSignedUrl.mock.calls[0];
            expect(command.input).toMatchObject({
                Bucket: 'my-bucket',
                Key: 'reports/exec-1/sales-2026.csv',
            });
            expect(options).toEqual({ expiresIn: 120 });
        });
    });

    describe('get()', () => {
        it('returns the object body as a string', async () => {
            s3Client.send.mockResolvedValue({
                Body: { transformToString: async () => 'file-contents' },
            });
            const repo = new ArtifactRepositoryS3({
                bucket: 'my-bucket',
                s3Client,
            });

            const body = await repo.get('reports/exec-1/sales-2026.csv');

            expect(body).toBe('file-contents');
            const command = s3Client.send.mock.calls[0][0];
            expect(command.input).toMatchObject({
                Bucket: 'my-bucket',
                Key: 'reports/exec-1/sales-2026.csv',
            });
        });
    });
});
