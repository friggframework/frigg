const fs = require('fs');
const dotenv = require('dotenv');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { logInfo } = require('./logger');
const { resolve } = require('node:path');
const { confirm, input } = require('@inquirer/prompts');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const extractRawEnvVariables = (modulePath) => {
    const filePath = resolve(modulePath, 'definition.js');

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const ast = parse(fileContent, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'], // Add more plugins if needed
    });

    const envVariables = {};

    traverse(ast, {
        ObjectProperty(path) {
            if (path.node.key.name === 'env') {
                path.node.value.properties.forEach((prop) => {
                    const key = prop.key.name;
                    if (prop.value.type === 'MemberExpression') {
                        const property = prop.value.property.name;
                        envVariables[key] = `${property}`;
                    } else if (prop.value.type === 'TemplateLiteral') {
                        // Handle template literals
                        const expressions = prop.value.expressions.map((exp) =>
                            exp.type === 'MemberExpression'
                                ? `${exp.property.name}`
                                : exp.name
                        );
                        envVariables[key] = expressions.join('');
                    }
                });
            }
        },
    });

    return envVariables;
};
const handleEnvVariables = async (backendPath, modulePath) => {
    logInfo('Searching for missing environment variables...');
    const Definition = { env: extractRawEnvVariables(modulePath) };
    if (Definition && Definition.env) {
        console.log('Here is Definition.env:', Definition.env);
        const envVars = Object.values(Definition.env);

        console.log(
            'Found the following environment variables in the API module:',
            envVars
        );

        const localEnvPath = resolve(backendPath, '../.env');
        const localDevConfigPath = resolve(
            backendPath,
            '../src/configs/dev.json'
        );

        // Load local .env variables
        let localEnvVars = {};
        if (existsSync(localEnvPath)) {
            localEnvVars = dotenv.parse(readFileSync(localEnvPath, 'utf8'));
        }

        // Load local dev.json variables
        let localDevConfig = {};
        if (existsSync(localDevConfigPath)) {
            localDevConfig = JSON.parse(
                readFileSync(localDevConfigPath, 'utf8')
            );
        }

        const missingEnvVars = envVars.filter(
            (envVar) => !localEnvVars[envVar] && !localDevConfig[envVar]
        );

        logInfo(`Missing environment variables: ${missingEnvVars.join(', ')}`);

        if (missingEnvVars.length > 0) {
            const addEnvVars = await confirm({
                message: `The following environment variables are required: ${missingEnvVars.join(
                    ', '
                )}. Do you want to add them now?`,
            });

            if (addEnvVars) {
                const envValues = {};
                for (const envVar of missingEnvVars) {
                    const value = await input({
                        type: 'input',
                        name: 'value',
                        message: `Enter value for ${envVar}:`,
                    });
                    envValues[envVar] = value;
                }

                // Add the envValues to the local .env file if it exists
                if (existsSync(localEnvPath)) {
                    const envContent = Object.entries(envValues)
                        .map(([key, value]) => `${key}=${value}`)
                        .join('\n');
                    fs.appendFileSync(localEnvPath, `\n${envContent}`);
                }

                // Add the envValues to the local dev.json file if it exists
                if (existsSync(localDevConfigPath)) {
                    const updatedDevConfig = {
                        ...localDevConfig,
                        ...envValues,
                    };
                    writeFileSync(
                        localDevConfigPath,
                        JSON.stringify(updatedDevConfig, null, 2)
                    );
                }
            } else {
                logInfo("Edit whenever you're able, safe travels friend!");
            }
        }
    }
};

module.exports = { handleEnvVariables };
