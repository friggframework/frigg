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
    definition: { moduleName?: string; proxy?: ModuleProxyConfig; [key: string]: any };
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

  /** One operation a module or the app lets the entity proxy forward (ADR-052). */
  export interface ProxyAllowRule {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "*";
    /** Relative to the module's base URL. `:param` is one segment; a trailing `/**` is a subtree. */
    path: string;
    /** Which of the module's named base URLs the rule applies to. Default `"default"`. Must be declared by the module (checked at load). */
    base?: string;
  }

  /**
   * A module definition's `proxy` setting (ADR-052). Declare `baseUrl` (one host,
   * meaning `{ default: baseUrl }`) or `baseUrls` (several), never both.
   * `baseUrls` values are absolute https URLs with no credentials, query or
   * fragment (strings only, unlike `baseUrl`); names match `^[a-z][a-z0-9-]*$`.
   * A caller picks a base by name in the proxy request's `base`.
   */
  export interface ModuleProxyConfig {
    baseUrl?: string | ((api: any) => string);
    baseUrls?: Record<string, string>;
    allow?: ProxyAllowRule[];
    headers?: string[];
    binary?: boolean;
  }

  /** `appDefinition.managementApi.proxy`: the entity proxy, POST /api/v2/entities/:id/proxy (ADR-052). */
  export interface ManagementApiProxyConfig {
    /** Mount the route. Default false. */
    enable?: boolean;
    /** Upstream timeout in ms; can only be lowered from 25000. */
    timeoutMs?: number;
    /** Largest request body in bytes; default 1 MiB, at most 10 MiB. */
    maxRequestBytes?: number;
    /** Largest response body in bytes; can only be lowered from 5 MiB. */
    maxResponseBytes?: number;
    /**
     * Entity scopes the proxy accepts (ADR-056 §3.5). Default `['individual']`.
     * Add `'organization'` to let a member with use access proxy through the
     * organization's shared credential. `global` is never accepted. An unknown,
     * empty or repeated value throws ManagementApiConfigError at load.
     */
    scopes?: Array<Exclude<EntityScope, "global">>;
    /** Per-module allow-list override; `'module'` uses the module's own list. */
    modules?: Record<string, { allow: "module" | ProxyAllowRule[] }>;
  }

  /** `appDefinition.managementApi` (ADR-052, ADR-053). */
  export interface ManagementApiConfig {
    /** Serve the deprecated v1 routes. Default true. */
    v1?: boolean;
    proxy?: ManagementApiProxyConfig;
  }

  export interface AppDefinition {
    integrations: any[];
    /** App-level entity type registry (ADR-059). */
    entities?: AppDefinitionEntities;
    /** Who owns what a person connects (ADR-056). */
    ownership?: AppOwnership;
    /** Management API versions and the entity proxy (ADR-052, ADR-053, ADR-056 §3.5). */
    managementApi?: ManagementApiConfig;
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

  /** Invalid `managementApi` setting (today: `proxy.scopes`), thrown at app-definition load. */
  export class ManagementApiConfigError extends Error {
    code: "MANAGEMENT_API_CONFIG_INVALID";
  }

  /**
   * @deprecated ADR-059. Use `getEntityTypeRegistry(appDefinition)` and read
   * each entry's `definition`. Returns the registry's definitions for these
   * integrations (plus registry-only types when `entities` is passed).
   */
  export function getModulesDefinitionFromIntegrationClasses(
    integrationClasses: any[],
    entities?: AppDefinitionEntities
  ): any[];

  /** Invalid `entities` registry. `code` is always `ENTITY_REGISTRY_INVALID`. */
  export class EntityRegistryError extends Error {
    code: "ENTITY_REGISTRY_INVALID";
  }
}
