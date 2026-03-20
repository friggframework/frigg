import _ = require('lodash');
import moment = require('moment');
import { debug } from '../logs';
import { get, getAndVerifyType } from '../assertions';
import { Sync } from './sync';
import { createSyncRepository } from './repositories/sync-repository-factory';
import type { SyncRepositoryInterface } from './repositories/sync-repository-interface';

const { ObjectId } = require('bson');

interface SyncModule {
    entity: { id: string | Promise<string> };
    constructor: { getName(): string };
    getAllSyncObjects(SyncObjectClass: typeof Sync): Promise<Sync[]>;
    batchUpdateSyncObjects(objects: Sync[], manager: SyncManager): Promise<unknown[]>;
    batchCreateSyncObjects(objects: Sync[], manager: SyncManager): Promise<unknown[]>;
}

export interface SyncManagerParams {
    syncObjectClass?: typeof Sync;
    ignoreEmptyMatchValues?: boolean;
    isUnidirectionalSync?: boolean;
    useFirstMatchingDuplicate?: boolean;
    omitEmptyStringsFromData?: boolean;
    integration?: unknown;
}

export class SyncManager {
    readonly SyncObjectClass: typeof Sync;
    readonly ignoreEmptyMatchValues: boolean;
    readonly isUnidirectionalSync: boolean;
    readonly useFirstMatchingDuplicate: boolean;
    readonly omitEmptyStringsFromData: boolean;
    readonly integration: unknown;
    readonly syncRepository: SyncRepositoryInterface;
    primaryModule!: SyncModule;
    secondaryModule!: SyncModule;

    constructor(params: SyncManagerParams) {
        this.SyncObjectClass = getAndVerifyType(
            params,
            'syncObjectClass',
            Sync
        ) as typeof Sync;
        this.ignoreEmptyMatchValues = get(
            params,
            'ignoreEmptyMatchValues',
            true
        ) as boolean;
        this.isUnidirectionalSync = get(params, 'isUnidirectionalSync', false) as boolean;
        this.useFirstMatchingDuplicate = get(
            params,
            'useFirstMatchingDuplicate',
            true
        ) as boolean;
        this.omitEmptyStringsFromData = get(
            params,
            'omitEmptyStringsFromData',
            true
        ) as boolean;

        this.integration = get(params, 'integration', null);
        this.syncRepository = createSyncRepository();
    }

    private filterEmptyMatchValues(arr: Sync[], moduleName: string): Sync[] {
        const countBefore = arr.length;
        const filtered = arr.filter((obj) => !obj.missingMatchData);
        debug(
            `Ignoring ${countBefore - filtered.length} ${
                this.SyncObjectClass.name
            } objects from ${moduleName}`
        );
        return filtered;
    }

    private deduplicateByMatchHash(arr: Sync[], label: string): Sync[] {
        const deduped = _.uniqBy(arr, 'matchHash');
        debug(`${deduped.length} Objects remaining after removing duplicates from ${label}`);
        return deduped;
    }

    private valuesAreEquivalent(primaryVal: unknown, secondaryVal: unknown): boolean {
        if (_.isEqual(primaryVal, secondaryVal)) return true;
        if (typeof primaryVal === 'number' || typeof secondaryVal === 'number') {
            return primaryVal === secondaryVal;
        }
        if (!primaryVal && !secondaryVal) return true;
        return false;
    }

    private resolveIntersectionUpdates(
        primaryObj: Sync,
        secondaryObj: Sync
    ): { primaryUpdated: boolean; secondaryUpdated: boolean } {
        let primaryUpdated = false;
        let secondaryUpdated = false;

        for (const key in primaryObj.data) {
            if (this.valuesAreEquivalent(primaryObj.data[key], secondaryObj.data[key])) {
                continue;
            }

            if (
                primaryObj.dataKeyIsReplaceable(key) &&
                !secondaryObj.dataKeyIsReplaceable(key) &&
                !this.isUnidirectionalSync
            ) {
                primaryObj.data[key] = secondaryObj.data[key];
                primaryUpdated = true;
            } else if (!primaryObj.dataKeyIsReplaceable(key)) {
                secondaryObj.data[key] = primaryObj.data[key];
                secondaryUpdated = true;
            }
        }

        return { primaryUpdated, secondaryUpdated };
    }

    async initialSync(): Promise<void> {
        const time0 = Number.parseInt(moment().format('x'));
        const primaryEntityId = await this.primaryModule.entity.id;
        const secondaryEntityId = await this.secondaryModule.entity.id;

        let primaryArr = await this.primaryModule.getAllSyncObjects(
            this.SyncObjectClass
        );
        const primaryArrayInitialCount = primaryArr.length;
        const time1 = Number.parseInt(moment().format('x'));
        debug(
            `${primaryArr.length} number of ${
                this.SyncObjectClass.name
            } retrieved from ${this.primaryModule.constructor.getName()} in ${
                time1 - time0
            } ms`
        );
        let secondaryArr = await this.secondaryModule.getAllSyncObjects(
            this.SyncObjectClass
        );
        const secondaryArrayInitialCount = secondaryArr.length;
        const time2 = Number.parseInt(moment().format('x'));
        debug(
            `${secondaryArr.length} number of ${
                this.SyncObjectClass.name
            } retrieved from ${this.secondaryModule.constructor.getName()} in ${
                time2 - time1
            } ms`
        );

        if (this.ignoreEmptyMatchValues) {
            primaryArr = this.filterEmptyMatchValues(primaryArr, this.primaryModule.constructor.getName());
            secondaryArr = this.filterEmptyMatchValues(secondaryArr, this.secondaryModule.constructor.getName());
        }
        if (this.useFirstMatchingDuplicate) {
            primaryArr = this.deduplicateByMatchHash(primaryArr, 'Primary Array');
            secondaryArr = this.deduplicateByMatchHash(secondaryArr, 'Secondary Array');
        }
        const primaryUpdate: Sync[] = [];
        const secondaryUpdate: Sync[] = [];
        const primaryIntersection = primaryArr.filter((e1) =>
            secondaryArr.some((e2) => e1.equals(e2))
        );
        const secondaryIntersection = secondaryArr.filter((e1) =>
            primaryIntersection.some((e2) => e1.equals(e2))
        );
        const secondaryCreate = primaryArr.filter(
            (e1) => !secondaryArr.some((e2) => e1.equals(e2))
        );
        const primaryCreate = secondaryArr.filter(
            (e1) => !primaryArr.some((e2) => e1.equals(e2))
        );

        for (const primaryObj of primaryIntersection) {
            const secondaryObj = secondaryIntersection.find((e1) =>
                e1.equals(primaryObj)
            )!;

            const { primaryUpdated, secondaryUpdated } =
                this.resolveIntersectionUpdates(primaryObj, secondaryObj);

            if (primaryUpdated && !this.isUnidirectionalSync) {
                primaryUpdate.push(primaryObj);
            }
            if (secondaryUpdated) {
                secondaryUpdate.push(secondaryObj);
            }

            const createdObj = await this.createSyncDBObject(
                [primaryObj, secondaryObj],
                [primaryEntityId, secondaryEntityId]
            );

            primaryObj.setSyncId(createdObj.id!);
            secondaryObj.setSyncId(createdObj.id!);
        }
        debug(
            `Found ${
                primaryUpdate.length
            } for updating in ${this.primaryModule.constructor.getName()}`
        );
        debug(
            `Found ${
                primaryCreate.length
            } for creating in ${this.primaryModule.constructor.getName()}`
        );
        debug(
            `Found ${
                secondaryUpdate.length
            } for updating in ${this.secondaryModule.constructor.getName()}`
        );
        debug(
            `Found ${
                secondaryCreate.length
            } for creating in ${this.secondaryModule.constructor.getName()}`
        );

        const time3 = Number.parseInt(moment().format('x'));
        debug(`Sorting complete in ${time3 - time2} ms`);

        if (!this.isUnidirectionalSync) {
            for (const secondaryObj of primaryCreate) {
                const createdObj = await this.createSyncDBObject(
                    [secondaryObj],
                    [secondaryEntityId, primaryEntityId]
                );

                secondaryObj.setSyncId(createdObj.id!);
            }
        }

        for (const primaryObj of secondaryCreate) {
            const createdObj = await this.createSyncDBObject(
                [primaryObj],
                [primaryEntityId, secondaryEntityId]
            );
            primaryObj.setSyncId(createdObj.id!);
        }
        const time4 = Number.parseInt(moment().format('x'));
        debug(`Sync objects create in DB in ${time4 - time3} ms`);

        let time5 = Number.parseInt(moment().format('x'));
        let time6 = Number.parseInt(moment().format('x'));
        if (!this.isUnidirectionalSync) {
            await this.primaryModule.batchUpdateSyncObjects(
                primaryUpdate,
                this
            );
            time5 = Number.parseInt(moment().format('x'));
            debug(
                `Updated ${primaryUpdate.length} ${
                    this.SyncObjectClass.name
                }s in ${this.primaryModule.constructor.getName()} in ${
                    time5 - time4
                } ms`
            );
            await this.primaryModule.batchCreateSyncObjects(
                primaryCreate,
                this
            );
            time6 = Number.parseInt(moment().format('x'));
            debug(
                `Created ${primaryCreate.length} ${
                    this.SyncObjectClass.name
                }s in ${this.primaryModule.constructor.getName()} in ${
                    time6 - time5
                } ms`
            );
        }

        await this.secondaryModule.batchUpdateSyncObjects(
            secondaryUpdate,
            this
        );
        const time7 = Number.parseInt(moment().format('x'));
        debug(
            `Updated ${secondaryUpdate.length} ${
                this.SyncObjectClass.name
            }s in ${this.secondaryModule.constructor.getName()} in ${
                time7 - time6
            } ms`
        );

        await this.secondaryModule.batchCreateSyncObjects(
            secondaryCreate,
            this
        );
        const time8 = Number.parseInt(moment().format('x'));
        debug(
            `${primaryArrayInitialCount} number of ${
                this.SyncObjectClass.name
            } objects retrieved from ${this.primaryModule.constructor.getName()} in ${
                time1 - time0
            } ms`
        );
        debug(
            `${secondaryArrayInitialCount} number of ${
                this.SyncObjectClass.name
            } objects retrieved from ${this.secondaryModule.constructor.getName()} in ${
                time2 - time1
            } ms`
        );
        debug(`Sorting complete in ${time3 - time2} ms`);
        debug(`Sync objects create in DB in ${time4 - time3} ms`);
        debug(
            `Updated ${primaryUpdate.length} ${
                this.SyncObjectClass.name
            }s in ${this.primaryModule.constructor.getName()} in ${
                time5 - time4
            } ms`
        );
        debug(
            `Created ${primaryCreate.length} ${
                this.SyncObjectClass.name
            }s in ${this.primaryModule.constructor.getName()} in ${
                time6 - time5
            } ms`
        );
        debug(
            `Updated ${secondaryUpdate.length} ${
                this.SyncObjectClass.name
            }s in ${this.secondaryModule.constructor.getName()} in ${
                time7 - time6
            } ms`
        );
        debug(
            `Created ${secondaryCreate.length} ${
                this.SyncObjectClass.name
            }s in ${this.secondaryModule.constructor.getName()} in ${
                time8 - time7
            } ms`
        );
    }

    async createSyncDBObject(objArr: Sync[], entities: string[]): Promise<{ id?: string }> {
        const entityIds = entities.map(
            (ent) => ({ $elemMatch: { $eq: new ObjectId(ent) } })
        );
        const dataIdentifiers: { entity: string; id: unknown; hash: string }[] = [];
        for (const index in objArr) {
            dataIdentifiers.push({
                entity: entities[index],
                id: objArr[index].dataIdentifier,
                hash: objArr[index].dataIdentifierHash,
            });
        }
        const primaryObj = objArr[0];

        const createSyncObj = {
            name: primaryObj.getName(),
            entities,
            hash: primaryObj.getHashData({
                omitEmptyStringsFromData: this.omitEmptyStringsFromData,
            }),
            dataIdentifiers,
        };
        const filter = {
            name: primaryObj.getName(),
            dataIdentifiers: {
                $elemMatch: {
                    id: primaryObj.dataIdentifier,
                    entity: entities[0],
                },
            },
            entities: { $all: entityIds },
        };

        return await this.syncRepository.upsertSync(filter as any, createSyncObj as any);
    }

    async sync(syncObjects: Sync[]): Promise<unknown[]> {
        const batchUpdates: Sync[] = [];
        const batchCreates: Sync[] = [];
        const noChange: unknown[] = [];
        const primaryEntityId = await this.primaryModule.entity.id;
        const secondaryEntityId = await this.secondaryModule.entity.id;

        const secondaryModuleName = this.secondaryModule.constructor.getName();
        for (const primaryObj of syncObjects) {
            const dataHash = primaryObj.getHashData({
                omitEmptyStringsFromData: this.omitEmptyStringsFromData,
            });

            let syncObj = await this.syncRepository.getSyncObject(
                primaryObj.getName(),
                primaryObj.dataIdentifier,
                primaryEntityId
            );

            if (syncObj) {
                debug('Sync object found, evaluating...');
                const hashMatch = syncObj.hash === dataHash;
                const dataIdentifierLength = syncObj.dataIdentifiers?.length ?? 0;

                if (!hashMatch && dataIdentifierLength > 1) {
                    debug(
                        "Previously successful sync, but hashes don't match. Updating."
                    );
                    const secondaryObj = new this.SyncObjectClass({
                        data: primaryObj.data,
                        dataIdentifier:
                            this.syncRepository.getEntityObjIdForEntityIdFromObject(
                                syncObj,
                                secondaryEntityId
                            ),
                        moduleName: secondaryModuleName,
                        useMapping: false,
                    });
                    secondaryObj.setSyncId(syncObj.id!);
                    batchUpdates.push(secondaryObj);
                } else if (hashMatch && dataIdentifierLength > 1) {
                    debug(
                        'Data hashes match, no updates or creates needed for this one.'
                    );
                    noChange.push(syncObj);
                }

                if (dataIdentifierLength === 1) {
                    debug(
                        "We have only one data Identifier, which means we don't have a record in the secondary app for whatever reason (failure or filter). So, creating."
                    );
                    primaryObj.setSyncId(syncObj.id!);
                    batchCreates.push(primaryObj);
                }
            } else {
                debug(
                    "No sync object, so we'll try creating, first creating an object"
                );
                syncObj = await this.createSyncDBObject(
                    [primaryObj],
                    [primaryEntityId, secondaryEntityId]
                );
                primaryObj.setSyncId(syncObj.id!);
                batchCreates.push(primaryObj);
            }
        }
        const updateRes =
            batchUpdates.length > 0
                ? await this.secondaryModule.batchUpdateSyncObjects(
                      batchUpdates,
                      this
                  )
                : [];
        const createRes =
            batchCreates.length > 0
                ? await this.secondaryModule.batchCreateSyncObjects(
                      batchCreates,
                      this
                  )
                : [];
        return updateRes.concat(createRes).concat(noChange);
    }

    async confirmCreate(syncObj: Sync, createdId: unknown, moduleManager: SyncModule): Promise<unknown> {
        const dataIdentifier = {
            entity: await moduleManager.entity.id,
            id: createdId,
            hash: this.SyncObjectClass.hashJSON(createdId),
        };

        await this.syncRepository.updateSync(syncObj.syncId!, {
            hash: syncObj.getHashData({
                omitEmptyStringsFromData: this.omitEmptyStringsFromData,
            }),
        });

        const result = await this.syncRepository.addDataIdentifier(
            syncObj.syncId!,
            dataIdentifier
        );

        return result;
    }

    async confirmUpdate(syncObj: Sync): Promise<unknown> {
        debug(
            'Successfully updated secondaryObject. Updating the hash in the DB'
        );
        const result = await this.syncRepository.updateSync(syncObj.syncId!, {
            hash: syncObj.getHashData({
                omitEmptyStringsFromData: this.omitEmptyStringsFromData,
            }),
        });
        debug('Success');

        return result;
    }
}
