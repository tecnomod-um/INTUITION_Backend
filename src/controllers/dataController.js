const express = require('express');
const router = express.Router();
const dataFetcher = require('../utils/dataFetcher.js');
const dataFiles = require('../config/dataFiles');
const maxValues = require('../config/maxValues');

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
        let vars;
        switch (file) {
            case 'vars':
                fileContent = await getVars(req, endpoint);
                break;

            case 'object_properties':
            case 'data_properties':
                vars = await getVars(req, endpoint);

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
                vars = await getVars(req, endpoint);
                const { filter } = req.query;
                if (!filter || filter.length < 3) {
                    // Fetch stock nodes
                    if (!req.session.nodesPromise && !req.session.nodes) {
                        req.session.nodesPromise = dataFetcher.getNodesFromSPARQL(vars, endpoint, maxValues.node, maxValues.total);
                        req.session.save();
                    }

                    if (!req.session.nodes) {
                        const nodes = await req.session.nodesPromise
                        req.session.nodes = nodes;
                        req.session.save();
                    }
                    fileContent = req.session.nodes;
                } else
                    fileContent = await dataFetcher.getFilteredNodes(vars, endpoint, maxValues.node, filter, maxValues.total);
                break;
        }

        res.setHeader('Content-Type', 'application/json');
        res.json(fileContent);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
