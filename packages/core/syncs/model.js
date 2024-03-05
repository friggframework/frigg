const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  entities: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Entity", required: true },
  ],
  hash: { type: String, required: true },
  name: { type: String, required: true },
  dataIdentifiers: [
    {
      entity: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Entity",
        required: true,
      },
      id: { type: Object, required: true },
      hash: { type: String, required: true },
    },
  ],
});

schema.statics({
  getSyncObject: async function (name, dataIdentifier, entity) {
    // const syncList = await this.list({name:name,entities: {"$in": entities}, "entityIds.idHash":entityIdHash });
    const syncList = await this.find({
      name: name,
      dataIdentifiers: { $elemMatch: { id: dataIdentifier, entity } },
    });

    if (syncList.length === 1) {
      return syncList[0];
    } else if (syncList.length === 0) {
      return null;
    } else {
      throw new Error(
        `There are multiple sync objects with the name ${name}, for entities [${syncList[0].entities}] [${syncList[1].entities}]`
      );
    }
  },

  addDataIdentifier: async function (id, dataIdentifier) {
    return await this.update(
      { _id: id },
      {},
      { dataIdentifiers: dataIdentifier }
    );
  },

  getEntityObjIdForEntityIdFromObject: function (syncObj, entityId) {
    for (let dataIdentifier of syncObj.dataIdentifiers) {
      if (dataIdentifier.entity.toString() === entityId) {
        return dataIdentifier.id;
      }
    }
    throw new Error(
      `Sync object does not have DataIdentifier for entityId: ${entityId}`
    );
  },
});

const Sync = mongoose.models.Sync || mongoose.model("Sync", schema);
module.exports = { Sync };
