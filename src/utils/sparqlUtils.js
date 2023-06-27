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
        // Fetch all graph URIs
        const graphResponse = await executeSPARQLQuery(endpoint, queries.getAllGraphs());
        let graphURIs = graphResponse.results.bindings.map((binding) => binding.graph.value);
        graphURIs = graphURIs.filter(uri =>
            uri.startsWith("http") &&
            !uri.includes("localhost") &&
            !uri.includes("schemas") &&
            !(uri.includes("www.w3.org") && uri !== "http://www.w3.org/2002/07/owl#Thing")
        );
        // Fetch labels for each graph
        const vars = {};
        const labelPromises = graphURIs.map(async (uri_graph) => {
            const labelResponse = await executeSPARQLQuery(endpoint, queries.getLabelForGraph(`<${uri_graph}>`));
            const key = uri_graph.substring(uri_graph.lastIndexOf('/') + 1);

            // Treat elements without class hierarchy
            if (labelResponse.results.bindings.some(binding => binding.VarType?.value === "http://www.w3.org/2002/07/owl#Thing")) {
                let label = key;
                let useGraphOnly = true;
                let uri_element = '';
                vars[key.toLowerCase().replace(/\s+/g, '_')] = {
                    label,
                    useGraphOnly,
                    uri_element,
                    uri_graph,
                };
            }

            else labelResponse.results.bindings.forEach(binding => {
                let label = binding.VarTypeLabel?.value || '';
                let useGraphOnly = false;
                let uri_element = binding.VarType?.value || '';

                // Element is another element's defined triplet
                if ((label === 'Triple') || uri_element.includes('http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement')) {
                    label = key.charAt(0).toUpperCase() + key.slice(1);
                    useGraphOnly = true;
                }

                if (uri_element.includes("localhost") || uri_element.includes("schemas") || uri_element.includes("www.w3.org"))
                    uri_element = label;
                if (label)
                    vars[label.toLowerCase().replace(/\s+/g, '_')] = {
                        label,
                        useGraphOnly,
                        uri_element,
                        uri_graph,
                    };
            });
        });

        // Wait for all promises to resolve
        await Promise.all(labelPromises);
        return vars;
    } catch (error) {
        console.error('Error retrieving vars from SPARQL:', error);
        throw error;
    }
}

const getPropertiesFromSPARQL = async (vars, endpoint) => {
    const objectProperties = {};
    const dataProperties = {};

    // Separate vars between simple and element pair notation 
    const { simple, elementPair } = Object.entries(vars).reduce(
        (result, [key, value]) => {
            if ((!value.name && !value.label) || value.name !== value.label) {
                result.simple[key] = value;
            } else {
                result.elementPair[key] = value;
            }
            return result;
        },
        { simple: {}, elementPair: {} }
    );

    console.log('Simple:', simple);
    console.log('Pair:', elementPair);


    // Simple elements properties
    for (const varKey of Object.keys(simple)) {
        try {
            console.log(`Examining ${varKey} properties`);
            objectProperties[varKey] = [];
            dataProperties[varKey] = [];
            // Get properties for the current graph
            const propertyResponse = await executeSPARQLQuery(endpoint, queries.getPropertiesForType(`<${simple[varKey].label}>`));
            const properties = propertyResponse.results.bindings;
            for (const prop of properties) {
                const objectURI = prop.type?.value;
                // Check if this object is present in vars
                const foundVar = Object.values(vars).find(v => objectURI === v.label);
                if (foundVar) {
                    var objectToPush = {
                        property: prop.p.value,
                        label: prop.name.value,
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
                        label: prop.name.value,
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
            console.log(`Properties for ${varKey} fetched`);
        } catch (error) {
            console.error(`Error retrieving properties for ${varKey} from SPARQL:`, error);
            throw error;
        }
    }

    // Element Pair elements properties
    for (const varKey of Object.keys(elementPair)) {
        try {
            objectProperties[varKey] = [];
            const objectPropertyResponse = await executeSPARQLQuery(endpoint, queries.getPropertiesForPair(`<${elementPair[varKey].uri_graph}>`));
            let objectAndSubjectProperties = objectPropertyResponse.results.bindings;
            // These elements can only have object and subject properties
            // TODO gen2phen isn't considered. OMIM is empty but it needs to be identified somehow?
            const objectURI = objectAndSubjectProperties[0]?.object?.value;
            const foundObject = Object.values(vars).find(v => objectURI === v.label);
            if (foundObject) {
                var objectToPush = {
                    property: "http://www.w3.org/1999/02/22-rdf-syntax-ns#object",
                    label: "object",
                    object: foundObject.uri_graph.substring(foundObject.uri_graph.lastIndexOf('/') + 1)
                };
                objectProperties[varKey].push(objectToPush);
            }

            const subjectURI = objectAndSubjectProperties[0]?.subject?.value;
            const foundSubject = Object.values(vars).find(v => subjectURI === v.label);
            if (foundSubject) {
                var subjectToPush = {
                    property: "http://www.w3.org/1999/02/22-rdf-syntax-ns#object",
                    label: "subject",
                    object: foundSubject.uri_graph.substring(foundSubject.uri_graph.lastIndexOf('/') + 1)
                };
                objectProperties[varKey].push(subjectToPush);
            }
            // Data properties
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
