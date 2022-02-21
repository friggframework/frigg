const util = require('util');
const aws = require('aws-sdk');

// Except in some outlier circumstances, for example steam or event error handlers, this should be the only place that calls `console.*`.  That way, this file can be modified to log everything properly on a variety of platforms because all the logging code is here in one place.
/* eslint-disable no-console */

const logs = [];
let flushCalled = false;

// Log AWS SDK calls
aws.config.logger = { log: debug };

function debug(...messages) {
    if (messages.length) {
        const date = new Date();
        const text = util.format.apply(null, messages);

        if (process.env.DEBUG_VERBOSE === '1') {
            console.debug(date, text);
        } else {
            logs.push({ date, text });
        }
    }
}

function initDebugLog(...initMessages) {
    flushCalled = false;

    // Hacky but fast way to empty an array.
    logs.length = 0;

    // Log initial event
    debug(...initMessages);
}

function flushDebugLog(error) {
    if (flushCalled) {
        console.debug(
            'Another error was encountered while handling the same request or event!  All debug messages are included again in this output as well.'
        );
    }

    flushCalled = true;

    // Output unless in verbose mode.  In verbose mode, these will already have been output so we don't want to output the messages twice.
    if (process.env.DEBUG_VERBOSE !== '1') {
        if (logs?.length > 0) {
            for (const { date, text } of logs) {
                console.debug(date, text);
            }
        }
    }

    if (!error) {
        error = new Error('flushDebugLog called with empty error');
    }

    console.error(error);

    let { cause: parentError } = error;

    while (parentError) {
        console.error('(Caused By)-------------------------');
        console.error(parentError);
        parentError = parentError.cause;
    }
}

module.exports = { debug, initDebugLog, flushDebugLog };
