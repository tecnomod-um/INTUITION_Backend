const express = require('express');
const router = express.Router();
const fileHandler = require('../utils/fileHandler.js');

router.get('/:file', (req, res) => {
    const dataFiles = {
        data_properties: 'data/data_properties.json',
        object_properties: 'data/object_properties.json',
        vars: 'data/vars.json',
        nodes: 'data/nodes.json',
    };

    const file = dataFiles[req.params.file];

    if (file) {
        console.log()
        if (req.params.file === 'nodes') {
            const { filter } = req.query;
            fileHandler.sendPartialFile(res, file, filter);
        } else {
            fileHandler.sendFile(res, file);
        }
    } else {
        res.sendStatus(404);
    }
});

module.exports = router;