import md5 = require('md5');
import { debug } from '../logs';
import { get } from '../assertions';

type ModuleMapFn = (data: unknown) => unknown;

export interface SyncConfig {
    name: string;
    keys: string[];
    matchOn: string[];
    moduleMap: Record<string, Record<string, ModuleMapFn>>;
    reverseModuleMap: Record<string, (data: Record<string, unknown>) => unknown>;
}

export interface SyncParams {
    data?: unknown;
    moduleName?: string;
    dataIdentifier?: unknown;
    useMapping?: boolean;
}

export class Sync {
    static Config: SyncConfig = {
        name: 'Sync',
        keys: [],
        matchOn: [],
        moduleMap: {},
        reverseModuleMap: {},
    };

    data: Record<string, unknown>;
    moduleName: string | undefined;
    dataIdentifier: unknown;
    useMapping: boolean;
    dataIdentifierHash: string;
    missingMatchData: boolean;
    matchHash: string;
    syncId: string | null;

    constructor(params: SyncParams) {
        this.data = {};

        const data = get(params, 'data') as unknown;
        this.moduleName = get(params, 'moduleName') as string | undefined;
        this.dataIdentifier = get(params, 'dataIdentifier');
        this.useMapping = get(params, 'useMapping', true) as boolean;

        this.dataIdentifierHash = (this.constructor as typeof Sync).hashJSON(this.dataIdentifier);

        if (this.useMapping) {
            for (const key of (this.constructor as typeof Sync).Config.keys) {
                this.data[key] =
                    (this.constructor as typeof Sync).Config.moduleMap[this.moduleName!][key](data);
            }
        } else {
            this.data = data as Record<string, unknown>;
        }

        const matchHashData: unknown[] = [];
        this.missingMatchData = false;
        for (const key of (this.constructor as typeof Sync).Config.matchOn) {
            if (!this.data[key]) {
                this.missingMatchData = true;
                debug(`Data key of ${key} was missing from MatchOn`);
            }

            matchHashData.push(this.data[key]);
        }
        this.matchHash = (this.constructor as typeof Sync).hashJSON(matchHashData);

        this.syncId = null;
    }

    equals(syncObj: Sync): boolean {
        return this.matchHash === syncObj.matchHash;
    }

    dataKeyIsReplaceable(key: string): boolean {
        return this.data[key] === null || this.data[key] === '';
    }

    isModuleInMap(moduleName: string): unknown {
        return (this.constructor as typeof Sync).Config.moduleMap[moduleName];
    }

    getName(): string {
        return (this.constructor as typeof Sync).Config.name;
    }

    getHashData(params?: { omitEmptyStringsFromData?: boolean }): string {
        const omitEmptyStringsFromData = get(
            params || {},
            'omitEmptyStringsFromData',
            false
        ) as boolean;
        const orderedData: unknown[] = [];
        for (const key of (this.constructor as typeof Sync).Config.keys) {
            if (omitEmptyStringsFromData && this.data[key] === '') {
                this.data[key] = undefined;
            }
            orderedData.push(this.data[key]);
        }

        return (this.constructor as typeof Sync).hashJSON(orderedData);
    }

    setSyncId(syncId: string | null): void {
        this.syncId = syncId;
    }

    reverseModuleMap(moduleName: string): unknown {
        return (this.constructor as typeof Sync).Config.reverseModuleMap[moduleName](this.data);
    }

    static hashJSON(data: unknown): string {
        const dataString = JSON.stringify(data, null, 2);
        return md5(dataString);
    }
}
