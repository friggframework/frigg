/**
 * Resolved view tree -> Slack Block Kit. Data comes from vendor records, so everything that is data is escaped for
 * mrkdwn, and everything is cut to Slack's limits with a visible marker instead of letting chat.postMessage reject the
 * whole message (a long deal name must not cost the approval request).
 */
const { str, safeUrl, truncate, toneOf, encodeAction } = require('./common');

const LIMITS = { blocks: 50, header: 150, sectionText: 3000, fieldText: 2000, fields: 10, contextText: 3000, contextElements: 10, button: 75, buttonUrl: 3000, actionId: 255, actions: 25, listItems: 25, itemText: 300 };
const MARK = '…';
const ZWSP = '\u200b';

/**
 * Text that is DATA, for a mrkdwn field. `&`, `<` and `>` are the three characters Slack requires escaping (this also
 * defuses `<!channel>` and `<https://evil|click>` in a vendor field). Slack has no backslash escape for `* _ ~ \``, so
 * `* _ ~` are fenced with a zero-width space, which stops them pairing into bold/italic/strike without changing how they
 * look. A fenced backtick would still pair into a code span, so it becomes the look-alike U+02CB.
 */
function escapeMrkdwn(v) {
    return str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[*_~]/g, `${ZWSP}$&${ZWSP}`).replace(/`/g, '\u02cb');
}
const mrkdwn = (t) => ({ type: 'mrkdwn', text: t });
const plain = (t) => ({ type: 'plain_text', text: t, emoji: false });
const clip = (s, max) => truncate(s, max, MARK);

/** Lines packed into as few sections as fit 3000 characters; one line is never split. */
function linesToSections(lines) {
    const out = [];
    let cur = '';
    for (const l of lines) {
        const line = clip(l, LIMITS.itemText);
        if (cur && cur.length + 1 + line.length > LIMITS.sectionText) { out.push(cur); cur = ''; }
        cur = cur ? `${cur}\n${line}` : line;
    }
    if (cur) out.push(cur);
    return out.map((text) => ({ type: 'section', text: mrkdwn(clip(text, LIMITS.sectionText)) }));
}

const TONE_EMOJI = { positive: ':large_green_circle:', warning: ':large_yellow_circle:', critical: ':red_circle:', neutral: ':white_circle:' };

/**
 * @param {object|null} view  resolveView output ({ component, props, children })
 * @param {{ integrationId?: string, surface?: string }} [opts]  what a button's click carries back
 * @returns {{ blocks: object[], text: string, truncated: boolean }}  `text` is the notification/fallback text
 */
function viewToSlack(view, { integrationId, surface } = {}) {
    const blocks = [];
    let text = '';
    let truncated = false;
    let pending = []; // consecutive buttons share one actions block
    let n = 0;

    const flush = () => {
        if (!pending.length) return;
        const els = pending.slice(0, LIMITS.actions);
        if (pending.length > LIMITS.actions) truncated = true;
        blocks.push({ type: 'actions', elements: els });
        pending = [];
    };
    const push = (b) => { flush(); blocks.push(b); };

    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        const p = node.props || {};
        switch (node.component) {
            case 'Heading': {
                flush();
                const t = clip(str(p.text), LIMITS.header);
                if (!text) text = t;
                if (t) blocks.push({ type: 'header', text: plain(t) });
                break;
            }
            case 'Text': {
                const t = str(p.text);
                if (!text) text = t;
                if (t) push({ type: 'section', text: mrkdwn(clip(escapeMrkdwn(t), LIMITS.sectionText)) });
                break;
            }
            case 'KeyValue': {
                const items = Array.isArray(p.items) ? p.items : [];
                for (let i = 0; i < items.length; i += LIMITS.fields) {
                    const fields = items.slice(i, i + LIMITS.fields).map((it) => mrkdwn(clip(`*${escapeMrkdwn(it?.label)}*\n${escapeMrkdwn(it?.value) || '—'}`, LIMITS.fieldText)));
                    if (fields.length) push({ type: 'section', fields });
                }
                break;
            }
            case 'List': {
                const items = Array.isArray(p.items) ? p.items : [];
                const lines = items.slice(0, LIMITS.listItems).map((it) => `• ${escapeMrkdwn(it?.title)}${it?.meta ? ` — _${escapeMrkdwn(it.meta)}_` : ''}`);
                if (items.length > LIMITS.listItems) { lines.push(`_${MARK} and ${items.length - LIMITS.listItems} more_`); truncated = true; }
                flush();
                blocks.push(...linesToSections(lines));
                break;
            }
            case 'Table': {
                const cols = Array.isArray(p.columns) ? p.columns : [];
                const rows = Array.isArray(p.rows) ? p.rows : [];
                const lines = [];
                if (cols.length) lines.push(cols.map((c) => `*${escapeMrkdwn(c)}*`).join('  |  '));
                for (const r of rows.slice(0, LIMITS.listItems)) lines.push((Array.isArray(r) ? r : []).map((c) => escapeMrkdwn(c) || '—').join('  |  '));
                if (rows.length > LIMITS.listItems) { lines.push(`_${MARK} and ${rows.length - LIMITS.listItems} more_`); truncated = true; }
                flush();
                blocks.push(...linesToSections(lines));
                break;
            }
            case 'Badge': {
                const t = str(p.text);
                if (t) push({ type: 'context', elements: [mrkdwn(clip(`${TONE_EMOJI[toneOf(p.tone)]} *${escapeMrkdwn(t)}*`, LIMITS.contextText))] });
                break;
            }
            case 'Empty': {
                const t = str(p.text);
                if (t) push({ type: 'context', elements: [mrkdwn(clip(`_${escapeMrkdwn(t)}_`, LIMITS.contextText))] });
                break;
            }
            case 'Divider': push({ type: 'divider' }); break;
            case 'Button': {
                const label = clip(str(p.label) || 'Open', LIMITS.button);
                const style = p.style === 'primary' ? { style: 'primary' } : p.style === 'danger' ? { style: 'danger' } : {};
                const a = p.action;
                if (a?.type === 'userAction' && typeof a.workflow === 'string') {
                    const value = encodeAction({ integrationId, workflow: a.workflow, surface, needsInput: !!a.input });
                    if (value) pending.push({ type: 'button', text: plain(label), action_id: clip(`frigg:${a.workflow}`, LIMITS.actionId - 8) + `:${n++}`, value, ...style });
                } else if (a?.type === 'open_url') {
                    const url = safeUrl(a.url);
                    if (url && url.length <= LIMITS.buttonUrl) pending.push({ type: 'button', text: plain(label), action_id: `frigg:open:${n++}`, url });
                }
                break;
            }
            default: break; // Stack, and anything a newer definition adds: just its children
        }
        for (const c of node.children || []) walk(c);
    };
    walk(view);
    flush();

    // 50 blocks is Slack's whole-message cap. Keep 49 and say so, rather than lose the message.
    let out = blocks;
    if (blocks.length > LIMITS.blocks) {
        out = [...blocks.slice(0, LIMITS.blocks - 1), { type: 'context', elements: [mrkdwn(`_${MARK} ${blocks.length - (LIMITS.blocks - 1)} more blocks not shown_`)] }];
        truncated = true;
    }
    // `text` is the notification fallback and Slack parses it as mrkdwn too, so a record's `<!channel>` must not ping from there either.
    return { blocks: out, text: clip(escapeMrkdwn(text || 'Update'), LIMITS.sectionText), truncated };
}

module.exports = { viewToSlack, escapeMrkdwn, LIMITS };
