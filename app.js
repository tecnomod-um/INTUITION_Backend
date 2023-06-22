const express = require('express');
const session = require('express-session');
const cors = require('cors');
const app = express();
const indexRouter = require('./routes/index');
const dataRouter = require('./routes/data');
const crypto = require('crypto');
require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
const generateSecretKey = () => {
  return crypto.randomBytes(32).toString('hex');
};
app.use(
  session({
    secret: generateSecretKey(),
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);
const corsOptions = {
  origin: process.env.FRONTURL,
  methods: ['GET', 'POST'],
  credentials: true
};
app.use(cors(corsOptions));

app.use('/', indexRouter);
app.use('/umq', dataRouter);

module.exports = app;
