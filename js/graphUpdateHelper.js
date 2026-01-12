// ===================================================
// GRAPH DATA UPDATE HANDLING
// ---------------------------------------------------
// Purpose: Detects changes in input structure, validates
// new data, parses it, assigns group colors, and triggers
// a re-render of the graph.
// ===================================================
// 

import { 
    validateNodes, 
    validateGraphEdges, 
    buildAdjacencyList, 
    assignGroups, 
    formatEdges
} from "./graphParseHelper.js";

import { 
    handleEditorErrors 
} from "./editorHelper.js";

import {
    renderGraph
} from "./render.js";

import {
    assignGroupColor,
    cleanupGroupColors
} from "./graphInteractionHelpers.js"

// Check if the graph structure has changed
function isGraphStructureChanged(newNodes, newLinks, graphState) {
    // Loading old nodes and new nodes
    const oldNodeIds = new Set(graphState.currentNodes.map(d => d.id));
    const newNodeIds = new Set(newNodes.map(d => d.id));

    // Check if nodes have changed (added or removed)
    if (oldNodeIds.size !== newNodeIds.size || [...newNodeIds].some(id => !oldNodeIds.has(id))) {
        return true;
    }

    // Convert old edges to a sorted string (Each element -> "Source-Target")
    const oldEdges = new Set(
        graphState.currentLinks.map(d => {
            const u = d.source.id || d.source;
            const v = d.target.id || d.target;
            return [u, v].sort().join("-");
        })
    );

    // Convert new edges to a sorted string (Each element -> "Source-Target")
    const newEdges = new Set(
        newLinks.map(d => [d.source, d.target].sort().join("-"))
    );

    // Check if edges have changed
    if (oldEdges.size !== newEdges.size || [...newEdges].some(e => !oldEdges.has(e))) {
        return true;
    }

    return false;
}

// Updation Function -> Update graph from input
function updateGraphFromInput(nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, graphTriggers, tooltipState, dragState, shouldZoom = false) {
    // NODES
    const nodeText = nodesEditor.getValue();                    // Fetching new data
    const {validNodes, nodeErrors} = validateNodes(nodeText);   // Validating data

    // ERROR HANDLING
    handleEditorErrors(nodesEditor, nodeErrors, nodeErrorMarkers, "nodes-error-msg");

    
    
    // EDGES
    const edgeText = edgesEditor.getValue();                                 // Fetching new data
    const {validEdges, edgeErrors} = validateGraphEdges(edgeText, validNodes, graphState);    // Validating data

    // ERROR HANDLING
    handleEditorErrors(edgesEditor, edgeErrors, edgeErrorMarkers, "edges-error-msg");




    // PARSING AND GROUPING
    const graph = buildAdjacencyList(validNodes, validEdges, graphState);   // Creating adjacency list from input
    const groupedNodes = assignGroups(validNodes, graph);                   // Grouping and formatting nodes { id: "A", group: "Root_node"}
    const links = formatEdges(validEdges);                                  // Formatting edges
    const graphData = { nodes: groupedNodes, links: links };                // Formatting Graph Data



    
    // ASIGNING COLORS AND DISPLAY GROUPS
    // Getting set of unique groups
    const allGroups = [...new Set(groupedNodes.map(d => d.group))];

    // Assigning color to new groups
    allGroups.forEach(group => {
        assignGroupColor(group, groupColorMap, myColors, colorCounter);
    });

    // Map group ID -> Display Group Number (1-based index)
    let groupDisplayMap = {};
    allGroups.forEach((group, index) => {
        groupDisplayMap[group] = index + 1;
    });

    // Remove colors for groups no longer used
    cleanupGroupColors(allGroups, groupColorMap);

    // Fix zoom only if graph structure changes
    shouldZoom |= isGraphStructureChanged(graphData.nodes, graphData.links, graphState);
    
    // Render
    renderGraph(graphData, shouldZoom, groupColorMap, groupDisplayMap, graphTriggers, graphState, tooltipState, dragState);

}


export { updateGraphFromInput };