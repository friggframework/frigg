const { Delegate } = require('@friggframework/core');
const { Credential } = require('./credential');
const { Entity } = require('./entity');
const { get } = require('@friggframework/assertions');

class ModuleManager extends Delegate {
    static Entity = Entity;
    static Credential = Credential;

    constructor(params) {
        super(params);
        this.userId = get(params, 'userId', null); // Making this non-required
    }

    static getName() {
        throw new Error('Module name is not defined');
    }

    static async getInstance(params) {
        throw new Error(
            'getInstance is not implemented. It is required for ModuleManager. '
        );
    }

    static async getEntitiesForUserId(userId) {
        // Only return non-internal fields. Leverages "select" and "options" to non-excepted fields and a pure object.
        const list = await this.Entity.find(
            { user: userId },
            '-dateCreated -dateUpdated -user -credentials -credential -__t -__v',
            { lean: true }
        );
        return list.map((entity) => ({
            id: entity._id,
            type: this.getName(),
            ...entity,
        }));
    }

    async getEntityId() {
        const list = await Entity.find({ user: this.userId });
        if (list.length > 1) {
            throw new Error(
                'There should not be more than one entity associated with a user for this specific class type'
            );
        }
        if (list.length == 0) {
            return null;
        }
        return list[0].id;
    }

    async validateAuthorizationRequirements() {
        const requirements = await this.getAuthorizationRequirements();

        if (
            (requirements.type === 'oauth1' ||
                requirements.type === 'oauth2') &&
            !requirements.url
        ) {
            return false;
        }

        return true;
    }

    async getAuthorizationRequirements(params) {
        // this function must return a dictionary with the following format
        // node only url key is required. Data would be used for Base Authentication
        // let returnData = {
        //     url: "callback url for the data or teh redirect url for login",
        //     type: one of the types defined in modules/Constants.js
        //     data: ["required", "fields", "we", "may", "need"]
        // }
        throw new Error(
            'Authorization requirements method getAuthorizationRequirements() is not defined in the class'
        );
    }

    async testAuth(params) {
        // this function must invoke a method on the API using authentication
        // if it fails, an exception should be thrown
        throw new Error(
            'Authentication test method testAuth() is not defined in the class'
        );
    }

    async processAuthorizationCallback(params) {
        // this function takes in a dictionary of callback information along with
        // a unique user id to associate with the entity in the form of
        // {
        //   userId: "some id",
        //   data: {}
        // }

        throw new Error(
            'Authorization requirements method processAuthorizationCallback() is not defined in the class'
        );
    }

    //----------------------------------------------------------------------------------------------------
    // optional

    async getEntityOptions() {
        // May not be needed if the callback already creates the entity, such as in situations
        // like HubSpot where the account is determined in the authorization flow.
        // This should only be used in situations such as FreshBooks where the user needs to make
        // an account decision on the front end.
        throw new Error(
            'Entity requirement method getEntityOptions() is not defined in the class'
        );
    }

    async findOrCreateEntity(params) {
        // May not be needed if the callback already creates the entity, such as in situations
        // like HubSpot where the account is determined in the authorization flow.
        // This should only be used in situations such as FreshBooks where the user needs to make
        // an account decision on the front end.
        throw new Error(
            'Entity requirement method findOrCreateEntity() is not defined in the class'
        );
    }

    async getAllSyncObjects(SyncClass) {
        // takes in a Sync class and will return all objects associated with the SyncClass in an array
        // in the form of
        // [
        //      {...object1},{...object2}...
        // ]

        throw new Error(
            'The method "getAllSyncObjects()" is not defined in the class'
        );
    }

    async batchCreateSyncObjects(syncObjects, syncManager) {
        // takes in an array of Sync objects that has two pieces of data that
        // are important to the updating module:
        // 1. obj.data -> The data mapped to the obj.keys data
        // 2. obj.syncId -> the id of the newly created sync object in our database. You will need to update
        //                  the sync object in the database with the your id associated with this data. You
        //                  can do this by calling the SyncManager function updateSyncObject.
        // [
        //      syncObject1,syncObject2, ...
        // ]

        throw new Error(
            'The method "batchUpdateSyncObjects()" is not defined in the class'
        );
    }

    async batchUpdateSyncObjects(syncObjects, syncManager) {
        // takes in an array of Sync objects that has two pieces of data that
        // are important to the updating module:
        // 1. obj.data -> The data mapped to the obj.keys data
        // 2. obj.moduleObjectIds[this.constructor.getName()] -> Indexed from the point of view of the module manager
        //                                                   it will return a json object holding all of the keys
        //                                                   required update this datapoint. an example would be:
        //                                                   {companyId:12, email:"test@test.com"}
        // [
        //      syncObject1,syncObject2, ...
        // ]

        throw new Error(
            'The method "batchUpdateSyncObjects()" is not defined in the class'
        );
    }

    async markCredentialsInvalid() {
        this.credential.auth_is_valid = false;
        return await this.credential.save();
    }
}

module.exports = { ModuleManager };
