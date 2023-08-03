const sparqlPetition = require('../services/sparqlService.js');
const queries = require('../services/queries.js');

const executeSPARQL = async (req, res) => {
  try {
    const responseData = await sparqlPetition.executeQuery(req.body.endpoint, req.body.query);
    const responseDataWithLabels = await fetchQueryLabels(req.body.endpoint, responseData);
    console.log('Request processed successfully');
    console.log(responseDataWithLabels.results.bindings)
    res.json(responseDataWithLabels);
  } catch (error) {
    console.log('Request failed');
    res.json(error);
  }
}

const fetchQueryLabels = async (endpoint, responseData) => {
  const labelPromises = [];
  const fetchedLabels = new Map();
  responseData.results.bindings.forEach(binding => {
    Object.entries(binding).forEach(([key, value]) => {
      // Fetch label if it isn't registered already
      if (key.endsWith('URI') && value.type === 'uri' && !fetchedLabels.has(value.value)) {
        const labelPromise = sparqlPetition.executeQuery(endpoint, queries.getLabel(value.value))
          .then(labelResponse => {
            const label = labelResponse.results.bindings[0]?.label?.value || '';
            fetchedLabels.set(value.value, label);
          });
        labelPromises.push(labelPromise);
      }
    })
  });
  await Promise.all(labelPromises);

  responseData.results.bindings = responseData.results.bindings.map(binding => {
    const newBinding = { ...binding };
    Object.entries(binding).forEach(([key, value]) => {
      if (key.endsWith('URI') && value.type === 'uri') {
        newBinding[key] = { ...newBinding[key], label: fetchedLabels.get(value.value) };
      }
    });
    return newBinding;
  });
  return responseData;
}

module.exports = { executeSPARQL };
