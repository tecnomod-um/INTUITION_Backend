const express = require('express');
const router = express.Router();
const dataController = require('../src/controllers/dataController');
const sparqlRouter = require('./sparql');

router.use('/data', dataController);
router.use('/sparql', sparqlRouter);

module.exports = router;