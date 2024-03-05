// "use strict";
const http = require('http');
const url = require('url');
const open = require('open');

class Authenticator {
    static searchParamsToDictionary(params) {
        const entries = params.entries();
        const result = {};
        for (const entry of entries) {
            const [key, value] = entry;
            result[key] = value;
        }
        return result;
    }

    static async oauth2(authorizeUrl, port = 3000, browserName = undefined) {
        return new Promise((resolve, reject) => {
            const server = http
                .createServer(async (req, res) => {
                    try {
                        const qs = new url.URL(
                            req.url,
                            `http://localhost:${port}`
                        ).searchParams;

                        // gets the last parameter in the slash
                        const urlPostfix = req.url.split('?')[0];

                        const params =
                            Authenticator.searchParamsToDictionary(qs);

                        res.end(
                            `<h1 style="position: absolute;top: 50%;left: 50%;transform: translate(-50%, -50%);">Feel free to close the Brow Brow now</h1>
                                        <style>@media (prefers-color-scheme: dark) {
                                            body {
                                                color: #b0b0b0;
                                                background-color: #101010;
                                            }
                                        </style>`
                        );
                        server.close();
                        resolve({
                            base: urlPostfix,
                            data: params,
                        });
                    } catch (e) {
                        reject(e);
                    }
                })
                .listen(port, () => {
                    const options = browserName ? {app: {name: browserName }} : undefined
                    // open the browser to the authorize url to start the workflow
                    open(authorizeUrl, options).then((childProcess) => {
                        childProcess.unref();
                        clearTimeout(timeoutId);
                    });
                });

            const timeoutId = setTimeout(() => {
                if (server.listening) {
                    try {
                        server.close();
                    } finally {
                        throw new Error(
                            'Authenticator timed out before authentication completed in the browser.'
                        );
                    }
                }
            }, 59_000);
        });
    }
}
module.exports = Authenticator;
