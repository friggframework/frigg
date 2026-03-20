import Boom from '@hapi/boom';
import { AuthenticateWithSharedSecret } from './authenticate-with-shared-secret';

describe('AuthenticateWithSharedSecret', () => {
    let authenticateWithSharedSecret: InstanceType<typeof AuthenticateWithSharedSecret>;

    beforeEach(() => {
        process.env.FRIGG_API_KEY = 'test-secret-key';

        authenticateWithSharedSecret = new AuthenticateWithSharedSecret();
    });

    afterEach(() => {
        delete process.env.FRIGG_API_KEY;
        jest.clearAllMocks();
    });

    describe('Secret Validation', () => {
        it('should throw 500 if FRIGG_API_KEY environment variable is not set', async () => {
            delete process.env.FRIGG_API_KEY;

            await expect(
                authenticateWithSharedSecret.execute('any-secret')
            ).rejects.toThrow(Boom.badImplementation('FRIGG_API_KEY environment variable is not configured. Set FRIGG_API_KEY to enable shared secret authentication.'));
        });

        it('should throw 401 if provided secret is empty', async () => {
            await expect(
                authenticateWithSharedSecret.execute('')
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });

        it('should throw 401 if provided secret is null', async () => {
            await expect(
                authenticateWithSharedSecret.execute(null as any)
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });

        it('should throw 401 if provided secret does not match', async () => {
            await expect(
                authenticateWithSharedSecret.execute('wrong-secret')
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });

        it('should return true when provided secret matches', async () => {
            const result = await authenticateWithSharedSecret.execute('test-secret-key');

            expect(result).toBe(true);
        });

        it('should validate multiple times with same secret', async () => {
            const result1 = await authenticateWithSharedSecret.execute('test-secret-key');
            const result2 = await authenticateWithSharedSecret.execute('test-secret-key');

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        it('should be case-sensitive', async () => {
            await expect(
                authenticateWithSharedSecret.execute('TEST-SECRET-KEY')
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });

        it('should not trim whitespace', async () => {
            await expect(
                authenticateWithSharedSecret.execute(' test-secret-key ')
            ).rejects.toThrow(Boom.unauthorized('Invalid API key'));
        });
    });

    describe('Error Handling', () => {
        it('should provide helpful error message when FRIGG_API_KEY not configured', async () => {
            delete process.env.FRIGG_API_KEY;

            try {
                await authenticateWithSharedSecret.execute('any-secret');
                fail('Should have thrown error');
            } catch (error: any) {
                expect(error.message).toContain('FRIGG_API_KEY environment variable is not configured');
                expect(error.message).toContain('Set FRIGG_API_KEY to enable shared secret authentication');
                expect(error.output.statusCode).toBe(500);
            }
        });

        it('should provide generic error message on invalid secret', async () => {
            try {
                await authenticateWithSharedSecret.execute('wrong-secret');
                fail('Should have thrown error');
            } catch (error: any) {
                expect(error.message).toBe('Invalid API key');
                expect(error.output.statusCode).toBe(401);
            }
        });
    });

    describe('Security', () => {
        it('should not expose expected secret in error messages', async () => {
            process.env.FRIGG_API_KEY = 'super-secret-production-key';

            try {
                await authenticateWithSharedSecret.execute('wrong-key');
                fail('Should have thrown error');
            } catch (error: any) {
                expect(error.message).not.toContain('super-secret-production-key');
                expect(error.message).toBe('Invalid API key');
            }
        });

        it('should handle special characters in secret', async () => {
            process.env.FRIGG_API_KEY = 'test-key-with-$pecial-ch@rs!';

            const result = await authenticateWithSharedSecret.execute('test-key-with-$pecial-ch@rs!');

            expect(result).toBe(true);
        });

        it('should handle very long secrets', async () => {
            const longSecret = 'a'.repeat(1000);
            process.env.FRIGG_API_KEY = longSecret;

            const result = await authenticateWithSharedSecret.execute(longSecret);

            expect(result).toBe(true);
        });
    });
});
