// ===================================================
// ERROR HANDLING HELPERS
// ---------------------------------------------------
// Purpose: Provides utility functions to highlight errors
// in the Ace editors, show annotations in the gutter,
// and display error messages below the inputs.
// ===================================================

// Handler : Nodes Input Changed
function handleNodeInput(nodeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput) {
    clearTimeout(nodeInputState.timeout);                             // Clear previous timeout
    clearEditorMarkers(nodesEditor, nodeErrorMarkers);          // Clearing old node markers (errors)
    nodesEditor.session.clearAnnotations();                     // Clearing old gutter annotations
    nodeInputState.timeout = setTimeout(() => {
        updateGraphFromInput(nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, graphTriggers);
    }, 500);   // Update graph after delay
}

// Handler : Edges Input Changed
function handleEdgeInput(edgeInputState, nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, updateGraphFromInput) {
    clearTimeout(edgeInputState.timeout);                             // Clear previous timeout
    clearEditorMarkers(edgesEditor, edgeErrorMarkers);          // Clearing old edge markers (errors)
    edgesEditor.session.clearAnnotations();                     // Clearing old gutter annotations
    edgeInputState.timeout = setTimeout(() => {
        updateGraphFromInput(nodesEditor, edgesEditor, graphState, nodeErrorMarkers, edgeErrorMarkers, groupColorMap, myColors, colorCounter, graphTriggers);
    }, 500);   // Update graph after delay
}

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

export { handleNodeInput, handleEdgeInput, clearEditorMarkers, handleEditorErrors };