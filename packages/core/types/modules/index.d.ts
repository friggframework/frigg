declare module "@friggframework/core" {
  /** Where an entity type comes from: the app's `entities` map or an integration binding it. */
  export type EntityTypeSource =
    | { kind: "app" }
    | { kind: "integration"; name: string };

  export type EntityScope = "individual" | "organization" | "global";

  /** App-level settings carried from the `entities` entry; empty for an inferred-only type. */
  export interface EntityTypeSettings {
    scope?: EntityScope | { default?: EntityScope; allow?: EntityScope[] };
    proxy?: Record<string, unknown>;
    display?: Record<string, unknown>;
  }

  export interface EntityTypeEntry {
    /** The API module definition. */
    definition: any;
    /** Frozen. `{ kind: 'app' }` first when registered, then each binding integration. */
    sources: readonly EntityTypeSource[];
    /** Frozen. */
    settings: Readonly<EntityTypeSettings>;
  }

  /** Entity type name (the definition's moduleName) to its entry. */
  export type EntityTypeRegistry = Map<string, EntityTypeEntry>;

  /** One `appDefinition.entities` entry. The key must equal the definition's moduleName (and getName() when defined). */
  export interface EntityRegistration extends EntityTypeSettings {
    definition: any;
  }

  export interface AppDefinitionEntities {
    /** false turns inference off: every module an integration binds must be registered. Default true. */
    $infer?: boolean;
    [entityType: string]: EntityRegistration | boolean | undefined;
  }

  /**
   * One level's setting: a scope, or a default plus the scopes a request may
   * choose from (ADR-056 §3.1). `global` is never chosen by a tenant request.
   */
  export type ScopeSetting =
    | EntityScope
    | { default?: EntityScope; allow?: EntityScope[] };

  /**
   * `appDefinition.ownership` (ADR-056 §3, §3.6). Resolution order for a new
   * connection: request, binding, integration, entity type (`entities[name].scope`),
   * this `scope`, then `organization` for an organization-primary app and
   * `individual` otherwise.
   */
  export interface AppOwnership {
    scope?: ScopeSetting;
    /**
     * `'organization'` (default): an individual entity belongs to the organization
     * it was connected in. `'all'`: one connection per person across every
     * organization, stored with no `organizationId`.
     */
    individualAcross?: "organization" | "all";
  }

  /** `Definition.ownership` on an integration (ADR-056 §3.1, §3.3). */
  export interface IntegrationOwnership {
    /** Scope every binding of this integration accepts unless it sets its own. */
    scope?: ScopeSetting;
    /** `'derive'` (default): organization when every entity it uses is organization-scoped. */
    owner?: "derive" | "individual" | "organization";
  }

  export interface AppDefinition {
    integrations: any[];
    /** App-level entity type registry (ADR-059). */
    entities?: AppDefinitionEntities;
    /** Who owns what a person connects (ADR-056). */
    ownership?: AppOwnership;
    [key: string]: unknown;
  }

  /** Whose a record is and what the caller may do with it (ADR-056 §3.4). */
  export interface RecordTenancy {
    scope: Exclude<EntityScope, "global">;
    owner: { type: Exclude<EntityScope, "global">; id: string };
    /** Null for an individual entity connected outside an organization, or under `individualAcross: 'all'`. */
    organizationId: string | null;
    /** `manage`: create, reauthorize, delete. `use`: bind it, proxy through it. `view`: metadata only. */
    access: "manage" | "use" | "view";
  }

  /** Which scope a connection gets, and from which level of the order (ADR-056 §3.1). */
  export interface ResolvedScope {
    scope: EntityScope;
    /** Where `scope` came from. `request` when the request chose within the allowed list. */
    source: "request" | "binding" | "integration" | "entityType" | "app" | "default";
    /** The level that decided what a request may choose from. */
    decidedBy: "binding" | "integration" | "entityType" | "app" | "default";
    allow: EntityScope[];
  }

  /**
   * First match wins, each level overriding the ones below it. A request may
   * choose only from the deciding level's `allow`; `global` never comes from a
   * tenant request. Throws a Boom 400/403 for a request scope that is not allowed.
   */
  export function resolveScope(levels: {
    request?: EntityScope;
    binding?: ScopeSetting;
    integration?: ScopeSetting;
    entityType?: ScopeSetting;
    app?: ScopeSetting;
    primary?: "individual" | "organization";
  }): ResolvedScope;

  /** Every binding of every integration with its resolved scope (for tooling that wants to show the chain). */
  export function listBindingScopes(
    appDefinition: Pick<AppDefinition, "integrations" | "ownership">,
    entityTypeRegistry: EntityTypeRegistry,
    primary?: "individual" | "organization"
  ): Array<{
    integration: string;
    binding: string;
    moduleName: string | null;
    scope: EntityScope;
    source: ResolvedScope["source"];
    owner: "derive" | "individual" | "organization";
  }>;

  /** Invalid ownership or scope setting, thrown at app-definition load. `code` is always `OWNERSHIP_CONFIG_INVALID`. */
  export class OwnershipConfigError extends Error {
    code: "OWNERSHIP_CONFIG_INVALID";
  }

  /**
   * Builds the registry from `entities` plus the modules integrations bind.
   * Throws EntityRegistryError on an invalid registry.
   */
  export function getEntityTypeRegistry(
    appDefinition?: Pick<AppDefinition, "entities" | "integrations">
  ): EntityTypeRegistry;

  /** Invalid `entities` registry. `code` is always `ENTITY_REGISTRY_INVALID`. */
  export class EntityRegistryError extends Error {
    code: "ENTITY_REGISTRY_INVALID";
  }
}
