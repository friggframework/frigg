"use strict";
const mongoose = require("mongoose");
const { createModel, Entity: Parent } = require("@friggframework/models");

const collectionName = "salesrightEntity";
const parentModelObject = new Parent();

const _schema = new mongoose.Schema({
  credentials: [
    {
      credential: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Credential",
        required: false,
      },
      type: { type: String, required: true },
    },
  ],
  salesRightOrgName: { type: String },
});

_schema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { __t: collectionName } }
);

const _model = createModel(collectionName, _schema, parentModelObject);

class Entity extends Parent {
  static Schema = _schema;
  static Model = _model;

  constructor(model = _model) {
    super(model);
  }
}

module.exports = Entity;
