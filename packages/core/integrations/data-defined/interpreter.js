/**
 * Runs a list of steps against a context. Pure apart from the ports it is given:
 *   ports.call(moduleKey, capability, args)   a module capability (the runtime maps it to Api.<method>)
 *   ports.links.find / ports.links.upsert       the link + identity store (IntegrationMapping rows)
 *   ports.runCode(ref, args)                    registered code steps (optional)
 *
 * Every step leaves a trace entry: { id, use, status, ms, error? }. A step's result is stored at $.steps.<id>.
 * onError per step: 'fail' (default: throw, so the queue retries the whole run), 'continue' (result null), 'stop'.
 */
const { resolve, evaluate } = require('./expressions');
const { BUILTINS, FOREACH_HARD_CAP, isBuiltin, splitCapability } = require('./steps');

class StopRun extends Error { constructor(reason) { super(reason); this.name = 'StopRun'; this.reason = reason; } }

async function runSteps(steps, env, path = 'steps') {
    const { ctx, trace } = env;
    for (let i = 0; i < (steps || []).length; i++) {
        const step = steps[i];
        const id = step.id || `${step.use}#${i}`;
        const at = `${path}[${i}]`;
        if (step.when && !evaluate(step.when, ctx)) { trace.push({ id, use: step.use, at, status: 'skipped' }); continue; }
        const t0 = Date.now();
        try {
            let out;
            if (step.use === 'foreach') {
                const all = resolve(step.with?.over, ctx) ?? [];
                if (!Array.isArray(all)) throw new Error('foreach: `over` is not an array');
                const max = Math.min(step.with?.max || 100, FOREACH_HARD_CAP);
                const saved = { item: ctx.item, index: ctx.index };
                // `where` is checked per item, before the cap, so max bounds the work actually done.
                const items = [];
                for (const [n, item] of all.entries()) {
                    ctx.item = item; ctx.index = n;
                    if (!step.with?.where || evaluate(step.with.where, ctx)) items.push(item);
                }
                Object.assign(ctx, saved);
                const collect = step.with && 'collect' in step.with;
                out = [];
                for (const [n, item] of items.slice(0, max).entries()) {
                    ctx.item = item; ctx.index = n;
                    await runSteps(step.do || [], env, `${at}.do#${n}`);
                    out.push(collect
                        ? resolve(step.with.collect, ctx)
                        : Object.fromEntries((step.do || []).filter((s) => s.id).map((s) => [s.id, ctx.steps[s.id]])));
                    Object.assign(ctx, saved);
                }
                if (items.length > max) trace.push({ id, use: 'foreach', at, status: 'truncated', note: `${items.length - max} items over max ${max}` });
            } else if (step.use === 'branch') {
                const hit = (step.cases || []).find((c) => evaluate(c.when, ctx));
                await runSteps(hit ? hit.do : step.else || [], env, `${at}.${hit ? 'case' : 'else'}`);
                out = { matched: hit ? hit.when : null };
            } else if (isBuiltin(step.use)) {
                out = await BUILTINS[step.use].run(resolve(step.with || {}, ctx), env);
                if (out && out.stop) { ctx.steps[id] = out; trace.push({ id, use: step.use, at, status: 'stopped', ms: Date.now() - t0, reason: out.reason }); throw new StopRun(out.reason); }
            } else {
                const cap = splitCapability(step.use);
                if (!cap) throw new Error(`Unknown step "${step.use}"`);
                out = await env.ports.call(cap.module, cap.capability, resolve(step.with || {}, ctx));
            }
            ctx.steps[id] = out === undefined ? null : out;
            trace.push({ id, use: step.use, at, status: 'ok', ms: Date.now() - t0 });
        } catch (e) {
            if (e instanceof StopRun) throw e;
            const policy = step.onError || 'fail';
            trace.push({ id, use: step.use, at, status: 'error', ms: Date.now() - t0, error: String(e && e.message || e), policy });
            if (policy === 'continue') { ctx.steps[id] = null; continue; }
            if (policy === 'stop') throw new StopRun(`step ${id} failed`);
            throw e;
        }
    }
}

/**
 * Run steps and report the outcome instead of throwing for a normal stop.
 * @returns {Promise<{status:'completed'|'stopped', reason?:string, steps:object, trace:Array}>}
 */
async function execute(steps, { def, installation, ctx, ports }) {
    const env = { def, installation, ports, trace: [], ctx: { steps: {}, vars: {}, ...ctx } };
    try {
        await runSteps(steps, env);
        return { status: 'completed', steps: env.ctx.steps, trace: env.trace };
    } catch (e) {
        if (e instanceof StopRun) return { status: 'stopped', reason: e.reason, steps: env.ctx.steps, trace: env.trace };
        e.trace = env.trace;
        throw e;
    }
}

module.exports = { execute, runSteps, StopRun };
