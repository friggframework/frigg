const { handleEnvVariables } = require('./environment-variables');
const { logInfo } = require('./logger');
const inquirer = require('inquirer');
const fs = require('fs');
const dotenv = require('dotenv');
const { resolve } = require('node:path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse');

jest.mock('inquirer');
jest.mock('fs');
jest.mock('dotenv');
jest.mock('./logger');
jest.mock('@babel/parser');
jest.mock('@babel/traverse');

describe('handleEnvVariables', () => {
    const backendPath = '/mock/backend/path';
    const modulePath = '/mock/module/path';

    beforeEach(() => {
        jest.clearAllMocks();
        fs.readFileSync.mockReturnValue(`
            const Definition = {
                env: {
                    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
                    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
                    redirect_uri: \`\${process.env.REDIRECT_URI}/google-calendar\`,
                    scope: process.env.GOOGLE_CALENDAR_SCOPE,
                }
            };
        `);
        parse.mockReturnValue({});
        traverse.default.mockImplementation((ast, visitor) => {
            visitor.ObjectProperty({
                node: {
                    key: { name: 'env' },
                    value: {
                        properties: [
                            {
                                key: { name: 'client_id' },
                                value: {
                                    type: 'MemberExpression',
                                    object: { name: 'process' },
                                    property: {
                                        name: 'GOOGLE_CALENDAR_CLIENT_ID',
                                    },
                                },
                            },
                            {
                                key: { name: 'client_secret' },
                                value: {
                                    type: 'MemberExpression',
                                    object: { name: 'process' },
                                    property: {
                                        name: 'GOOGLE_CALENDAR_CLIENT_SECRET',
                                    },
                                },
                            },
                            {
                                key: { name: 'redirect_uri' },
                                value: {
                                    type: 'MemberExpression',
                                    object: { name: 'process' },
                                    property: { name: 'REDIRECT_URI' },
                                },
                            },
                            {
                                key: { name: 'scope' },
                                value: {
                                    type: 'MemberExpression',
                                    object: { name: 'process' },
                                    property: { name: 'GOOGLE_CALENDAR_SCOPE' },
                                },
                            },
                        ],
                    },
                },
            });
        });
    });

    xit('should identify and handle missing environment variables', async () => {
        const localEnvPath = resolve(backendPath, '../.env');
        const localDevConfigPath = resolve(
            backendPath,
            '../src/configs/dev.json'
        );

        fs.existsSync.mockImplementation(
            (path) => path === localEnvPath || path === localDevConfigPath
        );
        dotenv.parse.mockReturnValue({});
        fs.readFileSync.mockImplementation((path) => {
            if (path === resolve(modulePath, 'index.js'))
                return 'mock module content';
            if (path === localEnvPath) return '';
            if (path === localDevConfigPath) return '{}';
            return '';
        });

        inquirer.prompt
            .mockResolvedValueOnce({ addEnvVars: true })
            .mockResolvedValueOnce({ value: 'client_id_value' })
            .mockResolvedValueOnce({ value: 'client_secret_value' })
            .mockResolvedValueOnce({ value: 'redirect_uri_value' })
            .mockResolvedValueOnce({ value: 'scope_value' });

        await handleEnvVariables(backendPath, modulePath);

        expect(logInfo).toHaveBeenCalledWith(
            'Searching for missing environment variables...'
        );
        expect(logInfo).toHaveBeenCalledWith(
            'Missing environment variables: GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, REDIRECT_URI, GOOGLE_CALENDAR_SCOPE'
        );
        expect(inquirer.prompt).toHaveBeenCalledTimes(5);
        expect(fs.appendFileSync).toHaveBeenCalledWith(
            localEnvPath,
            '\nGOOGLE_CALENDAR_CLIENT_ID=client_id_value\nGOOGLE_CALENDAR_CLIENT_SECRET=client_secret_value\nREDIRECT_URI=redirect_uri_value\nGOOGLE_CALENDAR_SCOPE=scope_value'
        );
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            localDevConfigPath,
            JSON.stringify(
                {
                    GOOGLE_CALENDAR_CLIENT_ID: 'client_id_value',
                    GOOGLE_CALENDAR_CLIENT_SECRET: 'client_secret_value',
                    REDIRECT_URI: 'redirect_uri_value',
                    GOOGLE_CALENDAR_SCOPE: 'scope_value',
                },
                null,
                2
            )
        );
    });
});
