const axios = require('axios');

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

    try {
        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        console.error("Error while executing query:", error.message);
        if (error.response && error.response.data) {
            console.error("Response body:", error.response.data);
        }
    }
}

module.exports = {
    executeQuery,
}
