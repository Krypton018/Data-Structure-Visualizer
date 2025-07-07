// ===================================================
// [1] CONFIGURATION & GLOBAL STATE
// ---------------------------------------------------
// Purpose: Holds simulation state, group colors, and error markers
// Shared by rendering, parsing, and validation logic
// ===================================================

// Tracks the state of the graph visualization
let graphState = {
    svg: null,                  // Main SVG Element
    container: null,            // Group that holds all elements
    simulation: null,           // Force Simulation Instance
    zoom: null,                 // Pan/Zoom Behaviour
    
    // SVG Layer Groups (Layers used to prganize visuals for rendering the nodes, edges, labels)
    nodeLayer: null,            // <g> group for all nodes
    linkLayer: null,            // <g> group for all edges
    labelLayer: null,           // <g> group for all labels
    
    // Current Selection of rendered DOM elements (Used to update positions, color, etc)
    nodeSelection: null,        // Current <circle> selections (DOM)
    linkSelection: null,        // Current <line> selections (DOM)
    labelSelection: null,       // Current <text> selections (DOM)
    
    // Active graph data
    // Node Format : { id: "A", group: "G1", x: 100, y:100, vx: 200, vy: 200 }
    currentNodes: [],           // Current Node Data
    // Link Format : { source: "A", target: "B", value: 1 }
    currentLinks: [],           // Current Link Data

    // Dimensions
    width: 928,
    height: 680
};

// Error markers IDs for Ace Error Annotations
let nodeErrorMarkers = [];       // Store ID of node errors
let edgeErrorMarkers = [];       // Store ID of edge errors

// Color palette and group mapping
let myColors = [];               // Randomized color palette
let groupColorMap = {};          // Group to Color mapping
let colorIndexCounter = 0;       // Track number of groups




// ===================================================
// [2] ACE EDITOR SETUP
// ---------------------------------------------------
// Purpose: Sets up editors for node and edge input,
// initializes Ace themes and modes.
// ===================================================

// Notes Input Editor
const nodesEditor = ace.edit("nodes-input");
nodesEditor.setTheme("ace/theme/monokai");
nodesEditor.session.setMode("ace/mod/plain_text");

// Edges Input Editor
const edgesEditor = ace.edit("edges-input");
edgesEditor.setTheme("ace/theme/monokai");
edgesEditor.session.setMode("ace/mode/plain_text");




// ===================================================
// [3] USER INPUT EVENT HANDLERS
// ---------------------------------------------------
// Purpose: Detects changes in node/edge editors and
// schedules delayed parsing (with 500ms debounce).
// ===================================================

// Debounce timers for delayed validation
let inputNodeTimeout;
let inputEdgeTimeout;

// Handler : Nodes Input Changed
function handleNodeInput() {
    clearTimeout(inputNodeTimeout);                             // Clear previous timeout
    clearEditorMarkers(nodesEditor, nodeErrorMarkers);          // Clearing old node markers (errors)
    nodesEditor.session.clearAnnotations();                     // Clearing old gutter annotations
    inputNodeTimeout = setTimeout(updateGraphFromInput, 500);   // Update graph after delay
}

// Handler : Edges Input Changed
function handleEdgeInput() {
    clearTimeout(inputEdgeTimeout);                             // Clear previous timeout
    clearEditorMarkers(edgesEditor, edgeErrorMarkers);          // Clearing old edge markers (errors)
    edgesEditor.session.clearAnnotations();                     // Clearing old gutter annotations
    inputEdgeTimeout = setTimeout(updateGraphFromInput, 500);   // Update graph after delay
}

// Attach listeners to editors
nodesEditor.session.on("change", handleNodeInput);
edgesEditor.session.on("change", handleEdgeInput);





// ===================================================
// [4] ERROR HANDLING HELPERS
// ---------------------------------------------------
// Purpose: Provides utility functions to highlight errors
// in the Ace editors, show annotations in the gutter,
// and display error messages below the inputs.
// ===================================================

// Clearing all previous markers
function clearEditorMarkers(editor, markerIds) {
    markerIds.forEach(id => editor.session.removeMarker(id));   // Remove each marker
    markerIds.length = 0;                                       // Clear the array in-place
}

// Highlighting Error Lines
function markEditorErrors(editor, errors, markerArray) {
    // Clearing old markers
    clearEditorMarkers(editor, markerArray);

    // Adding new errors
    errors.forEach(error => {
        const markerId = editor.session.addMarker(       
            // Adding new error marking
            new ace.Range(error.line, 0, error.line, 0.1),    // Start row, Start col, End row, End col
            'ace_error-line',                                 // CSS class (styling)
            'fullLine',                                       // mode : highlight the full line
            false                                             // false -> Render the marker behind the text
        );
        
        // Saving all error markers
        markerArray.push(markerId);
    });
}

// Error Line Gutter Caution sign
function markEditorAnnotation(editor, errors) {
    // Annotate the first line if there are erros
    if (errors.length > 0) {
        editor.session.setAnnotations([
            {
                row: errors[0].line,      // Line number (0-indexed)  -> Only display the first error
                column: 0,                // Start at column 0
                text: errors[0].reason,   // Tooltip message
                type: "warning"           // Warning sign in gutter 
            }
        ]);
    } else {
        // Clear previous annotations
        editor.session.clearAnnotations();
    }
}
// Displaying Error 
function setEditorErrorMessage(containerId, errors) {
    const container = document.getElementById(containerId);
    if (errors.length > 0) {
        container.textContent = `⚠️ Line ${errors[0].line + 1}: ${errors[0].reason}`;
    } else {
        container.textContent = '';
    }
}




// ===================================================
// [5] INPUT PARSING & VALIDATION
// ---------------------------------------------------
// Purpose: Parses and validates user input for nodes
// and edges, assigns groups using DSU, and formats
// the data into a usable graph structure.
// ===================================================

// Validating node Names
function validateNodes(text) {
    const lines = text.split('\n');          // Getting each node separately
    const nodeErrors = [];                   // Keeping track of all errors
    const nodeSet = new Set();               // Keeping track of all valid unique nodes
    const validRegex = /^[a-zA-Z0-9_]+$/;    // For valid node names
    
    
    lines.forEach((rawLine, i) => {
        const line = rawLine.trim();         // Remvoing empty spaces
        
        // Skip empty lines     
        if (!line) return;     // (return -> skip execution for this current line)
    
        // Invalid name
        if (!validRegex.test(line)) {
            nodeErrors.push({ line: i, reason: 'Invalid node name' });
        }
        
        // Duplicate name
        else if (nodeSet.has(line)) {
            nodeErrors.push({ line: i, reason: 'Duplicate node name' });
        }
        
        // Add node to existing set
        else {
            nodeSet.add(line);
        }
    });
    
    // Returning valid and invalid input
    return {
        validNodes: [...nodeSet],     // Shallow copy of node set
        nodeErrors,        // Array of errors (if any) {line: number, reason: string}
    };
}

// Validating Edge Names
function validateEdges(text, validNodes) {
    const lines = text.split('\n');          // Getting each edge separately
    const edgeErrors = [];                   // Keeping track of all errors
    const edges = [];                        // Keeping track of all edges
    const validRegex = /^[a-zA-Z0-9_]+$/;    // For valid edge names

    lines.forEach((rawLine, i) => {
        const line = rawLine.trim();          // Remove empty space

        // Skip empty line
        if (!line) return;

        // Separating source and target
        const parts = line.split(/\s+/);

        // Must be exactly 2 values
        if (parts.length !== 2) {
            edgeErrors.push({ line: i, reason: 'Edge must have exactly 2 nodes' });
            return;
        }

        const [u, v] = parts;

        // Check valid names
        if (!validRegex.test(u) || !validRegex.test(v)) {
            edgeErrors.push({ line: i, reason: 'Invalid node name in edge' });
            return;
        }

        // Check that both nodes exist
        else if (!validNodes.includes(u) || !validNodes.includes(v)) {
            edgeErrors.push({ line: i, reason: 'Node in edge does not exist' });
            return;
        }

        // Add valid edge to edges
        else {
            edges.push([u, v]); 
        } 
    });

    return {
        validEdges: edges,    // Valid edges
        edgeErrors            // Array of errors (if any) {line: number, reason: string}
    };
}

// Building adjacency list for grouping nodes
function buildAdjacencyList(validNodes, validEdges) {
    const graph = {};

    // Initialize empty neighbor list for all nodes
    validNodes.forEach(node => {
        graph[node] = [];
    });

    // Fill neighbors from validEdges
    validEdges.forEach(([u, v]) => {
        graph[u].push(v);
        graph[v].push(u);  // Undirected graph
    });

    return graph;
}

// Assigning groups to each node  (IMPLETED VIA DSU)
function assignGroups(validNodes, graph) {
    const parent = {};   // Keep track of parents
    const size = {};     // Keep track of size of component

    // Initially, each node is its own group
    validNodes.forEach(node => {
        parent[node] = node;
        size[node] = 1;
    });

    // Finding parent for DSU
    function find(u) {
        if (parent[u] !== u) parent[u] = find(parent[u]);
        return parent[u];
    }

    // Union for DSU
    function union(u, v) {
        const pu = find(u);
        const pv = find(v);

        if (pu === pv) return;

        // Union by size (keep larger as parent)
        if (size[pu] < size[pv]) {
            parent[pu] = pv;
            size[pv] += size[pu];
        } else {
            parent[pv] = pu;
            size[pu] += size[pv];
        }
    }

    // Union all edges
    for (const u of validNodes) {
        for (const v of graph[u]) {
            union(u, v);
        }
    }

    // Assign final groups using root ID (stable grouping)
    const result = validNodes.map(node => {
        return {
            id: node,
            group: find(node)   // group is now the root ID (The root in the DSU component)
        };
    });


    return result;
}

// Formatting Edges
function formatEdges(validEdges) {
    return validEdges.map(([source, target]) => ({
        source,
        target,
        value: 1
    }));
}




// ===================================================
// [6] GRAPH DATA UPDATE HANDLING
// ---------------------------------------------------
// Purpose: Detects changes in input structure, validates
// new data, parses it, assigns group colors, and triggers
// a re-render of the graph.
// ===================================================

// Check if the graph structure has changed
function isGraphStructureChanged(newNodes, newLinks) {
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
function updateGraphFromInput(shouldZoom = false) {
    // NODES
    const nodeText = nodesEditor.getValue();                    // Fetching new data
    const {validNodes, nodeErrors} = validateNodes(nodeText);   // Validating data

    // ERROR HANDLING
    markEditorErrors(nodesEditor, nodeErrors, nodeErrorMarkers);   // Highlighting Error Lines
    markEditorAnnotation(nodesEditor, nodeErrors);                 // Add Gutter Symbol
    setEditorErrorMessage("nodes-error-msg", nodeErrors);          // Display Error

    
    
    // EDGES
    const edgeText = edgesEditor.getValue();                                 // Fetching new data
    const {validEdges, edgeErrors} = validateEdges(edgeText, validNodes);    // Validating data

    // ERROR HANDLING
    markEditorErrors(edgesEditor, edgeErrors, edgeErrorMarkers);   // Highlighting Error Lines
    markEditorAnnotation(edgesEditor, edgeErrors);                 // Add Gutter Symbol
    setEditorErrorMessage("edges-error-msg", edgeErrors);          // Display Error




    // PARSING AND GROUPING
    const graph = buildAdjacencyList(validNodes, validEdges);   // Creating adjacency list from input
    const groupedNodes = assignGroups(validNodes, graph);       // Grouping and formatting nodes { id: "A", group: "Root_node"}
    const links = formatEdges(validEdges);                      // Formatting edges
    const graphData = { nodes: groupedNodes, links: links };    // Formatting Graph Data



    
    // ASIGNING COLORS AND DISPLAY GROUPS
    // Getting set of unique groups
    const allGroups = [...new Set(groupedNodes.map(d => d.group))];

    // Assigning color to new groups
    allGroups.forEach(group => {
        if (!(group in groupColorMap)) {
            groupColorMap[group] = myColors[colorIndexCounter % myColors.length];
            colorIndexCounter++;
        }
    });

    // Map group ID -> Display Group Number (1-based index)
    let groupDisplayMap = {};
    allGroups.forEach((group, index) => {
        groupDisplayMap[group] = index + 1;
    });


    // Remove colors for groups no longer used
    Object.keys(groupColorMap).forEach(group => {
        if (!allGroups.includes(group)) {
            delete groupColorMap[group];
        }
    });




    // Fix zoom only if graph structure changes
    shouldZoom = isGraphStructureChanged(graphData.nodes, graphData.links);
    
    // Render
    renderGraph(graphData, shouldZoom, groupDisplayMap);

}




// ===================================================
// [7] GRAPH CANVAS INITIALIZATION
// ---------------------------------------------------
// Purpose: Sets up the SVG element, container group,
// simulation instance, and separate layers for links,
// nodes, and labels. Called once before first render.
// ===================================================

// Initial Graph Setup
function setupGraphCanvas(width, height) {
    if (graphState.svg) return;  // Already created

    // Creating SVG
    const svg = d3.select(".draw-area")
        .append("svg")
        .attr("id", "graph-svg")
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
    

    // Save to graphState
    graphState.svg = svg;
    graphState.container = container;
    graphState.linkLayer = linkLayer;
    graphState.nodeLayer = nodeLayer;
    graphState.labelLayer = labelLayer;
    graphState.simulation = simulation;
}




// ===================================================
// [8] INITIAL GRAPH LOAD
// ---------------------------------------------------
// Purpose: Loads default graph from graph.json,
// populates editors, randomizes initial colors, and
// performs the first render before enabling input.
// ===================================================

// Load default graph from graph.json
d3.json("graph.json").then((data) => {
    // Extract node and edge data
    const nodeText = data.nodes.map(d => d.id).join('\n');
    const edgeText = data.links.map(d => `${d.source} ${d.target}`).join('\n');

    // Detach input handlers
    nodesEditor.session.off("change", handleNodeInput);
    edgesEditor.session.off("change", handleEdgeInput);

    // Set initial values from graph.json 
    nodesEditor.setValue(nodeText, -1);
    edgesEditor.setValue(edgeText, -1);

    // Initially randomizing node color
    myColors = shuffle([
        "#ff006e", "#ffb703", "#036666", "#6f1d1b", "#5a189a",
        "#00b4d8", "#ff7f51", "#ffb3c6", "#250902", "#ef233c", "#192bc2"
    ]);

    // Mapping groups to colors
    const groups = [...new Set(data.nodes.map(d => d.group))];  // Getting all unique groups
    groups.forEach((group, index) => {
        groupColorMap[group] = myColors[index % myColors.length];
    });

    // Intial Graph setup
    setupGraphCanvas(graphState.width, graphState.height); 
    // Manually render once
    updateGraphFromInput(true);   // true -> zoom on first load

    // Reattach handlers for user input
    nodesEditor.session.on("change", handleNodeInput);
    edgesEditor.session.on("change", handleEdgeInput);

});




// ===================================================
// [9] GRAPH INTERACTION & LAYOUT UTILITIES
// ---------------------------------------------------
// Purpose: Handles drag behavior, tooltips, zoom/pan,
// bounding box calculations, and color shuffling.
// Supports interactive layout and rendering logic.
// ===================================================

// Randomizing colors
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Tooltip animation on hover
function addTooltipBehavior(selection, color, tooltip, groupDisplayMap) {
    let tooltipTimeout;

    selection
        .on("mouseover", (event, d) => {
            if (isDragging) return;          // No tooltip when hovering
            
            // Storing the setTimeout in a variable (so we can cancel it if needed)
            tooltipTimeout = setTimeout(() => {
                if (isDragging) return;      // No tooltip if hovering when animation is in progress
                tooltip
                    .html(`
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="display:inline-block; width:16px; height:16px; border-radius:50%; background:${color(d.group)}; border:2px solid #fff;"></span>
                            <div>
                                <div style="font-size:16px;">Node: ${d.id}</div>
                                <div style="color:#46f293;">Group: ${groupDisplayMap[d.group]}</div>
                            </div>
                        </div>
                    `)
                    .style("left", `${event.pageX + 24}px`)
                    .style("top", `${event.pageY + 12}px`)
                    .style("opacity", 1)
                    .style("transform", "translateY(0)");        
            }, 450);
        })
        .on("mousemove", (event) => {
            tooltip
                .style("left", `${event.pageX + 24}px`)  // Updating tooltip position on every move
                .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", () => {
            clearTimeout(tooltipTimeout);         // Clearing any remaining tooltip animation

            tooltip
                .style("opacity", 0)
                .style("transform", "translateY(8px)");
        });
}

// DRAG FUNCTIONS
let isDragging = false;
// event.active
// > 0   ->	At least one drag is ongoing
// == 0  ->	No drag is active (this is the last one ending)

// When drag starts
function dragstarted(event, simulation) {
    isDragging = true;
    // If first drag (no other drags currently active) -> Simulation gains energy
    if (!event.active) simulation.alphaTarget(0.3).restart();   
    // Fixing nodes at current position
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // Hide tooltip if dragging starts
    d3.select(".node-tooltip")
        .style("opacity", 0)
        .style("transform", "translateY(8px)");
    clearTimeout(window.tooltipTimeout);          // clears all delayed tooltip
}

// When dragging
function dragged(event) {
    // Moving nodes with the mouse
    event.subject.fx = event.x;
    event.subject.fy = event.y;
}

// When drag ends
function dragended(event, simulation) {
    isDragging = false;
    // If last drag (all other drags have ended) -> Simulation loses all energy
    if (!event.active) simulation.alphaTarget(0);
    // Unfixing nodes (simulation acts on them)
    event.subject.fx = null;
    event.subject.fy = null;
}


// Finding the smallest rectangle that fits all the nodes
function getGraphBoundingBox(nodes) {
    // Getting x and y coords of all the nodes
    const xs = nodes.map(d => d.x);
    const ys = nodes.map(d => d.y);

    // Finding boundary coords
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return { minX, maxX, minY, maxY };
}


// ZOOM function
// Find the smallest box that contains all nodes and zoom in/out to fit to that
function zoomToFit(svg, nodes, width, height, zoom) {
    // No nodes to zoom
    if (!nodes || nodes.length === 0) {
        return;
    }

    // Getting node positions and top-left, bottom-right boundaries
    const { minX, maxX, minY, maxY } = getGraphBoundingBox(nodes);

    
    // Node padding
    const padding = 20;
    
    // Dimension of node layout
    const boundsWidth = (maxX - minX) || 1;    //  Avoid division by 0 -> || 1
    const boundsHeight = (maxY - minY) || 1;

    // Dimensions of viewBox
    const svgWidth = width;
    const svgHeight = height;
    
    // Calculating scale factor
    // Choosing the smaller scale factor so we can accomodate all nodes
    const scale = Math.min(
        svgWidth / (boundsWidth + 2 * padding),
        svgHeight / (boundsHeight + 2 * padding),
        5      // Max zoom level allowed
    );
    
    // Graph center
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    // Moving the graph (with scale factor) so that graph center ends up at (0,0)
    // If graph is currently at (x,y), we move it by (-x, -y) to move it to (0,0) 
    const translateX = -midX * scale;
    const translateY = -midY * scale;
    
    // Zooming to fit to scale
    svg.transition()
        .duration(500)      // Transition for 0.5s
        .call(
            zoom.transform,
            d3.zoomIdentity                             // Neutral transform (no zoom, no pan)
                .translate(translateX, translateY)      // Applying our own zoom and pan
                .scale(scale)
        );
}




// ===================================================
// [10] GRAPH RENDERING ENGINE
// ---------------------------------------------------
// Purpose: Responsible for rendering nodes, edges,
// and labels on the canvas. Preserves node positions,
// applies dragging, zooming, tooltip behavior, and
// updates the simulation tick-by-tick.
// ===================================================

// Rendering the graph
function renderGraph (data, shouldZoom, groupDisplayMap) {

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
    
    //  Restart only if structure changed
    if (shouldZoom) {
        simulation.alpha(1).restart();
    }


    // CREATING ELEMENTS
    const svg = graphState.svg;
    const container = graphState.container;


    // Create edges
    const link = graphState.linkLayer
        .selectAll("line")
        .data(links, d => `${d.source.id}-${d.target.id}`)  
        .join("line")
        .attr("class", "link-edge");


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
        

    // DRAGGING 
    // Node Drag behaviour
    node.call(d3.drag()
        .on("start", (event) => dragstarted(event, simulation))
        .on("drag", dragged)
        .on("end", (event) => dragended(event, simulation)));

    // Label Drag Behaviour
    labels.call(d3.drag()
    .on("start", (event) => dragstarted(event, simulation))
    .on("drag", dragged)
    .on("end", (event) => dragended(event, simulation)));


    // TOOLTIP
    // Hovering Tooltip
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "node-tooltip")

    // Tooltip Animation
    addTooltipBehavior(node, color, tooltip, groupDisplayMap);
    addTooltipBehavior(labels, color, tooltip, groupDisplayMap);

    

    // Updating on tick (animation frame)
    let tickCount = 0;
    let hasZoomed = false;

    simulation.on("tick", () => {
        // Update edge position
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        // Update vertex position
        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

         // Update label position
        labels
            .attr("x", d => d.x)
            .attr("y", d => d.y);   

        
        // Wait for 20 ticks and them zoom in to fit to scale
        if (shouldZoom && !hasZoomed && ++tickCount === 20) {
            hasZoomed = true;
            zoomToFit(svg, nodes, width, height, zoom);
            
        }
    });

    
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
        });
    
    // Apply zoom behaviour
    svg.call(zoom);
    
    // Double click -> Reset zoom
    svg.on("dblclick.zoom", null);
    svg.on("dblclick.zoomToFit", () => zoomToFit(svg, nodes, width, height, zoom));
    
    

    // Updating graph state
    graphState.simulation = simulation;
    graphState.zoom = zoom;
    graphState.nodeSelection = node;
    graphState.linkSelection = link;
    graphState.labelSelection = labels;
    graphState.currentNodes = nodes;
    graphState.currentLinks = links;

};