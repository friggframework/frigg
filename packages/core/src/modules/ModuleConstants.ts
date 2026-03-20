export const ModuleConstants = {
    authType: {
        oauth2: 'oauth2' as const,
        oauth1: 'oauth1' as const,
        basic: 'basic' as const,
        apiKey: 'apiKey' as const,
    },
};

export type AuthType = typeof ModuleConstants.authType;
export type AuthTypeValue = AuthType[keyof AuthType];
