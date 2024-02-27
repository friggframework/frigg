declare module "@friggframework/errors" {
  export class BaseError extends Error {
    constructor(message?: string, options?: ErrorOptions, ...otherOptions: any);
  }

  export class FetchError extends BaseError {
    constructor(options?: FetchErrorConstructor);

    static create(options?: CreateFetchErrorParams): Promise<FetchError>;
  }

  type FetchErrorConstructor = {
    resource?: string;
    init?: Partial<{
      method: string;
      credentials: string;
      headers: object;
      query: object;
      body: URLSearchParams | any;
      returnFullRes: false;
    }>;
    response?: {
      headers?: object;
      status?: number;
      statusText?: string;
      text?: () => Promise<string>;
    };
    responseBody?: any;
  };

  type CreateFetchErrorParams = Omit<FetchErrorConstructor, "responseBody"> & {
    body: any;
  };

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
