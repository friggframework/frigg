const nock = require('nock');
const { Authenticator } = require('@friggframework/test');
const { join: joinPath } = require('path');
const { parse: parseUrl } = require('url');
const { mkdir, readFile, rename, rm, writeFile } = require('fs/promises');

// TODO store in DB?
const tokenDirectory = joinPath(process.cwd(), 'test', '.token-cache');
const fixtureDirectory = joinPath(process.cwd(), 'test', 'recorded-requests');
nock.back.fixtures = fixtureDirectory;

// Try to rename but fail silently if the file does not exist.
const tryRename = async (a, b) => {
    try {
        await rename(a, b);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
};
const getJestGlobalState = () => {
    const globalSymbols = Object.getOwnPropertySymbols(global);
    let jestState;
    globalSymbols.forEach((sym) => {
        if (sym.toString() === 'Symbol(JEST_STATE_SYMBOL)') {
            jestState = global[sym];
        }
    });

    return jestState;
};

const checkForOnlies = () => {
    let didFindOnly = false;
    const findOnly = (child) => {
        if (child.mode === 'only') {
            didFindOnly = true;
        }
        if (child.children) {
            child.children.forEach((nestedChild) => {
                findOnly(nestedChild);
            });
        }
    };
    const jestState = getJestGlobalState();
    const rootDescribe = jestState.rootDescribeBlock;

    for (const child of rootDescribe.children) {
        findOnly(child);
    }

    return didFindOnly;
};

const mockApi = (Api, classOptionByName = {}) => {
    const {
        authenticationMode,
        displayName = Api.name,
        filteringScope,
    } = classOptionByName;
    // The tag is the lower case display name, with any trailing 'Api' in the string removed.
    const tag = displayName.replace(/Api$/i, '').toLowerCase();
    const tokenFile = `${displayName}.json`;
    const tokenFileFullPath = joinPath(tokenDirectory, tokenFile);

    return class MockedApi extends Api {
        static name = `Mocked${displayName}`;
        static tokenResponse = null;
        static excludedRecordingPaths = [];
        static #context = {};

        static async initialize() {
            this.#context = {};

            const didFindOnlies = checkForOnlies();

            if (didFindOnlies) {
                throw new Error(
                    'Cancelled recording API mocks because some tests were marked `.only`.  Please remove any `.only`s from any `describe` blocks deeper than the root level, and all `it` blocks.'
                );
            }

            this.#context.originalNockMode = nock.back.currentMode;

            const { npm_config_record_apis: apisToRecordText = '' } =
                process.env;
            const apisToRecord = apisToRecordText
                .split(',')
                .map((name) => name.trim().toLowerCase());

            if (apisToRecord.includes(tag)) {
                this.#context.nockMode = 'update';
            } else {
                this.#context.nockMode = 'lockdown';
            }

            nock.back.setMode(this.#context.nockMode);

            const fixtureFile = `${displayName}.json`;

            if (this.#context.nockMode === 'update') {
                const fixtureFileFullPath = joinPath(
                    fixtureDirectory,
                    fixtureFile
                );
                const fixtureFileBackupFullPath = joinPath(
                    fixtureDirectory,
                    `.${displayName}.json.backup`
                );

                await tryRename(fixtureFileFullPath, fixtureFileBackupFullPath);

                this.#context.restoreFixture = async () =>
                    await tryRename(
                        fixtureFileBackupFullPath,
                        fixtureFileFullPath
                    );
                this.#context.deleteFixtureBackup = async () =>
                    await rm(fixtureFileBackupFullPath, { force: true });
            }

            const nockBack = await nock.back(fixtureFile, {
                before: (scope) => {
                    if (filteringScope) {
                        scope.options.filteringScope = filteringScope;
                    }
                },
                // Filter out token URLs
                afterRecord: (recordings) =>
                    recordings.filter(
                        ({ path }) =>
                            !this.excludedRecordingPaths.includes(path)
                    ),
                recorder: {
                    output_objects: true,
                    enable_reqheaders_recording: false,
                },
            });

            this.#context.assertAllRequests = () =>
                nockBack.context.assertScopesFinished();
            this.#context.done = () => nockBack.nockDone();
        }

        static async clean() {
            const {
                assertAllRequests,
                done,
                nockMode,
                originalNockMode,
                restoreFixture,
                deleteFixtureBackup,
            } = this.#context;

            const { didAllTestsPass } = global.mockApiResults;

            if (done) {
                done();
            }
            if (originalNockMode) {
                nock.back.setMode(originalNockMode);
            }
            if (assertAllRequests && nockMode !== 'update') {
                assertAllRequests();
            }

            nock.cleanAll();
            nock.restore();

            if (nockMode === 'update') {
                if (!didAllTestsPass) {
                    try {
                        await restoreFixture();
                    } finally {
                        throw new Error(
                            'Cancelled recording API mocks because some tests failed.  Please fix the failing tests and try to record again.'
                        );
                    }
                } else {
                    await deleteFixtureBackup();
                }
            }
        }

        static async saveCachedTokenResponse() {
            if (!this.tokenResponse) {
                return;
            }

            await mkdir(tokenDirectory, { recursive: true });
            await writeFile(
                tokenFileFullPath,
                JSON.stringify(this.tokenResponse)
            );
        }

        static async loadCachedTokenResponse() {
            try {
                const tokenResponseText = await readFile(tokenFileFullPath);
                this.tokenResponse = JSON.parse(tokenResponseText);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    this.tokenResponse = null;
                    return;
                }
                throw error;
            }
        }

        static async mock(...constructorParameters) {
            const api = new this(...constructorParameters);

            if (nock.back.currentMode !== 'lockdown') {
                await this.loadCachedTokenResponse();
            }

            // TODO read authentication mode from module package
            if (authenticationMode === 'client_credentials') {
                // TODO make generic (tied to crossbeam api)
                api.grantType = 'client_credentials';
                api.refreshAccessToken = api.getTokenFromClientCredentials;

                if (process.env.CROSSBEAM_API_BASE_URL)
                    api.baseUrl = process.env.CROSSBEAM_API_BASE_URL;
                if (process.env.CROSSBEAM_API_AUTH_URL)
                    api.tokenUri = `${process.env.CROSSBEAM_API_AUTH_URL}/oauth/token`;
                if (process.env.CROSSBEAM_API_AUDIENCE)
                    api.audience = process.env.CROSSBEAM_API_AUDIENCE;

                api.client_secret = process.env.CROSSBEAM_TEST_CLIENT_SECRET;
                api.client_id = process.env.CROSSBEAM_TEST_CLIENT_ID;
                api.refreshAccessToken = api.getTokenFromClientCredentials;

                this.tokenResponse = await api.getTokenFromClientCredentials();
            } else if (authenticationMode === 'puppet') {
                throw new Error('Not yet implemented');
            } else if (authenticationMode === 'browser') {
                if (nock.back.currentMode !== 'lockdown') {
                    const { path: tokenPath } = parseUrl(api.tokenUri);
                    this.excludedRecordingPaths.push(tokenPath);

                    if (this.tokenResponse) {
                        await api.setTokens(this.tokenResponse);

                        try {
                            await api.testAuth();
                        } catch {
                            this.tokenResponse = null;
                            nock.cleanAll();
                            await rm(tokenFileFullPath, {
                                force: true,
                            });
                        }
                    }

                    if (!this.tokenResponse) {
                        const url = api.authorizationUri;
                        const { data } = await Authenticator.oauth2(url);
                        const { code } = data;
                        this.tokenResponse = await api.getTokenFromCode(code);
                        await api.setTokens(this.tokenResponse);
                        nock.cleanAll();
                    }
                }
            } else if (authenticationMode === 'manual') {
                // NOOP.  This space intentionally left blank.  No action should be performed in this mode, and the developer writing the test will handle authentication externally to this module.
            } else {
                throw new Error(
                    'Unrecognized authentication mode for mocked API.'
                );
            }

            if (nock.back.currentMode !== 'lockdown') {
                await this.saveCachedTokenResponse();
            }

            return api;
        }
    };
};

module.exports = { mockApi };
