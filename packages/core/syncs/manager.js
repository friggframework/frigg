const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');
const SyncObject = require('./sync');
const { debug } = require('packages/logs');
const { get } = require('../assertions');
const { createSyncRepository } = require('./sync-repository-factory');

class SyncManager {
    constructor(params) {
        this.SyncObjectClass = getAndVerifyType(
            params,
            'syncObjectClass',
            SyncObject
        );
        this.ignoreEmptyMatchValues = get(
            params,
            'ignoreEmptyMatchValues',
            true
        );
        this.isUnidirectionalSync = get(params, 'isUnidirectionalSync', false);
        this.useFirstMatchingDuplicate = get(
            params,
            'useFirstMatchingDuplicate',
            true
        );
        this.omitEmptyStringsFromData = get(
            params,
            'omitEmptyStringsFromData',
            true
        );

        this.integration = get(params, 'integration', null); // TODO Change to type validation
        this.syncRepository = createSyncRepository();
    }

    // calls getAllSyncObjects() on the modules and then finds the difference between each. The Primary Module
    // takes precedence unless the field is an empty string or null
    async initialSync() {
        const time0 = parseInt(moment().format('x'));
        const primaryEntityId = await this.primaryModule.entity.id;
        const secondaryEntityId = await this.secondaryModule.entity.id;

        // get array of sync objects
        let primaryArr = await this.primaryModule.getAllSyncObjects(
            this.SyncObjectClass
        );
        const primaryArrayInitialCount = primaryArr.length;
        const time1 = parseInt(moment().format('x'));
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
        const time2 = parseInt(moment().format('x'));
        debug(
            `${secondaryArr.length} number of ${
                this.SyncObjectClass.name
            } retrieved from ${this.secondaryModule.constructor.getName()} in ${
                time2 - time1
            } ms`
        );

        // ignore the empty match values
        if (this.ignoreEmptyMatchValues) {
            const primaryCountBefore = primaryArr.length;
            primaryArr = primaryArr.filter((obj) => !obj.missingMatchData);
            const primaryCountAfter = primaryArr.length;
            const secondaryCountBefore = secondaryArr.length;
            secondaryArr = secondaryArr.filter((obj) => !obj.missingMatchData);
            const secondaryCountAfter = secondaryArr.length;
            debug(
                `Ignoring ${primaryCountBefore - primaryCountAfter} ${
                    this.SyncObjectClass.name
                } objects from ${this.primaryModule.constructor.getName()}`
            );
            debug(
                `Ignoring ${secondaryCountBefore - secondaryCountAfter} ${
                    this.SyncObjectClass.name
                } objects from ${this.secondaryModule.constructor.getName()}`
            );
        }
        if (this.useFirstMatchingDuplicate) {
            primaryArr = _.uniqBy(primaryArr, 'matchHash');
            debug(
                `${primaryArr.length} Objects remaining after removing duplicates from Primary Array`
            );
            secondaryArr = _.uniqBy(secondaryArr, 'matchHash');
            debug(
                `${secondaryArr.length} Objects remaining after removing duplicates from Secondary Array`
            );
        }
        const primaryUpdate = [];
        const secondaryUpdate = [];
        // PrimaryIntersection is an array where at least one matching object was found inside
        // SecondaryArray that matched the inspected object from Primary.
        // The only catch is, there will definitely be duplicates unless self filtered
        const primaryIntersection = primaryArr.filter((e1) =>
            secondaryArr.some((e2) => e1.equals(e2))
        );
        // SecondaryIntersection is an array where at least one matching object was found inside
        // primaryIntersection that matched the inspected object from secondaryArray.
        // The only catch is, there will definitely be duplicates unless self filtered
        const secondaryIntersection = secondaryArr.filter((e1) =>
            primaryIntersection.some((e2) => e1.equals(e2))
        );
        const secondaryCreate = primaryArr.filter(
            (e1) => !secondaryArr.some((e2) => e1.equals(e2))
        );
        const primaryCreate = secondaryArr.filter(
            (e1) => !primaryArr.some((e2) => e1.equals(e2))
        );

        // process the intersections and see which ones need to be updated.
        for (const primaryObj of primaryIntersection) {
            const secondaryObj = secondaryIntersection.find((e1) =>
                e1.equals(primaryObj)
            );

            let primaryUpdated = false;
            let secondaryUpdated = false;

            for (const key in primaryObj.data) {
                let valuesAreNotEquivalent = true; // Default to this just to be safe
                // Make sure we're not comparing a number 0 to a empty string/null/undefined.
                if (_.isEqual(primaryObj.data[key], secondaryObj.data[key])) {
                    // This should basically tell us if both values are falsy, in which case we're good
                    valuesAreNotEquivalent = false;
                } else if (
                    typeof primaryObj.data[key] === 'number' ||
                    typeof secondaryObj.data[key] === 'number'
                ) {
                    // This should try comparing if at least one of the two are numbers
                    valuesAreNotEquivalent =
                        primaryObj.data[key] !== secondaryObj.data[key];
                } else if (!primaryObj.data[key] && !secondaryObj.data[key]) {
                    valuesAreNotEquivalent = false;
                }

                if (valuesAreNotEquivalent) {
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
            }
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

            primaryObj.setSyncId(createdObj.id);
            secondaryObj.setSyncId(createdObj.id);
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

        const time3 = parseInt(moment().format('x'));
        debug(`Sorting complete in ${time3 - time2} ms`);

        // create the database entries for the
        if (!this.isUnidirectionalSync) {
            for (const secondaryObj of primaryCreate) {
                const createdObj = await this.createSyncDBObject(
                    [secondaryObj],
                    [secondaryEntityId, primaryEntityId]
                );

                secondaryObj.setSyncId(createdObj.id);
            }
        }

        for (const primaryObj of secondaryCreate) {
            const createdObj = await this.createSyncDBObject(
                [primaryObj],
                [primaryEntityId, secondaryEntityId]
            );
            primaryObj.setSyncId(createdObj.id);
        }
        const time4 = parseInt(moment().format('x'));
        debug(`Sync objects create in DB in ${time4 - time3} ms`);

        // call the batch update/creates
        let time5 = parseInt(moment().format('x'));
        let time6 = parseInt(moment().format('x'));
        if (!this.isUnidirectionalSync) {
            await this.primaryModule.batchUpdateSyncObjects(
                primaryUpdate,
                this
            );
            time5 = parseInt(moment().format('x'));
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
            time6 = parseInt(moment().format('x'));
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
        const time7 = parseInt(moment().format('x'));
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
        const time8 = parseInt(moment().format('x'));
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

    async createSyncDBObject(objArr, entities) {
        const entityIds = entities.map(
            (ent) => ({ $elemMatch: { $eq: mongoose.Types.ObjectId(ent) } })
            // return {"$elemMatch": {"$eq": ent}};
        );
        const dataIdentifiers = [];
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
            // entities
        };

        return await this.syncRepository.upsertSync(filter, createSyncObj);
    }

    // Automatically syncs the objects with the secondary module if the object was updated
    async sync(syncObjects) {
        const batchUpdates = [];
        const batchCreates = [];
        const noChange = [];
        const primaryEntityId = await this.primaryModule.entity.id;
        const secondaryEntityId = await this.secondaryModule.entity.id;

        const secondaryModuleName = this.secondaryModule.constructor.getName();
        for (const primaryObj of syncObjects) {
            const dataHash = primaryObj.getHashData({
                omitEmptyStringsFromData: this.omitEmptyStringsFromData,
            });

            // get the sync object in the database if it exists
            let syncObj = await this.syncRepository.getSyncObject(
                primaryObj.getName(),
                primaryObj.dataIdentifier,
                primaryEntityId
            );

            if (syncObj) {
                debug('Sync object found, evaluating...');
                const hashMatch = syncObj.hash === dataHash;
                const dataIdentifierLength = syncObj.dataIdentifiers.length;

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
                    secondaryObj.setSyncId(syncObj.id);
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
                    primaryObj.setSyncId(syncObj.id);
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
                primaryObj.setSyncId(syncObj.id);
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

    // takes in:
    // 1. the Sync Id of an object in our database
    // 2. the object Id in the form of a json object for example:
    //      {
    //          companyId: 12,
    //          saleId:524
    //      }
    // 3. the module manager calling the function
    async confirmCreate(syncObj, createdId, moduleManager) {
        const dataIdentifier = {
            entity: await moduleManager.entity.id,
            id: createdId,
            hash: this.SyncObjectClass.hashJSON(createdId),
        };
        // No matter what, save the hash because why not?
        // TODO this is suboptimal because it does 2 DB requests where only 1 is needed
        // TODO If you want to get even more optimized, batch any/all updates together.
        // Also this is only needed because of the case where an "update" becomes a "create" when we find only
        // 1 data identifier. So, during `sync()`, if we see that the hashes don't match, we check for DataIDs and
        // decide to create in the "target" or "secondary" because we know it failed for some reason. We also want
        // to hold off on updating the hash in case the create fails for some reason again.

        await this.syncRepository.updateSync(syncObj.syncId, {
            hash: syncObj.getHashData({
                omitEmptyStringsFromData: this.omitEmptyStringsFromData,
            }),
        });

        const result = await this.syncRepository.addDataIdentifier(
            syncObj.syncId,
            dataIdentifier
        );

        return result;
    }

    async confirmUpdate(syncObj) {
        debug(
            'Successfully updated secondaryObject. Updating the hash in the DB'
        );
        const result = await this.syncRepository.updateSync(syncObj.syncId, {
            hash: syncObj.getHashData({
                omitEmptyStringsFromData: this.omitEmptyStringsFromData,
            }),
        });
        debug('Success');

        return result;
    }
}

module.exports = SyncManager;
