const axios = require('axios');

// Used both in backend queries and received node queries
const executeQuery = async (endpoint, query) => {
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
    };
    const response = await axios.request(options);
    return response.data;
}

module.exports = {
    executeQuery,
}
