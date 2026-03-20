import {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
} from './commands/integration-commands';
import { createUserCommands } from './commands/user-commands';
import { createEntityCommands } from './commands/entity-commands';
import { createCredentialCommands } from './commands/credential-commands';

import type { IntegrationClass, IntegrationCommands } from './commands/integration-commands';
import type { UserCommands } from './commands/user-commands';
import type { EntityCommands } from './commands/entity-commands';
import type { CredentialCommands } from './commands/credential-commands';

export type FriggCommands = IntegrationCommands & UserCommands & EntityCommands & CredentialCommands;

export function createFriggCommands({ integrationClass }: { integrationClass: IntegrationClass }): FriggCommands {
    const integrationCommands = createIntegrationCommands({ integrationClass });
    const userCommands = createUserCommands();
    const entityCommands = createEntityCommands();
    const credentialCommands = createCredentialCommands();

    return {
        ...integrationCommands,
        ...userCommands,
        ...entityCommands,
        ...credentialCommands,
    };
}

export { createIntegrationCommands, findIntegrationContextByExternalEntityId } from './commands/integration-commands';
export { createUserCommands } from './commands/user-commands';
export { createEntityCommands } from './commands/entity-commands';
export { createCredentialCommands } from './commands/credential-commands';
export { createSchedulerCommands } from './commands/scheduler-commands';

export const integrationCommands = {
    create: createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
};

export type {
    IntegrationClass,
    IntegrationCommands,
    IntegrationContext,
    IntegrationRecord,
    CreateIntegrationParams,
    UpdateIntegrationConfigParams,
    DeleteIntegrationResult,
} from './commands/integration-commands';
export type { ErrorResponse } from './commands/integration-commands';

export type {
    UserCommands,
    UserRecord,
    OrganizationUserRecord,
    CreateUserParams,
    DeleteUserResult,
} from './commands/user-commands';

export type {
    EntityCommands,
    EntityRecord,
    CreateEntityParams,
    EntityFilter,
} from './commands/entity-commands';

export type {
    CredentialCommands,
    CredentialRecord,
    CreateCredentialParams,
    CredentialFilter,
} from './commands/credential-commands';

export type {
    SchedulerCommands,
    SchedulerService,
    ScheduleJobParams,
    ScheduleJobResult,
    DeleteJobResult,
    JobStatusResult,
    CreateSchedulerCommandsParams,
} from './commands/scheduler-commands';
