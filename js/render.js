// ===================================================
// GRAPH RENDERING ENGINE
// ---------------------------------------------------
// Purpose: Responsible for rendering nodes, edges,
// and labels on the canvas. Preserves node positions,
// applies dragging, zooming, tooltip behavior, and
// updates the simulation tick-by-tick.
// ===================================================

import { updateLinkPaths, updateArrowheads, updateWeightLabels, dragstarted, dragged, dragended, addTooltipBehavior, zoomToFit, buildAdjacencyNeighbor, applyHighlight, resetHighlight } from "./graphInteractionHelpers.js";

// Rendering the graph
function renderGraph(data, shouldZoom, groupColorMap, groupDisplayMap, graphTriggers, graphState, tooltipState, dragState) {

    // Dimensions -> Virtual Drawing Area for the Graph (viewBox)
    const width = graphState.width;
    const height = graphState.height;


    // Node color
    // color -> Function that maps groups to colors
    // Assigns dynamically as its called
    // 1st group its called with -> 1st color . . . . and so on
    const color = (group) => {
        return groupColorMap[group] || "#cccccc";  // fallback gray for new groups
    };


    // LOADING DATA
    // Creating shallow copy of vertices and edges
    const links = data.links.map(d => ({...d}));
    const nodes = data.nodes.map(d => ({...d}));


    
    // Preserve positions of existing nodes
    // Creates a mapping node ID -> old node object {id, x, y, vx, vy}
    const oldNodeMap = new Map(graphState.currentNodes.map(d => [d.id, d]));
    
    nodes.forEach(d => {
        const old = oldNodeMap.get(d.id);
        // If the node already existed previously (keep its state same)
        if (old) {
            d.x = old.x;
            d.y = old.y;
            d.vx = old.vx;
            d.vy = old.vy;
        } else {
            // Randomize position for new nodes only
            // Randomize initial position between (-w/2, h/2) to  (w/2 to h/2)
            d.x = (Math.random() - 0.5) * width;
            d.y = (Math.random() - 0.5) * height;
        }
    });


     


    // Create Simulation for nodes and links
    const simulation = graphState.simulation;
    simulation.nodes(nodes);
    simulation.force("link").links(links);

    // If no links, apply a collision force to prevent overlap
    if (links.length === 0) simulation.force("collide", d3.forceCollide().radius(15));
    else simulation.force("collide", null);
    
    //  Restart only if structure changed or directedToggle for first time
    if (shouldZoom || (graphState.isDirected && !graphTriggers.directedTrigger)) {
        simulation.alpha(1).restart();
    }

    // Toggling directedTrigger
    graphTriggers.directedTrigger = graphState.isDirected;


    

    // CREATING ELEMENTS
    const svg = graphState.svg;


    // Create edges
    const link = graphState.linkLayer
        .selectAll("path")
        .data(links, d => `${d.source.id}-${d.target.id}`)  
        // Each join (adding/deleting elements to math the data) has 3 phases, enter, update and exit
        .join("path")
        .attr("class", "link-edge")
    

    // Static update for edges
    updateLinkPaths(link, graphState);
    
    // Create arrows (triangles) for each edge
    const arrow = graphState.linkLayer
        .selectAll(".edge-arrow")
        .data(links, d => `${d.source.id}-${d.target.id}`)
        .join("polygon")
        .attr("class", "edge-arrow")
        .attr("points", "0,0 2,4 -2,4") // Initial dummy points, will update on tick
        .style("fill", "#333")
        .style("visibility", graphState.isDirected ? "visible" : "hidden");

    // Static update for arrowheads
    updateArrowheads(arrow, graphState);
    
    // Create nodes
    const node = graphState.nodeLayer
        .selectAll("circle")
        .data(nodes, d => d.id)  
        .join("circle")
        .attr("class", "node-circle")
        .attr("r", 5)
        .attr("fill", d => color(d.group))
        .attr("stroke", d => d3.rgb(color(d.group)).darker(1));


    // Create labels
    const labels = graphState.labelLayer
        .selectAll("text")
        .data(nodes, d => d.id)
        .join("text")
        .attr("class", "node-label")
        .attr("dy", 2)
        .text(d => d.id);

    // Background circle for edge weights
    const weightBg = graphState.linkLayer
        .selectAll(".edge-weight-bg")
        .data(links, d => `${d.source.id}-${d.target.id}`)
        .join("circle")
        .attr("class", "edge-weight-bg")
        .attr("r", 3) // radius, adjust as needed
        .style("fill", "#1b1a25") // same as background
        .style("pointer-events", "none"); // ignore mouse events

    graphState.weightBgSelection = weightBg;

    // Weight labels
    const weight = graphState.linkLayer
        .selectAll(".edge-weight")
        .data(links, d => `${d.source.id}-${d.target.id}`)
        .join("text")
        .attr("class", "edge-weight")
        .attr("dy", 1.5)
        .attr("text-anchor", "middle")
        .style("font-size", "4px")
        .style("fill", "#ffffffff")
        .style("pointer-events", "none")
        .text(d => graphState.isWeighted ? (d.value ?? 1) : "");

    graphState.weightSelection = weight;
    // Static update for weight labels
    updateWeightLabels(graphState);

        

    // DRAGGING 
    // Node Drag behaviour
    node.call(d3.drag()
        .on("start", (event) => dragstarted(event, simulation, tooltipState, dragState))
        .on("drag", dragged)
        .on("end", (event) => dragended(event, simulation, dragState)));

    // Label Drag Behaviour
    labels.call(d3.drag()
    .on("start", (event) => dragstarted(event, simulation, tooltipState, dragState))
    .on("drag", dragged)
    .on("end", (event) => dragended(event, simulation, dragState)));


    // TOOLTIP
    // Hovering Tooltip
    const tooltip = d3.select(".node-tooltip");

    // Tooltip Animation
    addTooltipBehavior(node, color, tooltip, groupDisplayMap, tooltipState, dragState);
    

    // Setting up zoom behaviour
    const zoom = graphState.zoom;
    // Double click -> Reset zoom
    svg.on("dblclick.zoom", null);
    svg.on("dblclick.zoomToFit", () => zoomToFit(svg, nodes, width, height, zoom));

    // Updating on tick (animation frame)
    let tickCount = 0;
    let hasZoomed = false;

    simulation.on("tick", () => {
        // Update edge position
        updateLinkPaths(link, graphState);


        // Update vertex position
        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

         // Update label position
        labels
            .attr("x", d => d.x)
            .attr("y", d => d.y);   


        // Update arrow position and orientation (dynamic update)
        updateArrowheads(arrow, graphState);

        // Update weights position (dynamic update)
        updateWeightLabels(graphState);

        
        // Wait for 20 ticks and them zoom in to fit to scale
        if (shouldZoom && !hasZoomed && ++tickCount === 20) {
            hasZoomed = true;
            zoomToFit(svg, nodes, width, height, zoom);
            
        }
    });

    
    
    
    

    // Build adjacency once per render
    const adjacency = buildAdjacencyNeighbor(links, graphState);

    // Highlight on dblclick (node or label)
    node.on("dblclick", (event, d) => {
        graphTriggers.highlightedTrigger = true;
        event.stopPropagation();
        applyHighlight(d.id, adjacency, graphState);
        graphState.lastHighlightedNode = d.id;
    });

    labels.on("dblclick", (event, d) => {
        graphTriggers.highlightedTrigger = true;
        event.stopPropagation();
        applyHighlight(d.id, adjacency, graphState);
        graphState.lastHighlightedNode = d.id;
    });

    // Reset on background click
    svg.on("click.resetHighlight", (event) => {
        if (event.target === svg.node()) {    // If clicked on the underlying svg
            graphTriggers.highlightedTrigger = false;
            resetHighlight(graphState);
            graphState.lastHighlightedNode = null;
        }
    });
    

    // Updating graph state
    graphState.simulation = simulation;
    graphState.zoom = zoom;
    graphState.nodeSelection = node;
    graphState.linkSelection = link;
    graphState.labelSelection = labels;
    graphState.currentNodes = nodes;
    graphState.currentLinks = links;



    // Keeping highlights preserved   (After all graph updation, so it doesn't get overriden)
    if (graphTriggers.highlightedTrigger && graphState.lastHighlightedNode != null) {
        applyHighlight(graphState.lastHighlightedNode, adjacency, graphState);
    }
};

export { renderGraph };