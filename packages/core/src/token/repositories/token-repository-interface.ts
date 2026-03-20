export interface TokenData {
    id?: string;
    token: string;
    expires?: Date | null;
    userId?: string;
    user?: string;
    created?: Date | null;
    [key: string]: unknown;
}

export interface TokenObj {
    id: string;
    token: string;
}

export interface DeleteResult {
    acknowledged: boolean;
    deletedCount: number;
}

export class TokenRepositoryInterface {
    async createTokenWithExpire(_userId: string, _rawToken: string, _minutes: number): Promise<TokenData> {
        throw new Error('Method createTokenWithExpire must be implemented by subclass');
    }

    async validateAndGetToken(_tokenObj: TokenObj): Promise<TokenData> {
        throw new Error('Method validateAndGetToken must be implemented by subclass');
    }

    async findTokenById(_tokenId: string): Promise<TokenData | null> {
        throw new Error('Method findTokenById must be implemented by subclass');
    }

    async findTokensByUserId(_userId: string): Promise<TokenData[]> {
        throw new Error('Method findTokensByUserId must be implemented by subclass');
    }

    async deleteToken(_tokenId: string): Promise<DeleteResult> {
        throw new Error('Method deleteToken must be implemented by subclass');
    }

    async deleteExpiredTokens(): Promise<DeleteResult> {
        throw new Error('Method deleteExpiredTokens must be implemented by subclass');
    }

    async deleteTokensByUserId(_userId: string): Promise<DeleteResult> {
        throw new Error('Method deleteTokensByUserId must be implemented by subclass');
    }

    createBase64BufferToken(_token: TokenData, _rawToken: string): string {
        throw new Error('Method createBase64BufferToken must be implemented by subclass');
    }

    getJSONTokenFromBase64BufferToken(_base64Token: string): TokenObj {
        throw new Error('Method getJSONTokenFromBase64BufferToken must be implemented by subclass');
    }
}
