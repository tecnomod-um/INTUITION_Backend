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
        ?s <http://www.w3.org/2000/01/rdf-schema#subClassOf>  ${type} .
        ?p <http://www.w3.org/2004/02/skos/core#prefLabel> ?name .
        OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?type }
    }
    `);
}

const getPropertiesForPair = (graph) => {
    return (`
    SELECT ?object ?subject
    WHERE {
      {
        SELECT (COUNT(?object) as ?objectCount) ?object ?objectName
        WHERE {
          GRAPH ${graph} {
            ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#object> ?x
          }
          ?x <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?object
          ?object <http://www.w3.org/2004/02/skos/core#prefLabel> ?objectName .
        }
        GROUP BY ?object
        ORDER BY DESC(?objectCount)
        LIMIT 1
      }
      {
        SELECT (COUNT(?subject) as ?subjectCount) ?subject ?subjectName ?subjectType
        WHERE {
          GRAPH ${graph} {
            ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#subject> ?x
          }
          ?x <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?subject
          ?subject <http://www.w3.org/2004/02/skos/core#prefLabel> ?subjectName .
        }
        GROUP BY ?subject
        ORDER BY DESC(?subjectCount)
        LIMIT 1
      }
      BIND(1 as ?dummy)
    } 
    `);
}

module.exports = {
    getAllGraphs,
    getLabelForGraph,
    getPropertiesForType,
    getPropertiesForPair,
}
