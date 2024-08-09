const getSecretValue = async () => {
    console.log('Fetching secrets...');

    const httpPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || 2773;
    const url = `http://localhost:${httpPort}/secretsmanager/get?secretId=${encodeURIComponent(
        process.env.SECRET_ARN
    )}`;
    const options = {
        headers: {
            'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN,
        },
        method: 'GET',
    };

    const response = await fetch(url, options);

    if (!response.ok) {
        const json = await response.json().catch((err) => err.message);
        console.error('Invalid response - response:', JSON.stringify(response));
        console.error('Invalid response - json:', json);
        throw new Error(`Invalid ${response.status} response`);
    }

    const result = await response.json();

    if (!result) {
        throw new Error('Error getting secret', result);
    }

    return JSON.parse(result.SecretString);
};

const transformSecrets = (secrets) => {
    Object.keys(secrets).forEach((key) => {
        process.env[key] = secrets[key];
    });
};

/**
 * Middleware that gets the secrets from Lambda layer and transform into environment variables.
 *
 */
const secretsToEnv = async () => {
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

module.exports = {
    secretsToEnv,
};
