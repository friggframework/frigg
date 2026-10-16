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

  export interface AppDefinition {
    integrations: any[];
    /** App-level entity type registry (ADR-059). */
    entities?: AppDefinitionEntities;
    [key: string]: unknown;
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
