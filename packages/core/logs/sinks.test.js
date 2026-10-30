const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createStdoutSink, createMemorySink } = require('./sinks');
const { getLogger } = require('./logger');
const runtime = require('./logger-runtime');

const errno = (code) => Object.assign(new Error(code), { code });

function fakeIo({ plan = [] } = {}) {
    const chunks = [];
    const stderr = [];
    const sleeps = [];
    let call = 0;
    const writeSync = jest.fn((fd, buffer, offset, length) => {
        const step = plan[call++];
        if (step instanceof Error) throw step;
        const count = typeof step === 'number' ? Math.min(step, length) : length;
        chunks.push(Buffer.from(buffer.subarray(offset, offset + count)));
        return count;
    });
    return {
        writeSync,
        writeStderr: jest.fn((line) => stderr.push(line)),
        sleep: jest.fn((ms) => sleeps.push(ms)),
        output: () => Buffer.concat(chunks).toString('utf8'),
        stderr,
        sleeps,
    };
}

const sampleRecord = { timestamp: '2026-09-24T00:00:00.000Z', level: 'INFO', message: 'héllo ✓ 日本', logger: 'frigg.test' };

describe('logs/sinks', () => {
    describe('stdout', () => {
        it('writes one JSON line per record to fd 1 via the injected writeSync', () => {
            const io = fakeIo();
            const sink = createStdoutSink(io);
            sink.write(sampleRecord);
            sink.write({ ...sampleRecord, message: 'second' });
            expect(io.writeSync.mock.calls[0][0]).toBe(1);
            const lines = io.output().split('\n');
            expect(lines).toHaveLength(3);
            expect(lines[2]).toBe('');
            expect(JSON.parse(lines[0])).toEqual(sampleRecord);
            expect(lines[0]).toBe(JSON.stringify(sampleRecord));
        });

        it('continues a partial write of a multi-byte record from the returned byte offset', () => {
            const io = fakeIo({ plan: [5, 3, 7] });
            createStdoutSink(io).write(sampleRecord);
            expect(io.output()).toBe(`${JSON.stringify(sampleRecord)}\n`);
            const offsets = io.writeSync.mock.calls.map((c) => c[2]);
            expect(offsets.slice(0, 4)).toEqual([0, 5, 8, 15]);
            expect(io.stderr).toEqual([]);
        });

        it('retries EAGAIN with the injected sleep', () => {
            const io = fakeIo({ plan: [errno('EAGAIN'), errno('EAGAIN')] });
            createStdoutSink(io).write(sampleRecord);
            expect(io.sleep).toHaveBeenCalledTimes(2);
            expect(io.output()).toBe(`${JSON.stringify(sampleRecord)}\n`);
            expect(io.stderr).toEqual([]);
        });

        it('stops after bounded retries, writes one fixed stderr line and never throws', () => {
            const io = fakeIo({ plan: Array.from({ length: 50 }, () => errno('EAGAIN')) });
            const sink = createStdoutSink({ ...io, maxRetries: 3 });
            expect(() => sink.write({ ...sampleRecord, message: 'secret-ish payload' })).not.toThrow();
            expect(io.writeSync).toHaveBeenCalledTimes(4);
            expect(io.stderr).toEqual(['frigg.logger.write_failed code=EAGAIN\n']);
        });

        it('bounds zero-byte writes like EAGAIN', () => {
            const io = fakeIo({ plan: Array.from({ length: 50 }, () => 0) });
            createStdoutSink({ ...io, maxRetries: 2 }).write(sampleRecord);
            expect(io.writeSync).toHaveBeenCalledTimes(3);
            expect(io.stderr).toEqual(['frigg.logger.write_failed code=EAGAIN\n']);
        });

        it('does not retry EPIPE', () => {
            const io = fakeIo({ plan: [errno('EPIPE')] });
            createStdoutSink(io).write(sampleRecord);
            expect(io.writeSync).toHaveBeenCalledTimes(1);
            expect(io.sleep).not.toHaveBeenCalled();
            expect(io.stderr).toEqual(['frigg.logger.write_failed code=EPIPE\n']);
        });

        it('puts no record data and no hostile code text on the stderr line', () => {
            const io = fakeIo({ plan: [errno('E/../"{token}"')] });
            createStdoutSink(io).write({ ...sampleRecord, message: 'fakeTokenValue123456' });
            expect(io.stderr).toEqual(['frigg.logger.write_failed code=Etoken\n']);
        });

        it('swallows a throwing stderr write', () => {
            const io = fakeIo({ plan: [errno('EIO')] });
            io.writeStderr.mockImplementation(() => {
                throw new Error('stderr gone');
            });
            expect(() => createStdoutSink(io).write(sampleRecord)).not.toThrow();
        });

        it('reports an unserializable record without throwing', () => {
            const io = fakeIo();
            createStdoutSink(io).write({ big: BigInt(1) });
            expect(io.writeSync).not.toHaveBeenCalled();
            expect(io.stderr).toEqual(['frigg.logger.write_failed code=SERIALIZE\n']);
        });
    });

    describe('memory', () => {
        it('keeps deep-frozen, fresh copies per write', () => {
            const sink = createMemorySink({ install: false });
            const record = { level: 'INFO', nested: { a: [1, 2] } };
            sink.write(record);
            sink.write(record);
            expect(sink.records).toHaveLength(2);
            expect(sink.records[0]).toEqual(record);
            expect(sink.records[0]).not.toBe(record);
            expect(sink.records[0]).not.toBe(sink.records[1]);
            expect(Object.isFrozen(sink.records[0].nested.a)).toBe(true);
            sink.clear();
            expect(sink.records).toEqual([]);
        });

        it('installs itself as the only sink by default', () => {
            const sink = createMemorySink();
            expect(runtime.getSinks()).toEqual([sink]);
            getLogger('integration.test').info('captured');
            expect(sink.records).toHaveLength(1);
        });

        it('holds records whose JSON equals the stdout bytes', () => {
            const memory = createMemorySink({ install: false });
            const io = fakeIo();
            runtime.resetLoggerForTests({ level: 'TRACE', sinks: [memory, createStdoutSink(io)] });
            getLogger('integration.test').warn('both', { count: 2, nested: { ok: true } });
            expect(`${JSON.stringify(memory.records[0])}\n`).toBe(io.output());
        });
    });

    describe('resetLoggerForTests', () => {
        it('installs a fresh stdout sink and clears once-warnings, violations and the config memo', () => {
            const saved = process.env.FRIGG_LOG_LEVEL;
            try {
                process.env.FRIGG_LOG_LEVEL = 'bogus';
                const sink = createMemorySink({ install: false });
                runtime.resetLoggerForTests({ sinks: [sink] });
                getLogger('frigg.area').warn('violation');
                expect(sink.records.filter((r) => r.eventName === 'frigg.logger.invalid_level')).toHaveLength(1);

                runtime.resetLoggerForTests();
                const sinks = runtime.getSinks();
                expect(sinks.map((s) => s.name)).toEqual(['stdout']);
                expect(runtime.takeViolationsForTests()).toEqual([]);
                expect(runtime.state().config).toBeNull();

                const again = createMemorySink({ install: false });
                runtime.resetLoggerForTests({ sinks: [again] });
                getLogger('integration.x').info('x');
                expect(again.records.filter((r) => r.eventName === 'frigg.logger.invalid_level')).toHaveLength(1);
            } finally {
                if (saved === undefined) delete process.env.FRIGG_LOG_LEVEL;
                else process.env.FRIGG_LOG_LEVEL = saved;
                runtime.resetLoggerForTests({ level: 'TRACE', sinks: [createMemorySink({ install: false })] });
            }
        });
    });

    describe('flushSinks', () => {
        it('settles every flush and never rejects', async () => {
            const flushed = [];
            const signal = new AbortController().signal;
            runtime.setSinks([
                { name: 'a', write() {}, flush: ({ signal: s }) => flushed.push(s) },
                { name: 'b', write() {}, flush: () => Promise.reject(new Error('late')) },
                { name: 'c', write() {}, flush: () => { throw new Error('sync'); } },
                { name: 'd', write() {} },
            ]);
            expect(runtime.hasFlushableSinks()).toBe(true);
            await expect(runtime.flushSinks({ signal })).resolves.toBeUndefined();
            expect(flushed).toEqual([signal]);
        });

        it('reports no flushable sink for stdout or memory', () => {
            runtime.setSinks([createStdoutSink(fakeIo()), createMemorySink({ install: false })]);
            expect(runtime.hasFlushableSinks()).toBe(false);
        });
    });

    describe('real fd 1 (child process)', () => {
        const run = (script) =>
            execFileSync(process.execPath, ['-e', script], {
                cwd: path.join(__dirname, '..'),
                env: { PATH: process.env.PATH, STAGE: 'test' },
                encoding: 'utf8',
            });

        it('writes three records as three parseable lines and nothing else', () => {
            const out = run(
                "const { getLogger } = require('./logs/logger');" +
                    "const log = getLogger('integration.child');" +
                    "log.info('one'); log.warn('two', { n: 2 }); log.error('three', { error: new Error('boom') });"
            );
            const lines = out.split('\n');
            expect(lines.pop()).toBe('');
            expect(lines).toHaveLength(3);
            expect(lines.map((l) => JSON.parse(l).message)).toEqual(['one', 'two', 'three']);
        });

        it('writes twenty 2,000-char fields as one line under 16,384 bytes', () => {
            const out = run(
                "const { getLogger } = require('./logs/logger');" +
                    'const fields = {};' +
                    "for (let i = 0; i < 20; i++) fields['f' + i] = 'lorem ipsum '.repeat(200).slice(0, 2000);" +
                    "getLogger('integration.child').info('big', fields);"
            );
            const lines = out.split('\n').filter(Boolean);
            expect(lines).toHaveLength(1);
            expect(Buffer.byteLength(lines[0])).toBeLessThan(16384);
            const record = JSON.parse(lines[0]);
            expect(record.message).toBe('big');
            expect(record.droppedKeys.length).toBeGreaterThan(0);
        });
    });
});
