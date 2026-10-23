/**
 * The small part of JSON Schema that extension `options` and `config` need, without a dependency: type, properties,
 * required, additionalProperties: false, items, enum, const, oneOf/anyOf, minimum/maximum, default. Pure.
 *
 * A function value is accepted for any property: binding options may depend on instance config (ADR-054 §4,
 * `subscribe: (config) => [...]`), and they are checked again once resolved.
 */
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function matchesType(value, type) {
    const t = typeOf(value);
    if (type === 'integer') return t === 'number' && Number.isInteger(value);
    return t === type;
}

/**
 * @param {object} schema
 * @param {*} value
 * @param {string} [path]
 * @returns {string[]} problems, empty when valid
 */
function check(schema, value, path = '') {
    if (!schema || typeof schema !== 'object') return [];
    if (typeof value === 'function') return [];
    const at = path || '(root)';
    const problems = [];
    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!types.some((t) => matchesType(value, t))) return [`${at} must be ${types.join(' or ')}`];
    }
    if (schema.const !== undefined && value !== schema.const) problems.push(`${at} must be ${JSON.stringify(schema.const)}`);
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) problems.push(`${at} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
    if (typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${at} must be >= ${schema.minimum}`);
        if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${at} must be <= ${schema.maximum}`);
    }
    for (const key of ['oneOf', 'anyOf']) {
        if (Array.isArray(schema[key])) {
            const passing = schema[key].filter((s) => check(s, value, path).length === 0).length;
            if (key === 'oneOf' ? passing !== 1 : passing === 0) problems.push(`${at} does not match ${key === 'oneOf' ? 'exactly one' : 'any'} of the allowed shapes`);
        }
    }
    if (typeOf(value) === 'object') {
        for (const req of schema.required || []) {
            if (value[req] === undefined) problems.push(`${path ? `${path}.` : ''}${req} is required`);
        }
        const props = schema.properties || {};
        for (const [k, v] of Object.entries(value)) {
            if (props[k]) problems.push(...check(props[k], v, path ? `${path}.${k}` : k));
            else if (schema.additionalProperties === false) problems.push(`${path ? `${path}.` : ''}${k} is not an allowed option`);
        }
    }
    if (typeOf(value) === 'array' && schema.items) {
        value.forEach((item, i) => problems.push(...check(schema.items, item, `${path}[${i}]`)));
    }
    return problems;
}

/** The value with the schema's top-level property defaults filled in (shallow, as config forms do). */
function withDefaults(schema, value = {}) {
    const out = { ...(value || {}) };
    for (const [k, prop] of Object.entries(schema?.properties || {})) {
        if (out[k] === undefined && prop && prop.default !== undefined) out[k] = prop.default;
    }
    return out;
}

module.exports = { check, withDefaults };
