// ===================================================
// [1] CONFIGURATION & GLOBAL STATE
// ---------------------------------------------------
// Purpose: Holds simulation state, group colors, and error markers
// Shared by rendering, parsing, and validation logic
// ===================================================

// Tracks the state of the graph visualization
const graphState = {
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
    weightBgSelection: null,    // Current weight background <circle> selections (DOM)
    lastHighlightedNode: null,  // Used for keeping track of last highlihgted node
    
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
let colorCounter = { index: 0 };       // Track number of groups




// ===================================================
// [2] ACE EDITOR SETUP
// ---------------------------------------------------
// Purpose: Sets up editors for node and edge input,
// initializes Ace themes and modes.
// ===================================================

// Nodes Input Editor
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

import { handleNodeInput, handleEdgeInput } from "./editorHelper.js";

// Debounce timers for delayed validation
let nodeInputState = { timeout: null }
let edgeInputState = { timeout: null }

// Attach listeners to editors
nodesEditor.session.on("change", () => {
    handleNodeInput(nodeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput);
});
edgesEditor.session.on("change", () => {
    handleEdgeInput(edgeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput);
});

// Toggle for weighted edges
document.getElementById('toggle-weighted').addEventListener('click', function() {
    this.classList.toggle('active');
    graphState.isWeighted = this.classList.contains('active');
    updateGraphFromInput(nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, graphTriggers, tooltipState, dragState);

});

// Toggle for directed edges
document.getElementById('toggle-directed').addEventListener('click', function() {
    this.classList.toggle('active');
    graphState.isDirected = this.classList.contains('active');
    updateGraphFromInput(nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, graphTriggers, tooltipState, dragState);
    

});

// ===================================================
// [4] ERROR HANDLING HELPERS
// ---------------------------------------------------
// Purpose: Provides utility functions to highlight errors
// in the Ace editors, show annotations in the gutter,
// and display error messages below the inputs.
// ===================================================

// ===================================================
// [5] INPUT PARSING & VALIDATION
// ---------------------------------------------------
// Purpose: Parses and validates user input for nodes
// and edges, assigns groups using DSU, and formats
// the data into a usable graph structure.
// ===================================================

// ===================================================
// [6] GRAPH DATA UPDATE HANDLING
// ---------------------------------------------------
// Purpose: Detects changes in input structure, validates
// new data, parses it, assigns group colors, and triggers
// a re-render of the graph.
// ===================================================

import { updateGraphFromInput } from "./graphUpdateHelper.js";



// ===================================================
// [7] GRAPH CANVAS INITIALIZATION
// ---------------------------------------------------
// Purpose: Sets up the SVG element, container group,
// simulation instance, and separate layers for links,
// nodes, and labels. Called once before first render.
// ===================================================

import { setupGraphCanvas } from "./graphCanvasHelper.js";




// ===================================================
// [8] INITIAL GRAPH LOAD
// ---------------------------------------------------
// Purpose: Loads default graph from graph.json,
// populates editors, randomizes initial colors, and
// performs the first render before enabling input.
// ===================================================

// Load default graph from graph.json
d3.json("/data/graph.json").then((data) => {
    // Extract node and edge data
    const nodeText = data.nodes.map(d => d.id).join('\n');
    const edgeText = data.links.map(d => `${d.source} ${d.target}`).join('\n');

    // Detach input handlers
    nodesEditor.session.off("change", () => {
        handleNodeInput(nodeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput);
    });
    edgesEditor.session.off("change", () => {
        handleEdgeInput(edgeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput);
    });

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
    setupGraphCanvas(graphState.width, graphState.height, graphState); 
    // Manually render once
    updateGraphFromInput(nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, graphTriggers, tooltipState, dragState, true);   // true -> zoom on first load

    // Reattach handlers for user input
    nodesEditor.session.on("change", () => {
        handleNodeInput(nodeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput);
    });
    edgesEditor.session.on("change", () => {
        handleEdgeInput(edgeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput);
    });

});




// ===================================================
// [9] GRAPH INTERACTION & LAYOUT UTILITIES
// ---------------------------------------------------
// Purpose: Handles drag behavior, tooltips, zoom/pan,
// bounding box calculations, and color shuffling.
// Supports interactive layout and rendering logic.
// ===================================================

import { 
    initColorPalette, 
} from "./graphInteractionHelpers.js";

// Tooltip animation on hover
let tooltipState = { timeout: null };

// DRAG FUNCTIONS
let dragState = { isDragging: false }; 
// event.active
// > 0   ->	At least one drag is ongoing
// == 0  ->	No drag is active (this is the last one ending)



// ===================================================
// [10] GRAPH RENDERING ENGINE
// ---------------------------------------------------
// Purpose: Responsible for rendering nodes, edges,
// and labels on the canvas. Preserves node positions,
// applies dragging, zooming, tooltip behavior, and
// updates the simulation tick-by-tick.
// ===================================================

let graphTriggers = {
    directedTrigger: false,
    highlightedTrigger: false
}




function destroyCurrentMode() {
    // Clear everything inside draw area / svg
    d3.select(".draw-area").selectAll("*").remove();
    graphState.svg = null;
}

function initGraphMode() {
    // Intial Graph setup
    setupGraphCanvas(graphState.width, graphState.height, graphState); 
    // Manually render once
    updateGraphFromInput(nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, graphTriggers, tooltipState, dragState, true);   // true -> zoom on first load

}

function initTreeMode() {
    // later: setupTreeCanvas(), renderTree(), etc
}

const toggle = document.querySelector(".mode-toggle");
const tabs = toggle.querySelectorAll(".tab");
const slider = toggle.querySelector(".slider");

let isGraph = true; // initially Graph selected

toggle.addEventListener("click", () => {
    isGraph = !isGraph;

    destroyCurrentMode();

    if (isGraph) {
        slider.style.transform = "translateX(0%)";
        tabs[0].classList.add("active");
        tabs[1].classList.remove("active");
        initGraphMode();
    } else {
        slider.style.transform = "translateX(100%)";
        tabs[1].classList.add("active");
        tabs[0].classList.remove("active");
        initTreeMode();
    }
});


// Tracks the state of the graph visualization
const treeState = {
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
    weightBgSelection: null,    // Current weight background <circle> selections (DOM)
    
    // Active graph data
    // Node Format : { id: "A", x: 100, y:100, vx: 200, vy: 200 }
    currentNodes: [],           // Current Node Data
    // Link Format : 
    // Straight Link : { source: "A", target: "B", value: 1, curved }
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
};
