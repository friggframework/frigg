const fs = require('node:fs');
const { deepFreeze } = require('./record');

const DEFAULT_MAX_RETRIES = 10;
const MAX_SLEEP_MS = 20;

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function defaultWriteStderr(line) {
    fs.writeSync(2, line);
}

function safeCode(code) {
    return String(code ?? 'UNKNOWN').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32) || 'UNKNOWN';
}

function createStdoutSink({
    fd = 1,
    writeSync = fs.writeSync,
    writeStderr = defaultWriteStderr,
    sleep = sleepSync,
    maxRetries = DEFAULT_MAX_RETRIES,
} = {}) {
    const reportFailure = (code) => {
        try {
            writeStderr(`frigg.logger.write_failed code=${safeCode(code)}\n`);
        } catch {
            // Nothing is left to report to.
        }
    };

    return {
        name: 'stdout',
        write(record) {
            let buffer;
            try {
                buffer = Buffer.from(`${JSON.stringify(record)}\n`);
            } catch {
                reportFailure('SERIALIZE');
                return;
            }
            let offset = 0;
            let retries = 0;
            // EAGAIN and a zero-byte write share one bounded retry budget.
            const retry = () => {
                if (retries >= maxRetries) {
                    reportFailure('EAGAIN');
                    return false;
                }
                retries += 1;
                sleep(Math.min(retries, MAX_SLEEP_MS));
                return true;
            };
            while (offset < buffer.length) {
                let written;
                try {
                    written = writeSync(fd, buffer, offset, buffer.length - offset);
                } catch (error) {
                    if (error?.code !== 'EAGAIN') {
                        reportFailure(error?.code);
                        return;
                    }
                    if (!retry()) return;
                    continue;
                }
                if (written > 0) offset += written;
                else if (!retry()) return;
            }
        },
    };
}

function createMemorySink({ install = true } = {}) {
    const records = [];
    const sink = {
        name: 'memory',
        records,
        write(record) {
            records.push(deepFreeze(JSON.parse(JSON.stringify(record))));
        },
        clear() {
            records.length = 0;
        },
    };
    if (install) {
        require('./logger-runtime').setSinks([sink]);
    }
    return sink;
}

module.exports = { createStdoutSink, createMemorySink };
