const sparqlPetition = require('../services/sparqlService.js');
const queries = require('../services/queries.js');
const maxValues = require('../config/maxValues');
const logger = require('../utils/logger.js');

const executeSPARQL = async (req, res) => {
  try {
    logger.info("Starting SPARQL Query Execution");
    const responseData = await sparqlPetition.executeQuery(req.body.endpoint, req.body.query);
    const responseDataWithLabels = await fetchQueryLabels(req.body.endpoint, responseData);

    logger.info('Request processed successfully');
    res.json(responseDataWithLabels);
  } catch (error) {
    logger.error(`Error during SPARQL Query Execution: ${JSON.stringify({
      message: error.message,
      stack: error.stack,
      endpoint: req.body.endpoint,
      query: req.body.query
    }, null, 2)}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

const fetchQueryLabels = async (endpoint, responseData) => {
  logger.info("Fetching required labels");
  const urisToFetch = [];
  responseData.results.bindings.forEach(binding => {
    Object.entries(binding).forEach(([key, value]) => {
      if (key.endsWith('URI') && value.type === 'uri') {
        urisToFetch.push(value.value);
      }
    });
  });
  const uniqueUris = [...new Set(urisToFetch)];
  const fetchedLabels = new Map();
  for (let i = 0; i < uniqueUris.length; i += maxValues.batch_size) {
    const currentBatch = uniqueUris.slice(i, i + maxValues.batch_size);
    const batchFetchedLabels = await fetchLabelsBatch(endpoint, currentBatch);
    batchFetchedLabels.forEach((label, uri) => fetchedLabels.set(uri, label));
  }

  responseData.results.bindings = responseData.results.bindings.map(binding => {
    const newBinding = { ...binding };
    Object.entries(binding).forEach(([key, value]) => {
      if (key.endsWith('URI') && value.type === 'uri') {
        newBinding[key] = { ...newBinding[key], label: fetchedLabels.get(value.value) || '' };
      }
    });
    return newBinding;
  });

  return responseData;
}

const fetchLabelsBatch = async (endpoint, uris) => {
  const fetchedLabels = new Map();

  try {
    const query = queries.getLabelsBatch(uris);
    const labelResponse = await sparqlPetition.executeQuery(endpoint, query);
    labelResponse.results.bindings.forEach(binding => {
      const uri = binding.uri?.value;
      const label = binding.label?.value || '';
      if (uri) {
        fetchedLabels.set(uri, label);
      }
    });
  } catch (error) {
    logger.error(`Failed to fetch labels batch: ${error.message}`);
  }
  uris.forEach(uri => {
    if (!fetchedLabels.has(uri)) {
      fetchedLabels.set(uri, '');
    }
  });

  return fetchedLabels;
}

module.exports = { executeSPARQL };
