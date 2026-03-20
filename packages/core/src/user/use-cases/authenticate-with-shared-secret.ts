import Boom from '@hapi/boom';

export class AuthenticateWithSharedSecret {
    async execute(providedSecret: string): Promise<boolean> {
        const expectedSecret = process.env.FRIGG_API_KEY;
        if (!expectedSecret) {
            throw Boom.badImplementation(
                'FRIGG_API_KEY environment variable is not configured. ' +
                'Set FRIGG_API_KEY to enable shared secret authentication.'
            );
        }

        if (!providedSecret || providedSecret !== expectedSecret) {
            throw Boom.unauthorized('Invalid API key');
        }

        return true;
    }
}
