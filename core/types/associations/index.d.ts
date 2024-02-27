declare module "@friggframework/associations/model" {
  import { Model } from "mongoose";

  export class Association extends Model {
    integrationId: string;
    name: string;
    type: string;
    primaryObject: string;
    objects: {
      entityId: string;
      objectType: string;
      objId: string;
      metadata?: object;
    }[];
  }
}

declare module "@friggframework/associations/association" {
  export default class Association implements IFriggAssociation {
    data: any;
    dataIdentifier: any;
    dataIdentifierHash: string;
    matchHash: string;
    moduleName: any;
    syncId: any;

    static Config: {
      name: "Association";
      reverseModuleMap: {};
    };

    constructor(params: AssociationConstructor);

    dataKeyIsReplaceable(key: string): boolean;

    equals(syncObj: any): boolean;

    getHashData(): string;

    getName(): any;

    hashJSON(data: any): string;

    isModuleInMap(moduleName: any): any;

    reverseModuleMap(moduleName: any): any;

    setSyncId(syncId: string): any;
  }

  interface IFriggAssociation {
    data: any;
    moduleName: any;
    dataIdentifier: any;
    dataIdentifierHash: string;
    matchHash: string;
    syncId: any;

    equals(syncObj: any): boolean;
    dataKeyIsReplaceable(key: string): boolean;
    isModuleInMap(moduleName: any): any;
    getName(): any;
    getHashData(): string;
    setSyncId(syncId: string): any;
    reverseModuleMap(moduleName: any): any;
    hashJSON(data: any): string;
  }

  type AssociationConstructor = {
    data: any;
    moduleName: any;
    dataIdentifier: any;
  };
}
