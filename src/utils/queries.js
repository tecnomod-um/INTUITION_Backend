const getAllGraphs = () => {
    return (`
    SELECT DISTINCT ?graph WHERE {
        GRAPH ?graph {?s ?p ?o}
    } ORDER BY ?graph
    `);
}

const getLabelForGraph = (graph) => {
    return (`
    SELECT ?VarType ?VarTypeLabel WHERE {
        GRAPH ${graph} {
          ?VarURI <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?VarType .
          OPTIONAL { ?VarType <http://www.w3.org/2000/01/rdf-schema#label> ?VarTypeRdfsLabel } .
          OPTIONAL { ?VarType <http://www.w3.org/2004/02/skos/core#prefLabel> ?VarTypePrefLabel } .
          OPTIONAL { ?VarType <http://www.w3.org/2004/02/skos/core#altLabel> ?VarTypeAltLabel } .
          BIND(COALESCE(?VarTypeRdfsLabel, ?VarTypePrefLabel, ?VarTypeAltLabel) AS ?VarTypeLabel)
        }
      }
      GROUP BY ?VarType ?VarTypeLabel
      ORDER BY DESC(COUNT(?VarTypeLabel))
      LIMIT 1
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

module.exports = {
    getAllGraphs,
    getLabelForGraph,
    getPropertiesForType,
};
