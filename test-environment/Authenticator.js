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

    static async oauth2(authorizeUrl, port = 3000) {
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
                            'Authentication successful! Please return to the console.'
                        );
                        server.destroy();
                        console.info('Tokens acquired.');
                        resolve({
                            base: urlPostfix,
                            data: params,
                        });
                    } catch (e) {
                        reject(e);
                    }
                })
                .listen(port, () => {
                    // open the browser to the authorize url to start the workflow
                    open(authorizeUrl).then((cp) => cp.unref());
                });
            destroyer(server);
        });
    }
}
module.exports = Authenticator;
