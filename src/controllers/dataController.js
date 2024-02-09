const express = require('express');
const path = require('path');
const router = express.Router();
const dataFetcher = require('../services/dataFetcherService.js');
const maxValues = require('../config/maxValues');
const dataPath = require('../config/dataPath');
const logger = require('../utils/logger.js');
const fileUtils = require('../utils/fileUtils.js');
const stringUtils = require('../utils/stringUtils.js');
const promiseCache = {};

const getVars = async (req, endpoint) => {
    let vars;
    const sanitizedEndpoint = stringUtils.sanitizeInput(endpoint);
    const varsFilePath = path.join(__dirname, `${dataPath}/vars_${sanitizedEndpoint}.json`);

    if (!req.session.vars) {
        if (await fileUtils.checkFileExists(varsFilePath)) {
            logger.info(`Vars data fetched from file: ${varsFilePath}`);
            vars = await fileUtils.readFile(varsFilePath);
        } else {
            if (promiseCache[endpoint])
                vars = await promiseCache[endpoint];
            else {
                promiseCache[endpoint] = dataFetcher.getVarsFromSPARQL(endpoint);
                vars = await promiseCache[endpoint];
                await fileUtils.writeFile(varsFilePath, vars);
            }
            delete promiseCache[endpoint];
        }
        req.session.vars = vars;
        req.session.save();
    } else
        vars = req.session.vars;
    return vars;
}

router.get('/:file', async (req, res, next) => {
    let fileContent;
    const { file } = req.params;
    const endpoint = req.headers['x-sparql-endpoint'];
    const sanitizedEndpoint = stringUtils.sanitizeInput(endpoint);
    let vars;

    try {
        vars = await getVars(req, endpoint);

        switch (file) {
            case 'vars':
                fileContent = vars;
                break;

            case 'properties':
                const propertiesFilePath = path.join(__dirname, `${dataPath}/properties_${sanitizedEndpoint}.json`);

                if (await fileUtils.checkFileExists(propertiesFilePath)) {
                    logger.info(`Properties data fetched from file: ${propertiesFilePath}`);
                    fileContent = await fileUtils.readFile(propertiesFilePath);
                } else {
                    let properties;
                    if (!req.session.propertiesPromise && !req.session.properties) {
                        req.session.propertiesPromise = dataFetcher.getPropertiesFromSPARQL(vars, endpoint);
                        req.session.save();
                    }
                    if (!req.session.properties) {
                        properties = await req.session.propertiesPromise;
                        req.session.properties = properties;
                        req.session.save();
                    }
                    await fileUtils.writeFile(propertiesFilePath, req.session.properties);
                    fileContent = req.session.properties;
                }
                break;

            case 'nodes':
                const nodesFilePath = path.join(__dirname, `${dataPath}/nodes_${sanitizedEndpoint}.json`);
                const { filter } = req.query;

                if (!filter || filter.length < 3) {
                    if (await fileUtils.checkFileExists(nodesFilePath)) {
                        logger.info(`Nodes data fetched from file: ${nodesFilePath}`);
                        fileContent = await fileUtils.readFile(nodesFilePath);
                    } else {
                        if (!req.session.nodesPromise && !req.session.nodes) {
                            req.session.nodesPromise = dataFetcher.getNodesFromSPARQL(vars, endpoint, maxValues.node, maxValues.total);
                            req.session.save();
                        }
                        if (!req.session.nodes) {
                            const nodes = await req.session.nodesPromise;
                            req.session.nodes = nodes;
                            req.session.save();
                        }
                        await fileUtils.writeFile(nodesFilePath, req.session.nodes);
                        fileContent = req.session.nodes;
                    }
                } else
                    fileContent = await dataFetcher.getFilteredNodes(vars, endpoint, maxValues.node, filter, maxValues.total);
                break;
            default:
                throw new Error(`Invalid file parameter: ${file}`);
        }
        res.setHeader('Content-Type', 'application/json');
        res.json(fileContent);
    } catch (err) {
        logger.error(`Error in /:file route: ${err.message}`);
        next(err);
    }
})

module.exports = router;
