const express = require('express');
const router = express.Router();
const sparqlController = require('../src/controllers/sparqlController');

router.post('/', sparqlController.executeSPARQL);

module.exports = router;
