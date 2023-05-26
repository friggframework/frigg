declare module "@friggframework/test-environment" {
  export class TestMongo implements IFriggTestDatabase {
    #mongoServer: any;
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  interface IFriggTestDatabase {
    start(): Promise<void>;
    stop(): Promise<void>;
  }

  export function overrideEnvironment(overrideByKey: any): void;
  export function restoreEnvironment(): void;
  export function globalTeardown(): Promise<void>;
  export function globalSetup(): Promise<void>;
}
