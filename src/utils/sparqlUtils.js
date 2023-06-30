const axios = require('axios');
const queries = require('./queries.js');

// Used both in backend queries and received node queries
const executeSPARQLQuery = async (endpoint, query) => {
    const options = {
        method: 'POST',
        url: endpoint,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        data: {
            query,
        },
    };
    const response = await axios.request(options);
    return response.data;
};

const getVarsFromSPARQL = async (endpoint) => {
    try {
        const graphURIs = await fetchGraphURIs(endpoint);
        const vars = await fetchLabelsForGraphs(endpoint, graphURIs);
        console.log(vars);
        return vars;
    } catch (error) {
        console.error('Error retrieving vars from SPARQL:', error);
        throw error;
    }
}

const fetchGraphURIs = async (endpoint) => {
    const graphResponse = await executeSPARQLQuery(endpoint, queries.getAllGraphs());
    return graphResponse.results.bindings
        .map((binding) => binding.graph.value)
        .filter(uri => isValidUri(uri));
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
        const labelResponse = await executeSPARQLQuery(endpoint, queries.getLabelForGraph(`<${uri}>`));
        const key = uri.substring(uri.lastIndexOf('/') + 1);

        if (isElementWithoutClassHierarchy(labelResponse)) {
            createVarWithoutClassHierarchy(key, uri, vars);
        } else {
            createOrUpdateVars(labelResponse, key, uri, vars);
        }
    }));
    return vars;
}

const isElementWithoutClassHierarchy = (labelResponse) => {
    return labelResponse.results.bindings.some(binding => binding.VarType?.value === "http://www.w3.org/2002/07/owl#Thing");
}

const createVarWithoutClassHierarchy = (key, uri, vars) => {
    const label = key;
    let useGraphOnly = true;
    let uri_element = 'http://www.w3.org/2002/07/owl#Thing';
    vars[formatKey(key)] = { label, useGraphOnly, uri_element, uri_graph: uri };
}

const createOrUpdateVars = (labelResponse, key, uri, vars) => {
    labelResponse.results.bindings.forEach(binding => {
        const formattedLabel = formatKey(binding.VarTypeLabel?.value || '');
        let useGraphOnly = false;
        let uri_element = binding.VarType?.value || '';
        let label = binding.VarTypeLabel?.value || '';

        if (isElementPairDefinedTriplet(label, uri_element)) {
            label = key.charAt(0).toUpperCase() + key.slice(1);
            uri_element = 'Triplet';
            useGraphOnly = true;
            vars[formatKey(label)] = { label, useGraphOnly, uri_element, uri_graph: uri };
            return;
        }

        if (formattedLabel && !vars[formattedLabel]) {
            vars[formattedLabel] = { label, useGraphOnly, uri_element, uri_graph: uri };
        } else if (formattedLabel && vars[formattedLabel].uri_element !== uri_element) {
            handleDuplicates(vars, formattedLabel, { label, useGraphOnly, uri_element, uri_graph: uri });
        }
    });
}

const isElementPairDefinedTriplet = (label, uri_element) => {
    return label === 'Triple' || uri_element.includes('http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement');
}

const formatKey = (key) => {
    return key.toLowerCase().replace(/\s+/g, '_');
}

const handleDuplicates = (vars, formattedLabel, newValue) => {
    const oldValue = vars[formattedLabel];
    delete vars[formattedLabel];
    const getDomain = (url) => {
        const hostname = (new URL(url)).hostname;
        const parts = hostname.split('.');
        return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    };

    vars[`${formattedLabel}_${getDomain(oldValue.uri_element)}`] = oldValue;
    vars[`${formattedLabel}_${getDomain(newValue.uri_element)}`] = newValue;
}

const getPropertiesFromSPARQL = async (vars, endpoint) => {
    const objectProperties = {};
    const dataProperties = {};

    // Separate vars between triplets and simple elements 
    const { triplet, simple } = Object.entries(vars).reduce(
        (result, [key, value]) => {
            if (value.uri_element === 'Triplet') {
                result.triplet[key] = value;
            } else {
                result.simple[key] = value;
            }
            return result;
        },
        { triplet: {}, simple: {} }
    );

    // Simple elements properties
    for (const varKey of Object.keys(simple)) {
        console.log(`Fetching ${varKey} simple props`);
        try {
            objectProperties[varKey] = [];
            dataProperties[varKey] = [];
            let propertyResponse;
            if (simple[varKey].useGraphOnly)
                propertyResponse = await executeSPARQLQuery(endpoint, queries.getPropertiesForGraph(`<${simple[varKey].uri_graph}>`));
            else
                propertyResponse = await executeSPARQLQuery(endpoint, queries.getPropertiesForType(`<${simple[varKey].uri_element}>`));

            const properties = propertyResponse.results.bindings;
            for (const prop of properties) {
                const objectURI = prop.type?.value;
                // Check if this object is present in vars
                const foundVar = Object.values(vars).find(v => objectURI === v.uri_element);
                if (foundVar) {
                    var objectToPush = {
                        property: prop.p.value,
                        label: prop.name?.value || prop.p.value,
                        object: foundVar.uri_graph.substring(foundVar.uri_graph.lastIndexOf('/') + 1)
                    };

                    var existingObject = objectProperties[varKey].find((obj) =>
                        obj.property === objectToPush.property &&
                        obj.label === objectToPush.label &&
                        obj.object === objectToPush.object
                    );

                    if (!existingObject) {
                        objectProperties[varKey].push(objectToPush);
                    }
                } else if (prop.o) {
                    var objectToPush = {
                        property: prop.p.value,
                        label: prop.name?.value || prop.p.value,
                        object: prop.o.type
                    };
                    var existingObject = dataProperties[varKey].find((obj) =>
                        obj.property === objectToPush.property &&
                        obj.label === objectToPush.label &&
                        obj.object === objectToPush.object
                    );

                    if (!existingObject) {
                        dataProperties[varKey].push(objectToPush);
                    }
                }
            }
        } catch (error) {
            console.error(`Error retrieving properties for ${varKey} from SPARQL:`, error);
            throw error;
        }
    }
    // Triplet properties
    for (const varKey of Object.keys(triplet)) {
        console.log(`Fetching ${varKey} triplet props`);
        try {
            objectProperties[varKey] = [];
            dataProperties[varKey] = [];
            // Object properties = object + subject
            let objectResponse = await executeSPARQLQuery(endpoint, queries.getObjectForTriplet(`<${triplet[varKey].uri_graph}>`));
            let subjectResponse = await executeSPARQLQuery(endpoint, queries.getSubjectForTriplet(`<${triplet[varKey].uri_graph}>`));
            const dataPropertyResponse = await executeSPARQLQuery(endpoint, queries.getDataPropertiesForTriplet(`<${triplet[varKey].uri_graph}>`));
            let objectProperty = objectResponse.results.bindings[0]?.object?.value;
            let subjectProperty = subjectResponse.results.bindings[0]?.subject?.value;
            let dataProperty = dataPropertyResponse.results.bindings;
            let foundObject;
            let foundSubject;
            // Deal with empty values since we know both object and subject should be defined
            if (!objectProperty) {
                objectResponse = await executeSPARQLQuery(endpoint, queries.getMissingElementForTriplet(`<${triplet[varKey].uri_graph}>`, `object`));
                objectProperty = objectResponse.results.bindings[0].graph.value;
                foundObject = Object.values(vars).find(v => objectProperty === v.uri_graph);
            } else {
                foundObject = Object.values(vars).find(v => objectProperty === v.uri_element);
            }
            if (!subjectProperty) {
                subjectResponse = await executeSPARQLQuery(endpoint, queries.getMissingElement = (`<${triplet[varKey].uri_graph}>`, 'subject'));
                subjectProperty = objectResponse.results.bindings[0].graph.value;
                foundSubject = Object.values(vars).find(v => subjectProperty === v.uri_graph);
            } else {
                foundSubject = Object.values(vars).find(v => subjectProperty === v.uri_element);
            }

            if (foundObject) {
                var objectToPush = {
                    property: "http://www.w3.org/1999/02/22-rdf-syntax-ns#object",
                    label: "object",
                    object: foundObject.uri_graph.substring(foundObject.uri_graph.lastIndexOf('/') + 1)
                };
                objectProperties[varKey].push(objectToPush);
            }

            if (foundSubject) {
                var subjectToPush = {
                    property: "http://www.w3.org/1999/02/22-rdf-syntax-ns#object",
                    label: "subject",
                    object: foundSubject.uri_graph.substring(foundSubject.uri_graph.lastIndexOf('/') + 1)
                };
                objectProperties[varKey].push(subjectToPush);
            }
            // Data properties
            for (const prop of dataProperty) {
                if (prop.o) {
                    var objectToPush = {
                        property: prop.p.value,
                        label: prop.name?.value || prop.p.value,
                        object: prop.o.type
                    };
                    var existingObject = dataProperties[varKey].find((obj) =>
                        obj.property === objectToPush.property &&
                        obj.label === objectToPush.label &&
                        obj.object === objectToPush.object
                    );
                    if (!existingObject) {
                        dataProperties[varKey].push(objectToPush);
                    }
                }
            }
        } catch (error) {
            console.error(`Error retrieving properties for ${varKey} from SPARQL:`, error);
            throw error;
        }
    }
    console.log("Object properties:")
    console.log(objectProperties)
    console.log("Data properties:")
    console.log(dataProperties)
    return {
        objectProperties: objectProperties,
        dataProperties: dataProperties,
    }
}

const getNodesFromSPARQL = async () => { }
module.exports = {
    getVarsFromSPARQL,
    getPropertiesFromSPARQL,
    getNodesFromSPARQL,
    executeSPARQLQuery,
};
