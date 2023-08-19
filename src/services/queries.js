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
        ?s ?p ?o .
        ?s ?Property <${type}> .

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

const getPropertySubClassForType = (type, property) => {
    return (`
    SELECT DISTINCT ?p ?type WHERE {
        BIND(<${property}> AS ?p)
        ?s <${property}> ?o .

        ?s ?Property <${type}> .

        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }

        OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
    }
    `);
}

const getPropertySubClassForGraph = (graph, property) => {
    return (`
    SELECT DISTINCT ?p ?type WHERE {
        GRAPH <${graph}> {
            ?s <${property}> ?o .

            OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
        }
    }
    `);
}

const getEmptyPropertiesForType = (type, emptyProperty) => {
    return (`
    SELECT DISTINCT ?p (IF(isLiteral(?o), datatype(?o), "") AS ?basicType) ?o WHERE {
        ?s ?Property <${type}> .
        ?s <${emptyProperty}> ?o .
        BIND(<${emptyProperty}> AS ?p)

        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
    } LIMIT 1
    `);
}

const getEmptyPropertiesForGraph = (graph, emptyProperty) => {
    return (`
    SELECT DISTINCT ?p (IF(isLiteral(?o), datatype(?o), "") AS ?basicType) ?o WHERE {
        GRAPH <${graph}> {
            ?s <${emptyProperty}> ?o .
            BIND(<${emptyProperty}> AS ?p)

            VALUES ?Property {
                <http://www.w3.org/2002/07/owl#someValuesFrom> 
                <http://www.w3.org/2000/01/rdf-schema#subClassOf>
            }
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
                    ?o <http://www.w3.org/2002/07/owl#someValuesFrom> ?parent .
                    FILTER(?o != ?parent)
                }
                FILTER NOT EXISTS {
                    ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?parent .
                    FILTER(?o != ?parent)
                }
                FILTER NOT EXISTS {
                    ?o <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?parent .
                    FILTER(?o != ?parent)
                }
        }
    }${queryLimit}
    `);
}

const getFilteredByType = (type, varKey, limit, filter) => {
    const queryLimit = limit ? ` LIMIT ${limit}` : "";
    return (`
    SELECT DISTINCT ?node "${varKey}" AS ?varType WHERE {
        ?node ?property <${type}> .
        VALUES ?property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
        FILTER(CONTAINS(str(?node), "${filter}") || CONTAINS(str(?varType), "${filter}")) .
    }${queryLimit}
    `);
}

const getFilteredByGraph = (graph, varKey, limit, filter) => {
    const queryLimit = limit ? ` LIMIT ${limit}` : "";
    return (`
    SELECT DISTINCT ?node "${varKey}" AS ?varType WHERE {
        GRAPH <${graph}> {
            ?node ?property ?o .
            FILTER NOT EXISTS {
                ?o <http://www.w3.org/2002/07/owl#someValuesFrom> ?parent .
                FILTER(?o != ?parent)
            }
            FILTER NOT EXISTS {
                ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?parent .
                FILTER(?o != ?parent)
            }
            FILTER NOT EXISTS {
                ?o <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?parent .
                FILTER(?o != ?parent)
            }
            FILTER(CONTAINS(str(?node), "${filter}") || CONTAINS(str(?varType), "${filter}")) .
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