const nock = require('nock');
const fs = require('fs');
const fsPath = require('path');

const nockBack = require('nock').back;
nockBack.fixtures = fsPath.join(process.cwd(), 'test/fixtures');

const state = {
    mode: null,
    done: null,
    active: false,
};

const constructUrl = (options) => {
    let endpoint = `${options.path}`;

    if (options.query) {
        endpoint = `${endpoint}?`;
        for (const [index, [key, value]] of Object.entries(
            Object.entries(options.query)
        )) {
            if (index == Object.keys(options.query).length - 1) {
                endpoint = `${endpoint}${key}=${value}`;
            } else {
                endpoint = `${endpoint}${key}=${value}&`;
            }
        }
    }

    return endpoint;
};

const record = async (path, options) => {
    nock.recorder.clear();

    // nock.load('../fixtures/request_options.json');
    // nock.load(options);

    nock.recorder.rec({
        output_objects: true,
        enable_reqheaders_recording: false,
    });

    const response = nock.recorder.play();

    try {
        const stringified = JSON.stringify(response, null, 2);
        console.log();
        fs.writeFileSync(path, stringified);
    } catch (err) {
        err.message = `Nockout failure - failed to persist nock records: ${err.message}`;
        throw err;
    }
};

const clean = () => {
    state.mode = null;
    state.done = null;
    state.active = false;

    nock.enableNetConnect();
    nock.cleanAll();
    nock.restore();
    nock.activate();
};

const initialize = (record, options) => {
    // nock.enableNetConnect();

    const preProcess = (records) => {
        console.log(records.path, constructUrl(options));
        records.path = constructUrl(options);
        return records;
    };

    const postProcess = (records) => {
        records.map((scope) => {
            scope.path = options.path;
            return scope;
        });
        return records;
    };

    if (record) {
        state.mode = 'record';
        state.active = true;
        nockBack.setMode(state.mode);

        nockBack(
            `${options.tag}.json`,
            { afterRecord: postProcess },
            (nockDone) => {
                state.done = nockDone;
            }
        );
    }
};

const done = () => {
    state.active = false;
    state.done();
};

const _request = (url) => {
    return nock(url, { encodedQueryParams: true });
};

const _get = async ({ url, path, status, tag, query }) => {
    // let endpoint = `${path}`;

    // if (query) {
    //     endpoint = `${endpoint}?`;
    //     for (const [key, value] of Object.entries(query)) {
    //         endpoint = `${endpoint}${key}=${value}&`;
    //     }
    // }

    const endpoint = constructUrl(options);

    let scope = () => _request(url).get(path);

    if (query) {
        scope = () => scope.query(query);
    }

    const options = [
        {
            scope: url,
            method: 'GET',
            path: endpoint,
            status,
        },
    ];

    let requestParams;
    let response;
    path = fsPath.join(process.cwd(), `test/fixtures/${tag}.json`);
    console.log(path, nockBack.fixtures);

    try {
        if (fs.existsSync(path)) {
            response = require(path);
            console.log('exists');
        }
    } catch (err) {
        console.log(`Fixture ${tag} not found, recording request...`);
        await record(path, options);

        response = require(path);
    }

    scope = () => scope.reply(status, response);

    return scope;
};

module.exports = {
    _get,
    initialize,
    done,
    clean,
};
