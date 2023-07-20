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
                ?VarType <http://www.w3.org/2002/07/owl#someValuesFrom> ?VarParent .
                FILTER(?VarParent != ?VarType)
            }
            FILTER NOT EXISTS {
                ?VarType <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?VarParent .
                FILTER(?VarParent != ?VarType)
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

const getEmptyPropertiesForType = (type, emptyProperties, additionalURIs) => {
    const emptyPropertiesString = emptyProperties.map(uri => `<${uri}>`).join(' ');
    const additionalURIsString = additionalURIs.map(uri => `<${uri}>`).join(' ');

    return (`
      SELECT DISTINCT ?p (IF(isLiteral(?o), datatype(?o), IF(?o IN (?additionalUris), str(?o), "")) AS ?basicType) WHERE {
        ?s ?p ?o .
        ?s ?Property <${type}> .

        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
        VALUES ?p { ${emptyPropertiesString} }
        VALUES ?additionalUris { ${additionalURIsString} }
    }
    `);
}

const getEmptyPropertiesForGraph = (graph, emptyProperties, additionalURIs) => {
    const emptyPropertiesString = emptyProperties.map(uri => `<${uri}>`).join(' ');
    const additionalURIsString = additionalURIs.map(uri => `<${uri}>`).join(' ');
    return (`
    SELECT DISTINCT ?p (IF(isLiteral(?o), datatype(?o), IF(?o IN (?additionalUris), str(?o), "")) AS ?basicType) WHERE {
        GRAPH <${graph}> {
            ?s ?p ?o .

            VALUES ?Property {
                <http://www.w3.org/2002/07/owl#someValuesFrom> 
                <http://www.w3.org/2000/01/rdf-schema#subClassOf>
            }
            VALUES ?p { ${emptyPropertiesString} }
            VALUES ?additionalUris { ${additionalURIsString} }
        }
    }
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
        FILTER (?p != <http://www.w3.org/1999/02/22-rdf-syntax-ns#subject> && 
                ?p != <http://www.w3.org/1999/02/22-rdf-syntax-ns#object>)
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

const encapsulateUnion = (union) => {
    return (`
    SELECT DISTINCT * WHERE
    {
        ${union}
    }
    `);
}

const getFilteredByType = (type, varKey, limit, filter) => {
    const queryLimit = limit ? ` LIMIT ${limit}` : "";
    return (`
    SELECT DISTINCT ?node ?varType WHERE {
        ?node ?property <${type}> .

        FILTER(CONTAINS(LCASE(str(?label)), "${filter}") || CONTAINS(LCASE(str(?node)), "${filter}") || CONTAINS(LCASE(str(?varType)), "${filter}")) .
        
        VALUES ?property {
                    <http://www.w3.org/2002/07/owl#someValuesFrom> 
                    <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
        
        BIND("${varKey}" AS ?varType)
    }${queryLimit}
    `);
}

const getFilteredByGraph = (graph, varKey, limit, filter) => {
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
                
                FILTER(CONTAINS(LCASE(str(?label)), "${filter}") || CONTAINS(LCASE(str(?node)), "${filter}") || CONTAINS(LCASE(str(?varType)), "${filter}")) .
        }
    }${queryLimit}
    `);
}

module.exports = {
    getAllGraphs,
    getLabel,
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
    encapsulateUnion,
    getEmptyPropertiesForType,
    getEmptyPropertiesForGraph,
    getPropertyType,
}
