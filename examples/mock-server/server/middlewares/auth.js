const jwt = require("jsonwebtoken");
const config = require('../config/config');

const User = require('../models/User');

exports.protect = async (req, res, next) => {
    if (!req.headers.authorization) {
      return next({
        message: "Please log in",
        statusCode: 401,
      });
    }
  
    const token = req.headers.authorization.replace("Bearer", "").trim();
  
    try {
      const decoded = jwt.verify(token, config.secret);
      const user = await User.findById(decoded._id);
  
      req.user = user;
      next();
    } catch (err) {
      next({
        message: "Please log in",
        statusCode: 401,
      });
    }
  };