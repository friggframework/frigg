/**
 * Frigg Infrastructure Entry Point
 *
 * This file is the serverless configuration consumed by the Frigg CLI
 * (`frigg build` / `frigg deploy`, which run `osls --config infrastructure.js`).
 *
 * `createFriggInfrastructure()` reads the `Definition` exported from `index.js`,
 * runs AWS resource discovery (VPC, KMS, Aurora, etc.), and composes the full
 * serverless definition. It returns a Promise that resolves to that definition,
 * which Serverless/osls awaits automatically.
 *
 * You normally never need to edit this file — customize your application through
 * the app definition in `index.js` instead.
 */

'use strict';

const { createFriggInfrastructure } = require('@friggframework/devtools');

module.exports = createFriggInfrastructure();
