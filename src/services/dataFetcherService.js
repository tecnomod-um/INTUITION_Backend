const queries = require('./queries.js');
const sparqlPetition = require('./sparqlService.js');
const stringUtils = require('../utils/stringUtils.js');

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
        const key = uri.substring(uri.lastIndexOf('/') + 1);
        const varResponse = await sparqlPetition.executeQuery(endpoint, queries.getVarsFromGraph(uri));

        if (isElementWithoutClassHierarchy(varResponse)) {
            createVarWithoutClassHierarchy(key, uri, vars);
        } else {
            const labelPromises = varResponse.results.bindings.map(entry => {
                const elementUri = entry.VarType?.value || '';
                return sparqlPetition.executeQuery(endpoint, queries.getLabel(elementUri))
                    .then(labelResponse => [elementUri, labelResponse.results.bindings[0]?.label?.value || '']);
            });
            const labelResults = await Promise.all(labelPromises);
            const labelMap = Object.fromEntries(labelResults);
            createOrUpdateVars(varResponse, labelMap, key, uri, vars);
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

const createOrUpdateVars = (varResponse, labelMap, key, uri, vars) => {
    varResponse.results.bindings.forEach((binding, index) => {
        let uri_element = binding.VarType?.value || '';
        let useGraphOnly = false;
        let label = labelMap[uri_element] || stringUtils.getLastPartUri(uri_element);

        if (isTriplet(label, uri_element)) {
            label = key.charAt(0).toUpperCase() + key.slice(1);
            uri_element = 'Triplet';
            useGraphOnly = true;
            vars[stringUtils.formatKey(label)] = { label, useGraphOnly, uri_element, uri_graph: uri };
            return;
        }
        const formattedLabel = stringUtils.formatKey(label);
        const varContent = { label, useGraphOnly, uri_element, uri_graph: uri };
        const existingVar = vars[formattedLabel];
        if (existingVar) {
            if (existingVar.uri_element !== uri_element) {
                handleDuplicates(vars, formattedLabel, varContent);
            }
        } else {
            vars[formattedLabel] = varContent;
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
    if (varKey === 'gene') console.log('in gene props');
    const propertyQueryObject = varValue.useGraphOnly
        ? queries.getPropertiesForGraph(varValue.uri_graph)
        : queries.getPropertiesForType(varValue.uri_element);
    const propertyResponse = await sparqlPetition.executeQuery(endpoint, propertyQueryObject);
    const emptyProps = {};

    const propertyPromises = propertyResponse.results.bindings.map(async (prop) => {
        const propertySubClassObject = varValue.useGraphOnly
            ? queries.getPropertySubClassForGraph(varValue.uri_graph, prop.p.value)
            : queries.getPropertySubClassForType(varValue.uri_element, prop.p.value);

        const subClassResponsePromise = await sparqlPetition.executeQuery(endpoint, propertySubClassObject);
        const labelResponsePromise = await sparqlPetition.executeQuery(endpoint, queries.getLabel(prop.p.value));

        // Helper property object
        const propertyData = {
            p: prop.p.value,
            label: labelResponsePromise.results.bindings[0]?.label?.value || '',
            type: subClassResponsePromise.results.bindings.map(entry => entry.type?.value || '')
        };

        let result;
        if (!propertyData.type[0]) {
            emptyProps[propertyData.p] = propertyData;
        } else {
            if (varKey === 'gene') console.log('full prop:');
            if (varKey === 'gene') console.log(propertyData);
            propertyData.type.forEach(type => {
                const propObject = createPropertyObject(propertyData, type, vars);
                result = pushToPropArray(propObject, objectProperties);
            });
        }

        return result;
    });
    await Promise.all(propertyPromises);

    // Treat empty properties
    const noValueProps = [];
    if (Object.keys(emptyProps).length > 0) {
        if (varKey === 'gene') console.log('in empties');
        const allPropURIs = Object.values(emptyProps).map(prop => prop.p.value);
        const allVarURIs = Object.values(vars).map(v => v.uri_element);
        const queryObjectEmpty = varValue.useGraphOnly
            ? queries.getEmptyPropertiesForGraph(varValue.uri_graph, allPropURIs, allVarURIs)
            : queries.getEmptyPropertiesForType(varValue.uri_element, allPropURIs, allVarURIs);

        const emptyPropertyResponse = await sparqlPetition.executeQuery(endpoint, queryObjectEmpty);
        emptyPropertyResponse.results.bindings.map(prop => {
            if (!prop.basicType?.value) noValueProps.push(prop.p.value);
            else {
                if (varKey === 'gene') console.log('basic data prop:');
                if (varKey === 'gene') console.log(emptyProps[prop.p.value]);
                if (varKey === 'gene') console.log(prop.basicType.value);
                const propObject = createPropertyObject(emptyProps[prop.p.value], prop.basicType.value, vars);
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
                    if (varKey === 'gene') console.log('Empty object prop:');
                    if (varKey === 'gene') console.log(emptyProps[prop.p.value]);
                    const propObject = createPropertyObject(emptyProps[prop.p.value], 'http://www.w3.org/2001/XMLSchema#anyURI', vars);
                    pushToPropArray(propObject, objectProperties);
                } else {
                    if (varKey === 'gene') console.log('Empty data prop:');
                    if (varKey === 'gene') console.log(emptyProps[prop.p.value]);
                    const propObject = createPropertyObject(emptyProps[prop.p.value], 'http://www.w3.org/2001/XMLSchema#string', vars);
                    pushToPropArray(propObject, dataProperties);
                }
            });
        }
    }
    console.log(`Fetched ${varKey} simple objects (OP:${objectProperties.length}, DP:${dataProperties.length})`);
    return;
}

const createPropertyObject = (propertyData, type, vars) => {
    let propLabel, propValue = '';
    const objectURI = type;
    const foundVarKey = Object.keys(vars).find(key => objectURI === vars[key].uri_element);
    // If the object isn't recognized, the property will allow all classes without hierarchy
    if (foundVarKey)
        propValue = foundVarKey;
    else propValue = type;
    const hasOutsideObject = propValue === 'http://www.w3.org/2001/XMLSchema#anyURI';
    propLabel = propertyData.label || propertyData.p.substring(propertyData.p.lastIndexOf('/') + 1);

    const result = (foundVarKey || hasOutsideObject) ? {
        property: propertyData.p,
        label: propLabel,
        object: propValue
    } : { property: propertyData.p, label: propLabel, type: type || 'http://www.w3.org/2001/XMLSchema#string' };
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
        sparqlPetition.executeQuery(endpoint, queries.getElementForTriplet(varValue.uri_graph, 'object')),
        sparqlPetition.executeQuery(endpoint, queries.getElementForTriplet(varValue.uri_graph, 'subject')),
        sparqlPetition.executeQuery(endpoint, queries.getDataPropertiesForTriplet(varValue.uri_graph))
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
        const labelResponsePromise = await sparqlPetition.executeQuery(endpoint, queries.getLabel(prop.p.value));

        // Helper property object
        const propertyData = {
            p: prop.p.value,
            label: labelResponsePromise.results.bindings[0]?.label?.value || '',
            type: [prop.type?.value || '']
        };

        const propObject = createPropertyObject(propertyData, prop.type?.value, vars);
        if (!propObject.object) pushToPropArray(propObject, dataProperties);
        else pushToPropArray(propObject, objectProperties);
    });
    console.log(`Fetched ${varKey} triplet objects (OP:${objectProperties.length}, DP:${dataProperties.length})`);
    return;
}

const findProperty = async (vars, endpoint, response, type, varValue) => {
    let property = response.results.bindings[0]?.[type]?.value;
    const target = property ? 'uri_element' : 'uri_graph';
    if (!property) {
        const missingResponse = await sparqlPetition.executeQuery(endpoint, queries.getMissingElementForTriplet(varValue.uri_graph, type));
        property = missingResponse.results.bindings[0].graph.value;
    }
    return Object.keys(vars).find(key => property === vars[key][target]);
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

    const labelResponsePromises = allNodesResponse.results.bindings.map(entry =>
        sparqlPetition.executeQuery(endpoint, queries.getLabel(entry.node.value)).then(labelResponse => ({
            node: entry.node.value,
            label: labelResponse.results.bindings[0]?.label?.value || '',
            varType: entry.varType.value
        }))
    );
    const nodeList = await Promise.all(labelResponsePromises);

    return buildNodes(vars, nodeList, totalLimit);
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
    const labelResponsePromises = allNodesResponses.flatMap(response =>
        response.results.bindings.map(entry =>
            sparqlPetition.executeQuery(endpoint, queries.getLabel(entry.node.value))
                .then(labelResponse => ({
                    node: entry.node.value,
                    label: labelResponse.results.bindings[0]?.label?.value || '',
                    varType: entry.varType.value
                }))
        )
    );
    const nodeList = await Promise.all(labelResponsePromises);

    return buildNodes(vars, nodeList, totalLimit);
}

const buildNodes = (vars, nodeList, totalLimit) => {
    const limitPerVarType = Math.floor(totalLimit / Object.keys(vars).length);
    let remaining = totalLimit - limitPerVarType * Object.keys(vars).length;
    const nodesObj = Object.keys(vars).reduce((acc, varType) => {
        acc[varType] = [];
        return acc;
    }, {});

    for (let nodeEntry of nodeList) {
        if (!isValidUri(nodeEntry.node)) continue;

        const varType = nodeEntry.varType.value;
        const remainingForThisVarType = limitPerVarType - nodesObj[varType].length;
        const label = nodeEntry?.label;

        if (remainingForThisVarType <= 0 && remaining <= 0) continue;
        nodesObj[varType].push({
            uri: nodeEntry.node,
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
