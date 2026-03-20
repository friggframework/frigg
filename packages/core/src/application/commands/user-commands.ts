/* eslint-disable @typescript-eslint/no-require-imports */
const {
    createUserRepository,
} = require('../../../user/repositories/user-repository-factory');

export interface ErrorResponse {
    error: number;
    reason?: string;
    code?: string;
}

export interface UserRecord {
    id: string;
    username: string;
    email?: string;
    appUserId?: string;
}

export interface OrganizationUserRecord {
    id: string;
    appOrgId?: string;
    name?: string;
}

export interface CreateUserParams {
    username: string;
    email?: string;
    appUserId?: string;
    password?: string;
}

export interface DeleteUserResult {
    success: boolean;
    userId: string;
    message: string;
}

export interface UserCommands {
    createUser(params?: CreateUserParams): Promise<UserRecord | ErrorResponse>;
    findUserByAppUserId(appUserId: string): Promise<UserRecord | null | ErrorResponse>;
    findUserByUsername(username: string): Promise<UserRecord | null | ErrorResponse>;
    findIndividualUserById(userId: string): Promise<UserRecord | null | ErrorResponse>;
    findOrganizationUserById(userId: string): Promise<OrganizationUserRecord | null | ErrorResponse>;
    updateUser(userId: string, updates: Record<string, unknown>): Promise<UserRecord | ErrorResponse>;
    deleteUserById(userId: string): Promise<DeleteUserResult | ErrorResponse>;
}

const ERROR_CODE_MAP: Record<string, number> = {
    USER_NOT_FOUND: 404,
    USER_ALREADY_EXISTS: 409,
    INVALID_USER_DATA: 400,
};

function mapErrorToResponse(error: Error & { code?: string | number }): ErrorResponse {
    const status = ERROR_CODE_MAP[error?.code as string ?? ''] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code as string | undefined,
    };
}

export function createUserCommands(): UserCommands {
    const userRepository = createUserRepository();

    return {
        async createUser({ username, email, appUserId, password }: CreateUserParams = {} as CreateUserParams) {
            try {
                if (!username) {
                    const error = new Error('username is required') as Error & { code?: string };
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const userData: Record<string, unknown> = { username };
                if (email) userData.email = email;
                if (appUserId) userData.appUserId = appUserId;
                if (password) userData.password = password;

                const user = await userRepository.createIndividualUser(
                    userData
                );

                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error: unknown) {
                const err = error as Error & { code?: string | number };
                if (err.code === 11000) {
                    const duplicateError = new Error(
                        `User with username '${username}' already exists`
                    ) as Error & { code?: string };
                    duplicateError.code = 'USER_ALREADY_EXISTS';
                    return mapErrorToResponse(duplicateError);
                }
                return mapErrorToResponse(err);
            }
        },

        async findUserByAppUserId(appUserId: string) {
            try {
                if (!appUserId) {
                    const error = new Error('appUserId is required') as Error & { code?: string };
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.findIndividualUserByAppUserId(
                    appUserId
                );

                if (!user) {
                    return null;
                }

                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async findUserByUsername(username: string) {
            try {
                if (!username) {
                    const error = new Error('username is required') as Error & { code?: string };
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.findIndividualUserByUsername(
                    username
                );

                if (!user) {
                    return null;
                }

                return {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async findIndividualUserById(userId: string) {
            try {
                if (!userId) {
                    const error = new Error('userId is required') as Error & { code?: string };
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.findIndividualUserById(
                    userId
                );

                if (!user) {
                    return null;
                }

                return {
                    id: user._id?.toString() || user.id,
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async findOrganizationUserById(userId: string) {
            try {
                if (!userId) {
                    const error = new Error('userId is required') as Error & { code?: string };
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.findOrganizationUserById(
                    userId
                );

                if (!user) {
                    return null;
                }

                return {
                    id: user.id,
                    appOrgId: user.appOrgId,
                    name: user.name,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async updateUser(userId: string, updates: Record<string, unknown>) {
            try {
                if (!userId) {
                    const error = new Error('userId is required') as Error & { code?: string };
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const user = await userRepository.IndividualUser.update(
                    userId,
                    updates
                );

                if (!user) {
                    const error = new Error(`User ${userId} not found`) as Error & { code?: string };
                    error.code = 'USER_NOT_FOUND';
                    throw error;
                }

                return {
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    appUserId: user.appUserId,
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async deleteUserById(userId: string) {
            try {
                if (!userId) {
                    const error = new Error('userId is required') as Error & { code?: string };
                    error.code = 'INVALID_USER_DATA';
                    throw error;
                }

                const deleted = await userRepository.deleteUser(userId);

                if (!deleted) {
                    const error = new Error(`User ${userId} not found`) as Error & { code?: string };
                    error.code = 'USER_NOT_FOUND';
                    return mapErrorToResponse(error);
                }

                return {
                    success: true,
                    userId,
                    message: 'User deleted successfully',
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },
    };
}

export { ERROR_CODE_MAP };
