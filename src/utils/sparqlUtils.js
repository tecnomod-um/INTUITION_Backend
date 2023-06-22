const axios = require('axios');
const queries = require('./queries.js');

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
            !uri.includes("www.w3.org")
        );
        // Fetch labels for each graph
        const vars = {};
        // Create an array of promises for each label fetch operation
        const labelPromises = graphURIs.map(async (graphURI) => {
            const labelResponse = await executeSPARQLQuery(endpoint, queries.getLabelForGraph(`<${graphURI}>`));

            const key = graphURI.substring(graphURI.lastIndexOf('/') + 1);
            let name = labelResponse.results.bindings[0]?.VarTypeLabel.value || '';
            if (name == 'Triple')
                name = key.charAt(0).toUpperCase() + key.slice(1);
            let label = labelResponse.results.bindings[0]?.VarType.value || '';
            if (label.includes("localhost") || label.includes("schemas") || label.includes("www.w3.org"))
                label = name;
            vars[key] = {
                name,
                label,
                uri_graph: graphURI,
            };
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
    console.log("Fetching properties");
    for (const varKey of Object.keys(vars)) {
        try {
            console.log(`Fetching properties for ${varKey}`);
            objectProperties[varKey] = [];
            dataProperties[varKey] = [];
            // Get properties for the current graph
            const propertyResponse = await executeSPARQLQuery(endpoint, queries.getPropertiesForType(`<${vars[varKey].label}>`));
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
                } else {
                    console.log("Dont have any " + objectURI);

                    var objectToPush = {
                        property: prop.p.value,
                        label: prop.name.value,
                        object: foundVar.uri_graph.substring(foundVar.uri_graph.lastIndexOf('/') + 1)
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
    console.log("DONE WITH OBJECT")
    console.log(objectProperties)
    console.log("DONE WITH DATA")
    console.log(dataProperties)
    return {
        objectProperties: objectProperties,
        dataProperties: dataProperties,
    }
}


module.exports = {
    getVarsFromSPARQL,
    getPropertiesFromSPARQL,
    executeSPARQLQuery,
};
