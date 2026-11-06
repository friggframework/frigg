const http = require('http');
const url = require('url');
const chalk = require('chalk');

class OAuthCallbackServer {
    constructor(options = {}) {
        this.port = options.port || 3333;
        this.timeout = (options.timeout || 300) * 1000; // Convert to milliseconds
        this.server = null;
        this._resolveCode = null;
        this._rejectCode = null;
        this._timeoutId = null;
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(this.handleRequest.bind(this));

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    reject(
                        new Error(
                            `Port ${this.port} is already in use.\n` +
                                `Try using a different port: frigg auth test <module> --port <different-port>`
                        )
                    );
                } else {
                    reject(err);
                }
            });

            this.server.listen(this.port, () => {
                console.log(
                    chalk.gray(
                        `Callback server listening on http://localhost:${this.port}`
                    )
                );
                resolve();
            });
        });
    }

    handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);

        // Handle OAuth callback (any path - to support module-specific redirects like /attio, /pipedrive)
        if (parsedUrl.query.code) {
            this.handleOAuthCallback(parsedUrl.query, res);
        } else if (parsedUrl.query.error) {
            this.handleOAuthError(parsedUrl.query, res);
        } else if (parsedUrl.pathname === '/health') {
            // Health check endpoint
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ready' }));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getWaitingHtml());
        }
    }

    handleOAuthCallback(query, res) {
        const { code, state } = query;

        // Send success page to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getSuccessHtml());

        // Clear timeout
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = null;
        }

        // Resolve the waiting promise
        if (this._resolveCode) {
            this._resolveCode({ code, state });
            this._resolveCode = null;
            this._rejectCode = null;
        }
    }

    handleOAuthError(query, res) {
        const { error, error_description, error_uri } = query;

        // Send error page to browser
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(this.getErrorHtml(error, error_description, error_uri));

        // Clear timeout
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = null;
        }

        // Reject the waiting promise
        if (this._rejectCode) {
            const errorMessage = error_description
                ? `OAuth error: ${error} - ${error_description}`
                : `OAuth error: ${error}`;
            this._rejectCode(new Error(errorMessage));
            this._resolveCode = null;
            this._rejectCode = null;
        }
    }

    waitForCode() {
        return new Promise((resolve, reject) => {
            this._resolveCode = resolve;
            this._rejectCode = reject;

            // Set timeout
            this._timeoutId = setTimeout(() => {
                this._resolveCode = null;
                this._rejectCode = null;
                reject(
                    new Error(
                        `OAuth callback timeout after ${
                            this.timeout / 1000
                        } seconds.\n` +
                            `Make sure you completed the authorization in the browser.`
                    )
                );
            }, this.timeout);
        });
    }

    getSuccessHtml() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Frigg Auth - Success</title>
    <style>
        :root {
            --primary: hsl(150 45% 30%);
            --primary-foreground: hsl(150 30% 90%);
            --background: hsl(0 0% 100%);
            --foreground: hsl(240 10% 3.9%);
            --muted-foreground: hsl(240 3.8% 46.1%);
            --border: hsl(240 5.9% 90%);
            --radius: 0.5rem;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: var(--background);
        }
        .container {
            text-align: center;
            background: var(--background);
            padding: 3rem;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            max-width: 400px;
        }
        .icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1.5rem auto;
            background: var(--primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .icon svg {
            width: 32px;
            height: 32px;
            color: var(--primary-foreground);
        }
        h1 {
            color: var(--foreground);
            margin: 0 0 0.5rem 0;
            font-size: 1.25rem;
            font-weight: 600;
        }
        p {
            color: var(--muted-foreground);
            margin: 0;
            line-height: 1.6;
            font-size: 0.875rem;
        }
        .frigg-badge {
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border);
            font-size: 0.75rem;
            color: var(--muted-foreground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </div>
        <h1>Authentication Successful</h1>
        <p>You can close this window and return to the terminal.</p>
        <div class="frigg-badge">Powered by Frigg</div>
    </div>
</body>
</html>`;
    }

    getErrorHtml(error, description, errorUri) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Frigg Auth - Error</title>
    <style>
        :root {
            --destructive: hsl(0 84.2% 60.2%);
            --destructive-foreground: hsl(0 0% 98%);
            --background: hsl(0 0% 100%);
            --foreground: hsl(240 10% 3.9%);
            --muted-foreground: hsl(240 3.8% 46.1%);
            --border: hsl(240 5.9% 90%);
            --primary: hsl(150 45% 30%);
            --radius: 0.5rem;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: var(--background);
        }
        .container {
            text-align: center;
            background: var(--background);
            padding: 3rem;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            max-width: 400px;
        }
        .icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1.5rem auto;
            background: var(--destructive);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .icon svg {
            width: 32px;
            height: 32px;
            color: var(--destructive-foreground);
        }
        h1 {
            color: var(--foreground);
            margin: 0 0 1rem 0;
            font-size: 1.25rem;
            font-weight: 600;
        }
        .error-code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            background: hsl(0 84.2% 97%);
            color: hsl(0 72% 51%);
            padding: 0.5rem 1rem;
            border-radius: calc(var(--radius) - 2px);
            display: inline-block;
            margin-bottom: 1rem;
            font-size: 0.875rem;
            border: 1px solid hsl(0 84.2% 90%);
        }
        p {
            color: var(--muted-foreground);
            margin: 0 0 0.5rem 0;
            line-height: 1.6;
            font-size: 0.875rem;
        }
        a {
            color: var(--primary);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .frigg-badge {
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border);
            font-size: 0.75rem;
            color: var(--muted-foreground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </div>
        <h1>Authentication Failed</h1>
        <div class="error-code">${escapeHtml(error)}</div>
        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
        ${
            errorUri
                ? `<p><a href="${escapeHtml(
                      errorUri
                  )}" target="_blank">More information →</a></p>`
                : ''
        }
        <p style="margin-top: 1rem;">Check the terminal for details.</p>
        <div class="frigg-badge">Powered by Frigg</div>
    </div>
</body>
</html>`;
    }

    getWaitingHtml() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Frigg Auth - Waiting</title>
    <style>
        :root {
            --primary: hsl(150 45% 30%);
            --background: hsl(0 0% 100%);
            --foreground: hsl(240 10% 3.9%);
            --muted-foreground: hsl(240 3.8% 46.1%);
            --border: hsl(240 5.9% 90%);
            --radius: 0.5rem;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: var(--background);
        }
        .container {
            text-align: center;
            background: var(--background);
            padding: 3rem;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            max-width: 400px;
        }
        .spinner {
            width: 48px;
            height: 48px;
            margin: 0 auto 1.5rem auto;
            border: 3px solid var(--border);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        h1 {
            color: var(--foreground);
            margin: 0 0 0.5rem 0;
            font-size: 1.25rem;
            font-weight: 600;
        }
        p {
            color: var(--muted-foreground);
            margin: 0;
            line-height: 1.6;
            font-size: 0.875rem;
        }
        .frigg-badge {
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border);
            font-size: 0.75rem;
            color: var(--muted-foreground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h1>Waiting for Authorization</h1>
        <p>Complete the OAuth flow in your browser to continue.</p>
        <div class="frigg-badge">Powered by Frigg</div>
    </div>
</body>
</html>`;
    }

    async stop() {
        // Clear any pending timeout
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = null;
        }

        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    this.server = null;
                    resolve();
                });
            });
        }
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = { OAuthCallbackServer };
