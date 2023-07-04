declare module "@friggframework/syncs/model" {
  import { Model } from "mongoose";

  export class Sync extends Model {
    entities: any[];
    hash: string;
    name: string;
    dataIdentifiers: {
      entity: any;
      id: object;
      hash: string;
    }[];
  }
}

declare module "@friggframework/syncs/manager" {
  import Sync from "@friggframework/syncs/sync";

  export default class SyncManager implements IFriggSyncManager {
    ignoreEmptyMatchValues: boolean;
    integration: any;
    isUnidirectionalSync: boolean;
    omitEmptyStringsFromData: boolean;
    syncObjectClass: Sync;
    useFirstMatchingDuplicate: boolean;

    constructor(params: SyncManagerConstructor);
    confirmCreate(
      syncObj: Sync,
      createdId: string,
      moduleManager: any
    ): Promise<any>;
    confirmUpdate(syncObj: Sync): Promise<any>;
    createSyncDBObject(objArr: any[], entities: any[]): Promise<any>;
    initialSync(): Promise<void>;
    sync(syncObjects: Sync[]): Promise<any[]>;
  }

  interface IFriggSyncManager {
    syncObjectClass: Sync;
    ignoreEmptyMatchValues: boolean;
    isUnidirectionalSync: boolean;
    useFirstMatchingDuplicate: boolean;
    omitEmptyStringsFromData: boolean;
    integration: any;

    initialSync(): Promise<void>;
    createSyncDBObject(objArr: any[], entities: any[]): Promise<any>;
    sync(syncObjects: Sync[]): Promise<any[]>;
    confirmCreate(
      syncObj: Sync,
      createdId: string,
      moduleManager: any
    ): Promise<any>;
    confirmUpdate(syncObj: Sync): Promise<any>;
  }

  type SyncManagerConstructor = {
    syncObjectClass: Sync;
    ignoreEmptyMatchValues?: boolean;
    isUnidirectionalSync?: boolean;
    useFirstMatchingDuplicate?: boolean;
    omitEmptyStringsFromData?: boolean;
    integration: any;
  };
}

declare module "@friggframework/syncs/sync" {
  export default class Sync implements IFriggSync {
    data: object;
    dataIdentifier: any;
    dataIdentifierHash: string;
    matchHash: string;
    missingMatchData: boolean;
    moduleName: string;
    syncId: string;
    useMapping: boolean;

    static Config: {
      name: string;
      keys: any[];
      matchOn: any[];
      moduleMap: object;
      reverseModuleMap: object;
    };

    static hashJSON(data: any): string;

    constructor(params: SyncConstructor);
    dataKeyIsReplaceable(key: string): boolean;
    equals(syncObj: IFriggSync): boolean;
    getHashData(params: GetHashData): any;
    getName(): string;
    isModuleInMap(moduleName: string): any;
    reverseModuleMap(moduleName: string): any;
    setSyncId(syncId: string): void;
  }

  interface IFriggSync {
    data: object;
    moduleName: string;
    dataIdentifier: any;
    useMapping?: boolean;
    dataIdentifierHash: string;
    missingMatchData: boolean;
    matchHash: string;
    syncId: string;

    equals(syncObj: IFriggSync): boolean;
    dataKeyIsReplaceable(key: string): boolean;
    isModuleInMap(moduleName: string): any;
    getName(): string;
    getHashData(params: GetHashData): any;
    setSyncId(syncId: string): void;
    reverseModuleMap(moduleName: string): any;
  }

  type SyncConstructor = {
    data: any;
    moduleName: string;
    dataIdentifier: any;
    useMapping?: boolean;
  };

  type GetHashData = {
    omitEmptyStringsFromData?: boolean;
  };
}
