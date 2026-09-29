declare module "@friggframework/errors" {
  export class BaseError extends Error {
    constructor(message?: string, options?: ErrorOptions, ...otherOptions: any);
  }

  export class FetchError extends BaseError {
    constructor(options?: FetchErrorConstructor);

    statusCode?: number;
    method: string;
    /** Request URL without userinfo; each query value is `REDACTED`. */
    url: string;
    /** Non-enumerable. The raw response, or `null`. */
    readonly response: FetchErrorResponse | null;
    /** Non-enumerable. The raw response body; never part of `message`. */
    readonly body: any;
    isTimeout?: boolean;
    timeoutMs?: number;
    isRateLimited?: boolean;
    reason?: RateLimitReason;

    static create(options?: CreateFetchErrorParams): Promise<FetchError>;
  }

  export type RateLimitReason =
    | "burst"
    | "daily"
    | "monthly"
    | "concurrency"
    | "unknown";

  export type RateLimitSource = "header" | "body" | "static" | "backoff";

  export type RateLimitHint = {
    retryAt: Date;
    waitMs: number;
    reason: RateLimitReason;
    policy?: string;
    remaining?: number;
    source: RateLimitSource;
  };

  export class RateLimitError extends FetchError {
    constructor(options?: RateLimitErrorConstructor);

    isRateLimited: true;
    retryAt: Date;
    waitMs: number;
    reason: RateLimitReason;
    policy?: string;
    source: RateLimitSource | "unknown";
    module?: string;
    scopeKey?: string;

    static create(
      options?: CreateRateLimitErrorParams
    ): Promise<RateLimitError>;
  }

  type RateLimitErrorConstructor = FetchErrorConstructor & {
    hint?: Partial<RateLimitHint>;
    waitMs?: number;
    module?: string;
    scopeKey?: string;
    now?: number;
  };

  type CreateRateLimitErrorParams = RateLimitErrorConstructor;

  type FetchErrorResponse = {
    headers?: object;
    status?: number;
    statusText?: string;
    bodyUsed?: boolean;
    text?: () => Promise<string>;
  };

  type FetchErrorConstructor = {
    resource?: string | URL | { url: string };
    init?: Partial<{
      method: string;
      credentials: string;
      headers: object;
      query: object;
      body: URLSearchParams | any;
      returnFullRes: false;
    }>;
    response?: FetchErrorResponse | null;
    cause?: unknown;
    responseBody?: any;
    body?: any;
  };

  type CreateFetchErrorParams = FetchErrorConstructor;

  export class HaltError extends BaseError {
    isHaltError: boolean;
  }

  export class RequiredPropertyError extends BaseError {
    constructor(
      options: RequiredPropertyErrorOptions,
      otherOptions?: ErrorOptions
    );
  }

  type RequiredPropertyErrorOptions = {
    parent?: new () => Class;
    key: string;
  };

  export class ParameterTypeError extends BaseError {
    constructor(
      options: ParameterTypeErrorOptions,
      otherOptions?: ErrorOptions
    );
  }

  type ParameterTypeErrorOptions = {
    parent?: new () => Class;
    key: string;
    value: string;
    expectedType: new () => Class;
  };

  type Class<T = any> = new (...args: any[]) => T;
}
