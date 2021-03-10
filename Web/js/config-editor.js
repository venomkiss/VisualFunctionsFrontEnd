var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.pipeline = com.mobysoft.pipeline || {};

com.mobysoft.pipeline.createConfigEditor = function( containerSelector, d3 ) {

    var self = this;

    var mainContainer = d3.select(containerSelector);

    var callbacks = {};

    var State = (function(){

        var id;
        var sections = [];
        var editable = true;

        return {
            setId: function(_id) { id = _id; },
            getId: function() { return id; },
            setSections: function( sectionDefinitions ) {
                sections = sectionDefinitions ? sectionDefinitions : [];
            },
            getSections: function() { return sections; },
            setEditable: function(newEditState) {editable = newEditState;},
            getEditable: function(){return editable;}
        };
    }());

    var makeChangeCallback = function( propertyId, value ) {

        var config = State.getSections().find(x => x.sectionName ==="Component Config Properties");
        var onChangeData = { stateId: State.getId(), propertyId: propertyId, value: value };
        if ( config ) {
            var props = config.properties.find(y=>y.id === propertyId);
            if ( props && props.onChange) {
                onChangeData = props.onChange( onChangeData );
            }
        }

        var newState = callbacks.onChange( onChangeData );
        if ( newState ) {
            setState(newState);
        }
    };

    var addInput = function(container,d) {
        switch ( d.type ) {
            case "text":
                if ( d.editable ) {
                    container.append('input')
                        .attr('type','text')
                        .classed("config-editor-text-input", true)
                        .on( 'keyup', function(d) {
                            makeChangeCallback( d.id, this.value );
                        } );
                } else {
                    container.append('span')
                        .classed("config-editor-static-text", true)
                }
                break;
            case "select":
                var select = container.append('select')
                    .attr("class","config-editor-select")
                    .on( 'change', function(d) {
                        makeChangeCallback( d.id, this.value );
                    } )
                    .attr( "disabled", d => d.editable ? null : "disabled" );
                var optionSelection = select.selectAll('option').data( d.availableValues );
                optionSelection.enter()
                    .append('option')
                    .property( "value", d => d.id )
                    .text( d => d.display );
                break;
            case "[text]":
                var textarea = container.append('textarea')
                    .attr("class","config-editor-textarea-input")
                    .on( 'keyup', function(d) {
                        makeChangeCallback( d.id, this.value.split('\n') );
                    } );
                break;
        }
    };
    var updateInput = function(container,d) {
        switch ( d.type ) {
            case "text":
                if ( d.editable ) {
                    container.select('input')
                        .classed( 'invalid-config-editor-value', d => !d.valid )
                        .each( function(d) {
                            var input = d3.select(this);
                            input.attr("disabled", State.getEditable()?null:"disabled")
                            if ( d.value !== input.property("value") ) {
                                input.property("value", d.value);
                            }
                        } );
                } else {
                    container.select('span').text( function(d) { return d.value } );
                }
                break;
            case "select":
                container.select('select')
                    .classed( 'invalid-config-editor-value', function(d) {
                        return !d.valid;
                    } )
                    .attr("disabled", State.getEditable()?null:"disabled")
                    .selectAll('option')

                    .each( function(selectVal) {
                        d3.select(this).property("selected", function(v) {
                            return v.id === d.value;
                        });
                    } );
                break;
            case "[text]":
                var value = d.value;
                if ( value && value.constructor === Array) { value = value.join('\n') }
                container.select('textarea')
                    .classed( 'invalid-config-editor-value', d => !d.valid )
                    .property('value',value)
                    .attr("disabled", State.getEditable()?null:"disabled");
                break;
        }
    };
    var renderAdditionalFields = function(container,d) {
        var additionalFieldSelection = container.selectAll('td.config-editor-property-additional-field').data( function(d) {
            return d.additional.map( function(ad) {
                d;
                return ad;
            } );
        }, d => d.id);
        additionalFieldSelection.enter().append('td')
            .classed('config-editor-property-additional-field', true)
            .each(function (d) {
                var container = d3.select(this);
                container.append('button')
                    .text(d.text)
                    .attr("disabled", State.getEditable()?null:"disabled")
                    .on('click', function(d) {
                        if ( d.onClick ) {
                            d.onClick();
                        }
                    });
            });
    };
    var renderProperties = function(container,d) {
        var propertiesSelection = container.selectAll('tr.config-editor-property').data( function(d) {
            return d.properties;
        }, function(d) {
            return d.id + ":" + d.type;
        } );
        propertiesSelection.enter()
            .append('tr').classed('config-editor-property', true)
            .each(function (d) {
                var row = d3.select(this);
                row.append('td').classed('config-editor-input-label-cell', true).html(d => d.label);
                row.append('td').classed('config-editor-property-input-cell', true).each(function (d) {
                    addInput(d3.select(this), d);
                });

                renderAdditionalFields(row, d);

            })
            .merge(propertiesSelection).each( function(d) {
                var inputCell = d3.select(this).select('td.config-editor-property-input-cell');
                updateInput( inputCell, d );
            } );
        propertiesSelection.exit().remove();
    };
    var render = function() {

        mainContainer.datum( State );

        var sectionSelection = mainContainer.selectAll('div.config-editor-section').data( function(d) {
            return d.getSections();
        }, function(d) {
            return d.sectionId;
        } );

        sectionSelection.enter()
            .append('div')
            .classed("config-editor-section",true)
            .each( function(d) {
                var section = d3.select(this);

                section.append('div').classed('config-editor-section-header', true)
                    .append('span').html(d => d.sectionName);
                var table = section.append('div').append('table').classed('config-editor-property-set', true);
                var headerRow = table.append('tr').classed('config-editor-property-set-header-row', true);
                headerRow.selectAll('th.config-editor-property-set-header').data(d.headings)
                    .enter().append('th').classed('config-editor-property-set-header', true).html(d => d);
            } )
            .merge(sectionSelection).each( function(d) {
                renderProperties( d3.select(this).select('table.config-editor-property-set'), d );
            } );
        sectionSelection.exit().remove();
    };
    var initialise = function( options ) {
        setState( null );
        callbacks = options.callbacks || {};
    };
    var setState = function( stateDefinition, editable ) {
        State.setId( stateDefinition ? stateDefinition.id : null );
        State.setSections( stateDefinition ? stateDefinition.sections : null );
        State.setEditable(editable!=undefined ? editable : true);
        render();
    };

    return {
        initialise: initialise,
        setState: setState
    };
};
