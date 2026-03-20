import { Delegate } from '../core/Delegate';
import { pick } from 'lodash';
import { flushDebugLog } from '../logs';
import { ModuleConstants } from './ModuleConstants';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCredentialRepository } = require('../credential/repositories/credential-repository-factory') as { createCredentialRepository: () => CredentialRepositoryLike };
import { createModuleRepository } from './repositories/module-repository-factory';
import type { ModuleRepositoryInterface } from './repositories/module-repository-interface';
import type { Requester } from './requester/requester';

export interface Credential {
    id?: string;
    userId?: string;
    authIsValid?: boolean;
    externalId?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface Entity {
    id?: string;
    credentialId?: string;
    credential?: Credential;
    userId?: string;
    name?: string;
    moduleName?: string;
    externalId?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface ApiPropertiesToPersist {
    credential?: string[];
    entity?: string[];
}

export interface RequiredAuthMethods {
    getToken?: (api: Requester, params: unknown) => Promise<unknown>;
    setAuthParams?: (api: Requester, params: unknown) => Promise<unknown>;
    getEntityDetails: (api: Requester, params: unknown, tokenResponse: unknown, userId: string | null) => Promise<{ identifiers: Record<string, unknown>; details: Record<string, unknown> }>;
    getCredentialDetails: (api: Requester, userId: string | null) => Promise<{ identifiers: Record<string, unknown>; details: Record<string, unknown> }>;
    apiPropertiesToPersist: ApiPropertiesToPersist;
    testAuthRequest: (api: Requester) => Promise<boolean>;
    [key: string]: unknown;
}

export interface ModuleDefinition {
    moduleName: string;
    modelName?: string;
    API: { new(params?: Record<string, unknown>): Requester; requesterType?: string };
    requiredAuthMethods: RequiredAuthMethods;
    env?: Record<string, unknown>;
    Credential?: { schema: { paths: Record<string, unknown> } };
    getName?: () => string;
    getEntityOptions?: () => unknown;
    refreshEntityOptions?: (options: unknown) => Promise<void>;
    [key: string]: unknown;
}

export interface ModuleParams {
    definition: ModuleDefinition;
    userId?: string | null;
    entity?: Entity | null;
}

interface CredentialRepositoryLike {
    upsertCredential(credentialDetails: { identifiers: Record<string, unknown>; details: Record<string, unknown> }): Promise<Credential>;
    updateAuthenticationStatus(credentialId: string, authIsValid: boolean): Promise<unknown>;
    deleteCredentialById(credentialId: string): Promise<unknown>;
}

export class Module extends Delegate {
    userId: string | null;
    entity: Entity | null;
    credential: Credential | undefined;
    definition: ModuleDefinition;
    name: string;
    modelName: string | undefined;
    apiClass: ModuleDefinition['API'];
    api: Requester;
    credentialRepository: CredentialRepositoryLike;
    moduleRepository: ModuleRepositoryInterface;
    apiPropertiesToPersist?: ApiPropertiesToPersist;
    testAuthRequest!: (api: Requester) => Promise<boolean>;
    getCredentialDetails!: (api: Requester, userId: string | null) => Promise<{ identifiers: Record<string, unknown>; details: Record<string, unknown> }>;

    constructor({ definition, userId = null, entity: entityObj = null }: ModuleParams) {
        super({ definition, userId, entity: entityObj } as Record<string, unknown>);

        this.validateDefinition(definition);

        this.userId = userId;
        this.entity = entityObj;
        this.credential = entityObj?.credential;
        this.definition = definition;
        this.name = this.definition.moduleName;
        this.modelName = this.definition.modelName;
        this.apiClass = this.definition.API;

        this.credentialRepository = createCredentialRepository();
        this.moduleRepository = createModuleRepository();

        Object.assign(this, this.definition.requiredAuthMethods);

        const apiParams: Record<string, unknown> = {
            ...this.definition.env,
            delegate: this,
            ...(this.credential?.data
                ? this.apiParamsFromCredential(this.credential.data as Record<string, unknown>)
                : {}),
            ...this.apiParamsFromEntity(this.entity),
        };
        this.api = new this.apiClass(apiParams);
    }

    getName(): string {
        return this.name;
    }

    getEntityOptions(): unknown {
        return this.definition.getEntityOptions?.();
    }

    async refreshEntityOptions(options: unknown): Promise<unknown> {
        await this.definition.refreshEntityOptions?.(options);
        return this.getEntityOptions();
    }

    apiParamsFromCredential(credential: Record<string, unknown>): Record<string, unknown> {
        return pick(credential, ...(this.apiPropertiesToPersist?.credential ?? []));
    }

    apiParamsFromEntity(entity: Entity | null): Record<string, unknown> {
        if (!entity) return {};
        return pick(entity, ...(this.apiPropertiesToPersist?.entity ?? []));
    }

    validateAuthorizationRequirements(): boolean {
        const requirements = this.getAuthorizationRequirements();
        let valid = true;
        if (
            ['oauth1', 'oauth2'].includes(requirements.type) &&
            !requirements.url
        ) {
            valid = false;
        }
        return valid;
    }

    getAuthorizationRequirements(_params?: unknown): { url: string | null; type: string } {
        return (this.api as unknown as { getAuthorizationRequirements(): { url: string | null; type: string } }).getAuthorizationRequirements();
    }

    async testAuth(): Promise<boolean> {
        let validAuth = false;
        try {
            if (await this.testAuthRequest(this.api)) validAuth = true;
        } catch (e) {
            flushDebugLog(e as Error);
        }
        return validAuth;
    }

    async onTokenUpdate(): Promise<void> {
        const credentialDetails = await this.getCredentialDetails(
            this.api,
            this.userId
        );
        const apiParams = this.apiParamsFromCredential(this.api as unknown as Record<string, unknown>);

        if (!apiParams.refresh_token && this.api.isRefreshable) {
            console.warn(
                `[Frigg] No refresh_token in apiParams for module ${this.name}.`
            );
        }

        Object.assign(credentialDetails.details, apiParams);
        credentialDetails.details.authIsValid = true;

        const persisted = await this.credentialRepository.upsertCredential(
            credentialDetails
        );
        this.credential = persisted;
    }

    async receiveNotification(notifier: Delegate, delegateString: string, _object: unknown = null): Promise<unknown> {
        const api = this.api as unknown as { DLGT_TOKEN_UPDATE: string; DLGT_TOKEN_DEAUTHORIZED: string; DLGT_INVALID_AUTH: string };
        if (delegateString === api.DLGT_TOKEN_UPDATE) {
            await this.onTokenUpdate();
        } else if (delegateString === api.DLGT_TOKEN_DEAUTHORIZED) {
            await this.deauthorize();
        } else if (delegateString === api.DLGT_INVALID_AUTH) {
            await this.markCredentialsInvalid();
        }
        return undefined;
    }

    async markCredentialsInvalid(): Promise<void> {
        if (!this.credential) return;

        if (!this.credential.id) return;

        await this.credentialRepository.updateAuthenticationStatus(
            this.credential.id,
            false
        );

        this.credential.authIsValid = false;
    }

    async deauthorize(): Promise<void> {
        this.api = new this.apiClass();

        if (this.entity?.credential) {
            const credentialId =
                (this.entity.credential as Credential).id || this.entity.credential as unknown as string;

            await this.credentialRepository.deleteCredentialById(credentialId);

            const entityId = this.entity.id;
            if (entityId) {
                await this.moduleRepository.unsetCredential(entityId);
            }

            this.entity.credential = undefined;
        }
    }

    static getEntityModelFromDefinition(definition: ModuleDefinition): { modelName: string } {
        return { modelName: definition.modelName || definition.moduleName };
    }

    validateDefinition(definition: ModuleDefinition): void {
        if (!definition) {
            throw new Error('Module definition is required');
        }
        if (!definition.moduleName) {
            throw new Error('Module definition requires moduleName');
        }
        if (!definition.API) {
            throw new Error('Module definition requires API class');
        }
        if (!definition.requiredAuthMethods) {
            throw new Error('Module definition requires requiredAuthMethods');
        }
        if (
            definition.API.requesterType ===
                ModuleConstants.authType.oauth2 &&
            !definition.requiredAuthMethods.getToken
        ) {
            throw new Error(
                'Module definition requires requiredAuthMethods.getToken'
            );
        }
        if (!definition.requiredAuthMethods.getEntityDetails) {
            throw new Error(
                'Module definition requires requiredAuthMethods.getEntityDetails'
            );
        }
        if (!definition.requiredAuthMethods.getCredentialDetails) {
            throw new Error(
                'Module definition requires requiredAuthMethods.getCredentialDetails'
            );
        }
        if (!definition.requiredAuthMethods.apiPropertiesToPersist) {
            throw new Error(
                'Module definition requires requiredAuthMethods.apiPropertiesToPersist'
            );
        } else if (definition.Credential) {
            for (const prop of definition.requiredAuthMethods
                .apiPropertiesToPersist?.credential ?? []) {
                if (
                    !Object.hasOwn(definition.Credential.schema.paths, prop)
                ) {
                    throw new Error(
                        `Module definition requires Credential schema to have property ${prop}`
                    );
                }
            }
        }
        if (!definition.requiredAuthMethods.testAuthRequest) {
            throw new Error(
                'Module definition requires requiredAuthMethods.testAuth'
            );
        }
    }
}
