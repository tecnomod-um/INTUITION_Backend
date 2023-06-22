const axios = require('axios');
const sparqlUtils = require('../utils/sparqlUtils.js');

const executeSPARQL = (req, res) => {
  console.log('Got SPARQL query:', req.body);

  sparqlUtils.executeSPARQLQuery(req.body.endpoint, req.body.query)
    .then((responseData) => {
      console.log('Request processed successfully');
      console.log(responseData);
      res.json(responseData);
    })
    .catch((error) => {
      console.log('Request failed');
      res.json(error);
    });
};

module.exports = { executeSPARQL };
