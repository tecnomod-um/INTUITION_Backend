const getAllGraphs = () => {
    return (`
    SELECT DISTINCT ?graph WHERE {
        GRAPH ?graph {?s ?p ?o}
    } ORDER BY ?graph
    `);
}

const getLabelForGraph = (graph) => {
    return (`
    SELECT DISTINCT ?VarType ?VarTypeLabel WHERE {
        GRAPH ${graph} {
            ?AnyURI ?Property ?VarType .
    
            VALUES ?Property {
                <http://www.w3.org/2002/07/owl#someValuesFrom> 
                <http://www.w3.org/2000/01/rdf-schema#subClassOf>
            }
    
            OPTIONAL { ?VarType <http://www.w3.org/2000/01/rdf-schema#label> ?VarTypeRdfsLabel } .
            OPTIONAL { ?VarType <http://www.w3.org/2004/02/skos/core#prefLabel> ?VarTypePrefLabel } .
            OPTIONAL { ?VarType <http://www.w3.org/2004/02/skos/core#altLabel> ?VarTypeAltLabel } .
            BIND(COALESCE(?VarTypeRdfsLabel, ?VarTypePrefLabel, ?VarTypeAltLabel) AS ?VarTypeLabel)
        
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

const getElementForTriplet = (graph, type) => {
    return (`
    SELECT (COUNT(?${type}) as ?count) ?${type} WHERE {
    GRAPH ${graph}  {
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
        GRAPH ${graph} {
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
    SELECT DISTINCT ?p ?name ?type WHERE {
        GRAPH ${graph} {
            ?s ?p ?o .
            
            OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
            
            BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)
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
    SELECT DISTINCT ?node ?label ?varType WHERE {
        ?node ?property <${type}> .
        
        OPTIONAL { ?node <http://www.w3.org/2000/01/rdf-schema#label> ?rdfsLabel } .
        OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#prefLabel> ?prefLabel } .
        OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#altLabel> ?altLabel } .
        BIND(COALESCE(?rdfsLabel, ?prefLabel, ?altLabel) AS ?label)
        
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
    SELECT DISTINCT ?node ?label ?varType WHERE {
        GRAPH <${graph}> {
                ?node ?property ?o .
                
                OPTIONAL { ?node <http://www.w3.org/2000/01/rdf-schema#label> ?rdfsLabel } .
                OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#prefLabel> ?prefLabel } .
                OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#altLabel> ?altLabel } .
                BIND(COALESCE(?rdfsLabel, ?prefLabel, ?altLabel) AS ?label)
                
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
    SELECT DISTINCT ?node ?label ?varType WHERE {
        ?node ?property <${type}> .

        FILTER(CONTAINS(LCASE(str(?label)), "${filter}") || CONTAINS(LCASE(str(?node)), "${filter}") || CONTAINS(LCASE(str(?varType)), "${filter}")) .
        
        OPTIONAL { ?node <http://www.w3.org/2000/01/rdf-schema#label> ?rdfsLabel } .
        OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#prefLabel> ?prefLabel } .
        OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#altLabel> ?altLabel } .
        BIND(COALESCE(?rdfsLabel, ?prefLabel, ?altLabel) AS ?label)
        
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
    SELECT DISTINCT ?node ?label ?varType WHERE {
        GRAPH <${graph}> {
                ?node ?property ?o .
                
                OPTIONAL { ?node <http://www.w3.org/2000/01/rdf-schema#label> ?rdfsLabel } .
                OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#prefLabel> ?prefLabel } .
                OPTIONAL { ?node <http://www.w3.org/2004/02/skos/core#altLabel> ?altLabel } .
                BIND(COALESCE(?rdfsLabel, ?prefLabel, ?altLabel) AS ?label)
                
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

const getPropertiesForType = (type) => {
    return (`
        SELECT DISTINCT ?p ?name ?type WHERE {
            ?s ?p ?o .
            ?s ?Property ${type} .

            VALUES ?Property {
                <http://www.w3.org/2002/07/owl#someValuesFrom> 
                <http://www.w3.org/2000/01/rdf-schema#subClassOf>
            }

            OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
            BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)

            OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
        }
`);
}

const getPropertiesForGraph = (graph) => {
    return (`
    SELECT DISTINCT ?p ?name ?type WHERE {
        GRAPH ${graph} {
            ?s ?p ?o .

            VALUES ?Property {
                <http://www.w3.org/2002/07/owl#someValuesFrom> 
                <http://www.w3.org/2000/01/rdf-schema#subClassOf>
            }

            OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
            BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)

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
        ?s ?Property ${type} .

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
        GRAPH ${graph} {
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

module.exports = {
    getAllGraphs,
    getLabelForGraph,
    getPropertiesForType,
    getPropertiesForGraph,
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

/* Prev queries

    SELECT DISTINCT ?p ?name ?type WHERE {
        ?s ?p ?o .
        ?s ?Property ${type} .
    
        VALUES ?Property {
            <http://www.w3.org/2002/07/owl#someValuesFrom> 
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }

        OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
        OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
        OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
        BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)

        OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
    }




        SELECT DISTINCT ?p ?objectType WHERE {
            ?s ?p ?o .
            ?s ?Property ${type} .
            VALUES ?p { 
                <http://www.w3.org/2000/01/rdf-schema#subClassOf>
                <http://www.w3.org/2000/01/rdf-schema#isDefinedBy>
                <http://purl.obolibrary.org/obo/OGI_1000003>
                <http://purl.obolibrary.org/obo/OGI_1000004>
                <http://semanticscience.org/resource/SIO_000772>
                <http://www.w3.org/2004/02/skos/core#prefLabel>
                <http://schema.org/evidenceOrigin>
                <http://purl.obolibrary.org/obo/RO_0000052>
                <http://www.w3.org/2004/02/skos/core#definition>
                <http://purl.obolibrary.org/obo/CLO_0037208>
                <http://purl.obolibrary.org/obo/CLO_0037209>
                <http://purl.obolibrary.org/obo/CLO_0037210>
                <http://purl.obolibrary.org/obo/RO_0002428>
                <http://purl.obolibrary.org/obo/RO_0002331>
            }
            
            OPTIONAL { ?o <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?objectType }
        }

        

const getAllPropertiesForType = (type) => {
    return (`
    SELECT DISTINCT ?p ?name ?type ?propType WHERE {
        ?s ?p ?o .
        ?s ?subjectClass ${type} .
        ?p ?propertyClass ?propType .

        VALUES ?subjectClass {
            <http://www.w3.org/2002/07/owl#someValuesFrom>
            <http://www.w3.org/2000/01/rdf-schema#subClassOf>
        }
        VALUES ?propertyClass {
            <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
            <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
        }

        OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
        OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
        OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
        BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)

        OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
    }
    `);
}

const getAllPropertiesForGraph = (graph) => {
    return (`
    SELECT DISTINCT ?p ?name ?type ?propType WHERE {
        GRAPH ${graph} {
            ?s ?p ?o .
            ?p ?propertyClass ?propType .

            VALUES ?propertyClass {
                <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
                <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
            }

            OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
            BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)
        }
        OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
    }
    `);
}

const getObjectForTriplet = (graph) => {
    return (`
    SELECT ?object
    WHERE {
      SELECT (COUNT(?object) as ?objectCount) ?object
      WHERE {
        GRAPH ${graph}  {
          ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#object> ?x
        }
        ?x <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?object .
      }
      GROUP BY ?object
      ORDER BY DESC(?objectCount)
      LIMIT 1
    }
    `);
}

const getSubjectForTriplet = (graph) => {
    return (`
    SELECT ?subject
    WHERE {
    SELECT (COUNT(?subject) as ?subjectCount) ?subject
    WHERE {
        GRAPH ${graph} {
            ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#subject> ?x
        }
        ?x <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?subject .
    }
    GROUP BY ?subject
    ORDER BY DESC(?subjectCount)
    LIMIT 1
    } 
    `);
}

const getMissingElementForTriplet = (graph, property) => {
    return (`
    SELECT ?graph WHERE {
        SELECT ?graph (COUNT(?x) as ?subjectCount) WHERE {
            GRAPH ${graph} {
                ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#${property}> ?x .
            }
            GRAPH ?graph {
                ?x ?p ?o .
            }
        }
    }
    GROUP BY ?graph
    ORDER BY DESC(?subjectCount)
    LIMIT 1
    `);
}

const getDataPropertiesForTriplet = (graph) => {
    return (`
    SELECT DISTINCT ?p ?name ?o ?type WHERE {
        GRAPH ${graph} {
            ?s ?p ?o .
            OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
            BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)
        }
        OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
    }
    `);
}
*/