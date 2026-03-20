import crypto from 'crypto';
import type { UserRepositoryInterface } from '../repositories/user-repository-interface';

interface CreateTokenForUserIdDeps {
    userRepository: UserRepositoryInterface;
}

export class CreateTokenForUserId {
    private userRepository: UserRepositoryInterface;

    constructor({ userRepository }: CreateTokenForUserIdDeps) {
        this.userRepository = userRepository;
    }

    async execute(userId: string, minutes?: number): Promise<string> {
        const rawToken = crypto.randomBytes(20).toString('hex');
        return this.userRepository.createToken(userId, rawToken, minutes);
    }
}
