/**
 * Rollup window keys. A window key is `<granularity>:<UTC-truncated-timestamp>`
 * (e.g. `day:2026-07-05`, `hour:2026-07-05T14`), prefixed by granularity so the
 * store can filter a series by bucket (`window startsWith 'day:'`) and range on
 * the ISO-lexicographic keys. Shared by the rollup writer and the read
 * repositories so the write/read formats can never drift.
 */
function windowKey(bucket, date = new Date()) {
    const iso = new Date(date).toISOString();
    return `${bucket}:${
        bucket === 'hour' ? iso.slice(0, 13) : iso.slice(0, 10)
    }`;
}

/**
 * The window keys a usage event falls into — one per granularity.
 * @param {Date} [date] Defaults to now.
 * @returns {string[]} e.g. ['day:2026-07-05', 'hour:2026-07-05T14']
 */
function computeUsageWindows(date = new Date()) {
    return [windowKey('day', date), windowKey('hour', date)];
}

module.exports = { computeUsageWindows, windowKey };
