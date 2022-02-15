const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const passport = require("passport");
const cors = require('cors');
const config = require('./server/config/config');

require('./server/models/User');

const users = require("./server/routes/users");

const app = express();

// Bodyparser middleware
app.use(
  bodyParser.urlencoded({
    extended: false
  })
);

app.use(bodyParser.json());

app.use(
    cors({
        origin: '*',
        credentials: true,
    })
);

// DB Config
const db = config.database;

// Connect to MongoDB
mongoose
  .connect(
    db,
    { useNewUrlParser: true }
  )
  .then(() => console.log("MongoDB successfully connected"))
  .catch(err => console.log(err));


// Passport config
require("./server/config/passport");

// Passport middleware
app.use(passport.initialize());

// Routes
app.use("/api/auth", users);

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server up and running on port ${port} !`));