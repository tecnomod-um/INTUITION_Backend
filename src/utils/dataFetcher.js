const queries = require('./queries.js');
const stringUtils = require('./stringUtils.js');
const w3cTypes = require('../config/typeList');
const sparqlPetition = require('./sparqlPetitionHandler.js');

const getVarsFromSPARQL = async (endpoint) => {
    try {
        const graphURIs = await fetchGraphURIs(endpoint);
        const vars = await fetchLabelsForGraphs(endpoint, graphURIs);
        return vars;
    } catch (error) {
        console.error('Error retrieving vars from SPARQL:', error);
        throw error;
    }
}

// Returns all graphs defined in the endpoint
const fetchGraphURIs = async (endpoint) => {
    const graphResponse = await sparqlPetition.executeQuery(endpoint, queries.getAllGraphs());
    return graphResponse.results.bindings
        .map((binding) => binding.graph.value)
        .filter(isValidUri);
}

const isValidUri = (uri) => {
    return uri.startsWith("http") &&
        !uri.includes("localhost") &&
        !uri.includes("schemas") &&
        !(uri.includes("www.w3.org") && uri !== "http://www.w3.org/2002/07/owl#Thing");
}

const fetchLabelsForGraphs = async (endpoint, graphURIs) => {
    const vars = {};
    await Promise.all(graphURIs.map(async (uri) => {
        const labelResponse = await sparqlPetition.executeQuery(endpoint, queries.getLabelForGraph(`<${uri}>`));
        const key = uri.substring(uri.lastIndexOf('/') + 1);

        if (isElementWithoutClassHierarchy(labelResponse)) {
            createVarWithoutClassHierarchy(key, uri, vars);
        } else {
            createOrUpdateVars(labelResponse, key, uri, vars);
        }
    }));
    return vars;
}

// Elements that inherit from 'thing' will be considered without class hierarchy
const isElementWithoutClassHierarchy = (labelResponse) => {
    return labelResponse.results.bindings.some(binding => binding.VarType?.value === "http://www.w3.org/2002/07/owl#Thing");
}

const createVarWithoutClassHierarchy = (key, uri, vars) => {
    const label = key;
    let useGraphOnly = true;
    let uri_element = 'http://www.w3.org/2002/07/owl#Thing';
    vars[stringUtils.formatKey(key)] = { label, useGraphOnly, uri_element, uri_graph: uri };
}

const createOrUpdateVars = (labelResponse, key, uri, vars) => {
    labelResponse.results.bindings.forEach(binding => {
        const formattedLabel = stringUtils.formatKey(binding.VarTypeLabel?.value || '');
        let useGraphOnly = false;
        let uri_element = binding.VarType?.value || '';
        let label = binding.VarTypeLabel?.value || '';

        if (isTriplet(label, uri_element)) {
            label = key.charAt(0).toUpperCase() + key.slice(1);
            uri_element = 'Triplet';
            useGraphOnly = true;
            vars[stringUtils.formatKey(label)] = { label, useGraphOnly, uri_element, uri_graph: uri };
            return;
        }

        const varContent = { label, useGraphOnly, uri_element, uri_graph: uri };

        if (formattedLabel) {
            const existingVar = vars[formattedLabel];
            if (existingVar) {
                if (existingVar.uri_element !== uri_element) {
                    handleDuplicates(vars, formattedLabel, varContent);
                }
            } else {
                vars[formattedLabel] = varContent;
            }
        }
    });
}

const isTriplet = (label, uri_element) => {
    return label === 'Triple' || uri_element.includes('http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement');
}

const handleDuplicates = (vars, formattedLabel, newValue) => {
    const oldValue = vars[formattedLabel];
    delete vars[formattedLabel];

    vars[`${formattedLabel}_${stringUtils.getDomain(oldValue.uri_element)}`] = oldValue;
    vars[`${formattedLabel}_${stringUtils.getDomain(newValue.uri_element)}`] = newValue;
}

// Fetches both object and data properties
const getPropertiesFromSPARQL = async (vars, endpoint) => {
    const objectProperties = {};
    const dataProperties = {};
    const { triplet, simple } = separateVars(vars);

    // Process simple and triplet elements properties in parallel
    const promiseSimple = Promise.all(Object.entries(simple).map(async ([varKey, varValue]) => {
        objectProperties[varKey] = [];
        dataProperties[varKey] = [];
        return fetchSimpleProperties(varKey, varValue, vars, endpoint, objectProperties[varKey], dataProperties[varKey]);
    }));

    const promiseTriplet = Promise.all(Object.entries(triplet).map(async ([varKey, varValue]) => {
        objectProperties[varKey] = [];
        dataProperties[varKey] = [];
        return fetchTripletProperties(varKey, varValue, vars, endpoint, objectProperties[varKey], dataProperties[varKey]);
    }));

    await Promise.all([promiseSimple, promiseTriplet]);

    return { objectProperties, dataProperties };
}

const separateVars = (vars) => {
    return Object.entries(vars).reduce((result, [key, value]) => {
        result[value.uri_element === 'Triplet' ? 'triplet' : 'simple'][key] = value;
        return result;
    }, { triplet: {}, simple: {} });
}

const fetchSimpleProperties = async (varKey, varValue, vars, endpoint, objectProperties, dataProperties) => {
    const queryObject = varValue.useGraphOnly
        ? queries.getPropertiesForGraph(`<${varValue.uri_graph}>`)
        : queries.getPropertiesForType(`<${varValue.uri_element}>`)

    const propertyResponse = await sparqlPetition.executeQuery(endpoint, queryObject);
    const emptyProps = {};
    propertyResponse.results.bindings.map(prop => {
        if (!prop.type?.value) {
            emptyProps[prop.p.value] = prop;
        } else {
            const propObject = createPropertyObject(prop, vars);
            pushToPropArray(propObject, objectProperties);
        }
    });
    // Treat empty properties
    const noValueProps = [];
    if (Object.keys(emptyProps).length > 0) {
        const allPropURIs = Object.values(emptyProps).map(prop => prop.p.value);
        const allVarURIs = Object.values(vars).map(v => v.uri_element);
        const queryObjectEmpty = varValue.useGraphOnly
            ? queries.getEmptyPropertiesForGraph(`<${varValue.uri_graph}>`, allPropURIs, allVarURIs)
            : queries.getEmptyPropertiesForType(`<${varValue.uri_element}>`, allPropURIs, allVarURIs);

        const emptyPropertyResponse = await sparqlPetition.executeQuery(endpoint, queryObjectEmpty);
        emptyPropertyResponse.results.bindings.map(prop => {
            if (!prop.basicType?.value) noValueProps.push(prop.p.value);
            else {
                emptyProps[prop.p.value].type = emptyProps[prop.p.value].type || {};
                emptyProps[prop.p.value].type.value = prop.basicType.value;
                const propObject = createPropertyObject(emptyProps[prop.p.value], vars);
                propObject.object ?
                    pushToPropArray(propObject, objectProperties) :
                    pushToPropArray(propObject, dataProperties);
            }
        });
        if (noValueProps.length > 0) {
            const noValuePropertyResponse = await sparqlPetition.executeQuery(endpoint, queries.getPropertyType(noValueProps));
            noValuePropertyResponse.results.bindings.map(prop => {
                // If no value, it will be treated as an object property for classes without hierarchy
                if (prop.propertyType.value === 'http://www.w3.org/2002/07/owl#ObjectProperty') {
                    emptyProps[prop.p.value].type = emptyProps[prop.p.value].type || {};
                    emptyProps[prop.p.value].type.value = 'http://www.w3.org/2001/XMLSchema#anyURI';
                    const propObject = createPropertyObject(emptyProps[prop.p.value], vars);
                    pushToPropArray(propObject, objectProperties);
                } else {
                    emptyProps[prop.p.value].type = emptyProps[prop.p.value].type || {};
                    emptyProps[prop.p.value].type.value = 'http://www.w3.org/2001/XMLSchema#string';
                    const propObject = createPropertyObject(emptyProps[prop.p.value], vars);
                    pushToPropArray(propObject, dataProperties);
                }
            });
        }
    }
    console.log(`Fetched ${varKey} simple objects (OP:${objectProperties.length}, DP:${dataProperties.length})`);
    return;
}

const createPropertyObject = (prop, vars) => {
    let propLabel, propValue = '';
    const objectURI = prop.type?.value;
    const foundVarKey = Object.keys(vars).find(key => objectURI === vars[key].uri_element);
    // If the object isn't recognized, the property will allow all classes without hierarchy
    if (foundVarKey)
        propValue = foundVarKey;
    else propValue = prop.type?.value;
    const hasOutsideObject = propValue === 'http://www.w3.org/2001/XMLSchema#anyURI';
    propLabel = prop.name?.value || prop.p.value.substring(prop.p.value.lastIndexOf('/') + 1);

    const result = (foundVarKey || hasOutsideObject) ? {
        property: prop.p.value,
        label: propLabel,
        object: propValue
    } : { property: prop.p.value, label: propLabel, type: prop.type?.value || 'http://www.w3.org/2001/XMLSchema#string'};
    return result;
}

// Push property to array if not already present
const pushToPropArray = (propObject, propArray) => {
    if (!propArray.find(obj => obj.property === propObject.property && obj.label === propObject.label && obj.object === propObject.object)) {
        propArray.push(propObject);
    }
}

const fetchTripletProperties = async (varKey, varValue, vars, endpoint, objectProperties, dataProperties) => {
    // Run all three SPARQL queries concurrently.
    const [objectResponse, subjectResponse, dataPropertyResponse] = await Promise.all([
        sparqlPetition.executeQuery(endpoint, queries.getElementForTriplet(`<${varValue.uri_graph}>`, 'object')),
        sparqlPetition.executeQuery(endpoint, queries.getElementForTriplet(`<${varValue.uri_graph}>`, 'subject')),
        sparqlPetition.executeQuery(endpoint, queries.getDataPropertiesForTriplet(`<${varValue.uri_graph}>`))
    ]);

    // Handle object properties
    const [foundObject, foundSubject] = await Promise.all([
        findProperty(vars, endpoint, objectResponse, 'object', varValue),
        findProperty(vars, endpoint, subjectResponse, 'subject', varValue)
    ]);
    if (foundObject) objectProperties.push(createTripletProperty('object', foundObject));
    if (foundSubject) objectProperties.push(createTripletProperty('subject', foundSubject));

    // Handle data properties
    dataPropertyResponse.results.bindings.map(async (prop) => {
        if (!prop.p?.value.includes('object') && !prop.p?.value.includes('subject')) {
            const propObject = createPropertyObject(prop, vars);
            if (!propObject.object) pushToPropArray(propObject, dataProperties);
        }
    });
    console.log(`Fetched ${varKey} triplet objects (OP:${objectProperties.length}, DP:${dataProperties.length})`);
    return;
}

const findProperty = async (vars, endpoint, response, type, varValue) => {
    let property = response.results.bindings[0]?.[type]?.value;
    let foundVarKey;

    if (!property) {
        const missingResponse = await sparqlPetition.executeQuery(endpoint, queries.getMissingElementForTriplet(`<${varValue.uri_graph}>`, type));
        property = missingResponse.results.bindings[0].graph.value;
        foundVarKey = Object.keys(vars).find(key => property === vars[key].uri_graph);
    } else {
        foundVarKey = Object.keys(vars).find(key => property === vars[key].uri_element);
    }
    return foundVarKey;
}

const createTripletProperty = (label, key) => ({
    property: `http://www.w3.org/1999/02/22-rdf-syntax-ns#${label}`,
    label: label,
    object: key
})

const getNodesFromSPARQL = async (vars, endpoint, limit, totalLimit) => {
    const unionQueries = Object.keys(vars).map(key =>
        vars[key].useGraphOnly
            ? `{${queries.getNodesByGraph(vars[key].uri_graph, key, limit)}}`
            : `{${queries.getNodesByType(vars[key].uri_element, key, limit)}}`
    );
    const fullQuery = queries.encapsulateUnion(unionQueries.join(" UNION "));
    const allNodesResponse = await sparqlPetition.executeQuery(endpoint, fullQuery);
    const allNodes = allNodesResponse.results.bindings;
    return buildNodes(vars, allNodes, totalLimit);
}

const getFilteredNodes = async (vars, endpoint, limit, filter, totalLimit) => {
    console.log("in filter")
    const sanitizedFilter = stringUtils.sanitizeInput(filter.toLowerCase());
    const filterQueryList = Object.keys(vars).map(key =>
        vars[key].useGraphOnly
            ? queries.getFilteredByGraph(vars[key].uri_graph, key, limit, sanitizedFilter)
            : queries.getFilteredByType(vars[key].uri_element, key, limit, sanitizedFilter)
    );
    const allNodesResponses = await Promise.all(
        filterQueryList.map(query => sparqlPetition.executeQuery(endpoint, query))
    );
    const allNodes = allNodesResponses.flatMap(response => response.results.bindings);
    return buildNodes(vars, allNodes, totalLimit);
}

const buildNodes = (vars, nodes, totalLimit) => {
    const limitPerVarType = Math.floor(totalLimit / Object.keys(vars).length);
    let remaining = totalLimit - limitPerVarType * Object.keys(vars).length;
    const nodesObj = Object.keys(vars).reduce((acc, varType) => {
        acc[varType] = [];
        return acc;
    }, {});

    for (let node of nodes) {
        if (!isValidUri(node.node.value)) continue;

        const varType = node.varType.value;
        const remainingForThisVarType = limitPerVarType - nodesObj[varType].length;
        const label = node.label?.value;

        if (remainingForThisVarType <= 0 && remaining <= 0) continue;
        nodesObj[varType].push({
            uri: node.node.value,
            label: label
        });
        if (remainingForThisVarType <= 0 && remaining > 0) {
            remaining--;
        }
    }
    // Go over nodes again to add URI part to duplicated labels
    for (let varType of Object.keys(nodesObj)) {
        let labels = nodesObj[varType].map(node => node.label);
        let duplicates = labels.filter((item, index) => labels.indexOf(item) != index);

        for (let node of nodesObj[varType]) {
            if (duplicates.includes(node.label)) {
                node.label = `${node.label ? `${node.label} ` : ''}(${stringUtils.getLastPartUri(node.uri)})`;
            }
        }
    }
    return nodesObj;
}

module.exports = {
    getVarsFromSPARQL,
    getPropertiesFromSPARQL,
    getNodesFromSPARQL,
    getFilteredNodes,
}
