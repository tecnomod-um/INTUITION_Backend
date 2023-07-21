const axios = require('axios');

const executeQuery = async (endpoint, query) => {
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
    };

    try {
        const response = await axios.request(options);
        return response.data;
        let endTime = Date.now();
        let timeTaken = endTime - startTime;
        console.log(`Time taken: ${timeTaken} milliseconds`);
    } catch (error) {
        let endTime = Date.now();
        let timeTaken = endTime - startTime;
        console.log(`Time taken: ${timeTaken} milliseconds`);
        console.error("Error while executing query:", error.message);
        console.error(query);
        if (error.response && error.response.data) {
            console.error("Response body:", error.response.data);
        }
    }
}

module.exports = {
    executeQuery,
}
