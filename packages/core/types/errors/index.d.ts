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
    /**
     * True when `classify` named the response as a limit but gave no time. A
     * `RateLimitError` always has it.
     */
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

  /** What Frigg knows about when calls are accepted again. */
  export type RateLimitHint = {
    /** When calls are accepted again. */
    retryAt: Date;
    /** Milliseconds from the time the hint was read until `retryAt`. */
    waitMs: number;
    reason: RateLimitReason;
    /** A provider policy name, when the response names one. */
    policy?: string;
    /** Calls left in the window, when the response says. */
    remaining?: number;
    source: RateLimitSource;
  };

  /**
   * A FetchError for a response that said a limit was hit, and for which the
   * response or the module's policy says when to call again.
   */
  export class RateLimitError extends FetchError {
    constructor(options?: RateLimitErrorConstructor);

    isRateLimited: true;
    /** When calls are accepted again. */
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
    /** Wait from `now`. When absent, `hint.retryAt` sets the time. */
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
