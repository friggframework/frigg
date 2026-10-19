/**
 * The v0.1 gaps the 15 examples exposed, each closed inside v0.1: link sets, fixed values and merge, foreach collect,
 * static checks of templates and views, option lists that take inputs, arithmetic filters, a sync-only definition,
 * and lifecycle results and account values on $.install.
 */
const d = require('..');
const { renderTemplate, resolve } = require('../expressions');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));
const errorsOf = (def) => d.validate(def, manifests).errors.map((e) => `${e.path}: ${e.message}`);

function harness(def, respond = () => ({ id: 'out_1' }), seed = {}) {
    const store = new Map(Object.entries(seed));
    const calls = [];
    const ports = d.makePorts({
        def, manifests,
        store: { get: async (k) => store.get(k) || null, put: async (k, v) => { store.set(k, v); }, claim: async (k, v) => { if (store.has(k)) return false; store.set(k, v); return true; }, release: async (k) => { store.delete(k); } },
        callApi: async (module, method, args) => { calls.push({ module, method, args }); return respond(module, method, args); },
    });
    return { store, calls, ports };
}
const run = (def, steps, ctx = {}, ports) => d.execute(steps, { def, installation: {}, ctx: { event: {}, ...ctx }, ports });

describe('link sets (links without a sync)', () => {
    const def = () => example('calendly-salesforce');

    it('stores and finds links under the link set, normalising identity keys with its transform', async () => {
        const h = harness(def());
        await run(def(), [{ use: 'links.upsert', with: { link: 'people', ids: { calendly: 'inv_1', salesforce: '00Q1' }, keys: { email: 'Dana@Acme.com' } } }], {}, h.ports);
        expect(h.store.get('link:people:calendly:inv_1')).toMatchObject({ calendly: 'inv_1', salesforce: '00Q1' });
        expect(h.store.has('idx:people:email:dana@acme.com')).toBe(true);
        const out = await run(def(), [{ id: 'hit', use: 'links.find', with: { link: 'people', key: { email: 'DANA@acme.com' } } }], {}, h.ports);
        expect(out.steps.hit).toMatchObject({ salesforce: '00Q1' });
    });

    it('the calendly example has no syncs any more: its links are link sets', () => {
        expect(def().syncs).toBeUndefined();
        expect(def().links.map((l) => l.id)).toEqual(['people', 'meetings']);
        expect(errorsOf(def())).toEqual([]);
    });

    it('refuses an unknown link set, naming both link and sync, a module the set does not join, and a key it does not index', () => {
        const x = def();
        const steps = x.workflows[0].steps;
        steps.unshift(
            { use: 'links.find', with: { link: 'nope', key: { email: 'a' } } },
            { use: 'links.find', with: { link: 'people', sync: 'people', key: { email: 'a' } } },
            { use: 'links.upsert', with: { link: 'people', ids: { hubspot: '1' } } },
            { use: 'links.find', with: { link: 'people', key: { phone: '1' } } },
        );
        const e = errorsOf(x).join('\n');
        expect(e).toMatch(/Unknown link set "nope"/);
        expect(e).toMatch(/names a link set \(link\) or a sync \(sync\), exactly one/);
        expect(e).toMatch(/"hubspot" is not one of the modules link set "people" links/);
        expect(e).toMatch(/"phone" is not an identity key of link set "people"/);
    });

    it('a link set joins two different, existing objects', () => {
        const x = def();
        x.links[0].between = ['calendly.invitee', 'calendly.scheduledEvent'];
        x.links[1].between = ['calendly.nope', 'salesforce.event'];
        const e = errorsOf(x).join('\n');
        expect(e).toMatch(/links\[0\]\.between: A link set joins two different modules/);
        expect(e).toMatch(/links\[1\]\.between\[0\]: Module "calendly" has no object "nope"/);
    });
});

describe('fixed values and merge', () => {
    it('a mapping row can write a fixed value, which skips the source and still passes the transform', () => {
        const out = d.applyMapping([{ source: 'n', target: 'name' }, { target: 'Line[0].DetailType', value: 'SalesItemLineDetail' }, { target: 'stage', value: 'Lead', transform: 'lowercase' }], { n: 'Acme' });
        expect(out).toEqual({ name: 'Acme', Line: [{ DetailType: 'SalesItemLineDetail' }], stage: 'lead' });
    });

    it('a row has a source or a value, never both or neither', () => {
        const x = example('stripe-quickbooks');
        x.workflows[0].steps.unshift({ use: 'map', with: { record: '$.record', mapping: [{ target: 'a' }, { target: 'b', source: 'x', value: 1 }] } });
        const e = errorsOf(x).join('\n');
        expect(e).toMatch(/mapping\[0\]: A row needs a source or a fixed value/);
        expect(e).toMatch(/mapping\[1\]: A row has a source or a fixed value, not both/);
    });

    it('merge deep-merges, later objects win, lists are replaced, and inputs are untouched', async () => {
        const a = { properties: { name: 'A', tags: ['x'] }, keep: 1 };
        const out = await run(example('phone-hubspot'), [{ id: 'm', use: 'merge', with: { objects: ['$.vars.a', { properties: { tags: ['y'], owner: '7' } }] } }], { vars: { a } });
        expect(out.steps.m).toEqual({ properties: { name: 'A', tags: ['y'], owner: '7' }, keep: 1 });
        expect(a).toEqual({ properties: { name: 'A', tags: ['x'] }, keep: 1 });
    });
});

describe('foreach collect and where', () => {
    const def = example('phone-hubspot');

    it('collect makes the step result a list of one value per item; where skips items before the cap', async () => {
        const items = [{ n: 'a', ok: true }, { n: 'b', ok: false }, { n: 'c', ok: true }, { n: 'd', ok: true }];
        const out = await run(def, [{ id: 'names', use: 'foreach', with: { over: '$.vars.items', where: '$.item.ok == true', max: 2, collect: '{{item.n | upper}}' } }], { vars: { items } });
        expect(out.steps.names).toEqual(['A', 'C']);
        expect(out.trace.find((t) => t.status === 'truncated').note).toMatch(/1 items over max 2/);
    });

    it('collect can read the step results of its own iteration', async () => {
        const out = await run(def, [{ id: 'lines', use: 'foreach', with: { over: '$.vars.items', collect: '$.steps.line' }, do: [{ id: 'line', use: 'template', with: { text: '#{{index}} {{item}}' } }] }], { vars: { items: ['x', 'y'] } });
        expect(out.steps.lines).toEqual(['#0 x', '#1 y']);
    });

    it('the digests build their message with collect and join, not repeated set', async () => {
        const hs = example('hubspot-slack');
        const w = hs.workflows.find((x) => x.id === 'weekly-digest');
        expect(JSON.stringify(w.steps)).not.toMatch(/"use":"set"/);
        const deals = [{ id: '1', properties: { dealname: 'Acme', amount: '1200' } }, { id: '2', properties: { dealname: 'Globex', amount: '450' } }];
        const h = harness(hs, (m, method) => (method === 'searchDeals' ? { total: deals.length, results: deals } : { ok: true }));
        const r = await d.runWorkflow({ def: hs, installation: { workflows: { 'weekly-digest': { settings: { channel: 'C1' } } } }, workflowId: 'weekly-digest', ports: h.ports, manifests });
        expect(r.status).toBe('completed');
        const post = h.calls.find((c) => c.method === 'postMessage');
        expect(post.args.text.split('\n')).toHaveLength(3);                       // heading + one line per deal
        expect(post.args.text).toMatch(/\(2 deals\)/);
    });

    it('foreach needs do, collect or both, and max is 1..1000', () => {
        const x = example('phone-hubspot');
        x.workflows[0].steps.unshift({ use: 'foreach', with: { over: '$.event.x' } }, { use: 'foreach', with: { over: '$.event.x', max: 5000, collect: '$.item' } });
        const e = errorsOf(x).join('\n');
        expect(e).toMatch(/foreach needs do steps, collect, or both/);
        expect(e).toMatch(/with\.max: A whole number from 1 to 1000/);
    });
});

describe('static checks of templates and views', () => {
    it('an unknown filter is an error wherever a template appears: steps, named templates, views', () => {
        const x = example('phone-hubspot');
        x.templates['call-note'] += ' {{record.x | shout}}';
        x.workflows[0].steps.push({ use: 'set', with: { y: '{{event.id | yell}}' } });
        x.ui[0].view.children[0].props.text = '{{data.calls | whisper}}';
        const e = errorsOf(x).join('\n');
        expect(e).toMatch(/templates\.call-note: Unknown template filter "shout"/);
        expect(e).toMatch(/Unknown template filter "yell"/);
        expect(e).toMatch(/Unknown template filter "whisper"/);
    });

    it('a view can only read what its query returns, $.item inside a List row and $.row inside a Table column', () => {
        const x = example('phone-hubspot');
        const kids = x.ui[0].view.children;
        kids[0].props.text = '{{data.deals}}';
        kids.push({ component: 'Text', props: { text: '{{item.title}}' } }, { component: 'Text', props: { text: '{{steps.x}}' } });
        const e = errorsOf(x).join('\n');
        expect(e).toMatch(/\$\.data\.deals is not returned by query "recent-activity" \(calls, texts\)/);
        expect(e).toMatch(/\$\.item is not available here/);
        expect(e).toMatch(/\$\.steps is not available here/);
    });

    it('a named template no step renders is a warning', () => {
        const x = example('phone-hubspot');
        x.templates.orphan = 'hi';
        expect(d.validate(x, manifests).warnings.map((w) => w.path)).toContain('templates.orphan');
    });
});

describe('option lists that take inputs', () => {
    const def = example('asana-slack');
    const projects = [{ gid: 'p1', name: 'Launch' }, { gid: 'p2', name: 'Ops' }];

    it('calls the list with inputs read from earlier choices, and returns nothing until they are chosen', async () => {
        const h = harness(def, (m, method) => (method === 'listProjects' ? projects : []));
        expect(await d.resolveOptions({ def, manifests, ports: h.ports, path: 'settings.project', values: {} })).toEqual([]);
        expect(h.calls).toEqual([]);
        const opts = await d.resolveOptions({ def, manifests, ports: h.ports, path: 'settings.project', values: { workspace: 'w9' } });
        expect(opts).toEqual([{ label: 'Launch', value: 'p1' }, { label: 'Ops', value: 'p2' }]);
        expect(h.calls).toEqual([{ module: 'asana', method: 'listProjects', args: { workspace: 'w9' } }]);
    });

    it('a workflow setting reads integration settings as $.install', async () => {
        const gl = example('github-linear');
        const h = harness(gl, () => [{ id: 's1', name: 'Done' }]);
        const opts = await d.resolveOptions({ def: gl, manifests, ports: h.ports, path: 'workflows.pr-merged-done.settings.doneState', values: {}, integrationSettings: { team: 'T1' } });
        expect(opts).toEqual([{ label: 'Done', value: 'Done' }]);
        expect(h.calls[0].args).toEqual({ teamId: 'T1' });
    });

    it('refuses a missing required input, an undeclared one, reading itself, and a loop', () => {
        const x = example('asana-slack');
        x.settings.project.options = { source: 'asana.project', with: { colour: '$.settings.workspace' } };
        x.settings.workspace.options = { source: 'asana.workspace', with: {} };
        let e = errorsOf(x).join('\n');
        expect(e).toMatch(/settings\.project\.options\.with\.workspace: Option list asana\.project needs input "workspace"/);
        expect(e).toMatch(/takes no input "colour"/);
        x.settings.project.options = { source: 'asana.project', with: { workspace: '$.settings.project' } };
        expect(errorsOf(x).join('\n')).toMatch(/cannot read its own setting/);
        const loop = example('asana-slack');
        loop.settings.a = { type: 'option', label: 'A', options: { source: 'asana.project', with: { workspace: '$.settings.b' } } };
        loop.settings.b = { type: 'option', label: 'B', options: { source: 'asana.project', with: { workspace: '$.settings.a' } } };
        expect(errorsOf(loop).join('\n')).toMatch(/Option inputs form a loop/);
    });
});

describe('arithmetic filters and typed single-tag templates', () => {
    it('money in minor units follows the currency, and rounds away float error', () => {
        expect(renderTemplate('{{v | to_cents}}', { v: 19.99 })).toBe(1999);
        expect(renderTemplate('{{v | to_cents}}', { v: 19.995 })).toBe(2000);
        expect(d.TRANSFORMS.units_to_cents(19.995)).toBe(2000);
        expect(renderTemplate('{{v | from_minor_units: c}}', { v: 1999, c: 'usd' })).toBe(19.99);
        expect(renderTemplate('{{v | from_minor_units: c}}', { v: 1999, c: 'JPY' })).toBe(1999);
        expect(renderTemplate('{{v | from_minor_units: c}}', { v: 1999, c: 'KWD' })).toBe(1.999);
        expect(renderTemplate('{{v | to_minor_units: c}}', { v: 12.5, c: 'EUR' })).toBe(1250);
        expect(renderTemplate('{{v | to_minor_units: c}}', { v: 1250, c: 'JPY' })).toBe(1250);
        expect(renderTemplate('{{v | to_minor_units: c}}', { v: 1.5, c: 'KWD' })).toBe(1500);
    });

    it('unix seconds convert both ways, and chain with date', () => {
        expect(renderTemplate('{{t | from_unix | date}}', { t: 1760796433 })).toBe('2025-10-18');
        expect(renderTemplate('{{t | to_unix}}', { t: '2026-10-18T14:07:12Z' })).toBe(1792332432);
    });

    it('a single tag keeps its type; text around a tag makes a string; bad input gives blank, never a throw', () => {
        expect(resolve({ n: '{{v | times: 2}}', s: 'n={{v | times: 2}}', l: '{{list}}' }, { v: 4, list: [1, 2] })).toEqual({ n: 8, s: 'n=8', l: [1, 2] });
        expect(renderTemplate('{{v | divided_by: 0}}', { v: 4 })).toBe('');
        expect(renderTemplate('{{v | plus: 1}}', { v: 'abc' })).toBe('');
        expect(renderTemplate('{{v | round: 2}}', { v: 1.005 })).toBe(1.01);
        expect(renderTemplate("{{v | join: '\\n'}}", { v: ['a', '', 'b'] })).toBe('a\nb');
    });

    it('the Stripe receipt converts cents and unix time with filters, not a code step', async () => {
        const st = example('stripe-quickbooks');
        const w = st.workflows.find((x) => x.id === 'payment-sales-receipt');
        expect(JSON.stringify(w.steps)).not.toMatch(/MinorUnits/);
        const h = harness(st, (m, method) => ({ id: 'qb_1', method }), { 'link:customers:stripe:cus_1': { quickbooks: '58', stripe: 'cus_1' } });
        const event = JSON.parse(JSON.stringify(manifests.stripe.events[w.trigger.topic].payload));
        Object.assign(event.data.object, { amount_received: 125000, currency: 'jpy', customer: 'cus_1', created: 1760796433 });
        const r = await d.runWorkflow({ def: st, installation: { settings: { depositAccount: '35', incomeItem: '1' } }, workflowId: w.id, event, ports: h.ports, manifests });
        expect(r.status).toBe('completed');
        const receipt = h.calls.find((c) => c.method === 'createSalesReceipt').args;
        expect(JSON.stringify(receipt)).toMatch(/"Amount":125000/);            // JPY has no minor unit
        expect(JSON.stringify(receipt)).toMatch(/"TxnDate":"2025-10-18"/);
    });
});

describe('a sync-only definition', () => {
    it('validates and compiles to sync events only: no workflow, query or UI events', () => {
        const ph = example('pipedrive-hubspot');
        expect(errorsOf(ph)).toEqual([]);
        expect(Object.keys(d.compile(ph, {}).events).sort()).toEqual(['SYNC_PEOPLE_BACKFILL', 'SYNC_PEOPLE_ONGOING', 'SYNC_PEOPLE_PAGE']);
        expect(d.compile(ph, {}).webhooks).toEqual({ pipedrive: { 'person.*': ['SYNC_PEOPLE_ONGOING'] }, hubspot: { 'contact.*': ['SYNC_PEOPLE_ONGOING'] } });
    });
});

describe('lifecycle results and account values on $.install', () => {
    class FakeBase {
        constructor(p = {}) { this.events = {}; this.config = p.config; this.id = p.id; this.pipedrive = { api: {} }; this.phone = { api: {} }; this.calls = []; }
        registerEventHandlers() {}
        async patchConfig(patch) { this.config = { ...this.config, ...patch }; }
        async onCreate() {} async onDelete() {} async onUpdate() {}
        async getMapping() { return null; } async upsertMapping() {} async createMapping() {}
    }
    const make = (def, apis) => {
        const Cls = d.defineSharedIntegrationClass({ definitions: d.memoryDefinitions([def]), manifests, modules: { pipedrive: {}, phone: {}, hubspot: {}, zendesk: {}, jira: {} }, IntegrationBase: FakeBase, runs: false });
        const inst = new Cls({ id: 'int_1', config: { definition: { id: def.id, version: def.version } } });
        Object.assign(inst, apis(inst));
        return inst;
    };

    it('install keeps every onInstall result by step id, and uninstall undoes exactly those', async () => {
        const def = example('pipedrive-phone');
        let n = 0;
        const inst = make(def, (self) => ({
            phone: { api: { createUnifiedWebhook: async (a) => { self.calls.push(['phone.create', a]); return { id: 'WHq' }; }, deleteWebhook: async (id) => { self.calls.push(['phone.delete', id]); } } },
            pipedrive: { api: { createWebhook: async (a) => { self.calls.push(['pd.create', a]); n += 1; return { id: `pd${n}` }; }, deleteWebhook: async (id) => { self.calls.push(['pd.delete', id]); } } },
        }));
        await inst.onCreate({});
        expect(inst.config.runtime.installed).toEqual({ phoneHook: { id: 'WHq' }, personCreated: { id: 'pd1' }, personChanged: { id: 'pd2' } });
        inst.calls.length = 0;
        await inst.onDelete({});
        expect(inst.calls).toEqual([['phone.delete', 'WHq'], ['pd.delete', 'pd1'], ['pd.delete', 'pd2']]);
    });

    it('in every example, uninstall makes one call per thing install created, and never with a blank id', async () => {
        for (const def of d.loadExamples().filter((x) => x.lifecycle?.onInstall?.length)) {
            let n = 0; const calls = [];
            const created = (k) => ({ id: `id${k}`, gid: `id${k}`, connectId: `id${k}`, resource: { uri: `id${k}` }, webhookRegistrationResult: [{ createdWebhookId: k }] });
            const ports = d.makePorts({ def, manifests, store: { get: async () => null, put: async () => {}, claim: async () => true }, callApi: async (module, method, args) => { calls.push(args); n += 1; return created(n); } });
            const install = await d.runLifecycle({ def, installation: { webhookUrl: 'https://x/wh' }, hook: 'onInstall', ports });
            const installed = Object.fromEntries(def.lifecycle.onInstall.filter((st) => st.id).map((st) => [st.id, install.steps[st.id] ?? null]));
            const made = calls.length; calls.length = 0;
            await d.runLifecycle({ def, installation: { runtime: { installed } }, hook: 'onUninstall', ports });
            const blank = calls.filter((args) => Object.values(args).some((v) => v == null || (Array.isArray(v) && (!v.length || v.some((x) => x == null)))));
            expect([def.id, calls.length, blank]).toEqual([def.id, made, []]);
        }
    });

    it('$.install.accounts exposes only the account fields a manifest declares, in queries as in workflows', async () => {
        const def = example('zendesk-jira');
        const inst = make(def, () => ({ zendesk: { api: { subdomain: 'acme', secretToken: 'never' } }, jira: { api: { site: 'acme.atlassian.net', cloudId: 'c1' } } }));
        await inst.loadDefinition();
        expect(inst.installation().accounts).toEqual({ zendesk: { subdomain: 'acme' }, jira: { site: 'acme.atlassian.net', cloudId: 'c1' } });
        const q = def.queries[0];
        const h = harness(def, () => ({ key: 'SUP-1' }), { [`link:escalations:zendesk:42`]: { jira: '10001', zendesk: 42 } });
        const out = await d.runQuery({ def, installation: inst.installation(), queryId: q.id, record: { id: 42 }, ports: h.ports });
        expect(JSON.stringify(out)).toMatch(/acme\.atlassian\.net/);
    });

    it('warns when uninstall never undoes an install step, or an install step keeps no result', () => {
        const x = example('pipedrive-phone');
        x.lifecycle.onUninstall = x.lifecycle.onUninstall.filter((st) => st.use !== 'phone.webhook.delete');
        x.lifecycle.onInstall.push({ use: 'phone.webhook.create', with: { url: '$.install.webhookUrl', events: ['call.completed'] } });
        const w = d.validate(x, manifests).warnings.map((e) => `${e.path}: ${e.message}`).join('\n');
        expect(w).toMatch(/onInstall\[0\]: onUninstall never reads \$\.install\.runtime\.installed\.phoneHook/);
        expect(w).toMatch(/onInstall\[3\]: This install step has no id/);
        // Unimplemented-capability warnings are about the module's Api (see the unimplemented-capability tests), not install/uninstall pairing.
        expect(d.validate(example('pipedrive-phone'), manifests).warnings.filter((e) => !/unimplemented|verification/.test(e.message))).toEqual([]);
    });

    it('refuses an undeclared account field, an unknown install step, and install steps reading their own results', () => {
        const x = example('zendesk-jira');
        x.workflows[0].steps.push({ use: 'set', with: { a: '$.install.accounts.zendesk.password', b: '$.install.runtime.installed.nope', c: '$.install.runtime.subscriptions' } });
        x.lifecycle.onInstall[1].with.url = '$.install.runtime.installed.zendeskHook.id';
        const e = errorsOf(x).join('\n');
        expect(e).toMatch(/zendesk declares no account field "password"/);
        expect(e).toMatch(/no onInstall step has id "nope"/);
        expect(e).toMatch(/runtime only holds "installed"/);
        expect(e).toMatch(/Install steps cannot read \$\.install\.runtime\.installed/);
    });
});

describe('manifest validation', () => {
    it('every bundled manifest is valid', () => {
        for (const [name, m] of Object.entries(manifests)) expect([name, d.validateManifest(m).errors]).toEqual([name, []]);
    });

    it('refuses an option label that mixes $. into text, an option list on a write capability, and an unlisted enum', () => {
        const m = JSON.parse(JSON.stringify(manifests.hubspot));
        m.options.owner.label = '$.item.firstName {{item.lastName}}';
        m.options.dealStage.capability = 'deal.update';
        m.objects.deal.fields.find((f) => f.name === 'properties.dealstage').values = undefined;
        const e = d.validateManifest(m).errors.map((x) => `${x.path}: ${x.message}`).join('\n');
        expect(e).toMatch(/options\.owner\.label: .* renders literally/);
        expect(e).toMatch(/options\.dealStage\.capability: An option list reads; deal\.update is a write capability/);
        expect(e).toMatch(/An enum lists its values, or names an option list/);
    });
});

describe('versioning of the new shapes', () => {
    it('a new link set is minor; changing its identity is major and the upgrade says lookups by key will miss', () => {
        const a = example('calendly-salesforce');
        const b = { ...example('calendly-salesforce'), version: '2.1.0', links: [...a.links, { id: 'extra', between: ['calendly.invitee', 'salesforce.lead'] }] };
        expect(d.diff(a, b).level).toBe('minor');
        const c = example('calendly-salesforce'); c.version = '3.0.0'; c.links[0].identity.match[0].key = 'mail';
        expect(d.checkBump(a, { ...c, version: '2.1.0' }).ok).toBe(false);
        expect(d.planUpgrade({}, a, c).actions.map((x) => x.kind)).toContain('reindex');
    });

    it('changing only an option list\'s inputs is minor, not "setting type changed"', () => {
        const a = example('asana-slack');
        const b = example('asana-slack'); b.version = '0.3.0';
        b.settings.project.options = { ...b.settings.project.options, with: { workspace: '$.settings.workspace', archived: false } };
        expect(d.diff(a, b).changes.map((x) => `${x.level} ${x.message}`)).toEqual(['minor Option list inputs changed']);
    });
});
