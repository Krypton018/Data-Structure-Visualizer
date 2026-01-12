// ===================================================
// INPUT PARSING & VALIDATION
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
function validateGraphEdges(text, validNodes, graphState) {
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
// (This adjacency list is for representing graph data)
function buildAdjacencyList(validNodes, validEdges, graphState) {
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

export { validateNodes, validateGraphEdges, buildAdjacencyList, assignGroups, formatEdges };