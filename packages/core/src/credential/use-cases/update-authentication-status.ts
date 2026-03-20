import type { CredentialRepositoryInterface } from '../repositories/credential-repository-interface';

interface UpdateAuthenticationStatusDeps {
    credentialRepository: CredentialRepositoryInterface;
}

export class UpdateAuthenticationStatus {
    private credentialRepository: CredentialRepositoryInterface;

    constructor({ credentialRepository }: UpdateAuthenticationStatusDeps) {
        this.credentialRepository = credentialRepository;
    }

    async execute(credentialId: string, authIsValid: boolean): Promise<void> {
        await this.credentialRepository.updateAuthenticationStatus(credentialId, authIsValid);
    }
}
