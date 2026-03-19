import { createHash } from 'node:crypto';
import { get } from '../assertions/get';

export interface AssociationConfig {
    name: string;
    keys: string[];
    matchOn: string[];
    moduleMap: Record<string, Record<string, (data: unknown) => unknown>>;
    reverseModuleMap: Record<string, (data: Record<string, unknown>) => unknown>;
}

export interface AssociationConstructorParams {
    data: unknown;
    moduleName: string;
    dataIdentifier: unknown;
}

/**
 * This class enforces proper use of the Association model.
 * For now, we're going to use the model directly and worry about proper use
 * later...
 */
export class Association {
    static Config: AssociationConfig = {
        name: 'Association',
        keys: [],
        matchOn: [],
        moduleMap: {},
        reverseModuleMap: {},
    };

    data: Record<string, unknown>;
    moduleName: string;
    dataIdentifier: unknown;
    dataIdentifierHash: string;
    matchHash: string;
    syncId: string | null;

    constructor(params: AssociationConstructorParams) {
        this.data = {};

        const data = get(params, 'data');
        this.moduleName = get(params, 'moduleName');
        this.dataIdentifier = get(params, 'dataIdentifier');

        this.dataIdentifierHash = (this.constructor as typeof Association).hashJSON(this.dataIdentifier);

        const config = (this.constructor as typeof Association).Config;

        for (const key of config.keys) {
            this.data[key] = config.moduleMap[this.moduleName][key](data);
        }

        // matchHash is used to find matches between two sync objects
        const matchHashData: unknown[] = [];
        for (const key of config.matchOn) {
            matchHashData.push(this.data[key]);
        }
        this.matchHash = (this.constructor as typeof Association).hashJSON(matchHashData);

        this.syncId = null;
    }

    equals(syncObj: Association): boolean {
        return this.matchHash === syncObj.matchHash;
    }

    dataKeyIsReplaceable(key: string): boolean {
        return this.data[key] === null || this.data[key] === '';
    }

    isModuleInMap(moduleName: string): unknown {
        return (this.constructor as typeof Association).Config.moduleMap[moduleName];
    }

    getName(): string {
        return (this.constructor as typeof Association).Config.name;
    }

    getHashData(): string {
        const orderedData: unknown[] = [];
        const config = (this.constructor as typeof Association).Config;
        for (const key of config.keys) {
            orderedData.push(this.data[key]);
        }

        return (this.constructor as typeof Association).hashJSON(orderedData);
    }

    setSyncId(syncId: string): void {
        this.syncId = syncId;
    }

    reverseModuleMap(moduleName: string): unknown {
        return (this.constructor as typeof Association).Config.reverseModuleMap[moduleName](this.data);
    }

    static hashJSON(data: unknown): string {
        const dataString = JSON.stringify(data, null, 2);
        return createHash('md5').update(dataString).digest('hex');
    }
}

