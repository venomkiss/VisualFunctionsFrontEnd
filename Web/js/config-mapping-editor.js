var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.pipeline = com.mobysoft.pipeline || {};

com.mobysoft.pipeline.createConfigMappingEditor = function( containerSelector, d3 ) {

    var mainContainer = d3.select(containerSelector);
    var header = mainContainer.append( 'div' ).classed( 'config-mapping-editor-header', true ).text('All Config Mappings');
    var body = mainContainer.append( 'div' ).classed( 'config-mapping-editor-body', true );
    var state = null;

    var callbacks = {};

    var render = function() {
        body.datum( state );

        var configMappings = d3.entries(state.getConfigMappings().reduce( function(ret,cm) {
            ( ret[cm.externalKey] || (ret[cm.externalKey] = []) ).push( cm );
            return ret;
        }, {} )).map( function(externalKeyEntry) {
            return {
                externalConfigKey: externalKeyEntry.key,
                mapTo: externalKeyEntry.value
            };
        } );

        var keySectionSelection = body.selectAll('div.key-section').data( function(d) {
            return configMappings;
        } );
        keySectionSelection.enter().append('div')
            .classed('key-section',true)
            .each( function(d) {
                var keySection = d3.select(this);
                var keyNameSpan = keySection.append('span');
                keyNameSpan.append('input').classed('config-mapping-editor-key-input',true).attr('data-element-type','key-name');
                keySection.append('span').append('div');
            } ).merge( keySectionSelection ).each( function(d) {
                var keySection = d3.select(this);
                keySection.select('input')
                    .attr("disabled", state.getEditState() == "editable" ? null : "disabled" )
                    .each( function(d) {
                        var e = d3.select(this);
                        if ( d.externalConfigKey !== e.property('value') ) {
                            e.property('value', d.externalConfigKey);
                        }

                    } )
                    .on( 'keyup', function(d) {
                        var oldValue = d.externalConfigKey, newValue = d3.select(this).property('value');
                        if ( callbacks.onExternalKeyNameChange && oldValue !== newValue ) {
                            callbacks.onExternalKeyNameChange( oldValue, newValue );
                        }
                    } );
                var mappingsContainer = keySection.select('div');
                var mappingsSelection = mappingsContainer.selectAll('div').data( function(d) {
                    return d.mapTo;
                } );
                mappingsSelection.enter().append('div')
                    .each( function(d) {
                        var mappingContainer = d3.select(this);
                        mappingContainer.append('button')
                            .text("Remove")
                            .attr('data-element-type','remove-button')
                            .classed('config-mapping-remove-button',true);
                        mappingContainer.append('input')
                            .classed('component-name-input',true)
                            .attr('data-element-type','component-name')
                            .property('disabled','disabled');
                        mappingContainer.append('input')
                            .classed('config-key-input',true)
                            .attr('data-element-type','config-key')
                            .property('disabled','disabled');
                    } ).merge( mappingsSelection ).each( function(d) {
                        var mappingContainer = d3.select(this);
                        mappingContainer.select('button')
                            .attr("disabled", state.getEditState() == "editable" ? null : "disabled" );
                        mappingContainer.select('input[data-element-type="component-name"]')
//                            .attr("disabled", state.getEditState() == "editable" ? null : "disabled" )
                            .attr("disabled", "disabled" )
                            .property('value',d => state.getComponentMap()[d.componentId].getName());
                        mappingContainer.select('input[data-element-type="config-key"]')
//                            .attr("disabled", state.getEditState() == "editable" ? null : "disabled" )
                            .attr("disabled", "disabled" )
                            .property('value',d => state.getComponentMap()[d.componentId].getConfig()[d.configKey].display);
                    } );
                mappingsSelection.exit().remove();
            } );
        keySectionSelection.exit().remove();
    };

    var setState = function( pipelineState ) {
        state = pipelineState;
        render();
    };

    return {
        initialise: function( _callbacks ) { callbacks = _callbacks; },
        setState: setState
    };
};