interface SecretsMap {
    [key: string]: string;
}

const getSecretValue = async (): Promise<SecretsMap> => {
    console.log('Fetching secrets...');

    const httpPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || 2773;
    const url = `http://localhost:${httpPort}/secretsmanager/get?secretId=${encodeURIComponent(
        process.env.SECRET_ARN!
    )}`;
    const options: RequestInit = {
        headers: {
            'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN!,
        },
        method: 'GET',
    };

    const response = await fetch(url, options);

    if (!response.ok) {
        const json = await response.json().catch((err: Error) => err.message);
        console.error('Invalid response - response:', JSON.stringify(response));
        console.error('Invalid response - json:', json);
        throw new Error(`Invalid ${response.status} response`);
    }

    const result = await response.json() as { SecretString: string };

    if (!result) {
        throw new Error('Error getting secret');
    }

    return JSON.parse(result.SecretString) as SecretsMap;
};

const transformSecrets = (secrets: SecretsMap): void => {
    Object.keys(secrets).forEach((key) => {
        process.env[key] = secrets[key];
    });
};

/**
 * Middleware that gets the secrets from Lambda layer and transform into environment variables.
 */
export const secretsToEnv = async (): Promise<SecretsMap | undefined> => {
    if (!process.env.SECRET_ARN) {
        return;
    }
    console.log('Secrets to env');

    try {
        const secrets = await getSecretValue();
        transformSecrets(secrets);

        return secrets;
    } catch (err) {
        throw err;
    }
};

