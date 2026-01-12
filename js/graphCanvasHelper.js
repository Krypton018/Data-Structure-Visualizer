// ===================================================
// GRAPH CANVAS INITIALIZATION
// ---------------------------------------------------
// Purpose: Sets up the SVG element, container group,
// simulation instance, and separate layers for links,
// nodes, and labels. Called once before first render.
// ===================================================

// Initial Graph Setup
function setupGraphCanvas(width, height, graphState) {
    if (graphState.svg) return;  // Already created

    // Creating SVG
    const svg = d3.select(".draw-area")
        .append("svg")
        .attr("id", "area-svg")
        .attr("viewBox", [-width / 2, -height / 2, width, height]);

    // Create Container inside SVG to hold all the elements
    const container = svg.append("g");

    // Reusable layers 
    const linkLayer = container.append("g").attr("class", "link-layer");    // Grouping Links
    const nodeLayer = container.append("g").attr("class", "node-layer");    // Grouping Nodes
    const labelLayer = container.append("g").attr("class", "label-layer");  // Grouping Labels
    

    // Create Simulation
    const simulation = d3.forceSimulation()                 // Creates physics for the nodes 
        .force("link", d3.forceLink().id(d => d.id))        // Spring Force that pulls nodes together
        .force("charge", d3.forceManyBody())                // Repulsive Force
        .force("x", d3.forceX())                            // Centring Force -> pulls towards x = 0
        .force("y", d3.forceY())                            // Centring Force -> pulls towards y = 0
    

    // Only create tooltip once
    if (d3.select(".node-tooltip").empty()) {
        d3.select("body")
        .append("div")
        .attr("class", "node-tooltip");
    }


    // Panning and Zooming
    const panLimit = 300;
    // Setting up zoom behaviour
    const zoom = d3.zoom()
        .scaleExtent([0.5, 15])       // 0.5x zoom till 15x zoom
        .on("zoom", (event) => {
            // (t.k, t.x, t.y) -> (Scale/Zoom factor, Horizontal pan, Vertical pan)
            const t = event.transform;     

            // Setting pan limit according to scale factor
            const scaledPanLimit = panLimit * t.k;     

            // Clamping
            // Clamp the pan values between -scaledPanLimit and +scaledPanLimit
            const limitedX = Math.max(Math.min(t.x, scaledPanLimit), -scaledPanLimit);
            const limitedY = Math.max(Math.min(t.y, scaledPanLimit), -scaledPanLimit);
            
            container.attr("transform", `translate(${limitedX},${limitedY}) scale(${t.k})`);

            // Hide tooltip on zoom/pan
            d3.select(".node-tooltip")
                .style("opacity", 0)
                .style("transform", "translateY(8px)");
        });
    
    // Apply zoom behaviour
    svg.call(zoom);


    // Save to graphState
    graphState.svg = svg;
    graphState.container = container;
    graphState.linkLayer = linkLayer;
    graphState.nodeLayer = nodeLayer;
    graphState.labelLayer = labelLayer;
    graphState.simulation = simulation;
    graphState.zoom = zoom;
}

export { setupGraphCanvas };