const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcherService.js');
const maxValues = require('../config/maxValues');
const promiseCache = {};

const getVars = async (req, endpoint) => {
    let vars;

    if (!req.session.vars) {
        // If there is a promise in cache for this endpoint, wait for it
        if (promiseCache[endpoint]) {
            vars = await promiseCache[endpoint];
        } else {
            promiseCache[endpoint] = dataFetcher.getVarsFromSPARQL(endpoint);
            vars = await promiseCache[endpoint];
        }
        req.session.vars = vars;
        req.session.save();
        // Once the data is fetched, delete the promise from the cache
        delete promiseCache[endpoint];
    } else {
        vars = req.session.vars;
    }
    return vars;
}

router.get('/:file', async (req, res, next) => {
    let fileContent;
    const { file } = req.params;
    const endpoint = req.headers['x-sparql-endpoint'];
    let vars;
    try {
        switch (file) {
            case 'vars':
                fileContent = await getVars(req, endpoint);
                break;

            case 'properties':
                vars = await getVars(req, endpoint);
                console.log(vars);
                if (!req.session.propertiesPromise && !req.session.properties) {
                    req.session.propertiesPromise = dataFetcher.getPropertiesFromSPARQL(vars, endpoint);
                    req.session.save();
                }
                let properties;
                if (!req.session.properties) {
                    properties = await req.session.propertiesPromise;
                    req.session.properties = properties;
                    req.session.save();
                }
                fileContent = req.session.properties;
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
