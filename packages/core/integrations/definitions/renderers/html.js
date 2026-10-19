/**
 * Safe, self-contained HTML for a preview pane. Every piece of data goes through `esc`, links are http(s) only, styles
 * are inline attributes and there is no script, no `<style>`, no event handler and no external resource, so a pane can
 * show a vendor's record next to the definition's chrome without that record being able to do anything.
 */
const { str, safeUrl, toneOf } = require('./common');

const esc = (v) => str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** How each host frames what it shows. `generic` is for hosts with no look of their own (a phone app, Zendesk, Shopify…). */
const HOSTS = {
    hubspot: { label: 'HubSpot card', frame: `${FONT};background:#fff;border:1px solid #cbd6e2;border-radius:3px;max-width:420px;color:#33475b;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,.08)`, head: 'background:#f5f8fa;border-bottom:1px solid #cbd6e2;padding:8px 14px;font-size:12px;color:#516f90;font-weight:600', body: 'padding:14px', accent: '#ff7a59' },
    slack: { label: 'Slack message', frame: `${FONT};background:#fff;border:1px solid #e0e0e0;border-radius:8px;max-width:560px;color:#1d1c1d;font-size:15px`, head: 'padding:8px 14px 0;font-size:13px;color:#616061', body: 'padding:6px 14px 12px', accent: '#4a154b' },
    generic: { label: 'Preview', frame: `${FONT};background:#fff;border:1px solid #d9dde3;border-radius:6px;max-width:480px;color:#1f2937;font-size:14px`, head: 'background:#f3f4f6;border-bottom:1px solid #d9dde3;padding:8px 14px;font-size:12px;color:#6b7280;font-weight:600', body: 'padding:14px', accent: '#2563eb' },
};
const hostOf = (h) => HOSTS[h] || HOSTS.generic;
const TONE = { positive: 'background:#e6f4ea;color:#1e6b34', warning: 'background:#fff4d6;color:#8a5a00', critical: 'background:#fde8e6;color:#a4261b', neutral: 'background:#eceff3;color:#44505f' };

/** The view tree as HTML, without the host frame. */
function viewToHtmlBody(view, host = 'generic') {
    const H = hostOf(host);
    const go = (v) => {
        if (!v || typeof v !== 'object') return '';
        const p = v.props || {};
        const kids = () => (v.children || []).map(go).join('');
        switch (v.component) {
            case 'Stack': return `<div style="display:flex;flex-direction:column;gap:10px">${kids()}</div>`;
            case 'Heading': return `<h3 style="margin:0;font-size:16px;font-weight:700">${esc(p.text)}</h3>`;
            case 'Text': return `<p style="margin:0;line-height:1.4">${esc(p.text)}</p>`;
            case 'KeyValue': return `<dl style="margin:0;display:grid;grid-template-columns:max-content 1fr;gap:4px 14px">${(Array.isArray(p.items) ? p.items : []).map((it) => `<dt style="color:#6b7280">${esc(it?.label)}</dt><dd style="margin:0">${esc(it?.value) || '—'}</dd>`).join('')}</dl>`;
            case 'List': return `<ul style="margin:0;padding-left:18px">${(Array.isArray(p.items) ? p.items : []).map((it) => `<li>${esc(it?.title)}${it?.meta ? ` <span style="color:#6b7280;font-size:12px">${esc(it.meta)}</span>` : ''}</li>`).join('')}</ul>`;
            case 'Table': return `<table style="border-collapse:collapse;width:100%"><thead><tr>${(Array.isArray(p.columns) ? p.columns : []).map((c) => `<th style="text-align:left;border-bottom:1px solid #d9dde3;padding:4px 8px;font-size:12px;color:#6b7280">${esc(c)}</th>`).join('')}</tr></thead><tbody>${(Array.isArray(p.rows) ? p.rows : []).map((r) => `<tr>${(Array.isArray(r) ? r : []).map((c) => `<td style="border-bottom:1px solid #eef0f3;padding:4px 8px">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
            case 'Badge': return `<span style="display:inline-block;align-self:flex-start;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;${TONE[toneOf(p.tone)]}">${esc(p.text)}</span>`;
            case 'Empty': return `<p style="margin:0;color:#6b7280;font-style:italic">${esc(p.text)}</p>`;
            case 'Divider': return '<hr style="border:0;border-top:1px solid #e5e7eb;margin:2px 0">';
            case 'Button': return buttonHtml({ label: p.label, action: p.action, primary: p.style === 'primary', accent: H.accent });
            default: return kids();
        }
    };
    return go(view);
}

/** A button in a preview does nothing (no script), but says what it would do: a link for open_url, a `data-` marker for a workflow. */
function buttonHtml({ label, action, primary, accent }) {
    const style = `display:inline-block;align-self:flex-start;padding:6px 14px;border-radius:4px;font-size:14px;font-weight:600;text-decoration:none;cursor:default;${primary ? `background:${accent};color:#fff;border:1px solid ${accent}` : `background:#fff;color:${accent};border:1px solid ${accent}`}`;
    if (action?.type === 'open_url') {
        const url = safeUrl(action.url);
        if (url) return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="${style}">${esc(label || 'Open')}</a>`;
    }
    const wf = action?.type === 'userAction' ? ` data-workflow="${esc(action.workflow)}" title="${esc(`Runs the "${action.workflow}" workflow`)}"` : '';
    return `<button type="button"${wf} style="${style}">${esc(label || 'Open')}</button>`;
}

/** The framed preview: a head line saying what this is and where it appears, then the body. */
function frame(host, title, bodyHtml) {
    const H = hostOf(host);
    return `<div data-preview-host="${esc(host in HOSTS ? host : 'generic')}" style="${H.frame}"><div style="${H.head}">${esc(title || H.label)}</div><div style="${H.body}">${bodyHtml}</div></div>`;
}

/**
 * @param {object|null} view
 * @param {{ host?: string, title?: string }} [opts]
 */
function viewToHtml(view, { host = 'generic', title } = {}) {
    const body = view ? viewToHtmlBody(view, host) : `<p style="margin:0;color:#6b7280;font-style:italic">Nothing to show for this record.</p>`;
    return frame(host, title, body);
}

// ---- Slack: mrkdwn and Block Kit as HTML, so a posted message previews as it will look, not as a data dump ----

/** Slack mrkdwn (already Slack-encoded: `&amp;`, `<url|label>`) to HTML. Only `* _ ~ \`` and links are interpreted. */
function mrkdwnToHtml(text) {
    const parts = str(text).split(/(<[^<>\n]*>)/);
    const out = parts.map((seg) => {
        const tok = /^<([^<>\n]*)>$/.exec(seg);
        if (tok) {
            // the target is Slack-encoded like the rest (`&amp;` in a query string): decode it once, then esc() it as an attribute
            const [rawTarget, label] = tok[1].split('|');
            const target = rawTarget.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
            if (/^https?:\/\//i.test(target)) { const url = safeUrl(target); return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:#1264a3">${esc(label || target)}</a>` : esc(label || ''); }
            if (target.startsWith('!')) return `<span style="background:#fff3cd">@${esc(label || target.slice(1).split('^')[0])}</span>`;
            if (target.startsWith('@')) return `<span style="background:#e8f5fa;color:#1264a3">@${esc(label || target.slice(1))}</span>`;
            if (target.startsWith('#')) return `<span style="color:#1264a3">#${esc(label || target.slice(1))}</span>`;
            return esc(label || '');
        }
        // decode Slack's three entities once, then escape for HTML, then emphasis on the escaped text
        const raw = seg.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        return esc(raw)
            .replace(/`([^`\n]+)`/g, '<code style="background:#f4f4f4;border:1px solid #e0e0e0;border-radius:3px;padding:0 3px">$1</code>')
            .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<strong>$2</strong>')
            .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
            .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,!?:;])/g, '$1<del>$2</del>');
    }).join('');
    return out.replace(/\n/g, '<br>');
}

const textOf = (t) => (t && t.type === 'mrkdwn' ? mrkdwnToHtml(t.text) : esc(t?.text));

function slackBlocksToHtml(blocks) {
    return (Array.isArray(blocks) ? blocks : []).map((b) => {
        switch (b?.type) {
            case 'header': return `<div style="font-size:18px;font-weight:700;margin:6px 0">${esc(b.text?.text)}</div>`;
            case 'section': return `<div style="margin:4px 0">${b.text ? `<div>${textOf(b.text)}</div>` : ''}${Array.isArray(b.fields) ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:4px">${b.fields.map((f) => `<div>${textOf(f)}</div>`).join('')}</div>` : ''}</div>`;
            case 'context': return `<div style="color:#616061;font-size:12px;margin:4px 0">${(b.elements || []).map(textOf).join(' ')}</div>`;
            case 'divider': return '<hr style="border:0;border-top:1px solid #e0e0e0;margin:8px 0">';
            case 'actions': return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0">${(b.elements || []).map((e) => (e.url
                ? buttonHtml({ label: e.text?.text, action: { type: 'open_url', url: e.url }, accent: '#1264a3' })
                : buttonHtml({ label: e.text?.text, action: { type: 'userAction', workflow: safeWorkflow(e.value) }, primary: e.style === 'primary', accent: e.style === 'primary' ? '#007a5a' : '#1264a3' }))).join('')}</div>`;
            default: return `<div style="color:#616061;font-size:12px">(${esc(b?.type || 'unknown')} block)</div>`;
        }
    }).join('');
}
function safeWorkflow(value) { try { const w = JSON.parse(value)?.workflow; return typeof w === 'string' ? w : ''; } catch (_) { return ''; } }

/** A Slack message as the channel will show it: who posts it, where, then the blocks (or the text). */
function slackMessageToHtml({ channel, text, blocks, appName = 'Your integration' }) {
    const to = channel ? esc(channel) : '<em>(channel not chosen yet)</em>';
    const body = Array.isArray(blocks) && blocks.length ? slackBlocksToHtml(blocks) : `<div>${mrkdwnToHtml(text)}</div>`;
    return `<div data-preview-host="slack" style="${HOSTS.slack.frame}"><div style="${HOSTS.slack.head}"><strong style="color:#1d1c1d">${esc(appName)}</strong> <span style="background:#e8e8e8;border-radius:3px;padding:0 4px;font-size:11px">APP</span> to ${to}</div><div style="${HOSTS.slack.body}">${body}</div></div>`;
}

/** Any other outbound call: what it is and what it carries. The values are escaped, and objects are shown as JSON. */
function callToHtml({ module, capability, args }) {
    const rows = Object.entries(args || {}).map(([k, v]) => `<dt style="color:#6b7280">${esc(k)}</dt><dd style="margin:0;white-space:pre-wrap;word-break:break-word">${esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2))}</dd>`).join('');
    return frame('generic', `Would call ${module} · ${capability}`, `<dl style="margin:0;display:grid;grid-template-columns:max-content 1fr;gap:4px 14px">${rows}</dl>`);
}

module.exports = { viewToHtml, viewToHtmlBody, slackBlocksToHtml, slackMessageToHtml, mrkdwnToHtml, callToHtml, esc, HOSTS };
