const mongoose = require("mongoose");
const { Base } = require("./base");
const { createModel } = require("./create-model");

const collectionName = "Association";
let _schema = Base.Schema.clone();

_schema.add({
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

const _model = createModel(collectionName, _schema);

class Association extends Base {
  static Schema = _schema;
  static Model = _model;

  constructor(model = _model) {
    super(model);
  }

  async getAssociationObject(name, dataIdentifierHash) {
    // let syncList = await this.list({name:name,entities: {"$in": entities}, "entityIds.idHash":entityIdHash });
    let syncList = await this.list({
      name: name,
      "dataIdentifiers.hash": dataIdentifierHash,
    });

    if (syncList.length === 1) {
      return syncList[0];
    } else if (syncList.length === 0) {
      return null;
    } else {
      this.throwException(
        `there are multiple sync objects with the name ${name}, for entities [${entities}]`
      );
    }
  }

  async addAssociation(id, object) {
    return this.model.update({ _id: id }, { $push: { objects: object } });
  }
}

module.exports = { Association };
