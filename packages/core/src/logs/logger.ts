import util from 'node:util';

/* eslint-disable no-console */

interface LogEntry {
    date: Date;
    text: string;
}

const logs: LogEntry[] = [];
let flushCalled = false;

function debug(...messages: unknown[]): void {
    if (messages.length) {
        const date = new Date();
        const text = util.format.apply(null, messages as [string, ...unknown[]]);

        if (process.env.DEBUG_VERBOSE === '1') {
            console.debug(date, text);
        } else {
            logs.push({ date, text });
        }
    }
}

function initDebugLog(...initMessages: unknown[]): void {
    flushCalled = false;

    // Hacky but fast way to empty an array.
    logs.length = 0;

    // Log initial event
    debug(...initMessages);
}

function flushDebugLog(error?: Error): void {
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

    let parentError: Error | undefined = error.cause as Error | undefined;

    while (parentError) {
        console.error('(Caused By)-------------------------');
        console.error(parentError);
        parentError = (parentError as Error).cause as Error | undefined;
    }
}

export { debug, initDebugLog, flushDebugLog };
export type { LogEntry };
