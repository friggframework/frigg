/**
 * Application layer for data-defined integrations (ADR-063): publishing definition versions, the catalogue the
 * runtime reads from, and per-installation upgrades. Business rules live here; the repositories only store rows.
 *
 *   createDefinitionCatalog()        what defineSharedIntegrationClass({ definitions }) reads: get(id, version), latest(id)
 *   PublishDefinitionVersion         validate (schema + references) → checkBump against the latest published → store
 *   DeprecateDefinitionVersion       PUBLISHED → DEPRECATED (still runs for its pins, cannot be newly installed)
 *   ListPublishedDefinitions         the install catalogue: latest published version of each definition
 *   GetDefinitionHistory             every version of one definition, newest first
 *   PlanInstallationUpgrade          planUpgrade(installation, pinned, target), without changing anything
 */
const { checksum } = require('../canonical');
const { checkBump, planUpgrade } = require('../versioning');

class DefinitionError extends Error {
    constructor(message, { status = 400, code, details } = {}) { super(message); this.name = 'DefinitionError'; this.status = status; this.code = code; this.details = details; }
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/;
function compareVersions(a, b) {
    const x = SEMVER.exec(a), y = SEMVER.exec(b);
    if (!x || !y) return String(a).localeCompare(String(b));
    for (let i = 1; i <= 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
    if (x[4] && !y[4]) return -1;                                // 1.0.0-beta < 1.0.0
    if (!x[4] && y[4]) return 1;
    return String(x[4] || '').localeCompare(String(y[4] || ''));
}
const newestFirst = (rows) => [...rows].sort((a, b) => compareVersions(b.version, a.version));
const SERVABLE = new Set(['PUBLISHED', 'DEPRECATED', 'RETIRED']);   // a DRAFT never reaches the runtime

/**
 * The definition store the runtime reads from. Published rows are immutable, so they are cached by id@version for the
 * life of the process; a pinned checksum is verified, so an installation provably runs the document it was pinned to.
 */
function createDefinitionCatalog({ repository } = {}) {
    const repo = () => repository || (repository = require('../repositories/definition-version-repository').createDefinitionVersionRepository());
    const cache = new Map();
    return {
        async get(definitionId, version, { checksum: expected } = {}) {
            const key = `${definitionId}@${version}`;
            let row = cache.get(key);
            if (!row) {
                row = await repo().findVersion(definitionId, version);
                if (!row || !SERVABLE.has(row.status)) return null;
                cache.set(key, row);
            }
            if (expected && expected !== row.checksum) throw new DefinitionError(`${key} does not match the pinned checksum`, { status: 409, code: 'CHECKSUM_MISMATCH' });
            return row.document;
        },
        /** The latest PUBLISHED version (not deprecated, not draft): what a new installation pins. */
        async latest(definitionId) {
            const rows = (await repo().listVersions(definitionId)).filter((r) => r.status === 'PUBLISHED');
            return rows.length ? newestFirst(rows)[0].document : null;
        },
        async checksumOf(definitionId, version) {
            return (await repo().findVersion(definitionId, version))?.checksum || null;
        },
        /** The workspace that built a definition, or null for the app's own catalogue. */
        async ownerOf(definitionId) {
            const rows = await repo().listVersions(definitionId);
            return rows[0]?.workspaceId ?? null;
        },
        /** The install catalogue: latest published version of each definition (with `workspaceId`, that workspace's too). */
        list: (context) => new ListPublishedDefinitions({ repository: repo() }).execute(context),
        /** The repository behind this catalogue, for publishing (bundled stores have none). */
        get repository() { return repo(); },
    };
}

class PublishDefinitionVersion {
    /**
     * @param {{ repository, manifests: object, check?: (def, manifests) => { valid, errors, warnings } }} deps
     *        check defaults to schema-check's checkDefinition (JSON Schema + references)
     */
    constructor({ repository, manifests, check, isReserved }) {
        this.repository = repository;
        this.manifests = manifests;
        this.check = check || require('../schema-check').checkDefinition;
        /** Names a definition may not take: the app's registered (code) integrations. */
        this.isReserved = isReserved || (() => false);
    }

    /** @returns {Promise<{ version: object, created: boolean, changeLevel: string|null, warnings: array }>} */
    /** @param {{ workspaceId?: string }} p workspaceId: the workspace building its own integration (null: the app's catalogue) */
    async execute({ document, notes, createdBy, publish = true, strict = false, workspaceId = null } = {}) {
        if (!document || typeof document !== 'object') throw new DefinitionError('Send the definition as `document`');
        const result = this.check(document, this.manifests);
        if (!result.valid || (strict && result.warnings.length)) throw new DefinitionError(`${document.id}@${document.version} is not valid`, { code: 'INVALID', details: { errors: result.errors, warnings: result.warnings } });

        // An id belongs to one owner: the app's catalogue, or one workspace. Nobody publishes over someone else's, nor
        // takes the name of a code integration.
        if (this.isReserved(document.id)) throw new DefinitionError(`"${document.id}" is the name of an integration this app already has`, { status: 409, code: 'ID_TAKEN' });
        const versions = await this.repository.listVersions(document.id);
        if (versions.some((v) => (v.workspaceId ?? null) !== (workspaceId ?? null))) throw new DefinitionError(`"${document.id}" is already used by another integration`, { status: 409, code: 'ID_TAKEN' });

        const sum = checksum(document);
        const existing = await this.repository.findVersion(document.id, document.version);
        if (existing && existing.status !== 'DRAFT') {
            if (existing.checksum === sum) return { version: existing, created: false, changeLevel: existing.changeLevel, warnings: result.warnings };
            throw new DefinitionError(`${document.id}@${document.version} is already ${existing.status.toLowerCase()} and cannot change. Publish a new version.`, { status: 409, code: 'IMMUTABLE' });
        }

        const published = newestFirst(versions.filter((r) => r.status === 'PUBLISHED' || r.status === 'DEPRECATED'));
        const previous = published.find((r) => r.version !== document.version) || null;
        let changeLevel = null;
        if (previous) {
            if (compareVersions(document.version, previous.version) <= 0) throw new DefinitionError(`${document.version} is not newer than the latest published ${previous.version}`, { status: 409, code: 'NOT_NEWER' });
            const bump = checkBump(previous.document, document);
            if (!bump.ok) throw new DefinitionError(bump.message, { status: 409, code: 'BUMP_TOO_SMALL', details: { required: bump.required, declared: bump.declared, changes: bump.changes } });
            changeLevel = bump.required;
        }

        const row = {
            definitionId: document.id, version: document.version, schemaVersion: document.schemaVersion, checksum: sum, document,
            changeLevel, previousVersion: previous?.version || null, notes: notes ?? null, createdBy: createdBy ?? null, workspaceId: workspaceId ?? null,
            status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? new Date() : null,
        };
        if (existing) {
            // A draft may be rewritten, and published, as long as it is still a draft when we write (checked by the
            // database, so two concurrent publishes cannot both win).
            const updated = await this.repository.updateIfStatus(document.id, document.version, 'DRAFT', row);
            if (!updated) throw new DefinitionError(`${document.id}@${document.version} changed while publishing; try again`, { status: 409, code: 'CONFLICT' });
            return { version: updated, created: false, changeLevel, warnings: result.warnings };
        }
        try {
            return { version: await this.repository.createVersion(row), created: true, changeLevel, warnings: result.warnings };
        } catch (e) {
            if (e?.code === 'P2002') {
                // Lost a race to the same version: the same document is the same publish; anything else is a conflict.
                const winner = await this.repository.findVersion(document.id, document.version);
                if (winner?.checksum === sum) return { version: winner, created: false, changeLevel: winner.changeLevel, warnings: result.warnings };
                throw new DefinitionError(`${document.id}@${document.version} was published with different content just now`, { status: 409, code: 'CONFLICT' });
            }
            throw e;
        }
    }
}

class DeprecateDefinitionVersion {
    constructor({ repository }) { this.repository = repository; }
    async execute({ definitionId, version }) {
        const row = await this.repository.updateIfStatus(definitionId, version, 'PUBLISHED', { status: 'DEPRECATED' });
        if (row) return row;
        const existing = await this.repository.findVersion(definitionId, version);
        if (!existing) throw new DefinitionError(`${definitionId}@${version} does not exist`, { status: 404, code: 'NOT_FOUND' });
        throw new DefinitionError(`${definitionId}@${version} is ${existing.status.toLowerCase()}; only a published version can be deprecated`, { status: 409, code: 'WRONG_STATUS' });
    }
}

class ListPublishedDefinitions {
    constructor({ repository }) { this.repository = repository; }
    /**
     * Latest published version of each definition, with what an install screen shows: the app's catalogue, plus the
     * integrations `workspaceId` built (another workspace's are never listed). Without a workspace, every one.
     */
    async execute({ workspaceId } = {}) {
        const byId = new Map();
        for (const r of await this.repository.listByStatus(['PUBLISHED'])) {
            if (workspaceId && r.workspaceId && r.workspaceId !== String(workspaceId)) continue;
            const cur = byId.get(r.definitionId);
            if (!cur || compareVersions(r.version, cur.version) > 0) byId.set(r.definitionId, r);
        }
        const out = [];
        for (const r of byId.values()) {
            const doc = (await this.repository.findVersion(r.definitionId, r.version)).document;
            out.push({
                id: r.definitionId, version: r.version, checksum: r.checksum, publishedAt: r.publishedAt, workspaceId: r.workspaceId ?? null,
                display: doc.display, modules: Object.fromEntries(Object.entries(doc.modules || {}).map(([k, m]) => [k, m.module])),
                counts: { syncs: (doc.syncs || []).length, links: (doc.links || []).length, workflows: (doc.workflows || []).length, ui: (doc.ui || []).length },
            });
        }
        return out.sort((a, b) => String(a.display?.label || a.id).localeCompare(String(b.display?.label || b.id)));
    }
}

class GetDefinitionHistory {
    constructor({ repository }) { this.repository = repository; }
    async execute({ definitionId }) {
        const rows = newestFirst(await this.repository.listVersions(definitionId));
        if (!rows.length) throw new DefinitionError(`No definition "${definitionId}"`, { status: 404, code: 'NOT_FOUND' });
        return rows.map(({ document, ...meta }) => meta);
    }
}

/**
 * The installation an approval decision is about, for someone who may not own it: an approval step names its
 * approvers, and they decide from their own sign-in. Whether this user may decide a particular run is the run's
 * business (decide()); here, only who owns it.
 */
/**
 * A workspace's own integration, for its editor: every version (drafts included) and the newest document. Anyone
 * else's, or the app's catalogue, is "not found": the editor exists only for what this workspace built.
 */
class GetOwnDefinition {
    constructor({ repository }) { this.repository = repository; }
    async execute({ definitionId, workspaceId }) {
        const rows = newestFirst(await this.repository.listVersions(definitionId));
        if (!rows.length || !workspaceId || rows[0].workspaceId !== String(workspaceId)) throw new DefinitionError(`No integration "${definitionId}" in this workspace`, { status: 404, code: 'NOT_FOUND' });
        return { id: definitionId, versions: rows.map(({ document, ...meta }) => meta), document: rows[0].document };
    }
}

class GetIntegrationForDecision {
    constructor({ getIntegrationInstance }) { this.getIntegrationInstance = getIntegrationInstance; }
    async execute(integrationId, userId) {
        const record = await this.getIntegrationInstance.integrationRepository.findIntegrationById(integrationId).catch(() => null);
        if (!record) throw new DefinitionError(`Integration ${integrationId} not found`, { status: 404, code: 'NOT_FOUND' });
        const isOwner = String(record.userId) === String(userId);
        const integration = await this.getIntegrationInstance.execute(integrationId, record.userId);
        return { integration, isOwner };
    }
}

class PlanInstallationUpgrade {
    constructor({ catalog }) { this.catalog = catalog; }
    /** @returns {Promise<{ from, to, allowed, needs, actions, config, changes }>} */
    async execute({ config, toVersion }) {
        const pin = config?.definition;
        if (!pin?.id || !pin?.version) throw new DefinitionError('This installation does not name a definition', { code: 'NO_PIN' });
        const from = await this.catalog.get(pin.id, pin.version);
        const target = toVersion || (await this.catalog.latest(pin.id))?.version;
        if (!target) throw new DefinitionError(`No published version of "${pin.id}"`, { status: 404, code: 'NOT_FOUND' });
        const to = await this.catalog.get(pin.id, target);
        if (!from || !to) throw new DefinitionError(`${pin.id}@${!from ? pin.version : target} is not published`, { status: 404, code: 'NOT_FOUND' });
        const plan = planUpgrade(config, from, to);
        plan.config.definition = { ...plan.config.definition, checksum: await this.catalog.checksumOf(pin.id, target) };
        return { from: pin.version, to: target, ...plan, changes: require('../versioning').diff(from, to).changes };
    }
}

module.exports = {
    DefinitionError, compareVersions, createDefinitionCatalog,
    PublishDefinitionVersion, DeprecateDefinitionVersion, ListPublishedDefinitions, GetDefinitionHistory, PlanInstallationUpgrade,
    GetIntegrationForDecision, GetOwnDefinition,
};
