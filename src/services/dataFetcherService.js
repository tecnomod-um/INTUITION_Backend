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
    const propertyQueryObject = varValue.useGraphOnly
        ? queries.getPropertiesForGraph(varValue.uri_graph)
        : queries.getPropertiesForType(varValue.uri_element);
    const propertyResponse = await sparqlPetition.executeQuery(endpoint, propertyQueryObject);
    const emptyProps = {};
    const noValueProps = [];

    const propertyPromises = propertyResponse.results.bindings.map(async (prop) => {
        const propertySubClassObject = varValue.useGraphOnly
            ? queries.getPropertySubClassForGraph(varValue.uri_graph, prop.p.value)
            : queries.getPropertySubClassForType(varValue.uri_element, prop.p.value);

        const subClassResponsePromise = sparqlPetition.executeQuery(endpoint, propertySubClassObject);
        const labelResponsePromise = sparqlPetition.executeQuery(endpoint, queries.getLabel(prop.p.value));
        const [subClassResponse, labelResponse] = await Promise.all([subClassResponsePromise, labelResponsePromise]);

        const propertyData = {
            p: prop.p.value,
            label: labelResponse.results.bindings[0]?.label?.value || '',
            type: subClassResponse.results.bindings.map(entry => entry.type?.value || '')
        };

        if (!propertyData.type[0]) {
            emptyProps[propertyData.p] = propertyData;
            return;
        }

        return propertyData.type.map(type => {
            const propObject = createPropertyObject(propertyData, type, vars);
            if (propObject.object) pushToPropArray(propObject, objectProperties);
            else pushToPropArray(propObject, dataProperties);
        });
    });
    await Promise.all(propertyPromises);

    // Treat empty properties
    if (Object.keys(emptyProps).length > 0) {
        const allVarURIs = Object.values(vars).map(v => v.uri_element);
        const emptyPropertyPromises = Object.keys(emptyProps).map(async (uri) => {
            const queryObjectEmpty = varValue.useGraphOnly
                ? queries.getEmptyPropertiesForGraph(varValue.uri_graph, uri)
                : queries.getEmptyPropertiesForType(varValue.uri_element, uri);

            const emptyPropertyResponse = await sparqlPetition.executeQuery(endpoint, queryObjectEmpty);

            emptyPropertyResponse.results.bindings.map(prop => {
                if (!prop.basicType?.value && !(prop.o?.value && allVarURIs.includes(prop.o.value))) {
                    noValueProps.push(prop.p.value);
                    return;
                }

                const target = prop.basicType?.value || prop.o.value;
                const propObject = createPropertyObject(emptyProps[prop.p.value], target, vars);
                if (propObject.object) pushToPropArray(propObject, objectProperties);
                else pushToPropArray(propObject, dataProperties);
            });
        });
        await Promise.all(emptyPropertyPromises);
    }

    if (noValueProps.length > 0) {
        const noValuePropertyPromises = noValueProps.map(async (noValueProp) => {
            const noValuePropertyResponse = await sparqlPetition.executeQuery(endpoint, queries.getPropertyType([noValueProp]));
            noValuePropertyResponse.results.bindings.map(prop => {
                const propObject = createPropertyObject(
                    emptyProps[prop.p.value],
                    prop.propertyType.value === 'http://www.w3.org/2002/07/owl#ObjectProperty' ? 'http://www.w3.org/2001/XMLSchema#anyURI' : 'http://www.w3.org/2001/XMLSchema#string',
                    vars
                );
                if (propObject.object) pushToPropArray(propObject, objectProperties);
                else pushToPropArray(propObject, dataProperties);
            });
        });
        await Promise.all(noValuePropertyPromises);
    }
    console.log(`Fetched ${varKey} simple objects (OP:${objectProperties.length}, DP:${dataProperties.length})`);
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
    const [objectResponse, subjectResponse, dataPropertyResponse] = await Promise.all([
        sparqlPetition.executeQuery(endpoint, queries.getElementForTriplet(varValue.uri_graph, 'object')),
        sparqlPetition.executeQuery(endpoint, queries.getElementForTriplet(varValue.uri_graph, 'subject')),
        sparqlPetition.executeQuery(endpoint, queries.getPropertiesForGraph(varValue.uri_graph))
    ]);
    // Handle object properties
    const [foundObject, foundSubject] = await Promise.all([
        findProperty(vars, endpoint, objectResponse, 'object', varValue),
        findProperty(vars, endpoint, subjectResponse, 'subject', varValue)
    ]);
    if (foundObject) objectProperties.push(createTripletProperty('object', foundObject));
    if (foundSubject) objectProperties.push(createTripletProperty('subject', foundSubject));
    // Handle data properties
    const dataPropertyPromises = dataPropertyResponse.results.bindings.map(async (prop) => {
        if (prop.p.value === '<http://www.w3.org/1999/02/22-rdf-syntax-ns#subject>'
            || prop.p.value === '<http://www.w3.org/1999/02/22-rdf-syntax-ns#object>') return;

        const labelResponse = await sparqlPetition.executeQuery(endpoint, queries.getLabel(prop.p.value));

        // Helper property object
        const propertyData = {
            p: prop.p.value,
            label: labelResponse.results.bindings[0]?.label?.value || '',
            type: [prop.type?.value || '']
        };
        const propObject = createPropertyObject(propertyData, prop.type?.value, vars);
        if (!propObject.object) pushToPropArray(propObject, dataProperties);
        else pushToPropArray(propObject, objectProperties);
    });
    await Promise.all(dataPropertyPromises);
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
    const individualQueries = Object.keys(vars).map(key =>
        vars[key].useGraphOnly
            ? queries.getNodesByGraph(vars[key].uri_graph, key, limit)
            : queries.getNodesByType(vars[key].uri_element, key, limit)
    );
    const allNodesResponses = await Promise.all(
        individualQueries.map(query => sparqlPetition.executeQuery(endpoint, query))
    );
    const allNodes = allNodesResponses.reduce((acc, response) => acc.concat(response.results.bindings), []);

    const labelResponsePromises = allNodes.map(entry =>
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
    console.log('in filter')
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

        const varType = nodeEntry.varType;
        const existingNodesArray = nodesObj[varType];

        const remainingForThisVarType = limitPerVarType - existingNodesArray.length;
        const label = nodeEntry?.label;

        if (remainingForThisVarType <= 0 && remaining <= 0) continue;
        existingNodesArray.push({
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
