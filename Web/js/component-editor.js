var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.pipeline = com.mobysoft.pipeline || {};

com.mobysoft.pipeline.createPipelineComponentEditor = function( containerSelector, d3 ) {

    var mainContainer = d3.select(containerSelector);
    mainContainer.append('div').text("Component Name").classed("controls-section-header",true);
    var nameInput = mainContainer.append('input')
        .attr('type','text')
        .classed("component-name-input",true)
        .on( 'keyup', function() { onChange(this.value); } );

    var onchangeCallback = null;
    var stateData = null;

    var onChange = function( newName ) {
        if ( stateData && onchangeCallback ) {
            onchangeCallback( stateData.id, newName );
        }
    };
    var render = function() {
        nameInput.property("value", stateData ? stateData.name : "N / A" )
            .attr("disabled", stateData === null || !stateData.editable ? "disabled" : null);
    };

    return {
        initialise: function( callbacks ) {
            onchangeCallback = callbacks.onchange
        },
        show: function( data ) {
            stateData = data;
            render();
        }
    };
};
