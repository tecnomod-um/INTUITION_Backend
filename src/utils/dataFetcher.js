const queries = require('./queries.js');
const stringUtils = require('./stringUtils.js');
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

const getPropertiesFromSPARQL = async (vars, endpoint) => {
    const objectProperties = {};
    const dataProperties = {};

    // Separate vars between triplets and simple elements 
    const { triplet, simple } = Object.entries(vars).reduce(
        (result, [key, value]) => {
            result[value.uri_element === 'Triplet' ? 'triplet' : 'simple'][key] = value;
            return result;
        },
        { triplet: {}, simple: {} }
    );

    // Process simple elements properties
    await Promise.all(Object.entries(simple).map(async ([varKey, varValue]) => {
        try {
            const { objectProps, dataProps } = await fetchSimpleProperties(vars, endpoint, varKey, varValue);
            objectProperties[varKey] = objectProps;
            dataProperties[varKey] = dataProps;
        } catch (error) {
            console.error(`Error retrieving properties for ${varKey} from SPARQL:`, error);
        }
    }));

    // Process triplet properties
    await Promise.all(Object.entries(triplet).map(async ([varKey, varValue]) => {
        try {
            const { objectProps, dataProps } = await fetchTripletProperties(vars, endpoint, varKey, varValue);
            objectProperties[varKey] = objectProps;
            dataProperties[varKey] = dataProps;
        } catch (error) {
            console.error(`Error retrieving properties for ${varKey} from SPARQL:`, error);
        }
    }));

    return {
        objectProperties: objectProperties,
        dataProperties: dataProperties,
    }
}

// Fetch non-triplet properties
const fetchSimpleProperties = async (vars, endpoint, varKey, varValue) => {
    const objectProps = [];
    const dataProps = [];
    const query = varValue.useGraphOnly ?
        queries.getPropertiesForGraph(`<${varValue.uri_graph}>`) :
        queries.getPropertiesForType(`<${varValue.uri_element}>`);

    const propertyResponse = await sparqlPetition.executeQuery(endpoint, query);

    propertyResponse.results.bindings.forEach(prop => {
        const propObject = createPropertyObject(prop, vars);

        if (propObject.object) {
            pushToPropArray(propObject, objectProps);
        } else if (prop.o) {
            pushToPropArray(propObject, dataProps);
        }
    });

    return { objectProps, dataProps };
}

const createPropertyObject = (prop, vars) => {
    const objectURI = prop.type?.value;
    const foundVarKey = Object.keys(vars).find(key => objectURI === vars[key].uri_element);

    return foundVarKey ? {
        property: prop.p.value,
        label: prop.name?.value || prop.p.value.substring(prop.p.value.lastIndexOf('/') + 1),
        object: foundVarKey
    } : { property: prop.p.value, label: prop.name?.value || prop.p.value.substring(prop.p.value.lastIndexOf('/') + 1), type: prop.o?.type };
}

// Push property to array if not already present
const pushToPropArray = (propObject, propArray) => {
    if (!propArray.find(obj => obj.property === propObject.property && obj.label === propObject.label && obj.object === propObject.object)) {
        propArray.push(propObject);
    }
}

const fetchTripletProperties = async (vars, endpoint, varKey, varValue) => {
    const objectProps = [];
    const dataProps = [];

    const [objectResponse, subjectResponse, dataPropertyResponse] = await Promise.all([
        sparqlPetition.executeQuery(endpoint, queries.getObjectForTriplet(`<${varValue.uri_graph}>`)),
        sparqlPetition.executeQuery(endpoint, queries.getSubjectForTriplet(`<${varValue.uri_graph}>`)),
        sparqlPetition.executeQuery(endpoint, queries.getDataPropertiesForTriplet(`<${varValue.uri_graph}>`))
    ]);

    const [foundObject, objectProperty, objectKey] = await findProperty(vars, endpoint, objectResponse, 'object', varValue);
    const [foundSubject, subjectProperty, subjectKey] = await findProperty(vars, endpoint, subjectResponse, 'subject', varValue);
    const dataProperty = dataPropertyResponse.results.bindings;

    if (foundObject) objectProps.push(createTripletProperty('object', objectKey));
    if (foundSubject) objectProps.push(createTripletProperty('subject', subjectKey));

    dataProperty.forEach(prop => {
        if (prop.o) {
            pushToPropArray(createPropertyObject(prop, vars), dataProps);
        }
    });

    return { objectProps, dataProps };
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

    return [vars[foundVarKey], property, foundVarKey];
}

const createTripletProperty = (label, key) => ({
    property: `http://www.w3.org/1999/02/22-rdf-syntax-ns#${label}`,
    label: label,
    object: key
});

module.exports = {
    getVarsFromSPARQL,
    getPropertiesFromSPARQL,
};
