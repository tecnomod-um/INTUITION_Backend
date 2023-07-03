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
                ?VarType <http://www.w3.org/2002/07/owl#someValuesFrom> ?VarSubType .
                FILTER(?VarSubType != ?VarType)
            }
            FILTER NOT EXISTS {
                ?VarType <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?VarSubType .
                FILTER(?VarSubType != ?VarType)
            }
        }
    }
    `);
}

const getPropertiesForType = (type) => {
    return (`
    SELECT DISTINCT ?p ?o ?name ?type WHERE {
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
    SELECT DISTINCT ?p ?o ?name ?type WHERE {
        GRAPH ${graph} {
            ?s ?p ?o .

            OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
            BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)

            OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
        }
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
    SELECT DISTINCT ?p ?name ?o WHERE {
        GRAPH ${graph} {
            ?s ?p ?o .
            OPTIONAL { ?p <http://www.w3.org/2000/01/rdf-schema#label> ?nameRdfsLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?namePrefLabel } .
            OPTIONAL { ?p <http://www.w3.org/2004/02/skos/core#altLabel> ?nameAltLabel } .
            BIND(COALESCE(?nameRdfsLabel, ?namePrefLabel, ?nameAltLabel) AS ?name)
        }
    }
    `);
}

module.exports = {
    getAllGraphs,
    getLabelForGraph,
    getPropertiesForType,
    getObjectForTriplet,
    getSubjectForTriplet,
    getMissingElementForTriplet,
    getDataPropertiesForTriplet,
    getPropertiesForGraph,
}
