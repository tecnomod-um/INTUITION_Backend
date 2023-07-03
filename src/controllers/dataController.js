const express = require('express');
const router = express.Router();
const dataFiles = require('../config/dataFiles');
const dataFetcher = require('../utils/dataFetcher.js');

const getVars = async (req, endpoint) => {
    if (!req.session.varsPromise && !req.session.vars) {
        req.session.varsPromise = dataFetcher.getVarsFromSPARQL(endpoint);
        req.session.save();
    }

    let vars;
    if (!req.session.vars) {
        vars = await req.session.varsPromise;
        req.session.vars = vars;
        req.session.save();
    } else {
        vars = req.session.vars;
    }

    return vars;
};

router.get('/:file', async (req, res, next) => {
    const { file } = req.params;
    const filePath = dataFiles[file];
    const endpoint = req.headers['x-sparql-endpoint'];

    if (!filePath) {
        return res.sendStatus(404);
    }

    try {
        let fileContent;

        switch (file) {
            case 'vars':
                fileContent = await getVars(req, endpoint);
                break;

            case 'object_properties':
            case 'data_properties':
                const vars = await getVars(req, endpoint);

                if (!req.session.propertiesPromise && (!req.session.object_properties || !req.session.data_properties)) {
                    req.session.propertiesPromise = dataFetcher.getPropertiesFromSPARQL(vars, endpoint);
                    req.session.save();
                }

                let properties;
                if (!req.session.object_properties || !req.session.data_properties) {
                    properties = await req.session.propertiesPromise;
                    req.session.object_properties = properties.objectProperties;
                    req.session.data_properties = properties.dataProperties;
                    req.session.save();
                }

                fileContent = file === 'object_properties' ? req.session.object_properties : req.session.data_properties;
                break;

            case 'nodes':
                const { filter } = req.query;
                console.log("Filter nodes reached '" + filter + "'");
                // TODO
                break;
        }

        res.setHeader('Content-Type', 'application/json');
        res.json(fileContent);
    } catch (err) {
        next(err);  // Pass the error to the error-handling middleware
    }
});

module.exports = router;
