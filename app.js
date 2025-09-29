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
    labelSelection: null,       // Current node <text> selections (DOM)
    weightSelection: null,      // Current weight <text> selections (DOM)
    
    // Active graph data
    // Node Format : { id: "A", group: "G1", x: 100, y:100, vx: 200, vy: 200 }
    currentNodes: [],           // Current Node Data
    // Link Format : 
    // Straight Link : { source: "A", target: "B", value: 1, curved: false }
    // Self Link : { source: "A", target: "B", value: 1, curved: false, loopAngle: 0.5 }
    // Curved Link : { source: "A", target: "B", value: 1, curved: true, direction: 1 }  
    currentLinks: [],           // Current Link Data
    // Note : After passing through the simulation, the source and target node strings become entire node objects
    // link : { source: {id: "A", . . .}, target: {id: "B", . . .}, value: 1, . . . }

    // Dimensions
    width: 928,
    height: 680,

     // Graph mode flags
    isWeighted: false,   // Show edge weights
    isDirected: false    // Show arrows for edges
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

// Toggle for weighted edges
document.getElementById('toggle-weighted').addEventListener('click', function() {
    this.classList.toggle('active');
    graphState.isWeighted = this.classList.contains('active');
    updateGraphFromInput();

});

// Toggle for directed edges
document.getElementById('toggle-directed').addEventListener('click', function() {
    this.classList.toggle('active');
    graphState.isDirected = this.classList.contains('active');
    updateGraphFromInput();
    

});


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

// Function to handle all editor error UI updates
function handleEditorErrors(editor, errors, markerArray, containerId) {
    markEditorErrors(editor, errors, markerArray);   // Highlighting Error Lines
    markEditorAnnotation(editor, errors);            // Add Gutter Symbol
    setEditorErrorMessage(containerId, errors);      // Display Error
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
    const seenEdges = new Set();             // Keeping track of all the seen edges (to filter out duplicate edges)
    const validRegex = /^[a-zA-Z0-9_]+$/;    // For valid edge names

    lines.forEach((rawLine, i) => {
        const line = rawLine.trim();          // Remove empty space

        // Skip empty line
        if (!line) return;

        // Separating source and target
        const parts = line.split(/\s+/);

        // Weighted Edges
        if (graphState.isWeighted) {
            // Must be exactly 2 (or 3, with an optional weight)
            if (parts.length < 2 || parts.length > 3) {
                edgeErrors.push({ line: i, reason: 'Edge must have 2 nodes with an optional weight' });
                return;
            }
        } 
        // Unweighted Edges
        else {
            // Must be exactly 2 values
            if (parts.length !== 2) {
                edgeErrors.push({ line: i, reason: 'Edge must have exactly 2 nodes' });
                return;
            }
        }

        // wRaw is undefined, if weight is not given
        const [u, v, wRaw] = parts;

        // Check valid names
        if (!validRegex.test(u) || !validRegex.test(v)) {
            edgeErrors.push({ line: i, reason: 'Invalid node name in edge' });
            return;
        }

        // Check that both nodes exist
        if (!validNodes.includes(u) || !validNodes.includes(v)) {
            edgeErrors.push({ line: i, reason: 'Node in edge does not exist' });
            return;
        }
        
        // Parsing weight (if given, else default 1)
        let weight = 1;
        if (wRaw !== undefined) {
            weight = Number(wRaw);
            if (isNaN(weight)) {
                edgeErrors.push({ line: i, reason: 'Invalid weight (must be a number)' });
                return;
            }
        }

        // Handle duplicate edges
        let key;
        if (graphState.isDirected) {
            key = `${u}->${v}`;
        } else {
            // Undirected edge: normalize A-B and B-A
            key = [u, v].sort().join('--');
        }

        if (seenEdges.has(key)) {
            edgeErrors.push({ line: i, reason: 'Duplicate edge' });
            return;
        }

        seenEdges.add(key);
        // Add valid edge to edges
        edges.push([u, v, weight]); 

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
    validEdges.forEach(([u, v, w]) => {
        graph[u].push({node: v, weight: w});
        if (!graphState.isDirected) {
            graph[v].push({node: u, weight: w});  // Undirected graph
        }
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
        for (const neighbor of graph[u]) {
            union(u, neighbor.node);
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
    // Each edge is unique, even if both directions exist
    const edgePairs = new Set();
    const result = [];

    for (const [source, target, w] of validEdges) {
        let curved = false;
        let direction = 0;

        // If the reverse edge exists, make both curved
        const reverseKey = `${target}->${source}`;
        const key = `${source}->${target}`;
        if (edgePairs.has(reverseKey)) {
            curved = true;
            direction = 1;
            // Update the previous edge to be curved too
            const prev = result.find(e => e.source === target && e.target === source);
            if (prev) {
                prev.curved = true;
                prev.direction = -1;
            }
        }
        edgePairs.add(key);
        result.push({ source, target, value: w, curved, direction });
    }

    return result;
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
    handleEditorErrors(nodesEditor, nodeErrors, nodeErrorMarkers, "nodes-error-msg");

    
    
    // EDGES
    const edgeText = edgesEditor.getValue();                                 // Fetching new data
    const {validEdges, edgeErrors} = validateEdges(edgeText, validNodes);    // Validating data

    // ERROR HANDLING
    handleEditorErrors(edgesEditor, edgeErrors, edgeErrorMarkers, "edges-error-msg");




    // PARSING AND GROUPING
    const graph = buildAdjacencyList(validNodes, validEdges);   // Creating adjacency list from input
    const groupedNodes = assignGroups(validNodes, graph);       // Grouping and formatting nodes { id: "A", group: "Root_node"}
    const links = formatEdges(validEdges);                      // Formatting edges
    const graphData = { nodes: groupedNodes, links: links };    // Formatting Graph Data



    
    // ASIGNING COLORS AND DISPLAY GROUPS
    // Getting set of unique groups
    const allGroups = [...new Set(groupedNodes.map(d => d.group))];

    // Assigning color to new groups
    allGroups.forEach(assignGroupColor);

    // Map group ID -> Display Group Number (1-based index)
    let groupDisplayMap = {};
    allGroups.forEach((group, index) => {
        groupDisplayMap[group] = index + 1;
    });

    // Remove colors for groups no longer used
    cleanupGroupColors(allGroups);

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
    myColors = initColorPalette()

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

// Initialize the color palette
function initColorPalette() {
    return shuffle([
        "#ff006e", "#ffb703", "#036666", "#6f1d1b", "#5a189a",
        "#00b4d8", "#ff7f51", "#ffb3c6", "#250902", "#ef233c", "#192bc2"
    ]);
}

// Assign a color to a group if not already assigned
function assignGroupColor(group) {
    if (!(group in groupColorMap)) {
        groupColorMap[group] = myColors[colorIndexCounter % myColors.length];
        colorIndexCounter++;
    }
}

// Remove colors for groups no longer used
function cleanupGroupColors(allGroups) {
    Object.keys(groupColorMap).forEach(group => {
        if (!allGroups.includes(group)) {
            delete groupColorMap[group];
        }
    });
}

// Tooltip animation on hover
let tooltipTimeout = null;
function addTooltipBehavior(selection, color, tooltip, groupDisplayMap) {

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

// Helps rotate a point about a centre by some angle
function rotatePoint(p1x, p1y, cx, cy, angleDeg) {
    const angleRad = angleDeg * Math.PI / 180;

    // Vector going from center to point 
    const dx = p1x - cx;
    const dy = p1y - cy;

    // Apply Rotation
    // Rotation of vector in 2D Plane formula : 
    // x_new = x*cos(θ) - y*sin(θ)
    // y_new = x*sin(θ) + y*cos(θ)
    const qx = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
    const qy = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

    // Translate back
    return {
        x: qx + cx,
        y: qy + cy
    };
}

// Helps calculating the coordinates of the arrowhead for directed graphs
function updateArrowheads(arrowSelection) {
    arrowSelection.attr("points", d => {
        // Arrowhead dimensions and position
        const arrowLength = 4.5;
        const arrowWidth = 5;
        const offset = 4.48;    // Offset from node center

        // Arrow Coordinates
        let p1, p2, p3;

        // SELF EDGE
        if (d.source.id === d.target.id) {
            // Same values as updateLinkPaths
            const cx = d.source.x;
            const cy = d.source.y;
            const loopRadius = 7.5;
            const loopOffset = 7.5;

            // Offset loop center in direction of d.loopAngle (already computed in updateLinkPaths)
            const offsetX = cx + loopOffset * Math.cos(d.loopAngle ?? -Math.PI / 2);
            const offsetY = cy + loopOffset * Math.sin(d.loopAngle ?? -Math.PI / 2);

            // Vector from loop center to node center
            const dx = cx - offsetX;
            const dy = cy - offsetY;
            const mag = Math.sqrt(dx*dx + dy*dy);
            // Unit vector
            const ux = dx / mag;
            const uy = dy / mag;

            // Starting point on circle (toward node)
            const startX = offsetX + ux * loopRadius;
            const startY = offsetY + uy * loopRadius;

            // Opposite point on circle (180° away)
            const oppX = offsetX - ux * loopRadius;
            const oppY = offsetY - uy * loopRadius;

            // Build circle path starting at node-facing side
            const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            tempPath.setAttribute("d", `
                M ${startX},${startY}
                A ${loopRadius},${loopRadius} 0 1,1 ${oppX},${oppY}
                A ${loopRadius},${loopRadius} 0 1,1 ${startX},${startY}
            `);

            // Path length
            const pathLength = tempPath.getTotalLength();

            // Get points slightly inside the end of the loop
            const tip = tempPath.getPointAtLength(pathLength - offset);
            const back = tempPath.getPointAtLength(pathLength - offset - 1);

            // Tangent vector
            const tx = tip.x - back.x;
            const ty = tip.y - back.y;
            const tMag = Math.sqrt(tx * tx + ty * ty);

            // Normalize tangent (Unit vector)
            const unitX = tx / tMag;
            const unitY = ty / tMag;

            // Perpendicular (Unit vector)
            const perpX = -unitY;
            const perpY = unitX;

            // Coordinates
            p1 = tip;
            const rawP2 = {
                x: p1.x - arrowLength * unitX + (arrowWidth / 2) * perpX,
                y: p1.y - arrowLength * unitY + (arrowWidth / 2) * perpY
            };
            const rawP3 = {
                x: p1.x - arrowLength * unitX - (arrowWidth / 2) * perpX,
                y: p1.y - arrowLength * unitY - (arrowWidth / 2) * perpY
            };

            // Slightly rotate the base for aesthetics
            const baseRotation = -9;
            p2 = rotatePoint(rawP2.x, rawP2.y, p1.x, p1.y, baseRotation);
            p3 = rotatePoint(rawP3.x, rawP3.y, p1.x, p1.y, baseRotation);
        }

        // STRAIGHT EDGES
        else if (!d.curved) {
            // Calculate horizontal and vertical distance between target and source nodes
            // (dx, dy) -> Direction vector  (source -> target)
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            // Calculating edge length (vector magnitude)
            const len = Math.sqrt(dx * dx + dy * dy);
    
            // Unit vector in the direction of the edge line
            // (dx/len, dy/len) -> Unit vector in the direction of (dx, dy)
            const unitX = dx/len;
            const unitY = dy/len;
            
            // Finding the tip of the arrowhead
            // (unitX*offset, unitY*offset) -> Unit vector scaled by offset
            const tipX = d.target.x - unitX*offset;
            const tipY = d.target.y - unitY* offset;
    
            // Perpendicular unit vector to the given edge line
            // (perpX, perpY) -> Unit vector perpendicular to (dx, dy) (90 degree counter clockwise)
            const perpX = -dy/len;
            const perpY = dx/len;
    
            // Coordinate 1
            p1 = {
                x: tipX,
                y: tipY
            };
            // Coordinate 2
            // tipX - (arrowLength * unitX) + (perpX * arrowWidth/2)
            // original place -> go downwards by arrowLength -> go perpendicular by arrowWidth/2
            p2 = {
                x: tipX - unitX*arrowLength + perpX*(arrowWidth/2),
                y: tipY - unitY*arrowLength + perpY*(arrowWidth/2)
            };
            // Coordinate 3
            // tipX - (arrowLength * unitX) - (perpX * arrowWidth/2)
            // original place -> go downwards by arrowLength -> go perpendicular by arrowWidth/2 in the other direction
            p3 = {
                x: tipX - unitX*arrowLength - perpX*(arrowWidth/2),
                y: tipY - unitY*arrowLength - perpY*(arrowWidth/2)
            };

        }

        // CURVED EDGES
        // Align the arrow with the tangent at the point where the bezier curve just leaves the node boundary
        else {
            // (dx, dy) -> Difference between nodes (Direction vector from source to target)
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            // Temporary path to simulate the actual path for simulation
            const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const dr = Math.sqrt(dx * dx + dy * dy) / 1.5; // Path radius    (1.5) -> constant
            tempPath.setAttribute("d", `M${d.source.x},${d.source.y} A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`);

            // Getting the a point from the end of the curve that is offset away and offset-1 away
            // so that we can calculate a tangent
            const pathLength = tempPath.getTotalLength();
            const tip = tempPath.getPointAtLength(pathLength - offset);
            const back = tempPath.getPointAtLength(pathLength - offset - 1);

            // Calculating tangent vector
            const tx = tip.x - back.x;
            const ty = tip.y - back.y;
            // Magnitude of tangent vector
            const tMag = Math.sqrt(tx * tx + ty * ty);

            // Unit vector in the direction of tangent vector
            const unitX = tx / tMag;
            const unitY = ty / tMag;

            // Unit vector perpendicular to tangent vector (90 degree counter clockwise)
            const perpX = -unitY;
            const perpY = unitX;


            // Coordinate 1
            p1 = tip;

            // Raw Coordinates 2 and 3
            // Same logic as straight edge
            const rawP2 = {
                x: p1.x - arrowLength * unitX + (arrowWidth / 2) * perpX,
                y: p1.y - arrowLength * unitY + (arrowWidth / 2) * perpY
            };
            const rawP3 = {
                x: p1.x - arrowLength * unitX - (arrowWidth / 2) * perpX,
                y: p1.y - arrowLength * unitY - (arrowWidth / 2) * perpY
            };

            // Rotating the base about the node center (better visual)
            const baseRotation = -3;  
            // Rotated Coordinates 2 and 3
            p2 = rotatePoint(rawP2.x, rawP2.y, p1.x, p1.y, baseRotation);
            p3 = rotatePoint(rawP3.x, rawP3.y, p1.x, p1.y, baseRotation);
        }
        


        return `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;
    })
    .style("fill", "#46f293")
    .style("visibility", graphState.isDirected ? "visible" : "hidden");
}

// Helps creating bezier curved edges, self loops, and straight edges
function updateLinkPaths(link) {
    link.attr("d", d => {
        
        // SELF-LOOP
        if (d.source.id === d.target.id) {
            // Center of the node
            const { x: cx, y: cy } = d.source;
            const loopRadius = 7.5;
            const loopOffset = 7.5;

            // Find all other connected edges (via raw data OR formatted D3 data id)
            const connectedEdges = graphState.currentLinks.filter(e =>
                (e.source.id || e.source) === d.source.id && e.target.id !== d.source.id ||
                (e.target.id || e.target) === d.source.id && e.source.id !== d.source.id
            );

            // Finding all the angles between current node and neighbors
            let angles = connectedEdges.map(e => {
                // Finding all the other connected node
                const otherNode = (e.source.id || e.source) === d.source.id ? e.target : e.source;
                // Finding the coords of the other node
                const ox = otherNode.x ?? 0;
                const oy = otherNode.y ?? 0;
                // Angle between the other nodes and the current nodes' center
                // (All angles are between -π and +π)
                return Math.atan2(oy - cy, ox - cx);   // atan2 -> returns tan inverse with sign 
            });

            // Sort angles  (So they are in clockwise manner from -π to +π)
            angles.sort((a, b) => a - b);

            // Find largest gap between consecutive edges
            let maxGap = 0;
            let bestAngle = -Math.PI / 2; // default angle -> Upwards
            if (angles.length > 0) {
                for (let i = 0; i < angles.length; i++) {
                    // First angle
                    const a1 = angles[i];
                    // Second angle (wrap around for the last angle to match with the very first angle)
                    // Add 2π to the very first angle (wrap around) when calculating gap with the last angle
                    const a2 = angles[(i + 1) % angles.length] + (i+1 === angles.length ? Math.PI * 2 : 0);
                    const gap = a2 - a1;
                    if (gap > maxGap) {
                        maxGap = gap;
                        bestAngle = a1 + gap / 2;  // Best angle is midway in the largest gap
                    }
                }
            }

            // Smooth interpolation between old and new angles
            // Adding link angle
            if (d.loopAngle === undefined) d.loopAngle = bestAngle;
            // Linear Interpolation Factor (Defines how quickly the loop moves to match the best angle)
            // Say, 0.15 -> move 15% of the entire way
            const lerpFactor = 0.09; // smaller = smoother
            let diff = bestAngle - d.loopAngle;

            // Normalize to shortest rotation (Keep the angle between -π and +π)
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;

            // Moving towards the desired angle on each tick (by lerpFactor)
            // (diff already takes care of sign/direction)
            d.loopAngle += (diff*lerpFactor);

            // Offset the loop’s circle center from the node in bestAngle direction
            // (cos(d.loopAngle), sin(d.loopAngle)) -> Unit vector in the direction of d.loopAngle
            // Offset Vector = Center Vector + (loopOffset * Unit vector in direction of d.loopAngle)
            const offsetX = cx + loopOffset * Math.cos(d.loopAngle);
            const offsetY = cy + loopOffset * Math.sin(d.loopAngle);
            // So (offsetX, offsetY) -> Center of the loop

            // Draw a full circle using two arcs
            // M -> Move pen to (offsetX + loopRadius, offsetY) -> Rightmost point on the circle
            // A -> draw arc 
            // First draw an arc from the rightmost point towards the leftmost point
            // Then draw an arc from the leftmost point towards the rightmost point
            return `
                M ${offsetX + loopRadius},${offsetY}
                A ${loopRadius},${loopRadius} 0 1,1 ${offsetX - loopRadius},${offsetY}
                A ${loopRadius},${loopRadius} 0 1,1 ${offsetX + loopRadius},${offsetY}
            `;

        }



        const { x: x1, y: y1 } = d.source;
        const { x: x2, y: y2 } = d.target;

        // STRAIGHT EDGE
        if (!d.curved) {
            // M -> moves the pen to x1, y1
            // L -> draws a line till x2, y2
            return `M${x1},${y1} L${x2},${y2}`;  // straight edge
        }

        // CURVED EDGE
        // vector from source to target
        const dx = x2 - x1;
        const dy = y2 - y1;
        // Curve radius
        const dr = Math.sqrt(dx * dx + dy * dy) / 1.5;   // (1.5) -> constant
        const sweep = 1   // Bend clockwise

        // M -> moves pen to x1, y1
        // A -> draw an arc
        // A -> radii of the ellipse, x-axis rotation, short arc, sweep direction, destination (x2,y2)
        return `M${x1},${y1} A${dr},${dr} 0 0,${sweep} ${x2},${y2}`;
    });
}



// Finding the position of the weighted label for straight edegs, curved edges and self loops
function getEdgeWeightPos(d) {
    // Self-loop
    if (d.source.id === d.target.id) {
        const loopRadius = 7.5;
        const loopOffset = 7.5;
        const cx = d.source.x;
        const cy = d.source.y;
        const angle = d.loopAngle ?? -Math.PI / 2;

        // Position for the weight: move loopOffset + loopRadius in the angle direction
        return {
            x: cx + (loopOffset + loopRadius) * Math.cos(angle),
            y: cy + (loopOffset + loopRadius) * Math.sin(angle)
        };
    }

    // Curved edge
    if (d.curved) {
        const { x: x1, y: y1 } = d.source;
        const { x: x2, y: y2 } = d.target;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dr = Math.sqrt(dx * dx + dy * dy) / 1.5;    // Curve Radius

        // Rebuild the same path string as updateLinkPaths
        const pathStr = `M${x1},${y1} A${dr},${dr} 0 0,1 ${x2},${y2}`;

        // Create a temp path element to measure
        const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempPath.setAttribute("d", pathStr);

        // Going to the midpoint 
        const pathLength = tempPath.getTotalLength();
        const midpoint = tempPath.getPointAtLength(pathLength / 2);

        return { x: midpoint.x , y: midpoint.y };
    }
    


    
    // Straight edge
    return {
        x: (d.source.x + d.target.x) / 2,
        y: (d.source.y + d.target.y) / 2
    };
}


// Helps updating the weight label positions
function updateWeightLabels() {
    if (graphState.weightSelection) {
        graphState.weightSelection
            .attr("x", d => getEdgeWeightPos(d).x)
            .attr("y", d => getEdgeWeightPos(d).y)
            .text(d => graphState.isWeighted ? (d.value ?? 1) : "")  // update text dynamically
            .style("display", graphState.isWeighted ? "block" : "none");  // Hide dynamically
    }
}


// ===================================================
// [10] GRAPH RENDERING ENGINE
// ---------------------------------------------------
// Purpose: Responsible for rendering nodes, edges,
// and labels on the canvas. Preserves node positions,
// applies dragging, zooming, tooltip behavior, and
// updates the simulation tick-by-tick.
// ===================================================

let directedTrigger = false;
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
    
    //  Restart only if structure changed or directedToggle for first time
    if (shouldZoom || (graphState.isDirected && !directedTrigger)) {
        simulation.alpha(1).restart();
    }

    // Toggling directedTrigger
    directedTrigger = graphState.isDirected;


    

    // CREATING ELEMENTS
    const svg = graphState.svg;


    // Create edges
    const link = graphState.linkLayer
        .selectAll("path")
        .data(links, d => `${d.source.id}-${d.target.id}`)  
        .join("path")
        .attr("class", "link-edge")

    // Static update for edges
    updateLinkPaths(link);
    
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
    updateArrowheads(arrow);
    
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
    updateWeightLabels();
        

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
    const tooltip = d3.select(".node-tooltip");

    // Tooltip Animation
    addTooltipBehavior(node, color, tooltip, groupDisplayMap);
    addTooltipBehavior(labels, color, tooltip, groupDisplayMap);

    

    // Updating on tick (animation frame)
    let tickCount = 0;
    let hasZoomed = false;

    simulation.on("tick", () => {
        // Update edge position
        updateLinkPaths(link);


        // Update vertex position
        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

         // Update label position
        labels
            .attr("x", d => d.x)
            .attr("y", d => d.y);   


        // Update arrow position and orientation (dynamic update)
        updateArrowheads(arrow);

        // Update weights position (dynamic update)
        updateWeightLabels();

        
        // Wait for 20 ticks and them zoom in to fit to scale
        if (shouldZoom && !hasZoomed && ++tickCount === 20) {
            hasZoomed = true;
            zoomToFit(svg, nodes, width, height, zoom);
            
        }
    });

    
    
    // Setting up zoom behaviour
    const zoom = graphState.zoom;
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





