/** In-memory HubSpot and Phone APIs shaped like the real ones as their manifests describe them. Test helper. */
/** A fake API: records by id, a write log, and the methods the manifest names. */
function hubspotApi() {
    const records = new Map();
    let n = 100;
    const api = {
        records, writes: [],
        seed(props, extra = {}) { const id = String(++n); records.set(id, { id, properties: { ...props }, updatedAt: extra.updatedAt || '2026-10-01T00:00:00Z' }); return id; },
        async getContactById({ id }) { return records.get(String(id)) || null; },
        async searchContacts({ email, phone }) { return [...records.values()].filter((r) => (email && r.properties.email === email) || (phone && r.properties.phone === phone)); },
        async listContacts({ after, limit = 100, updatedSince }) {
            const all = [...records.values()].filter((r) => !updatedSince || Date.parse(r.updatedAt) > Date.parse(updatedSince));
            const start = after ? Number(after) : 0;
            const page = all.slice(start, start + limit);
            return { results: page, ...(start + limit < all.length ? { paging: { next: { after: String(start + limit) } } } : {}) };
        },
        async createContact({ properties }) { api.writes.push(['create', properties]); const id = api.seed(properties, { updatedAt: '2026-10-02T00:00:00Z' }); return records.get(id); },
        async updateContact({ id, properties }) { api.writes.push(['update', id, properties]); const r = records.get(String(id)); Object.assign(r.properties, properties); r.updatedAt = '2026-10-03T00:00:00Z'; return r; },
    };
    return api;
}
function phoneApi() {
    const records = new Map();
    let n = 0;
    const api = {
        records, writes: [], searches: [],
        seed(fields, extra = {}) { const id = `CT${++n}`; records.set(id, { id, defaultFields: JSON.parse(JSON.stringify(fields)), ...extra }); return id; },
        async getContact({ id }) { return records.get(id) || null; },
        async searchContacts(args) {
            api.searches.push(args);
            return [...records.values()].filter((r) => (args.phone && r.defaultFields.phoneNumbers?.[0]?.value === args.phone) || (args.email && r.defaultFields.emails?.[0]?.value === args.email));
        },
        async listContacts({ pageToken, maxResults = 100 }) {
            const all = [...records.values()];
            const start = pageToken ? Number(pageToken) : 0;
            return { data: all.slice(start, start + maxResults), ...(start + maxResults < all.length ? { nextPageToken: String(start + maxResults) } : {}) };
        },
        async createContact({ defaultFields, externalId }) { api.writes.push(['create', defaultFields, externalId]); const id = api.seed(defaultFields, { externalId }); return records.get(id); },
        async updateContact({ id, defaultFields }) { api.writes.push(['update', id, defaultFields]); const r = records.get(id); r.defaultFields = { ...r.defaultFields, ...defaultFields }; return r; },
    };
    return api;
}

module.exports = { hubspotApi, phoneApi };
