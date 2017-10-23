var scc = require('strongly-connected-components');

function getSCC(vertices, edges) {
    var idxMap = {}

    console.log(vertices);
    console.log(edges);



    var i = 0;
    vertices.forEach(function(v) {
        idxMap[v] = i++;
    });

    var mappedEdges = [];
    edges.forEach(function(list) {
        l = [];
        list.forEach(function(v) {
            l.push(idxMap[v]);
        });

        mappedEdges.push(l);
    });

    var components = scc(mappedEdges).components;

    var mappedComponents = [];
    components.forEach(function(c) {
        mc = [];
        c.forEach(function(v) {
            for (k in idxMap) {
                if (idxMap[k] == v)
                    mc.push(k);
            }
        });

        mappedComponents.push(mc);
    });

    return mappedComponents;
}

module.exports = {getSCC};