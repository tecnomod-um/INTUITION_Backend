const express = require('express');
const cors = require('cors');
const app = express();
const indexRouter = require('./routes/index');
const dataRouter = require('./routes/data');

require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
  origin: process.env.FRONTURL,
  methods: ['GET', 'POST'],
};

app.use(cors(corsOptions));

app.use('/', indexRouter);
app.use('/umq', dataRouter);

module.exports = app;
