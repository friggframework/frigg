/**
 * What every renderer shares: coercion of view props (they come from record data, so any type can arrive), the one
 * URL rule, truncation that never leaves half an entity behind, and the button <-> Slack round trip.
 */

/** A view prop as text. Objects are JSON, null/undefined are empty: a renderer never prints "[object Object]" or "undefined". */
function str(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return ''; } }
    return String(v);
}

/**
 * Only http(s) links leave a preview or a card. Record data decides these URLs ("{{data.proposal.recording}}"), and a
 * `javascript:` or `data:` URL in a vendor field must not become a clickable thing in someone's HubSpot or Slack.
 * @returns {string|null}
 */
function safeUrl(u) {
    const s = str(u).trim();
    if (!/^https?:\/\/[^\s<>"']+$/i.test(s)) return null;
    try { new URL(s); } catch (_) { return null; }
    return s;
}

/**
 * Cut to at most `max` characters, ending in the marker. Never leaves a dangling half of a Slack entity ("&am"), which
 * would render as literal junk instead of the character it stood for.
 */
function truncate(s, max, marker = '…') {
    s = String(s);
    if (s.length <= max) return s;
    let cut = s.slice(0, Math.max(0, max - marker.length));
    cut = cut.replace(/&(?:[a-z]{1,4}|#\d{0,6}|#x[0-9a-f]{0,5})?$/i, '');
    return cut + marker;
}

/** Badge tone (`neutral`, or a Jira statusCategory key like `done`) -> one of four. Unknown is neutral, never an error. */
function toneOf(tone) {
    const t = str(tone).toLowerCase();
    if (['positive', 'success', 'good', 'done', 'green', 'complete', 'completed'].includes(t)) return 'positive';
    if (['warning', 'caution', 'indeterminate', 'yellow', 'in_progress', 'pending'].includes(t)) return 'warning';
    if (['critical', 'danger', 'error', 'bad', 'red', 'failed'].includes(t)) return 'critical';
    return 'neutral';
}

const ACTION_VALUE_MAX = 2000; // Slack's cap on a button's value

/**
 * A userAction button's identity as a Slack button value: which installation, which workflow, which surface it was on.
 * `needsInput` marks a button whose workflow asks for values first (a Slack button cannot, so the handler opens a form).
 */
function encodeAction({ integrationId, workflow, surface, needsInput }) {
    const value = JSON.stringify({ ...(integrationId ? { integrationId: String(integrationId) } : {}), workflow, surface, ...(needsInput ? { needsInput: true } : {}) });
    return value.length <= ACTION_VALUE_MAX ? value : null;
}

/** The inverse, for the handler that receives a click. null for anything that is not one of ours. */
function decodeAction(value) {
    let v;
    try { v = JSON.parse(value); } catch (_) { return null; }
    if (!v || typeof v !== 'object' || typeof v.workflow !== 'string' || !v.workflow || typeof v.surface !== 'string') return null;
    if (v.integrationId !== undefined && typeof v.integrationId !== 'string') return null;
    return { ...(v.integrationId ? { integrationId: v.integrationId } : {}), workflow: v.workflow, surface: v.surface, ...(v.needsInput ? { needsInput: true } : {}) };
}

module.exports = { str, safeUrl, truncate, toneOf, encodeAction, decodeAction, ACTION_VALUE_MAX };
