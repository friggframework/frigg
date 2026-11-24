/**
 * Jest config for the @friggframework/devtools workspace (`npm test`).
 *
 * - Only `*.test.js` / `*.spec.js` files are suites. Jest's default testMatch
 *   also treats every file under `__tests__/` as a suite, which collected the
 *   shared fixtures/helpers (e.g. `__tests__/utils/mock-factory.js`) and
 *   failed them with "Your test suite must contain at least one test".
 * - `management-ui/` is a Vite/React app with its own Vitest runner, jsdom
 *   environment and dependencies (`cd management-ui && npm install && npx vitest`).
 *   It is not an npm workspace, so its deps are not installed by `npm ci` at
 *   the repo root and its JSX suites cannot run under this Node/CommonJS Jest.
 * - `layers/` holds the built Prisma Lambda layer (vendored node_modules).
 */
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/?(*.)+(spec|test).js'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/management-ui/',
        '<rootDir>/layers/',
    ],
    modulePathIgnorePatterns: ['<rootDir>/layers/'],
    watchPathIgnorePatterns: ['<rootDir>/layers/'],
};
