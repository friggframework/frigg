const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  integration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Integration",
    required: true,
  },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["ONE_TO_MANY", "ONE_TO_ONE", "MANY_TO_ONE"],
    required: true,
  },
  primaryObject: { type: String, required: true },
  objects: [
    {
      entity: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Entity",
        required: true,
      },
      objectType: { type: String, required: true },
      objId: { type: String, required: true },
      metadata: { type: Object, required: false },
    },
  ],
});

schema.statics({
  addAssociation: async function (id, object) {
    return this.update({ _id: id }, { $push: { objects: object } });
  },
  findAssociation: async function (name, dataIdentifierHash) {
    const syncList = await this.list({
      name: name,
      "dataIdentifiers.hash": dataIdentifierHash,
    });

    if (syncList.length === 1) {
      return syncList[0];
    } else if (syncList.length === 0) {
      return null;
    } else {
      throw new Error(
        `there are multiple sync objects with the name ${name}, for entities [${entities}]`
      );
    }
  },
});

const Association =
  mongoose.models.Association || mongoose.model("Association", schema);
module.exports = { Association };
