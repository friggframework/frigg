declare module "@friggframework/integrations" {
  import { Delegate, IFriggDelegate } from "@friggframework/core";

  export type IntegrationMessageAction =
    | { type: "RETRY_WHEN_READY" }
    | { type: "LINK"; label: string; url: string };

  /**
   * A stored message. The framework stores the keys of an item as given, so a
   * caller can add its own. A rate limit adds `code: "RATE_LIMITED"`,
   * `module`, `reason`, `retryAt` (ISO 8601) and `actions`.
   */
  export interface IntegrationMessage {
    title: string;
    message: string;
    timestamp: number;
    code?: string;
    module?: string;
    reason?: string;
    retryAt?: string;
    actions?: IntegrationMessageAction[];
    [key: string]: unknown;
  }

  export interface Integration {
    entities: any[];
    userId: string;
    status: string; // IntegrationStatus
    config: any;
    version: string;
    messages: {
      errors: IntegrationMessage[];
      warnings: IntegrationMessage[];
      info: IntegrationMessage[];
      logs: IntegrationMessage[];
    };
  }

  export class IntegrationManager
    extends Delegate
    implements IFriggIntegrationManager {
    integration: Integration;
    primaryInstance: any;
    targetInstance: any;

    static Config: {
      name: string;
      version: string;
      supportedVersions: string[];
      events: string[];
    };
    static integrationManagerClasses: any[];
    static integrationTypes: string[];

    constructor(params: any);

    static getInstanceFromIntegrationId(params: {
      integrationId: string;
      userId?: string;
    }): Promise<any>;
    static getName(): string;
    static getCurrentVersion(): string;

    validateConfig(): Promise<void>;
    testAuth(): Promise<void>;

    static getInstance(params: {
      userId: string;
      integrationId: string;
    }): Promise<IntegrationManager>;
    static getIntegrationManagerClasses(type: string): any[];

    static createIntegration(
      entities: { id: string; user: any },
      userId: string,
      config: any,
    ): Promise<any>;

    static getFormattedIntegration(
      integration: Integration
    ): Promise<FormattedIntegration[]>;
    static getIntegrationsForUserId(
      userId: string
    ): Promise<FormattedIntegration[]>;
    static getIntegrationForUserById(
      userId: string,
      integrationId: string
    ): Promise<Integration>;
    static deleteIntegrationForUserById(
      userId: string,
      integrationId: string
    ): Promise<void>;
    static getIntegrationById(id: string): Promise<Integration>;
    static getFilteredIntegrationsForUserId(
      userId: string,
      filter: any
    ): Promise<Integration[]>;
    static getCredentialById(credential_id: string): Promise<any>;
    static listCredentials(options: any): Promise<any>;
    static getEntityById(entity_id: any): Promise<any>;
    static listEntities(options: any): Promise<any>;

    processCreate(params: any): Promise<any>;
    processUpdate(params: any): Promise<any>;
    processDelete(params: any): Promise<any>;

    getConfigOptions(): Promise<any>;
    getSampleData(): Promise<any>;
  }

  type FormattedIntegration = {
    entities: any[];
    messages: any;
    id: any;
    config: any;
    version: any;
    status: any;
  };

  interface IFriggIntegrationManager extends IFriggDelegate {
    primaryInstance: any; //  Returns the Freshbooks manager instance
    targetInstance: any; // Returns a manager e.g. StripeManager instance containing the entitiy, credential, api etc
    integration: Integration; // Integration model instance

    validateConfig(): Promise<void>;
    testAuth(): Promise<void>;
    processCreate(params: any): Promise<any>;
    processUpdate(params: any): Promise<any>;
    processDelete(params: any): Promise<any>;

    getConfigOptions(): Promise<any>;
    getSampleData(): Promise<any>;
  }

  export class IntegrationConfigManager
    implements IFriggIntegrationConfigManager {
    options: IntegrationOptions[];
    primary: any;

    getIntegrationOptions(): Promise<GetIntegrationOptions>;
  }

  interface IFriggIntegrationConfigManager {
    options: IntegrationOptions[];
    primary: any;

    getIntegrationOptions(): Promise<GetIntegrationOptions>;
  }

  type GetIntegrationOptions = {
    entities: {
      primary: any;
      options: any[];
      autorized: any[];
    };
    integrations: any[];
  };

  export class Options implements IFriggIntegrationOptions {
    display: IntegrationOptionDisplay;
    hasUserConfig: boolean;
    isMany: boolean;
    module: any;
    requiresNewEntity: boolean;
    type: string;

    constructor(params: {
      display: Partial<IntegrationOptionDisplay>;
      type?: string;
      hasUserConfig?: boolean;
      isMany?: boolean;
      requiresNewEntity?: boolean;
      module?: any;
    });
    get(): IntegrationOptions;
  }

  interface IFriggIntegrationOptions {
    module: any;
    type: string;
    hasUserConfig: boolean;
    isMany: boolean;
    requiresNewEntity: boolean;
    display: IntegrationOptionDisplay;

    get(): IntegrationOptions;
  }

  type IntegrationOptions = {
    type: string;
    hasUserConfig: boolean;
    isMany: boolean;
    requiresNewEntity: boolean;
    display: IntegrationOptionDisplay;
  };

  type IntegrationOptionDisplay = {
    name: string;
    description: string;
    detailsUrl: string;
    icon: string;
  };

  interface IFriggIntegrationsPackage {
    IntegrationManager: IFriggIntegrationManager;
  }
}
