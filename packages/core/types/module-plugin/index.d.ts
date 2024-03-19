declare module "@friggframework/module-plugin" {
  import { Model } from "mongoose";
  import { Delegate, IFriggDelegate } from "@friggframework/core";

  export class Credential extends Model {
    userId: string;
    auth_is_valid: boolean;
    subType: string;
    externalId: string;
  }

  export class EntityManager implements IFriggEntityManager {
    static primaryEntityClass: any;
    static entityManagerClasses: any[];
    static entityTypes: string[];
    static getEntitiesForUser(userId: string): Promise<any[]>;
    static checkIsValidType(entityType: string): boolean;
    static getEntityManagerClass(entityType?: string): any;

    static getEntityManagerInstanceFromEntityId(
      entityId: string,
      userId: string
    ): Promise<any>;
  }

  interface IFriggEntityManager {}

  export class Entity extends Model {
    credentialId: string;
    subType: string;
    userId: string;
    name: string;
    externalId: string;
  }

  export type MappedEntity = Entity & { id: string; type: any };
  export class ModuleManager extends Delegate implements IFriggModuleManager {
    static Entity: Entity;
    static Credential: Credential;

    constructor(params: { userId: string });

    static getName(): any;
    static getInstance(params: any): Promise<any>;
    static getEntitiesForUserId(userId: string): Promise<MappedEntity[]>;

    batchCreateSyncObjects(syncObjects: any, syncManager: any): Promise<any>;
    batchUpdateSyncObjects(syncObjects: any, syncManager: any): Promise<any>;
    findOrCreateEntity(params: any): Promise<any>;
    getAllSyncObjects(SyncClass: any): Promise<any>;
    getAuthorizationRequirements(params: any): Promise<any>;
    getEntityId(): Promise<string>;
    getEntityOptions(): Promise<any>;
    markCredentialsInvalid(): Promise<Credential>;
    processAuthorizationCallback(params: any): Promise<any>;
    testAuth(params: any): Promise<any>;
    validateAuthorizationRequirements(): Promise<boolean>;
  }

  interface IFriggModuleManager extends IFriggDelegate {
    getEntityId(): Promise<string>;
    validateAuthorizationRequirements(): Promise<boolean>;
    getAuthorizationRequirements(params: any): Promise<any>;
    testAuth(params: any): Promise<any>;
    processAuthorizationCallback(params: any): Promise<any>;
    getEntityOptions(): Promise<any>;
    findOrCreateEntity(params: any): Promise<any>;
    getAllSyncObjects(SyncClass: any): Promise<any>;
    batchCreateSyncObjects(syncObjects: any, syncManager: any): Promise<any>;
    batchUpdateSyncObjects(syncObjects: any, syncManager: any): Promise<any>;
    markCredentialsInvalid(): Promise<Credential>;
  }

  export class Requester implements IFriggRequester {
    DLGT_INVALID_AUTH: string;
    backOff: number[];
    fetch: any;
    isRefreshable: boolean;
    refreshCount: number;

    _delete(options: RequestOptions): Promise<any>;
    _get(options: RequestOptions): Promise<any>;
    _patch(options: RequestOptions): Promise<any>;
    _post(options: RequestOptions, stringify?: boolean): Promise<any>;
    _put(options: RequestOptions): Promise<any>;
    _request(
      url: string,
      options: Omit<RequestOptions, "url">,
      i?: number
    ): Promise<any>;
    parseBody(response: any): Promise<any>;
    refreshAuth(): Promise<any>;

    delegate: any;
    delegateTypes: any[];

    notify(delegateString: string, object?: any): Promise<any>;
    receiveNotification(
      notifier: any,
      delegateString: string,
      object?: any
    ): Promise<any>;
  }

  interface IFriggRequester extends IFriggDelegate {
    backOff: number[];
    isRefreshable: boolean;
    refreshCount: number;
    DLGT_INVALID_AUTH: string;
    fetch: any;

    parseBody(response: any): Promise<any>;
    _request(
      url: string,
      options: Omit<RequestOptions, "url">,
      i?: number
    ): Promise<any>;
    _get(options: RequestOptions): Promise<any>;
    _post(options: RequestOptions, stringify?: boolean): Promise<any>;
    _patch(options: RequestOptions): Promise<any>;
    _put(options: RequestOptions): Promise<any>;
    _delete(options: RequestOptions): Promise<any>;
    refreshAuth(): Promise<any>;
  }

  type RequestOptions = {
    url: string;
    headers?: object;
    query?: object;
    returnFullRes?: boolean;
    body?: any;
  };

  type RequesterConstructor = {
    backOff?: number[];
    fetch?: any;
  };

  export class ApiKeyRequester
    extends Requester
    implements IFriggApiKeyRequester
  {
    API_KEY_NAME: string;
    API_KEY_VALUE: any;

    constructor(params: RequesterConstructor);
    addAuthHeaders(headers: object): Promise<object>;
    isAuthenticated(): boolean;
    setApiKey(api_key: any): void;
  }

  interface IFriggApiKeyRequester extends IFriggRequester {
    API_KEY_NAME: string;
    API_KEY_VALUE: string;

    addAuthHeaders(headers: object): Promise<object>;
    isAuthenticated(): boolean;
    setApiKey(api_key: string): void;
  }

  export class BasicAuthRequester
    extends Requester
    implements IFriggBasicAuthRequester
  {
    password: string;
    username: string;

    constructor(params: BasicAuthRequesterConstructor);
    addAuthHeaders(headers: object): Promise<object>;
    isAuthenticated(): boolean;
    setPassword(password: string): void;
    setUsername(username: string): void;
  }

  interface IFriggBasicAuthRequester extends IFriggRequester {
    username: string;
    password: string;

    addAuthHeaders(headers: object): Promise<object>;
    isAuthenticated(): boolean;
    setUsername(username: string): void;
    setPassword(password: string): void;
  }

  type BasicAuthRequesterConstructor = RequesterConstructor & {
    username?: string;
    password?: string;
  };

  export class OAuth2Requester
    extends Requester
    implements IFriggOAuth2Requester
  {
    DLGT_TOKEN_DEAUTHORIZED: string;
    DLGT_TOKEN_UPDATE: string;
    accessTokenExpire: any;
    access_token: string;
    audience: any;
    authorizationUri: any;
    baseURL: string;
    client_id: string;
    client_secret: string;
    grant_type: string;
    password: string;
    redirect_uri: string;
    refreshTokenExpire: any;
    refresh_token: string;
    scope: string;
    state: any;
    username: string;

    constructor(params: OAuth2RequesterConstructor);

    addAuthHeaders(headers: object): Promise<object>;
    getAuthorizationUri(): string;
    getTokenFromClientCredentials(): Promise<Token>;
    getTokenFromCode(code: string): Promise<Token>;
    getTokenFromCodeBasicAuthHeader(code: string): Promise<Token>;
    getTokenFromUsernamePassword(): Promise<Token>;
    isAuthenticated(): boolean;
    refreshAccessToken(refreshTokenObject: {
      refresh_token: string;
    }): Promise<Token>;
    setTokens(params: Token): Promise<void>;
  }
  interface IFriggOAuth2Requester extends IFriggRequester {
    DLGT_TOKEN_UPDATE: string;
    DLGT_TOKEN_DEAUTHORIZED: string;

    grant_type?: string;
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
    scope?: string;
    authorizationUri?: any;
    baseURL?: string;
    access_token?: string;
    refresh_token?: string;
    accessTokenExpire?: any;
    refreshTokenExpire?: any;
    audience?: any;
    username?: string;
    password?: string;
    state?: any;

    setTokens(params: Token): Promise<void>;
    getAuthorizationUri(): string;
    getTokenFromCode(code: string): Promise<Token>;
    getTokenFromCodeBasicAuthHeader(code: string): Promise<Token>;
    refreshAccessToken(refreshTokenObject: {
      refresh_token: string;
    }): Promise<Token>;
    addAuthHeaders(headers: object): Promise<object>;
    isAuthenticated(): boolean;
    refreshAuth(): Promise<void>;
    getTokenFromUsernamePassword(): Promise<Token>;
    getTokenFromClientCredentials(): Promise<Token>;
  }

  type Token = {
    access_token?: string;
    refresh_token?: string;
    expires_in: any;
    x_refresh_token_expires_in: any;
  };

  type OAuth2RequesterConstructor = {
    grant_type?: string;
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
    scope?: string;
    authorizationUri?: any;
    baseURL?: string;
    access_token?: string;
    refresh_token?: string;
    accessTokenExpire?: any;
    refreshTokenExpire?: any;
    audience?: any;
    username?: string;
    password?: string;
    state?: any;
  };

  export const ModuleConstants: {
    authType: {
      oauth2: "oauth2";
      oauth1: "oauth1";
      basic: "basic";
      apiKey: "apiKey";
    };
  };
}
