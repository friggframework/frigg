const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

let UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  hash: String,
  salt: String,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: Date,
  reset_password_token: String,
  reset_password_date: Date,
});

UserSchema.pre('save', function(next) {
    const currentDate = new Date();
    this.updated_at = currentDate;
  
    next();
});

UserSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha1').toString('hex');
};

UserSchema.methods.validPassword = function(password) {
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha1').toString('hex');
  
    return this.hash === hash;
};

UserSchema.methods.generateJWT = function() {

    // set expiration to 60 days
    const today = new Date();
    const exp = new Date(today);
    exp.setDate(today.getDate() + 60);
  
    return jwt.sign({
      _id: this._id,
      email: this.email,
      exp: parseInt(exp.getTime() / 1000),
    }, config.secret);
};

const User = mongoose.model('User', UserSchema);

module.exports = User;