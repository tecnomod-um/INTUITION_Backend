const axios = require('axios');
const axiosRetry = require('axios-retry');
const logger = require('../utils/logger.js');

const executeQuery = async (endpoint, query) => {
    console.log(endpoint);
    console.log(query);
    const startTime = Date.now();
    const options = {
        method: 'POST',
        url: endpoint,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        data: {
            query,
        },
    }
    try {
        axiosRetry(axios, { retries: 3 });
        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        const endTime = Date.now();
        const timeTaken = endTime - startTime;
        logger.error(`Error while executing query: ${error.message}`, {
            timeTaken: `${timeTaken} milliseconds`,
            query: query,
            errorDetails: error.response ? error.response.data : 'No response data'
        });
    }
}

module.exports = {
    executeQuery,
}
