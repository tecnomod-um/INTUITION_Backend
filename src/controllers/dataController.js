const express = require('express');
const router = express.Router();
const sparqlUtils = require('../utils/sparqlUtils.js');
const fileHandler = require('../utils/fileHandler.js');

router.get('/:file', async (req, res) => {
    const dataFiles = {
        data_properties: 'data/data_properties.json',
        object_properties: 'data/object_properties.json',
        vars: 'data/vars.json',
        nodes: 'data/nodes.json',
    };

    const file = dataFiles[req.params.file];

    if (file) {
        let fileContent;
        const endpoint = req.headers['x-sparql-endpoint'];

        try {
            switch (req.params.file) {
                case 'vars':
                    if (!req.session.varsPromise && !req.session.vars) {
                        req.session.varsPromise = sparqlUtils.getVarsFromSPARQL(endpoint);
                        req.session.save();
                    }

                    if (!req.session.vars) {
                        console.log("Vars fetched from server")
                        fileContent = await req.session.varsPromise;
                        req.session.vars = fileContent;
                        //console.log(req.session.vars);
                        req.session.save();
                    } else {
                        console.log("Vars fetched from session")
                        fileContent = req.session.vars;
                    }
                    break;

                case 'object_properties':
                case 'data_properties':
                    if (!req.session.varsPromise && !req.session.vars) {
                        req.session.varsPromise = sparqlUtils.getVarsFromSPARQL(endpoint);
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

                    if (!req.session.propertiesPromise && (!req.session.object_properties || !req.session.data_properties)) {
                        console.log("Properties fetched from server")
                        req.session.propertiesPromise = sparqlUtils.getPropertiesFromSPARQL(vars, endpoint);
                        req.session.save();
                    }

                    let properties;
                    if (!req.session.object_properties || !req.session.data_properties) {
                        properties = await req.session.propertiesPromise;
                        req.session.object_properties = properties.objectProperties;
                        req.session.data_properties = properties.dataProperties;
                        req.session.save();
                    } else {
                        console.log("Properties fetched from session")
                        //console.log(req.session.object_properties);
                        //console.log(req.session.data_properties);
                    }

                    fileContent = req.params.file === 'object_properties' ? req.session.object_properties : req.session.data_properties;
                    break;

                case 'nodes':
                    const { filter } = req.query;
                    fileHandler.sendPartialFile(res, file, filter);
                    break;
            }
        } catch (err) {
            return res.sendStatus(500);
        }

        if (req.params.file !== 'nodes') {
            // Respond with file content from session
            res.setHeader('Content-Type', 'application/json');
            res.json(fileContent);
        }
    } else {
        res.sendStatus(404);
    }
});

module.exports = router;
