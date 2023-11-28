const axios = require('axios');
const axiosRetry = require('axios-retry');

const fetchIndexByType = async (endpoint, query) => {
    let startTime = Date.now();
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
        console.log(`Time taken: ${timeTaken} milliseconds`);
        console.log(query)
        console.error("Error while executing query:", error.message);
        if (error.response && error.response.data) {
            console.error("Response body:", error.response.data);
        }
    }
}

module.exports = {
    fetchIndex,
}
