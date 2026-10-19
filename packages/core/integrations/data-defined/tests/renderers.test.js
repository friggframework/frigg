/**
 * The renderers: a resolved view tree as Slack blocks, HubSpot components and HTML, and the previews that put real
 * example definitions through them. What is asserted is the concrete output (escaped text, limits, the click's
 * payload, what a dry run would send), against the real examples, with the guards mutation-checked.
 */
const http = require('http');
const https = require('https');
const d = require('..');
const { decodeAction } = require('../renderers/common');
const { esc, mrkdwnToHtml, viewToHtml, slackBlocksToHtml } = require('../renderers/html');
const { HUBSPOT_COMPONENTS } = require('../renderers/hubspot');
const { LIMITS } = require('../renderers/slack');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));
const view = (component, props, children) => ({ component, props: props || {}, ...(children ? { children } : {}) });
const ZW = '​';
const walk = (n, fn) => { if (!n || typeof n !== 'object') return; fn(n); (n.children || []).forEach((c) => walk(c, fn)); };

describe('Slack blocks', () => {
    const evil = 'Acme <!channel> <https://evil.example|click> & Co *bold* _it_ ~gone~ `code`';

    it('escapes record data for mrkdwn: & < > by entity, formatting characters fenced, backticks swapped', () => {
        const { blocks, text } = d.viewToSlack(view('Stack', {}, [
            view('Heading', { text: evil }),
            view('Text', { text: evil }),
            view('KeyValue', { items: [{ label: 'Who <@U1>', value: evil }] }),
            view('List', { items: [{ title: evil, meta: '*m*' }] }),
            view('Badge', { text: evil, tone: 'done' }),
        ]));
        const section = blocks.find((b) => b.type === 'section' && b.text);
        expect(section.text.text).toBe(`Acme &lt;!channel&gt; &lt;https://evil.example|click&gt; &amp; Co ${ZW}*${ZW}bold${ZW}*${ZW} ${ZW}_${ZW}it${ZW}_${ZW} ${ZW}~${ZW}gone${ZW}~${ZW} ˋcodeˋ`);
        const all = JSON.stringify(blocks);
        // nothing a record supplied survives as live mrkdwn: no raw <!channel>, no raw link, no unfenced bold
        const mrkdwnTexts = [];
        for (const b of blocks) { if (b.text?.type === 'mrkdwn') mrkdwnTexts.push(b.text.text); (b.fields || []).forEach((f) => mrkdwnTexts.push(f.text)); (b.elements || []).forEach((e) => e.type === 'mrkdwn' && mrkdwnTexts.push(e.text)); }
        expect(mrkdwnTexts.length).toBe(4);
        for (const t of mrkdwnTexts) { expect(t).not.toMatch(/<!channel>|<https:\/\/evil/); expect(t).not.toContain('`'); }
        expect(all).toContain('&lt;@U1&gt;');
        // the notification fallback is parsed as mrkdwn by Slack too
        expect(text).not.toContain('<!channel>');
        expect(text).toContain('&lt;!channel&gt;');
        // a header is plain_text: no mrkdwn to escape, and never interpreted
        expect(blocks[0]).toEqual({ type: 'header', text: { type: 'plain_text', text: evil, emoji: false } });
    });

    it('cuts a long header, text and field to Slack limits with a marker, and never leaves half an entity', () => {
        const { blocks } = d.viewToSlack(view('Stack', {}, [
            view('Heading', { text: 'H'.repeat(400) }),
            view('Text', { text: 'x'.repeat(5000) }),
            view('Text', { text: `${'a'.repeat(2997)}&&&&` }),
            view('KeyValue', { items: [{ label: 'L', value: 'v'.repeat(3000) }] }),
        ]));
        expect(blocks[0].text.text).toHaveLength(LIMITS.header);
        expect(blocks[0].text.text.endsWith('…')).toBe(true);
        expect(blocks[1].text.text).toHaveLength(3000);
        expect(blocks[1].text.text.endsWith('…')).toBe(true);
        // 2997 chars + "&amp;" straddles the 3000 cut: the dangling "&a" must go with it
        expect(blocks[2].text.text.length).toBeLessThanOrEqual(3000);
        expect(blocks[2].text.text).toBe(`${'a'.repeat(2997)}…`);
        expect(blocks[3].fields[0].text).toHaveLength(2000);
    });

    it('keeps a message at 50 blocks with a visible marker, and bounds list, table, field and button counts', () => {
        const many = view('Stack', {}, Array.from({ length: 80 }, (_, i) => view('Text', { text: `line ${i}` })));
        const out = d.viewToSlack(many);
        expect(out.blocks).toHaveLength(50);
        expect(out.truncated).toBe(true);
        expect(out.blocks[49]).toEqual({ type: 'context', elements: [{ type: 'mrkdwn', text: '_… 31 more blocks not shown_' }] });
        expect(out.blocks[48].text.text).toBe('line 48');

        const list = d.viewToSlack(view('List', { items: Array.from({ length: 40 }, (_, i) => ({ title: `i${i}` })) }));
        expect(list.truncated).toBe(true);
        expect(list.blocks.map((b) => b.text.text).join('\n')).toContain('and 15 more');

        const kv = d.viewToSlack(view('KeyValue', { items: Array.from({ length: 23 }, (_, i) => ({ label: `k${i}`, value: i })) }));
        expect(kv.blocks.map((b) => b.fields.length)).toEqual([10, 10, 3]);

        const btns = d.viewToSlack(view('Stack', {}, Array.from({ length: 30 }, (_, i) => view('Button', { label: `b${i}`, action: { type: 'open_url', url: `https://example.com/${i}` } }))));
        expect(btns.blocks).toHaveLength(1);
        expect(btns.blocks[0].elements).toHaveLength(25);
        expect(btns.truncated).toBe(true);
        // unique action_ids within the block, labels cut to 75
        const ids = btns.blocks[0].elements.map((e) => e.action_id);
        expect(new Set(ids).size).toBe(25);
        const long = d.viewToSlack(view('Button', { label: 'L'.repeat(200), action: { type: 'open_url', url: 'https://example.com' } }));
        expect(long.blocks[0].elements[0].text.text).toHaveLength(75);
    });

    it('never throws on odd input: null view, wrong types, unknown component', () => {
        expect(d.viewToSlack(null)).toEqual({ blocks: [], text: 'Update', truncated: false });
        const out = d.viewToSlack(view('Stack', {}, [view('KeyValue', { items: 'nope' }), view('List', { items: { a: 1 } }), view('Table', { rows: 7, columns: 'x' }), view('Mystery', { text: 't' }), view('Text', { text: { a: 1 } }), view('Text', { text: null })]));
        expect(out.blocks).toEqual([{ type: 'section', text: { type: 'mrkdwn', text: '{"a":1}' } }]);
    });

    it('a userAction button carries { integrationId, workflow, surface } and decodes back (real example)', async () => {
        const def = example('hubspot-slack');
        const { ports } = d.recordingPorts({ def, manifests, fixtures: { 'hubspot.task.get': { id: '9', properties: { hs_task_subject: 'Call Dana', hs_task_status: 'OPEN' } } } });
        const r = await d.previewSurface({ def, surfaceId: 'task-actions', record: { metadata: { event_type: 'hubspot_task', event_payload: { taskId: '9' } } }, ports, installation: { integrationId: 'int_42', portalId: '55' } });
        const actions = r.slack.blocks.find((b) => b.type === 'actions');
        const done = actions.elements.find((e) => e.text.text === 'Mark done');
        expect(done.style).toBe('primary');
        expect(done.action_id).toMatch(/^frigg:mark-task-done:\d+$/);
        expect(JSON.parse(done.value)).toEqual({ integrationId: 'int_42', workflow: 'mark-task-done', surface: 'task-actions' });
        expect(decodeAction(done.value)).toEqual({ integrationId: 'int_42', workflow: 'mark-task-done', surface: 'task-actions' });
        // the open_url button is a link button with the interpolated URL, and no value
        const open = actions.elements.find((e) => e.text.text === 'Open in HubSpot');
        expect(open.url).toBe('https://app.hubspot.com/tasks/55/view/all/task/9');
        expect(open.value).toBeUndefined();
        // and the click's workflow really is one the definition has, triggered by a user action
        expect(def.workflows.find((w) => w.id === decodeAction(done.value).workflow).trigger.type).toBe('userAction');
    });

    it('marks a button whose workflow asks for input, and refuses to decode what is not ours', () => {
        const b = d.viewToSlack(view('Button', { label: 'Send', action: { type: 'userAction', workflow: 'w', input: { m: { type: 'text' } } } }), { surface: 's' });
        expect(decodeAction(b.blocks[0].elements[0].value)).toEqual({ workflow: 'w', surface: 's', needsInput: true });
        for (const bad of ['', 'nope', '{}', '{"workflow":5,"surface":"s"}', '{"workflow":"w"}', '{"workflow":"w","surface":"s","integrationId":7}', 'null']) expect(decodeAction(bad)).toBeNull();
    });

    it('drops a button whose URL is not http(s)', () => {
        for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'ftp://x', '//evil.example', 'https://a b', '']) {
            expect(d.viewToSlack(view('Button', { label: 'Go', action: { type: 'open_url', url } })).blocks).toEqual([]);
        }
    });
});

describe('HubSpot component description', () => {
    it('describes the Zendesk-style card with real component names, status as a Tag, and the action on the button', async () => {
        const def = example('quo-hubspot');
        const { ports } = d.recordingPorts({ def, manifests });
        const r = await d.previewSurface({ def, surfaceId: 'quo-card', record: { properties: { phone: '+15551230000' } }, ports, installation: { integrationId: 'int_1' } });
        expect(r.hubspot.type).toBe('Flex');
        const names = new Set();
        walk({ children: [r.hubspot] }, (n) => n.type && names.add(n.type));
        for (const n of names) expect(HUBSPOT_COMPONENTS).toContain(n);
        const button = JSON.stringify(r.hubspot);
        expect(JSON.parse(button)).toEqual(r.hubspot); // plain data
        let send;
        walk({ children: [r.hubspot] }, (n) => { if (n.type === 'Button' && n.children[0] === 'Send text') send = n; });
        expect(send.props.action).toEqual({ type: 'userAction', workflow: 'text-from-card', surface: 'quo-card', integrationId: 'int_1', input: { message: { type: 'text', label: 'Message' } } });
    });

    it('maps tone to Tag variants, keeps data as text children, never as markup, and disables a button with no safe action', () => {
        const t = (v) => d.viewToHubSpot(v);
        expect(t(view('Badge', { text: 'Done', tone: 'done' }))).toEqual({ type: 'Tag', props: { variant: 'success' }, children: ['Done'] });
        expect(t(view('Badge', { text: 'x', tone: 'indeterminate' })).props.variant).toBe('warning');
        expect(t(view('Badge', { text: 'x', tone: 'weird' })).props.variant).toBe('default');
        expect(t(view('Text', { text: '<script>alert(1)</script>' }))).toEqual({ type: 'Text', children: ['<script>alert(1)</script>'] });
        const bad = t(view('Button', { label: 'Go', action: { type: 'open_url', url: 'javascript:alert(1)' } }));
        expect(bad.props.disabled).toBe(true);
        expect(bad.props.action).toBeUndefined();
        expect(t(view('Button', { label: 'Go', action: { type: 'open_url', url: 'https://example.com/x' } })).props.action).toEqual({ type: 'open_url', url: 'https://example.com/x' });
        expect(t(null)).toBeNull();
    });

    it('renders KeyValue as a DescriptionList and Table as Table parts, and a Jira escalation card as the Zendesk surface it is', async () => {
        const kv = d.viewToHubSpot(view('KeyValue', { items: [{ label: 'Priority', value: 'High' }, { label: 'Owner', value: null }] }));
        expect(kv).toEqual({ type: 'DescriptionList', props: { direction: 'row' }, children: [
            { type: 'DescriptionListItem', props: { label: 'Priority' }, children: [{ type: 'Text', children: ['High'] }] },
            { type: 'DescriptionListItem', props: { label: 'Owner' }, children: [{ type: 'Text', children: ['—'] }] },
        ] });
        const table = d.viewToHubSpot(view('Table', { columns: ['A', 'B'], rows: [['1', '2']] }));
        expect(table.children.map((c) => c.type)).toEqual(['TableHead', 'TableBody']);
        expect(table.children[1].children[0].children.map((c) => c.type)).toEqual(['TableCell', 'TableCell']);
        const def = example('zendesk-jira');
        const { ports } = d.recordingPorts({ def, manifests });
        const r = await d.previewSurface({ def, surfaceId: 'jira-panel', record: {}, ports, installation: {} });
        expect(r.surface.host).toBe('zendesk');
        expect(r.hubspot).toBeUndefined(); // no hubspot tree unless that host is asked for
        expect(d.viewToHubSpot(r.view).type).toBe('Flex');
    });
});

describe('HTML', () => {
    const script = '<script>alert(1)</script>';

    it('escapes every piece of data, emits no script, handler or style element, and only http(s) links', () => {
        const html = viewToHtml(view('Stack', {}, [
            view('Heading', { text: script }),
            view('Text', { text: `"><img src=x onerror=alert(1)>` }),
            view('KeyValue', { items: [{ label: script, value: script }] }),
            view('List', { items: [{ title: script, meta: script }] }),
            view('Table', { columns: [script], rows: [[script]] }),
            view('Badge', { text: script, tone: 'critical' }),
            view('Empty', { text: script }),
            view('Button', { label: script, action: { type: 'open_url', url: 'javascript:alert(1)' } }),
            view('Button', { label: 'ok', action: { type: 'open_url', url: 'https://example.com/a?b=1&c="x"' } }),
            view('Button', { label: 'wf', action: { type: 'userAction', workflow: '"><script>' } }),
        ]), { host: 'hubspot' });
        expect(html).not.toMatch(/<script/i);
        expect(html).not.toMatch(/<style/i);
        expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i); // an attribute, not the escaped text of one
        expect(html).not.toMatch(/<img/i);
        expect(html).not.toMatch(/javascript:/i);
        expect(html).not.toMatch(/href="(?!https?:)/);
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('"x"'); // the quote in the URL could not become an attribute break
    });

    it('renders each real example surface for its host with no script', async () => {
        let n = 0;
        for (const def of d.loadExamples()) {
            for (const u of def.ui || []) {
                const { ports } = d.recordingPorts({ def, manifests });
                const r = await d.previewSurface({ def, surfaceId: u.id, record: {}, ports, installation: { integrationId: 'i' } });
                expect(r.html).not.toMatch(/<script|<style|<[^>]*\son[a-z]+\s*=|javascript:/i);
                expect(r.html).toContain(`data-preview-host="${['hubspot', 'slack'].includes(u.host) ? u.host : 'generic'}"`);
                n++;
            }
        }
        expect(n).toBeGreaterThanOrEqual(10);
    });

    it('applies the host look: hubspot card, slack message and generic frames differ', () => {
        const v = view('Heading', { text: 'Hi' });
        const [h, s, g] = ['hubspot', 'slack', 'generic'].map((host) => viewToHtml(v, { host }));
        expect(h).toContain('data-preview-host="hubspot"');
        expect(h).toContain('HubSpot card');
        expect(s).toContain('data-preview-host="slack"');
        expect(s).toContain('Slack message');
        expect(g).toContain('data-preview-host="generic"');
        const btn = view('Button', { label: 'B', style: 'primary', action: { type: 'userAction', workflow: 'w' } });
        expect(viewToHtml(btn, { host: 'hubspot' })).toContain('background:#ff7a59');
        expect(viewToHtml(btn, { host: 'generic' })).toContain('background:#2563eb');
        expect(viewToHtml(v, { host: 'quo' })).toBe(viewToHtml(v, { host: 'generic' }));
        expect(new Set([h, s, g]).size).toBe(3);
        expect(viewToHtml(null, { host: 'hubspot' })).toContain('Nothing to show');
    });

    it('esc covers the five characters and non-strings', () => {
        expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
        expect(esc(null)).toBe('');
        expect(esc({ a: '<' })).toBe('{&quot;a&quot;:&quot;&lt;&quot;}');
    });

    it('renders Slack mrkdwn: bold, italic, code, links, entities decoded once; nothing else becomes markup', () => {
        const h = mrkdwnToHtml(':tada: *Acme &amp; Co* closed <https://example.com/d?a=1&amp;b=2|Open deal>\n_nice_ `x < y`');
        expect(h).toContain('<strong>Acme &amp; Co</strong>');
        expect(h).toContain('<a href="https://example.com/d?a=1&amp;b=2" target="_blank" rel="noopener noreferrer" style="color:#1264a3">Open deal</a>');
        expect(h).toContain('<em>nice</em>');
        expect(h).toContain('<code');
        expect(h).toContain('x &lt; y');
        expect(h).toContain('<br>');
        const nasty = mrkdwnToHtml('<script>alert(1)</script> <javascript:alert(1)|x> <https://a.example|"><script>>');
        expect(nasty).not.toMatch(/<script/i);
        expect(nasty).not.toMatch(/javascript:/i);
        // an http(s)-looking target that is not a clean URL is not linked either
        const spaced = mrkdwnToHtml('<https://ok.example/a b|x> <https://ok.example/a"b|y>');
        expect(spaced).not.toContain('href=');
        expect(spaced).toContain('x');
        expect(slackBlocksToHtml([{ type: 'image' }, null])).not.toMatch(/<script/);
    });
});

describe('previewSurface', () => {
    it('gives view, html and the host-specific description for a Slack surface, from sample records', async () => {
        const def = example('fathom-hubspot-notion');
        const { ports } = d.recordingPorts({ def, manifests });
        const r = await d.previewSurface({ def, surfaceId: 'stage-approval', record: { metadata: {} }, ports, installation: { integrationId: 'int_9' } });
        expect(r.surface).toMatchObject({ id: 'stage-approval', host: 'slack', placement: 'message.actions' });
        expect(r.view.component).toBe('Stack');
        expect(r.slack.blocks.map((b) => b.type)).toContain('section');
        expect(r.html).toContain('data-preview-host="slack"');
        expect(r.hubspot).toBeUndefined();
        // an explicit host re-renders the same data for another one
        const asHub = await d.previewSurface({ def, surfaceId: 'stage-approval', record: { metadata: {} }, ports, installation: {}, host: 'hubspot' });
        expect(asHub.hubspot.type).toBe('Flex');
        expect(asHub.slack).toBeUndefined();
        await expect(d.previewSurface({ def, surfaceId: 'nope', ports, installation: {} })).rejects.toThrow('Unknown UI surface');
    });
});

describe('previewWorkflow: a dry run', () => {
    const installFor = (id, settings) => ({ integrationId: 'int_1', portalId: '55', workflows: { [id]: { settings } } });

    it('captures the Slack post exactly as it would be sent, rendered, with the step it came from', async () => {
        const def = example('hubspot-slack');
        const r = await d.previewWorkflow({
            def, workflowId: 'deal-won', manifests, installation: installFor('deal-won', { channel: 'C123' }),
            event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '77' },
            fixtures: { 'hubspot.deal.get': { id: '77', properties: { dealname: 'Acme renewal', amount: '12000' } }, 'hubspot.owner.get': { firstName: 'Dana' } },
        });
        expect(r.status).toBe('completed');
        expect(r.sends).toHaveLength(1);
        const send = r.sends[0];
        expect(send).toMatchObject({ module: 'slack', capability: 'message.post', kind: 'write', stepId: 'slack.message.post#3', at: 'steps[3]' });
        expect(send.args).toEqual({ channel: 'C123', text: ':tada: *Acme renewal* closed won for $12000. Nice work Dana! <https://app.hubspot.com/contacts/55/record/0-3/77|Open deal>' });
        expect(send.rendered.slack).toEqual(send.args);
        expect(send.rendered.html).toContain('<strong>Acme renewal</strong>');
        expect(send.rendered.html).toContain('href="https://app.hubspot.com/contacts/55/record/0-3/77"');
        expect(send.rendered.html).toContain('to C123');
        // reads are listed (with the step ids the definition gave them) but are not "sends"
        expect(r.calls.map((c) => [c.stepId, c.capability, c.kind])).toEqual([['deal', 'deal.get', 'read'], ['owner', 'owner.get', 'read'], ['slack.message.post#3', 'message.post', 'write']]);
        expect(r.calls[0].rendered).toBeNull();
    });

    it('says so when a setting is not chosen yet, and renders blocks when the step sends them', async () => {
        const def = example('hubspot-slack');
        const r = await d.previewWorkflow({ def, workflowId: 'deal-won', manifests, installation: { portalId: '1' }, event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '7' } });
        expect(r.sends[0].rendered.html).toContain('channel not chosen yet');
        // blocks on a slack call
        const withBlocks = JSON.parse(JSON.stringify(def));
        withBlocks.workflows.find((w) => w.id === 'deal-won').steps.find((s) => s.use === 'slack.message.post').with.blocks = [{ type: 'header', text: { type: 'plain_text', text: 'Won <b>' } }, { type: 'section', text: { type: 'mrkdwn', text: '*hi* <https://example.com|there>' } }];
        const b = await d.previewWorkflow({ def: withBlocks, workflowId: 'deal-won', manifests, installation: installFor('deal-won', { channel: 'C1' }), event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '7' } });
        expect(b.sends[0].rendered.slack.blocks).toHaveLength(2);
        expect(b.sends[0].rendered.html).toContain('Won &lt;b&gt;');
        expect(b.sends[0].rendered.html).toContain('<strong>hi</strong>');
    });

    it('renders a non-Slack write as a "would call" card with escaped args, and the sample payload drives a webhook workflow with no event', async () => {
        const def = example('quo-hubspot');
        const r = await d.previewWorkflow({ def, workflowId: 'text-from-card', manifests, installation: { settings: { fromNumber: '+15550000000' } }, event: { input: { message: 'Hi <script>' } }, record: { properties: { phone: '+15551234567' } } });
        const send = r.sends[0];
        expect(send.args).toEqual({ from: '+15550000000', to: ['+15551234567'], content: 'Hi <script>' });
        expect(send.rendered.html).toContain('Would call quo');
        expect(send.rendered.html).toContain('Hi &lt;script&gt;');
        expect(send.rendered.html).not.toMatch(/<script/i);
        expect(send.rendered.slack).toBeUndefined();
        // no event given: the manifest's sample payload for the trigger stands in, and it is enough for the workflow to act
        const sample = await d.previewWorkflow({ def: example('calendly-salesforce'), workflowId: 'booking-to-event', manifests });
        expect(sample.status).toBe('completed');
        expect(sample.sends.length).toBe(2);
        expect(sample.sends[0].args.fields).toMatchObject({ FirstName: 'Priya', Email: 'priya@acme.example', Company: 'Acme Corp' });
        expect(sample.sends[1].rendered.html).toContain('Discovery call (30 min) with Priya Natarajan');
    });

    it('answers from fixture functions with the call args, and from the manifest shape when there is no fixture', async () => {
        const def = example('hubspot-slack');
        let seen;
        const r = await d.previewWorkflow({
            def, workflowId: 'deal-won', manifests, installation: installFor('deal-won', { channel: 'C1' }),
            event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '5' },
            fixtures: { 'hubspot.deal.get': (args, meta) => { seen = [args, meta]; return { id: args.id, properties: { dealname: `Deal ${args.id}` } }; } },
        });
        expect(seen).toEqual([{ id: '5' }, { module: 'hubspot', capability: 'deal.get' }]);
        expect(r.sends[0].args.text).toContain('*Deal 5*');
        // owner.get had no fixture and the manifest declares no owner object: an empty record, so the template falls back to "team"
        expect(r.calls[1].output).toEqual({});
        expect(r.sends[0].args.text).toContain('Nice work team!');
        // deal.get with no fixture at all: the manifest's own shape, ids filled so `exists` checks proceed
        const bare = await d.previewWorkflow({ def, workflowId: 'deal-won', manifests, installation: installFor('deal-won', { channel: 'C1' }), event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '5' } });
        expect(bare.calls[0].output).toEqual(expect.objectContaining({ id: 'preview-deal-id' }));
    });

    it('records a call that fails (an unknown capability) with its error, and reports the failed run', async () => {
        const def = example('hubspot-slack');
        def.workflows.find((w) => w.id === 'deal-won').steps.splice(0, 0, { id: 'bad', use: 'hubspot.nothing.here' });
        const r = await d.previewWorkflow({ def, workflowId: 'deal-won', manifests, installation: {}, event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '1' } });
        expect(r.status).toBe('failed');
        expect(r.error).toContain('hubspot.nothing.here is not declared');
        expect(r.calls[0]).toMatchObject({ stepId: 'bad', capability: 'nothing.here', kind: 'unknown', error: 'not declared by the module manifest' });
        expect(r.sends).toEqual([]);
    });

    it('shows an approval pause instead of running past it', async () => {
        const def = example('hubspot-slack');
        const w = def.workflows.find((x) => x.id === 'deal-won');
        w.steps.splice(1, 0, { id: 'ok', use: 'approval', with: { prompt: 'Post <b>this</b> to #wins?' } });
        const r = await d.previewWorkflow({ def, workflowId: 'deal-won', manifests, installation: {}, event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '1' } });
        expect(r.status).toBe('waiting');
        expect(r.waiting).toMatchObject({ kind: 'approval', prompt: 'Post <b>this</b> to #wins?' });
        expect(r.waiting.html).toContain('Post &lt;b&gt;this&lt;/b&gt; to #wins?');
        expect(r.sends).toEqual([]);
    });

    it('stubs code steps: recorded, never run', async () => {
        const def = example('hubspot-slack');
        def.workflows.find((w) => w.id === 'deal-won').steps.splice(0, 0, { id: 'c', use: 'code', with: { ref: 'pkg#boom@1.0.0', with: { a: 1 } } });
        const r = await d.previewWorkflow({ def, workflowId: 'deal-won', manifests, installation: {}, event: { propertyName: 'dealstage', propertyValue: 'closedwon', objectId: '1' }, fixtures: { 'code:pkg#boom@1.0.0': { grouped: true } } });
        expect(r.calls[0]).toMatchObject({ stepId: 'c', module: 'code', capability: 'pkg#boom@1.0.0', kind: 'code', args: { a: 1 }, output: { grouped: true } });
        expect(r.sends.find((s) => s.kind === 'code')).toBeUndefined();
    });

    it('makes zero real calls: every workflow of every example, with real network entry points trapped', async () => {
        const hits = [];
        const trap = (name) => (...a) => { hits.push([name, String(a[0]?.href || a[0]?.host || a[0])]); throw new Error(`REAL CALL: ${name}`); };
        const saved = { fetch: global.fetch, http: http.request, https: https.request };
        global.fetch = trap('fetch'); http.request = trap('http'); https.request = trap('https');
        let ran = 0;
        let sends = 0;
        try {
            for (const def of d.loadExamples()) {
                for (const w of def.workflows || []) {
                    const r = await d.previewWorkflow({ def, workflowId: w.id, manifests, installation: { integrationId: 'i', portalId: '1' } });
                    // a DryRunError would mean a call got past the recorder to the base ports' API function
                    expect(JSON.stringify(r)).not.toContain('dry run');
                    expect(r.calls.every((c) => !c.error || c.kind === 'unknown')).toBe(true);
                    ran++; sends += r.sends.length;
                }
            }
        } finally { global.fetch = saved.fetch; http.request = saved.http; https.request = saved.https; }
        expect(hits).toEqual([]);
        expect(ran).toBeGreaterThan(40);
        expect(sends).toBeGreaterThan(5);
    });

    it('the ports under the recorder refuse any real API call', async () => {
        const def = example('hubspot-slack');
        const { ports, refusing } = d.recordingPorts({ def, manifests });
        await expect(refusing.call('hubspot', 'deal.get', { id: '1' })).rejects.toThrow('dry run: hubspot.getDealById was not performed');
        await expect(ports.call('hubspot', 'deal.get', { id: '1' })).resolves.toEqual(expect.objectContaining({ id: 'preview-deal-id' }));
    });
});
