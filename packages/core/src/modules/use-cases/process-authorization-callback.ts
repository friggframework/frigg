import { Module } from '../module';
import type { ModuleDefinition, Entity } from '../module';
import { ModuleConstants } from '../ModuleConstants';
import type { ModuleRepositoryInterface } from '../repositories/module-repository-interface';

interface CredentialRepository {
    upsertCredential(credentialDetails: { identifiers: Record<string, unknown>; details: Record<string, unknown> }): Promise<Record<string, unknown>>;
}

export class ProcessAuthorizationCallback {
    moduleRepository: ModuleRepositoryInterface;
    credentialRepository: CredentialRepository;
    moduleDefinitions: ModuleDefinition[];

    constructor({ moduleRepository, credentialRepository, moduleDefinitions }: {
        moduleRepository: ModuleRepositoryInterface;
        credentialRepository: CredentialRepository;
        moduleDefinitions: ModuleDefinition[];
    }) {
        this.moduleRepository = moduleRepository;
        this.credentialRepository = credentialRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    async execute(userId: string, entityType: string, params: unknown): Promise<{ credential_id: string | undefined; entity_id: string | undefined; type: string }> {
        const moduleDefinition = this.moduleDefinitions.find((def) => {
            return entityType === def.moduleName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        let entity: Entity | null = null;

        const moduleInstance = new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });

        let tokenResponse: unknown;
        if (moduleInstance.apiClass.requesterType === ModuleConstants.authType.oauth2) {
            tokenResponse = await moduleDefinition.requiredAuthMethods.getToken!(
                moduleInstance.api,
                params
            );
        } else {
            tokenResponse =
                await moduleDefinition.requiredAuthMethods.setAuthParams!(
                    moduleInstance.api,
                    params
                );
            await this.onTokenUpdate(moduleInstance, moduleDefinition, userId);
        }

        const authRes = await moduleInstance.testAuth();
        if (!authRes) {
            throw new Error('Authorization failed');
        }

        const entityDetails =
            await moduleDefinition.requiredAuthMethods.getEntityDetails(
                moduleInstance.api,
                params,
                tokenResponse,
                userId
            );

        Object.assign(
            entityDetails.details,
            moduleInstance.apiParamsFromEntity(moduleInstance.api as unknown as Entity)
        );

        const persistedEntity = await this.findOrCreateEntity(
            entityDetails,
            entityType,
            moduleInstance.credential?.id
        );

        return {
            credential_id: moduleInstance.credential?.id,
            entity_id: persistedEntity.id,
            type: moduleInstance.getName(),
        };
    }

    async onTokenUpdate(moduleInstance: Module, moduleDefinition: ModuleDefinition, userId: string): Promise<void> {
        const credentialDetails =
            await moduleDefinition.requiredAuthMethods.getCredentialDetails(
                moduleInstance.api,
                userId
            );

        Object.assign(
            credentialDetails.details,
            moduleInstance.apiParamsFromCredential(moduleInstance.api as unknown as Record<string, unknown>)
        );
        credentialDetails.details.authIsValid = true;

        const persisted = await this.credentialRepository.upsertCredential(credentialDetails);
        moduleInstance.credential = persisted as Entity['credential'];
    }

    async findOrCreateEntity(
        entityDetails: { identifiers: Record<string, unknown>; details: Record<string, unknown> },
        moduleName: string,
        credentialId: string | undefined
    ): Promise<Entity> {
        const { identifiers, details } = entityDetails;

        const userId = (identifiers.user || identifiers.userId) as string | undefined;

        if (!userId) {
            throw new Error(
                `Module definition for ${moduleName} must return 'user' or 'userId' in identifiers from getEntityDetails(). ` +
                    `Without userId, entity lookup would match across all users (security issue).`
            );
        }

        const existingEntity = await this.moduleRepository.findEntity({
            externalId: identifiers.externalId as string,
            user: userId,
            moduleName: moduleName,
        });

        if (existingEntity) {
            return existingEntity;
        }

        return await this.moduleRepository.createEntity({
            ...identifiers,
            ...details,
            moduleName: moduleName,
            credential: credentialId,
        } as Record<string, unknown>);
    }
}
