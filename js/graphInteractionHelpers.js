// ===================================================
// GRAPH INTERACTION & LAYOUT UTILITIES
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
function assignGroupColor(group, groupColorMap, myColors, colorCounter) {
    if (!(group in groupColorMap)) {
        groupColorMap[group] = myColors[colorCounter.index % myColors.length];
        colorCounter.index++;
    }
}

// Remove colors for groups no longer used
function cleanupGroupColors(allGroups, groupColorMap) {
    Object.keys(groupColorMap).forEach(group => {
        if (!allGroups.includes(group)) {
            delete groupColorMap[group];
        }
    });
}


// Tooltip animation on hover
function addTooltipBehavior(selection, color, tooltip, groupDisplayMap, tooltipState, dragState) {

    selection
        .on("mouseover", (event, d) => {
            if (dragState.isDragging) return;          // No tooltip when hovering
            
            // Storing the setTimeout in a variable (so we can cancel it if needed)
            tooltipState.timeout = setTimeout(() => {
                if (dragState.isDragging) return;      // No tooltip if hovering when animation is in progress
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
            }, 600);
        })
        .on("mousemove", (event) => {
            tooltip
                .style("left", `${event.pageX + 24}px`)  // Updating tooltip position on every move
                .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", () => {
            clearTimeout(tooltipState.timeout);         // Clearing any remaining tooltip animation

            tooltip
                .style("opacity", 0)
                .style("transform", "translateY(8px)");
        });
}

// event.active
// > 0   ->	At least one drag is ongoing
// == 0  ->	No drag is active (this is the last one ending)

// When drag starts
function dragstarted(event, simulation, tooltipState, dragState) {
    dragState.isDragging = true;
    // If first drag (no other drags currently active) -> Simulation gains energy
    if (!event.active) simulation.alphaTarget(0.3).restart();   
    // Fixing nodes at current position
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // Hide tooltip if dragging starts
    d3.select(".node-tooltip")
        .style("opacity", 0)
        .style("transform", "translateY(8px)");
    clearTimeout(tooltipState.timeout);          // clears all delayed tooltip
}

// When dragging
function dragged(event) {
    // Moving nodes with the mouse
    event.subject.fx = event.x;
    event.subject.fy = event.y;
}

// When drag ends
function dragended(event, simulation, dragState) {
    dragState.isDragging = false;
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
function updateArrowheads(arrowSelection, graphState) {
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
function updateLinkPaths(link, graphState) {
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
function updateWeightLabels(graphState) {
    if (graphState.weightSelection) {
        graphState.weightSelection
            .attr("x", d => getEdgeWeightPos(d).x)
            .attr("y", d => getEdgeWeightPos(d).y)
            .text(d => graphState.isWeighted ? (d.value ?? 1) : "")  // update text dynamically
            .style("display", graphState.isWeighted ? "block" : "none");  // Hide dynamically

        // Update background circle position
        if (graphState.weightBgSelection) {
            graphState.weightBgSelection
                .attr("cx", d => getEdgeWeightPos(d).x)
                .attr("cy", d => getEdgeWeightPos(d).y)
                .style("display", graphState.isWeighted ? "block" : "none");
        }
    }
}





// Build adjacency: nodeId -> Set of neighbors
// (For highlight functions and faster in retrieving neighbors because of sets)
// (This adjacency list is just to find neighbors of each node (don't care about weights) -> Can use buildAdjacencyList function here as well, might change later)
// (Graphs working copy of UI)
function buildAdjacencyNeighbor(links, graphState) {
    const adjacency = new Map();
    links.forEach(l => {
        const s = l.source.id || l.source;
        const t = l.target.id || l.target;

        // Directed Edges
        if (graphState.isDirected) {
            if (!adjacency.has(s)) adjacency.set(s, new Set());
            adjacency.get(s).add(t);
        }

        // Undirected Edges
        else {
            if (!adjacency.has(s)) adjacency.set(s, new Set());
            if (!adjacency.has(t)) adjacency.set(t, new Set());
            adjacency.get(s).add(t);
            adjacency.get(t).add(s);
        }
    });
    return adjacency;
}

// Apply highlight on one node + its neighbors
function applyHighlight(targetId, adjacency, graphState) {
    const neighbors = adjacency.get(targetId) || new Set();
    const highlightDuration = 200; // milliseconds
    const isDirected = graphState.isDirected;

    // Nodes and node labels
    graphState.nodeSelection.transition().duration(highlightDuration)
        .style("opacity", d => (d.id === targetId || neighbors.has(d.id)) ? 1 : 0.1);

    graphState.labelSelection.transition().duration(highlightDuration)
        .style("opacity", d => (d.id === targetId || neighbors.has(d.id)) ? 1 : 0.1);


    // Link, arrow, weight highlight
    const linkOpacity = d => {
        if (isDirected) return (d.source.id === targetId) ? 1 : 0.1;        // only outgoing
        else return (d.source.id === targetId || d.target.id === targetId) ? 1 : 0.1; // undirected
    };


    graphState.linkSelection.transition().duration(highlightDuration)
        .style("opacity", linkOpacity);

    graphState.linkLayer.selectAll(".edge-arrow").transition().duration(highlightDuration)
        .style("opacity", linkOpacity);

    graphState.weightSelection.transition().duration(highlightDuration)
        .style("opacity", linkOpacity);

    graphState.weightBgSelection.transition().duration(highlightDuration)
        .style("opacity", linkOpacity);
}

// Reset highlight (everything visible)
function resetHighlight(graphState) {
    let unhighlightDuration = 200;  // milliseconds
    graphState.nodeSelection.transition().duration(unhighlightDuration).style("opacity", 1);
    graphState.labelSelection.transition().duration(unhighlightDuration).style("opacity", 1);
    graphState.linkSelection.transition().duration(unhighlightDuration).style("opacity", 1);
    graphState.linkLayer.selectAll(".edge-arrow").transition().duration(unhighlightDuration).style("opacity", 1);
    graphState.weightSelection.transition().duration(unhighlightDuration).style("opacity", 1);
    graphState.weightBgSelection.transition().duration(unhighlightDuration).style("opacity", 1);
}


export { initColorPalette, assignGroupColor, cleanupGroupColors, 
         addTooltipBehavior,
         dragstarted, dragged, dragended,
         zoomToFit,
         updateArrowheads, updateLinkPaths, updateWeightLabels,
         buildAdjacencyNeighbor, applyHighlight, resetHighlight
}; 