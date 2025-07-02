// INPUT PART
// Notes Input
const nodesEditor = ace.edit("nodes-input");
nodesEditor.setTheme("ace/theme/monokai");
nodesEditor.session.setMode("ace/mod/plain_text");

// Edges Input
const edgesEditor = ace.edit("edges-input");
edgesEditor.setTheme("ace/theme/monokai");
edgesEditor.session.setMode("ace/mode/plain_text");

// Listeners for user input
nodesEditor.session.on("change", handleEditorInput);
edgesEditor.session.on("change", handleEditorInput);


// Updating graph after 1 sec
let inputTimeout;
function handleEditorInput() {
    clearTimeout(inputTimeout);   // Clear previous timer
    inputTimeout = setTimeout(updateGraphFromInput, 1000);   // 1s delay
}


// Create graph from input
function updateGraphFromInput() {
    // NODES
    // Clearing old markers (errors)
    clearEditorMarkers(nodesEditor, nodeErrorMarkers);
    
    // Getting new data
    const nodeText = nodesEditor.getValue();
    
    // Validating data
    const {validNodes, errors} = validateNodes(nodeText);
    
    // Highlighting Error Lines
    errors.forEach(error => {
        console.log('Error on line:', error.line, nodesEditor.session.getLine(error.line));
        const markerId = nodesEditor.session.addMarker(
            new ace.Range(error.line, 0, error.line, 1),    // Start row, Start col, End row, End col
            'ace_error-line',
            'fullLine',
            false     // false -> Render the marker behind the text
        );
        
        // Saving all the error markers
        nodeErrorMarkers.push(markerId);
    });
    
    
    // EDGES
    // Clearing old markers (errors)
    clearEditorMarkers(edgesEditor, nodeErrorMarkers);
    
    // Getting new data
    const edgeText = edgesEditor.getValue();

    // Validate

    // Highlight
    
    
    
    console.log("Nodes:\n", nodeText);
    console.log("Edges:\n", edgeText);
    
    
    
    // TODO: validate, parse, and render
}

// Store marker IDs to remove later
let nodeErrorMarkers = [];
function clearEditorMarkers(editor, markerIds) {
    markerIds.forEach(id => editor.session.removeMarker(id));
    markerIds.length = 0; // Clear the array in-place
}


// Validating node names
function validateNodes(text) {
    const lines = text.split('\n');          // Getting each node separately
    const errors = [];                       // Keeping track of all errors
    const nodeSet = new Set();               // For unique node names
    const validRegex = /^[a-zA-Z0-9_]+$/;    // For valid node names
    
    
    lines.forEach((rawLine, i) => {
        const line = rawLine.trim();         // Remvoing empty spaces
        
        // Skip empty lines     
        if (!line) return;     // (return -> skip execution for this current line)
    
        // Invalid name
        if (!validRegex.test(line)) {
            errors.push({ line: i, reason: 'Invalid node name' });
        }
        
        // Duplicate name
        else if (nodeSet.has(line)) {
            errors.push({ line: i, reason: 'Duplicate node name' });
        }
        
        // Add node to existing set
        else {
            nodeSet.add(line);
        }
    });
    
    // Returning valid and invalid input
    return {
        validNodes: [...nodeSet],     // Shallow copy of node set
        errors,        // Array of errors (if any) {line: number, reason: string}
    };
}




















// VISUALIZATION PART
// --- Utitlity Functions --- (For Graph Generation)

// Randomizing colors
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Tooltip animation
function addTooltipBehavior(selection, color, tooltip) {
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
                                <div style="color:#46f293;">Group: ${d.group}</div>
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


// ZOOM function
// Find the smallest box that contains all nodes
// and zoom in/out to fit to that
function zoomToFit(svg, nodes, width, height, zoom) {
    // Getting node positions and top-left, bottom-right boundaries
    const xs = nodes.map(d => d.x);
    const ys = nodes.map(d => d.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
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



// GRAPH
d3.json("graph.json").then(function(data) {
    // Dimensions -> Virtual Drawing Area for the Graph (viewBox)
    const width = 928;
    const height = 680;


    // Node color
    const myColors = ["#ff006e", "#ffb703", "#036666", "#6f1d1b", "#5a189a", "#00b4d8", "#ff7f51", "#ffb3c6", "#250902", "#ef233c", "#192bc2"];
    shuffle(myColors);
    // color -> Function that maps groups to colors
    // Assigns dynamically as its called
    // 1st group its called with -> 1st color . . . . and so on
    const color = d3.scaleOrdinal(myColors);  


    // LOADING DATA
    // Creating shallow copy of vertices and edges
    const links = data.links.map(d => ({...d}));
    const nodes = data.nodes.map(d => ({...d}));


    // Randomize initial position between (-w/2, h/2) to  (w/2 to h/2)
    nodes.forEach(d => {
        d.x = (Math.random() - 0.5) * width;
        d.y = (Math.random() - 0.5) * height;
    });


    // Add forces
    const simulation = d3.forceSimulation(nodes)            // Creates physics for the nodes 
        .force("link", d3.forceLink(links).id(d => d.id))   // Spring Force that pulls nodes together
        .force("charge", d3.forceManyBody())                // Repulsive Force
        .force("x", d3.forceX())                            // Centring Force -> pulls towards x = 0
        .force("y", d3.forceY())                            // Centring Force -> pulls towards y = 0


    // CREATING ELEMENTS
    // Create SVG
    const svg = d3.select(".draw-area")
        .append("svg")
        .attr("id", "graph-svg")
        .attr("viewBox", [-width / 2, -height / 2, width, height]);
        // Viewbox goes from (-w/2, -h/2) to (w/2, h/2)   ->   (0, 0) is the centre


    // Cotainer group inside  SVG   (Organization Purposes)
    // Keeping all elements inside a group so transitions (zoom/pan) are easier to apply
    const container = svg.append("g");


    // Create edges
    const link = container.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "link-edge")


    // Create nodes
    const node = container.append("g")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("class", "node-circle")
        .attr("r",5)
        .attr("fill", d => color(d.group))
        .attr("stroke", d => d3.rgb(color(d.group)).darker(1));


    // Create labels
    const labels = container.append("g")
        .selectAll("text")
        .data(nodes)
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
    addTooltipBehavior(node, color, tooltip);
    addTooltipBehavior(labels, color, tooltip);

    

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
        if (!hasZoomed && ++tickCount === 20) {
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
    

    
});