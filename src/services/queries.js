const getAllGraphs = () => {
    return (`
    SELECT DISTINCT ?graph WHERE {
        GRAPH ?graph {?s ?p ?o}
    } ORDER BY ?graph
    `);
}

const getLabel = (element) => {
    return (`
    SELECT DISTINCT ?label WHERE {
        OPTIONAL { <${element}> <http://www.w3.org/2000/01/rdf-schema#label> ?rdfsLabel } .
        OPTIONAL { <${element}> <http://www.w3.org/2004/02/skos/core#prefLabel> ?prefLabel } .
        OPTIONAL { <${element}> <http://www.w3.org/2004/02/skos/core#altLabel> ?altLabel } .
        BIND(COALESCE(?rdfsLabel, ?prefLabel, ?altLabel) AS ?label)
    }
    `);
}

const getLabelsBatch = (uris) => {
    const values = uris.map(uri => `<${uri}>`).join(' ');
    return (`
      SELECT ?uri ?label WHERE {
        VALUES ?uri { ${values} }
        OPTIONAL { ?uri <http://www.w3.org/2000/01/rdf-schema#label> ?rdfsLabel } .
        OPTIONAL { ?uri <http://www.w3.org/2004/02/skos/core#prefLabel> ?prefLabel } .
        OPTIONAL { ?uri <http://www.w3.org/2004/02/skos/core#altLabel> ?altLabel } .
        BIND(COALESCE(?rdfsLabel, ?prefLabel, ?altLabel) AS ?label)
      }
    `);
}

const getVarsFromGraph = (graph) => {
    return (`
    SELECT DISTINCT ?VarType WHERE {
        GRAPH <${graph}> {
            ?AnyURI ?Property ?VarType .
    
            VALUES ?Property {
                <http://www.w3.org/2002/07/owl#someValuesFrom> 
                <http://www.w3.org/2000/01/rdf-schema#subClassOf>
            }
        
            FILTER NOT EXISTS {
                ?VarType <http://www.w3.org/2002/07/owl#someValuesFrom> ?VarParentValues .
                FILTER(?VarParentValues != ?VarType)
            }
            FILTER NOT EXISTS {
                ?VarType <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?VarParentClass .
                FILTER(?VarParentClass != ?VarType)
            }
        }
    }
    `);
}

const getPropertiesForType = (type) => {
    return (`
    SELECT DISTINCT ?p WHERE {
        ?s ?Property <${type}> .
        ?s ?p ?o .

        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
    }
    `);
}

const getPropertiesForGraph = (graph) => {
    return (`
    SELECT DISTINCT ?p WHERE {
        GRAPH <${graph}> {
                ?s ?p ?o .
        }
    }
    `);
}

const getInstancePropertiesForType = (type) => {
    return (`
    SELECT DISTINCT ?p WHERE {
        ?s ?Property <${type}> .
        ?typeInstance <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?s .
        ?typeInstance ?p ?o .

        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom>
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
    }
    `);
}

const getInstancePropertiesForGraph = (graph) => {
    return (`
    SELECT DISTINCT ?p WHERE {
        GRAPH <${graph}> {
            ?graphInstance <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?class .
            ?graphInstance ?p ?o
        }
    }
    `);
}

const getQuerySubject = (useGraphOnly, fromInstance, property) => {
    if (useGraphOnly) {
        if (fromInstance) {
            return `?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?class .\n?class <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Statement> .`;
        } else {
            return `?s <${property}> ?o .`;
        }
    } else {
        if (fromInstance) {
            return `?typeInstance <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?s .\n?typeInstance <${property}> ?o .`;
        } else {
            return `?s <${property}> ?o .`;
        }
    }
}

const getPropertySubClassForType = (type, property, fromInstance) => {
    const subject = getQuerySubject(false, fromInstance, property);
    return (`
    SELECT DISTINCT ?p ?type WHERE {
        BIND(<${property}> AS ?p)
        ?s ?Property <${type}> .
        ${subject}
        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom>
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
        OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
    }
    `);
}

const getPropertySubClassForGraph = (graph, property, fromInstance) => {
    const subject = getQuerySubject(true, fromInstance, property);
    return (`
    SELECT DISTINCT ?p ?type WHERE {
        GRAPH <${graph}> {
            BIND(<${property}> AS ?p)
            ${subject}
            OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
        }
    }
    `);
}

const getEmptyPropertiesForType = (type, emptyProperty, fromInstance) => {
    const subject = getQuerySubject(false, fromInstance, emptyProperty);
    return (`
    SELECT DISTINCT ?p (IF(lang(?o) != "", "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString", IF(isLiteral(?o), datatype(?o), "")) AS ?basicType) ?o  WHERE {
        BIND(<${emptyProperty}> AS ?p)
        ?s ?Property <${type}> .
        ${subject}

        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
    } LIMIT 1
    `);
}

const getEmptyPropertiesForGraph = (graph, emptyProperty, fromInstance) => {
    const subject = getQuerySubject(true, fromInstance, emptyProperty);
    return (`
    SELECT DISTINCT ?p (IF(lang(?o) != "", "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString", IF(isLiteral(?o), datatype(?o), "")) AS ?basicType) ?o WHERE {
        GRAPH <${graph}> {
            BIND(<${emptyProperty}> AS ?p)
            ${subject}
        }
    } LIMIT 1
    `);
}

const getPropertyType = (noValueProperties) => {
    const noValuePropertiesString = noValueProperties.map(uri => `<${uri}>`).join(' ');
    return (`
    SELECT DISTINCT ?p ?propertyType WHERE {
        
        ?p ?propertyClass ?propertyType.
        VALUES ?propertyClass {
            <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
            <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
        }
        VALUES ?p { ${noValuePropertiesString} }
    }
    `);
}

const getElementForTriplet = (graph, type) => {
    return (`
    SELECT (COUNT(?${type}) as ?count) ?${type} WHERE {
    GRAPH <${graph}>  {
        ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#${type}> ?x
    }
    ?x <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?${type} .
    }
    GROUP BY ?${type}
    ORDER BY DESC(?count)
    LIMIT 1
    `);
}

const getMissingElementForTriplet = (graph, property) => {
    return `
    SELECT ?graph (COUNT(?x) as ?subjectCount) WHERE {
        GRAPH <${graph}> {
            ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#${property}> ?x .
        }
        GRAPH ?graph {
            ?x ?p ?o .
        }
    }
    GROUP BY ?graph
    ORDER BY DESC(?subjectCount)
    LIMIT 1
    `;
}

const getDataPropertiesForTriplet = (graph) => {
    return (`
    SELECT DISTINCT ?p ?type WHERE {
        GRAPH <${graph}> {
            ?s ?p ?o .
            BIND(datatype(?o) AS ?type)
        }
    }
    `);
}

const getNodesByType = (type, varKey, limit) => {
    const queryLimit = limit ? ` LIMIT ${limit}` : "";
    return (`
    SELECT DISTINCT ?node ?varType WHERE {
        ?node ?property <${type}> .
        
        VALUES ?property {
                    <http://www.w3.org/2002/07/owl#someValuesFrom> 
                    <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
        
        BIND("${varKey}" AS ?varType)
    }${queryLimit}
    `);
}

const getNodesByGraph = (graph, varKey, limit) => {
    const queryLimit = limit ? ` LIMIT ${limit}` : "";
    return (`
    SELECT DISTINCT ?node ?varType WHERE {
        GRAPH <${graph}> {
                ?node ?property ?o .
                BIND("${varKey}" AS ?varType)
                FILTER NOT EXISTS {
                    ?o <http://www.w3.org/2002/07/owl#someValuesFrom> ?parent1 .
                    ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?parent2 .
                    ?o <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?parent3 .
                    FILTER(?o != ?parent1 && ?o != ?parent2 && ?o != ?parent3)
                }
        }
    }${queryLimit}
    `);
}

const getFilteredByType = (type, varKey, limit, filter) => {
    const queryLimit = limit ? ` LIMIT ${limit}` : "";
    return (`
    SELECT DISTINCT ?node ( "${varKey}" AS ?varType ) WHERE {
        ?node ?property <${type}> .
        VALUES ?property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
        FILTER( REGEX(?node, "${filter}") || REGEX(?varType, "${filter}")) .
    }${queryLimit}
    `);
}

const getFilteredByGraph = (graph, varKey, limit, filter) => {
    const queryLimit = limit ? ` LIMIT ${limit}` : "";
    return (`
    SELECT DISTINCT ?node ( "${varKey}" AS ?varType ) WHERE {
        GRAPH <${graph}> {
            ?node ?property ?o .
            OPTIONAL {
                ?o <http://www.w3.org/2002/07/owl#someValuesFrom> ?parent1 .
                ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?parent2 .
                ?o <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?parent3 .
            }
            FILTER(
                (!BOUND(?parent1) || ?o = ?parent1) &&
                (!BOUND(?parent2) || ?o = ?parent2) &&
                (!BOUND(?parent3) || ?o = ?parent3) &&
                (REGEX(?node, "${filter}") || REGEX(?varType, "${filter}"))
            )
        }
    }${queryLimit}
    `);
}

module.exports = {
    getAllGraphs,
    getLabel,
    getLabelsBatch,
    getVarsFromGraph,
    getPropertiesForType,
    getPropertiesForGraph,
    getInstancePropertiesForType,
    getInstancePropertiesForGraph,
    getPropertySubClassForType,
    getPropertySubClassForGraph,
    getElementForTriplet,
    getMissingElementForTriplet,
    getDataPropertiesForTriplet,
    getNodesByType,
    getNodesByGraph,
    getFilteredByType,
    getFilteredByGraph,
    getEmptyPropertiesForType,
    getEmptyPropertiesForGraph,
    getPropertyType,
}
