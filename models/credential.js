"use strict";
const mongoose = require("mongoose");
const LHEncrypt = require("@friggframework/encrypt");
const { Base } = require("./base");
const { createModel } = require("./create-model");

const collectionName = "Credential";
const _schema = Base.Schema.clone();

_schema.add({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  auth_is_valid: { type: Boolean },
  externalId: { type: String }, // Used for lookups, identifying the owner of the credential
});

_schema.plugin(LHEncrypt);

const _model = createModel(collectionName, _schema);

class Credential extends Base {
  static Schema = _schema;
  static Model = _model;

  constructor(model = _model) {
    super(model);
  }
}

module.exports = { Credential };
