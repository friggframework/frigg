/**
 * Recurrence: how often a recurring job fires, in a form no host owns.
 *
 *   { every: '15m' }                               every 15 minutes ('30s' is refused: hosts tick in minutes)
 *   { cron: '0 9 * * 1-5', timezone: 'America/New_York' }   standard five-field cron (minute hour dom month dow)
 *
 * Each scheduler adapter translates this into its host's syntax (EventBridge: rate(...) / cron(...) with six fields
 * and `?`). Keeping the neutral form here is what lets one definition, or one integration, run on any host.
 *
 * Pure; no I/O.
 */

const EVERY = /^(\d+)\s*(m|h|d)$/;
const UNIT_MINUTES = { m: 1, h: 60, d: 1440 };

/** '15m' -> 15, '2h' -> 120, '1d' -> 1440. Anything else -> null. */
function parseEvery(every) {
    const m = EVERY.exec(String(every ?? '').trim());
    if (!m) return null;
    const n = Number(m[1]) * UNIT_MINUTES[m[2]];
    return n > 0 ? n : null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const FIELDS = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'day of month', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12, names: MONTHS, base: 1 },
    { name: 'day of week', min: 0, max: 7, names: DAYS, base: 0 },   // 0 and 7 are both Sunday
];

function atom(token, field) {
    const t = token.toUpperCase();
    if (field.names) {
        const i = field.names.indexOf(t);
        if (i >= 0) return i + field.base;
    }
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= field.min && n <= field.max ? n : null;
}

/** One cron field -> the sorted set of values it matches, or an error string. */
function parseField(text, field) {
    const out = new Set();
    for (const part of text.split(',')) {
        const [range, stepText] = part.split('/');
        if (part.split('/').length > 2) return `${field.name}: "${part}" has more than one step`;
        const step = stepText === undefined ? 1 : Number(stepText);
        if (!Number.isInteger(step) || step < 1) return `${field.name}: step "${stepText}" is not a positive whole number`;
        let lo, hi;
        if (range === '*') { lo = field.min; hi = field.name === 'day of week' ? 6 : field.max; }
        else if (range.includes('-')) {
            const [a, b] = range.split('-');
            lo = atom(a, field); hi = atom(b, field);
            if (lo === null || hi === null) return `${field.name}: "${range}" is out of range`;
            if (lo > hi) return `${field.name}: "${range}" runs backwards`;
        } else {
            lo = atom(range, field);
            if (lo === null) return `${field.name}: "${range}" is out of range`;
            hi = stepText === undefined ? lo : (field.name === 'day of week' ? 6 : field.max);
        }
        for (let v = lo; v <= hi; v += step) out.add(field.name === 'day of week' && v === 7 ? 0 : v);
    }
    return [...out].sort((a, b) => a - b);
}

/**
 * Parse a five-field cron. Returns { fields: [Set x5], restricted: { dom, dow } } or { error }.
 * `restricted` records whether day-of-month / day-of-week were given (not `*`), which decides how they combine.
 */
function parseCron(cron) {
    const parts = String(cron ?? '').trim().split(/\s+/);
    if (parts.length !== 5 || parts[0] === '') return { error: 'A cron expression has five fields: minute hour day-of-month month day-of-week' };
    const fields = [];
    for (let i = 0; i < 5; i += 1) {
        const v = parseField(parts[i], FIELDS[i]);
        if (typeof v === 'string') return { error: v };
        fields.push(new Set(v));
    }
    return { fields, parts, restricted: { dom: parts[2] !== '*', dow: parts[4] !== '*' } };
}

/** Does a parsed cron fire at this (UTC-free, wall-clock) minute? Standard cron: dom and dow OR when both are set. */
function matches(parsed, d) {
    const [mi, h, dom, mon, dow] = parsed.fields;
    if (!mi.has(d.getUTCMinutes()) || !h.has(d.getUTCHours()) || !mon.has(d.getUTCMonth() + 1)) return false;
    const domHit = dom.has(d.getUTCDate()), dowHit = dow.has(d.getUTCDay());
    if (parsed.restricted.dom && parsed.restricted.dow) return domHit || dowHit;
    return domHit && dowHit;
}

/**
 * The shortest gap, in minutes, between two firings. For `every` it is the interval; for cron it is measured over
 * fifteen months of wall-clock minutes (long enough to see every month and weekday combination), so a floor such as
 * "no more often than every 15 minutes" is checked against what the expression really does, not its spelling.
 * Returns Infinity for an expression that fires at most once in that window, null when invalid.
 */
function minGapMinutes(recurrence) {
    if (recurrence?.every !== undefined) return parseEvery(recurrence.every);
    const parsed = parseCron(recurrence?.cron);
    return parsed.error ? null : scan(parsed).best;
}

/** Walk fifteen months of firings: how many there are and the shortest gap between two. */
function scan(parsed) {
    const [mi, h] = parsed.fields;
    const minutes = [...mi], hours = [...h];
    let prev = null, best = Infinity, count = 0;
    const start = Date.UTC(2027, 0, 1);
    for (let day = 0; day < 457 && best > 1; day += 1) {     // fifteen months: every month and weekday pairing
        const midnight = start + day * 86400000;
        if (!matches(parsed, new Date(midnight + hours[0] * 3600000 + minutes[0] * 60000))) continue;
        for (const hr of hours) {
            for (const mn of minutes) {
                const t = day * 1440 + hr * 60 + mn;
                if (prev !== null && t - prev < best) best = t - prev;
                prev = t;
                count += 1;
            }
        }
    }
    return { best, count };
}

/** Is `tz` an IANA time zone this runtime knows? */
function isTimeZone(tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/**
 * Validate a recurrence. `min` is an optional floor ('15m'): the expression must never fire more often.
 * @returns {string[]} problems, empty when valid
 */
function validateRecurrence(recurrence, { min } = {}) {
    const problems = [];
    if (!recurrence || typeof recurrence !== 'object') return ['Give a schedule as { every } or { cron, timezone? }'];
    const hasEvery = recurrence.every !== undefined, hasCron = recurrence.cron !== undefined;
    if (hasEvery === hasCron) return ['Give exactly one of every or cron'];
    if (hasEvery && parseEvery(recurrence.every) === null) problems.push(`every "${recurrence.every}" is not a whole number of minutes, hours or days (15m, 2h, 1d)`);
    if (hasCron) {
        const parsed = parseCron(recurrence.cron);
        if (parsed.error) problems.push(parsed.error);
        // EventBridge (and Quartz) cannot express "this day of month OR this weekday"; refuse it everywhere, so a
        // schedule that validates here runs on every host.
        else if (parsed.restricted.dom && parsed.restricted.dow) problems.push('Restrict day of month or day of week, not both');
        else if (scan(parsed).count === 0) problems.push(`"${recurrence.cron}" never fires`);
    }
    if (recurrence.timezone !== undefined && (hasEvery || !isTimeZone(recurrence.timezone))) {
        problems.push(hasEvery ? 'timezone applies to cron schedules only' : `Unknown time zone "${recurrence.timezone}"`);
    }
    if (!problems.length && min !== undefined) {
        const floor = parseEvery(min);
        const gap = minGapMinutes(recurrence);
        if (floor === null) problems.push(`minimum interval "${min}" is not a duration (15m, 2h, 1d)`);
        else if (gap !== null && gap < floor) problems.push(`Runs every ${gap} minute${gap === 1 ? '' : 's'} at its most frequent; the minimum is ${min}`);
    }
    return problems;
}

/** The comparable identity of a recurrence (what decides whether a stored schedule must be updated). */
function recurrenceKey(r) {
    if (!r) return '';
    return r.every !== undefined ? `every:${parseEvery(r.every)}` : `cron:${String(r.cron).trim().split(/\s+/).join(' ')}@${r.timezone || 'UTC'}`;
}

module.exports = { parseEvery, parseCron, minGapMinutes, validateRecurrence, recurrenceKey, isTimeZone, matches };
