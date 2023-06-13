const axios = require('axios');

const executeSPARQL = (req, res) => {
    console.log('Got SPARQL query:', req.body);

    const options = {
        method: 'POST',
        url: req.body.endpoint,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        data: {
            query: req.body.query,
        },
    };

    axios
        .request(options)
        .then((response) => {
            console.log('Request processed successfully');
            console.log(response.data);
            res.json(response.data);
        })
        .catch((error) => {
            console.log('Request failed');
            res.json(error);
        });
};

module.exports = { executeSPARQL };
