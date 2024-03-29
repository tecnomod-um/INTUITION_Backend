const queries = require('./queries.js');
const sparqlPetition = require('./sparqlService.js');
const stringUtils = require('../utils/stringUtils.js');
const logger = require('../utils/logger.js');

const getVarsFromSPARQL = async (endpoint) => {
    try {
        const graphURIs = await fetchGraphURIs(endpoint);
        const vars = await fetchLabelsForGraphs(endpoint, graphURIs);
        return vars;
    } catch (error) {
        logger.error(`Error retrieving vars from SPARQL: ${error.message}`);
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

    const promises = Promise.all([...Object.entries(simple), ...Object.entries(triplet)].map(async ([varKey, varValue]) => {
        objectProperties[varKey] = [];
        dataProperties[varKey] = [];
        return fetchProperties(varKey, varValue, vars, endpoint, objectProperties[varKey], dataProperties[varKey]);
    }));

    await promises;
    return { objectProperties, dataProperties };
}

const separateVars = (vars) => {
    return Object.entries(vars).reduce((result, [key, value]) => {
        result[value.uri_element === 'Triplet' ? 'triplet' : 'simple'][key] = value;
        return result;
    }, { triplet: {}, simple: {} });
}

const fetchProperties = async (varKey, varValue, vars, endpoint, objectProperties, dataProperties) => {
    const propertyQueries = varValue.useGraphOnly ?
        {
            general: queries.getPropertiesForGraph(varValue.uri_graph),
            instance: queries.getInstancePropertiesForGraph(varValue.uri_graph),
            subclass: (uri, fromInstance) => queries.getPropertySubClassForGraph(varValue.uri_graph, uri, fromInstance),
            empty: uri => queries.getEmptyPropertiesForGraph(varValue.uri_graph, uri)
        } : {
            general: queries.getPropertiesForType(varValue.uri_element),
            instance: queries.getInstancePropertiesForType(varValue.uri_element),
            subclass: (uri, fromInstance) => queries.getPropertySubClassForType(varValue.uri_element, uri, fromInstance),
            empty: uri => queries.getEmptyPropertiesForType(varValue.uri_element, uri)
        };

    if (varValue.uri_element === 'Triplet') {
        propertyQueries.general = queries.getPropertiesFromStructuredTriplets(varValue.uri_graph);
        propertyQueries.instance = queries.getPropertiesFromInstancedTriplets(varValue.uri_graph);
    }

    const processResponse = (response, fromInstance) => response.results.bindings.map(prop => ({ ...prop, fromInstance: fromInstance }));

    const [propertyGeneralResponse, propertyInstanceResponse] = await Promise.all([
        sparqlPetition.executeQuery(endpoint, propertyQueries.general),
        sparqlPetition.executeQuery(endpoint, propertyQueries.instance)
    ]);

    const bindings = [
        ...processResponse(propertyGeneralResponse, false),
        ...processResponse(propertyInstanceResponse, true)
    ];
    await processProperties(bindings, varValue, vars, endpoint, objectProperties, dataProperties, propertyQueries.subclass);
    const typeOfProp = varValue.uri_element === 'Triplet' ? 'triplet' : 'basic';
    logger.info(`Fetched ${varKey} ${typeOfProp} props (OP: ${objectProperties.length}, DP: ${dataProperties.length})`);
}

// Fetches each property targets and typing
const processProperties = async (bindings, varValue, vars, endpoint, objectProperties, dataProperties, subclassQuery) => {
    const emptyProps = {};
    const noValueProps = [];
    const objectUri = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#object';
    const subjectUri = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#subject';

    const propertyPromises = bindings.map(async (prop) => {
        if (prop.p.value === objectUri || prop.p.value === subjectUri) {
            // Special handling for triplet properties that are either object or subject
            const type = prop.p.value === objectUri ? 'object' : 'subject';
            const responseForProperty = await sparqlPetition.executeQuery(endpoint, queries.getElementForTriplet(varValue.uri_graph, type));
            const foundProperty = await findProperty(vars, endpoint, responseForProperty, type, varValue);
            if (foundProperty) {
                const tripletPropertyObject = createTripletProperty(type, foundProperty);
                pushToPropArray(tripletPropertyObject, objectProperties);
            }
        } else {
            const [subClassResponse, labelResponse] = await Promise.all([
                sparqlPetition.executeQuery(endpoint, subclassQuery(prop.p.value, prop.fromInstance)),
                sparqlPetition.executeQuery(endpoint, queries.getLabel(prop.p.value))
            ]);

            // Helper property object
            const propertyData = {
                p: prop.p.value,
                label: labelResponse.results.bindings[0]?.label?.value || '',
                type: subClassResponse.results.bindings.map(entry => entry.type?.value || ''),
                fromInstance: prop.fromInstance
            };
            if (!propertyData.type[0]) {
                emptyProps[propertyData.p] = propertyData;
                return;
            }
            propertyData.type.forEach(type => {
                const propObject = createPropertyObject(propertyData, type, vars, propertyData.fromInstance);
                if (propObject.object) pushToPropArray(propObject, objectProperties);
                else pushToPropArray(propObject, dataProperties);
            });
        }
    });

    await Promise.all(propertyPromises);

    // If no class was recognized, additional info from the object is tried to fetch
    await processEmptyProperties(noValueProps, emptyProps, varValue, vars, endpoint, objectProperties, dataProperties);
    await processNoValueProperties(noValueProps, emptyProps, vars, endpoint, objectProperties, dataProperties);
}

// Process empty properties
const processEmptyProperties = async (noValueProps, emptyProps, varValue, vars, endpoint, objectProperties, dataProperties) => {
    if (Object.keys(emptyProps).length === 0) return;

    const allVarURIs = Object.values(vars).map(v => v.uri_element);
    const emptyPropertyPromises = Object.keys(emptyProps).map(async (uri) => {

        const queryObjectEmpty = varValue.useGraphOnly
            ? queries.getEmptyPropertiesForGraph(varValue.uri_graph, uri)
            : queries.getEmptyPropertiesForType(varValue.uri_element, uri);
        const emptyPropertyResponse = await sparqlPetition.executeQuery(endpoint, queryObjectEmpty);

        emptyPropertyResponse.results.bindings.forEach(prop => {
            if (!prop.basicType?.value && !(prop.o?.value && allVarURIs.includes(prop.o.value))) {
                // If no basicType is found and the value isn't a recognized URI, mark as having no value
                noValueProps.push(prop.p.value);
                return;
            }
            const target = prop.basicType?.value || prop.o.value;
            const propObject = createPropertyObject(emptyProps[uri], target, vars, emptyProps[uri].fromInstance);
            if (propObject.object)
                pushToPropArray(propObject, objectProperties);
            else
                pushToPropArray(propObject, dataProperties);

        });
        // If nothing was found mark it as no value
        if (!emptyPropertyResponse.results.bindings.some(prop => prop.p.value === uri))
            noValueProps.push(uri);
    });
    await Promise.all(emptyPropertyPromises);
}

// Process properties targeting objects with no structure or similar
const processNoValueProperties = async (noValueProps, emptyProps, vars, endpoint, objectProperties, dataProperties) => {
    if (noValueProps.length === 0) return;
    const noValuePropertyPromises = noValueProps.map(async (noValueProp) => {

        const noValuePropertyResponse = await sparqlPetition.executeQuery(endpoint, queries.getPropertyType([noValueProp]));
        noValuePropertyResponse.results.bindings.forEach(prop => {
            const propType = prop.propertyType.value;
            const propObject = createPropertyObject(
                emptyProps[prop.p.value],
                propType === 'http://www.w3.org/2002/07/owl#ObjectProperty' ? 'http://www.w3.org/2001/XMLSchema#anyURI' : 'http://www.w3.org/2001/XMLSchema#string',
                vars,
                emptyProps[prop.p.value].fromInstance
            );
            if (propObject.object)
                pushToPropArray(propObject, objectProperties);
            else
                pushToPropArray(propObject, dataProperties);
        });
    });

    await Promise.all(noValuePropertyPromises);
}

const findProperty = async (vars, endpoint, response, type, varValue) => {
    let property = response.results.bindings[0]?.[type]?.value;
    const target = property ? 'uri_element' : 'uri_graph';
    // If the correct object class was found in vars, return true
    const foundElement = Object.keys(vars).find(key => target === 'uri_element' && property === vars[key][target]);
    if (foundElement) return foundElement;
    let missingElementQuery;
    // If another was discovered, check it's class structure
    if (property)
        missingElementQuery = queries.getParentElementForTriplet(response.results.bindings[0]?.[type].value);
    // If no object was fetched, assume graph defined object is it's target and fetch it
    else
        missingElementQuery = queries.getMissingElementForTriplet(varValue.uri_graph, type);
    const missingResponse = await sparqlPetition.executeQuery(endpoint, missingElementQuery);
    property = property ? missingResponse.results.bindings[0].subClass.value : missingResponse.results.bindings[0].graph.value;
    return Object.keys(vars).find(key => property === vars[key][target]);
}

const createTripletProperty = (label, key) => ({
    property: `http://www.w3.org/1999/02/22-rdf-syntax-ns#${label}`,
    label: label,
    object: key,
    fromInstance: false
})

const createPropertyObject = (propertyData, type, vars, fromInstance) => {
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
        object: propValue,
        fromInstance: fromInstance
    } : {
        property: propertyData.p,
        label: propLabel,
        type: type || 'http://www.w3.org/2001/XMLSchema#string',
        fromInstance: fromInstance
    };
    return result;
}

// Push property to array if not already present
const pushToPropArray = (propObject, propArray) => {
    if (!propArray.find(obj => obj.property === propObject.property && obj.label === propObject.label && obj.object === propObject.object)) {
        propArray.push(propObject);
    }
}

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
    logger.info('Fetched initial nodes');
    return buildNodes(vars, nodeList, totalLimit);
}

const getFilteredNodes = async (vars, endpoint, limit, filter, totalLimit) => {
    const sanitizedFilter = stringUtils.sanitizeInput(filter);
    const filterQueryList = Object.keys(vars).map(key => ({
        query: vars[key].useGraphOnly
            ? queries.getFilteredByGraph(vars[key].uri_graph, key, limit, sanitizedFilter)
            : queries.getFilteredByType(vars[key].uri_element, key, limit, sanitizedFilter),
        varKey: key
    }));

    const allNodesResponses = await Promise.all(
        filterQueryList.map(async ({ query, varKey }) => {
            // Mock tfac2gene
            if (varKey === 'tfac2gene') {
                logger.info(`Mock response for ${varKey}`);
                return {
                    head: { link: [], vars: ['node', 'varType'] },
                    results: { distinct: false, ordered: true, bindings: [] }
                };
            }
            const startTime = new Date().getTime();
            const result = await sparqlPetition.executeQuery(endpoint, query);
            const endTime = new Date().getTime();
            logger.info(`Query for ${varKey} completed in ${(endTime - startTime) / 1000} seconds`);
            return result;
        })
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

    logger.info('Fetched filtered nodes');
    return buildNodes(vars, nodeList, totalLimit);
};

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
