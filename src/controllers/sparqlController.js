const sparqlPetition = require('../services/sparqlService.js');
const queries = require('../services/queries.js');
const maxValues = require('../config/maxValues');

const executeSPARQL = async (req, res) => {
  try {
    console.log("Starting SPARQL Query Execution");
    const responseData = await sparqlPetition.executeQuery(req.body.endpoint, req.body.query);
    const responseDataWithLabels = await fetchQueryLabels(req.body.endpoint, responseData);

    console.log('Request processed successfully');
    res.json(responseDataWithLabels);
  } catch (error) {
    console.error('Error during SPARQL Query Execution:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

const fetchQueryLabels = async (endpoint, responseData) => {
  console.log("Fetching required labels");
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
    console.error('Failed to fetch labels batch:', error);
  }
  uris.forEach(uri => {
    if (!fetchedLabels.has(uri)) {
      fetchedLabels.set(uri, '');
    }
  });

  return fetchedLabels;
}

module.exports = { executeSPARQL };
