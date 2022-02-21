const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { protect } = require('../middlewares/auth');
const config = require('../config/config');

// const auth = jwt({ secret: config.secret, userProperty: 'payload' });

const User = require('../models/User');

router.get('/', function(req, res, next) {
  res.send('Frigg API <br>version: ' + config.version);
});

router.post('/register', function(req, res) {
  if (!req.body.email || !req.body.password) {
    return res.status(400).json({message: 'Please fill out all fields'});
  }

  User.findOne({ email: req.body.email }).then(user => {
    if (user) {
      return res.status(400).json({ message: "Email already exists" });
    } else {
      const newUser = new User({
        email: req.body.email,
      });

      bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(req.body.password, salt, (err, hash) => {
          if (err) throw err;
          newUser.hash = hash;
          newUser
            .save()
            .then(user => res.status(200).json({ success: true, token: user.generateJWT() }))
            .catch(err => console.log(err));
        });
      });
    }
  });
});


router.post('/login', function(req, res, next) {
  if(!req.body.email || !req.body.password){
    return res.status(400).json({message: 'Please fill out all fields'});
  }

  passport.authenticate('local', function(err, user, info) {
    if (err){ 
      return next(err); 
    }

    if (user){
        return res.json({ success: true, token: user.generateJWT() });
    } else {
        return res.status(401).json(info);
    }
  })(req, res, next);
});

router.route('/me').get(protect, (req, res, next) => {
    User.findById(req.user._id, (err, user) => {
        if (err) { 
            console.log(err)
            return next(err); 
        }

        res.status(200).json({ success: true, data: user });
    }).select('-hash');
});

module.exports = router;
