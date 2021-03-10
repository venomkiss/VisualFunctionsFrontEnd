Array.prototype.flatMap = Array.prototype.flatMap || function(lambda) {
    return Array.prototype.concat.apply([], this.map(lambda));
};

var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.pipeline = com.mobysoft.pipeline || {};


com.mobysoft.pipeline.createPipelineEditor = function( containerSelector, d3, pipelineStateFactory, configuration ) {

    var functionEditor = com.mobysoft.pipeline.createPipelineFunctionEditor( containerSelector, d3, configuration );
    var currentLevel = 0;
    var currentState = null;
    var stateStack = [];

    var latestTestResults = null;

    var pushState = function( newState, operation ) {
        currentState.selectedComponentIds = functionEditor.getSelectedComponents().map( c => c.getId() );
        currentState.componentPositions = functionEditor.getComponentPositions();
        currentState = newState;
        stateStack.push( {
            stateObj: currentState,
            operation: operation
        } );
        currentLevel++;
    };
    var popState = function() {
        var state = null;
        if ( !isAtRoot() ) {
            state = stateStack[currentLevel--];
            stateStack = stateStack.slice( 0, -1 );
            currentState = stateStack[currentLevel].stateObj;
        }
        return state;
    };
    var syncEditorToCurrentState = function() {
        functionEditor.setState( currentState, currentState.componentPositions );
        functionEditor.selectComponents( currentState.selectedComponentIds );
    };
    var isAtRoot = function() { return currentLevel === 0; };
    var pipelineStateId = 0;
    var getNewPipelineStateId = function() { return pipelineStateId ^= 1; };

    return {
        initialise: function( callbacks ) {
            functionEditor.initialise( callbacks );
        },
        popState: function() {
            popState();
            syncEditorToCurrentState();
        },
        popStateAndSaveOnParent: function() {
            var state = popState();
            if ( state ) {
                switch ( state.operation ) {
                    case "edit":
                        currentState.updateInnerPipelineFunction( state.stateObj );
                        break;
                    case "add":
                        currentState.addInnerPipelineFunction( state.stateObj );
                        break;
                }
            }
            syncEditorToCurrentState();
        },
        getCurrentState: function() { return currentState; },
        isAtRoot: isAtRoot,
        setBasePipeline: function( pipelineDefinition, viewInfo ) {
            stateStack = [];
            latestTestResults = null;
            currentLevel = 0;
            stateStack.push( {
                stateObj: currentState = pipelineStateFactory.createPipelineState(getNewPipelineStateId(), pipelineStateFactory.EditStates.EDITABLE).initialise( pipelineDefinition ),
                operation: "init"
            } );
            functionEditor.setState( currentState, viewInfo );
        },
        removeComponents: functionEditor.removeComponents,
        addComponent: functionEditor.addComponent,

        updateComponentConfigFromStringValue: functionEditor.updateComponentConfigFromStringValue,
        internaliseConfigProperty: functionEditor.internaliseConfigProperty,
        externaliseConfigProperty: functionEditor.externaliseConfigProperty,
        updateExternalConfigKeyName: functionEditor.updateExternalConfigKeyName,

        updateComponentName: functionEditor.updateComponentName,
        extract: function( components ) {
            pushState( currentState.createSubFunction(components), "add" );
            functionEditor.setState( currentState );
        },
        editInnerFunction: function( innerFunctionId ) {
            var subFunctionState = currentState.getSubFunction( innerFunctionId );

            // Use the serialised function definition to create a copy to edit ...
            var editState;
            if ( innerFunctionId.startsWith("core/") ) {
                editState = pipelineStateFactory.EditStates.STATIC;
            } else if ( innerFunctionId.startsWith("composite/") ) {
                editState = pipelineStateFactory.EditStates.VIEWABLE;
            } else  {
                editState = pipelineStateFactory.EditStates.EDITABLE;
            }
            var newState = pipelineStateFactory.createPipelineState( innerFunctionId, editState ).initialise( subFunctionState.get() );

            pushState( newState, "edit" );
            functionEditor.setState( newState );
        },
        get: function() { return currentState ? currentState.get() : null; },
        getComponentPositions: functionEditor.getComponentPositions,
        render: functionEditor.render,
        selectByType: function( typeToSelect ) {
            functionEditor.selectByType(typeToSelect);
        },
        showTestResults: function( testResults ) {
            latestTestResults = testResults;
            functionEditor.showTestResults( testResults );
        },
        toggleShowTestResults: functionEditor.toggleShowTestResults,
        isTestResultVisible: functionEditor.isTestResultVisible,
        isTestResultAvailable: functionEditor.isTestResultAvailable,
        position: function( viewInfo ) {
            functionEditor.position( viewInfo );
        }
    };
};


com.mobysoft.pipeline.createPipelineFunctionEditor = function( containerSelector, d3, configuration ) {

    var eventCallbacks = {};

    var State = null;

    var latestTestResults = null;
    var showTestResults = false;

    var mainContainer = d3.select(containerSelector);

    var currentConnectorInfo = null;
    var isReorderingComponent = function( component ) {
        return currentConnectorInfo !== null && currentConnectorInfo.reorderInfo
            && component.getId() === currentConnectorInfo.reorderInfo.componentId;
    };
    var isValidReorderPosition = function( inputInstance ) {
        return isReorderingComponent(inputInstance.getComponent())
            && inputInstance.getInput().getInputName() === currentConnectorInfo.reorderInfo.inputName
            && !inputInstance.isDefault()
    };
    var eligibleForReordering = function( inputInstance ) {
        return currentConnectorInfo !== null && currentConnectorInfo.reorderInfo
                && inputInstance.getComponent().getId() === currentConnectorInfo.reorderInfo.componentId
                && currentConnectorInfo.reorderInfo.targetIndex !== -1
                && inputInstance.getGlobalIndex() >= currentConnectorInfo.reorderInfo.baseIndex;
    };
    var getAdjustedInputInstanceIndex = function( inputInstance ) {
        var currentIndex = inputInstance.getGlobalIndex();
        if ( eligibleForReordering(inputInstance) ) {
            if ( currentIndex >= currentConnectorInfo.reorderInfo.targetIndex ) {
                return currentIndex + 1;
            }
        }
        return currentIndex;
    };

    // --- Selection --------------------------------------------------------------------------

    var Selection = (function(){
        var selectionAPI = {};

        var selectedComponents = {};
        var selectedConnections = {};

        var getSelectedComponents = function() {
            return d3.values( selectedComponents );
        };
        var syncSelectedConnections = function() {
            selectedConnections = State.getConnectionsFromComponentSet(selectedComponents);
        };

        selectionAPI.getSelectedComponentsMap = function() { return selectedComponents; };
        selectionAPI.deselectAll = function() {
            var changed = getSelectedComponents().length > 0;
            selectedComponents = {};
            selectedConnections = {};
            return changed;
        };
        selectionAPI.isSelected = function( component ) { return selectedComponents[component.getId()] !== undefined; };
        selectionAPI.add = function( component ) {
            if ( component && !selectionAPI.isSelected(component) ) {
                selectedComponents[component.getId()] = component;
                syncSelectedConnections();
                return true;
            }
            return false;
        };
        selectionAPI.remove = function(component) {
            if ( selectionAPI.isSelected(component) ) {
                delete selectedComponents[component.getId()];
                syncSelectedConnections();
                return true;
            }
            return false;
        };
        selectionAPI.toggleSelected = function(component) {
            if ( selectionAPI.isSelected(component) ) {
                selectionAPI.remove(component);
            } else {
                selectionAPI.add(component);
            }
            syncSelectedConnections();
            return true;
        };
        selectionAPI.setSelected = function(component) {
            var changed = getSelectedComponents().length !== 1 || !selectionAPI.isSelected(component);
            selectionAPI.deselectAll();
            selectionAPI.add(component);
            syncSelectedConnections();
            return changed;
        };
        selectionAPI.getSelectedComponents = getSelectedComponents;
        selectionAPI.isSingleSelection = function() { return getSelectedComponents().length === 1; };

        selectionAPI.getSelectedConnections = function() { return selectedConnections; };
        selectionAPI.syncSelectedConnections = syncSelectedConnections;

        selectionAPI.hasSelection = function() { return getSelectedComponents().length > 0; };
        selectionAPI.isFunction = function() {
            return State.isFunction( selectedComponents );
        };

        return selectionAPI;
    }());

    var onSelectionChanged = function() {
        if ( eventCallbacks && eventCallbacks.onSelectionChanged ) {
            eventCallbacks.onSelectionChanged( State, Selection );
        }
    };

    mainContainer.on('mousedown', function() {
        if ( Selection.deselectAll() ) {
            onSelectionChanged();
            render();
        }
    });

    // --- Moving Components -------------------------------------------------------------------

    var Positioning = (function(){

        var viewInfo = {};

        var getComponentPosition = function( component ) {
            var position = viewInfo[component.getId()];
            if ( !position ) { position = viewInfo[component.getId()] = {x:0,y:0}; }
            return position;
        };
        var getOutputPosition = function( output ) {
            var componentPosition = getComponentPosition(output.getComponent());
            return {
                x: componentPosition.x + 180,
                y: componentPosition.y + 62
            };
        };
        var getInputInstancePosition = function( inputInstance ) {
            return getInputInstancePositionForPositionIndex( inputInstance.getComponent(), getAdjustedInputInstanceIndex( inputInstance ) );
        };
        var getInputInstancePositionForPositionIndex = function( component, positionIndex ) {
            var componentPosition = getComponentPosition(component);
            return {
                x: componentPosition.x,
                y: componentPosition.y + 63 + (positionIndex * 26)
            };
        };

        return {
            initialise: function( initialViewInfo ) {
                viewInfo = initialViewInfo;
            },
            getViewInfo: function() { return d3.entries(viewInfo).reduce( function(map,e) {
                map[e.key] = e.value;
                return map;
            }, {} ); },
            reset: function() {
                viewInfo = {};
            },
            getComponentPosition: getComponentPosition,
            setComponentPosition: function( component, newPosition ) {
                var existingPosition = getComponentPosition(component);
                existingPosition.x = newPosition.x;
                existingPosition.y = newPosition.y;
            },
            getOutputPosition: getOutputPosition,
            getInputInstancePosition: getInputInstancePosition,
            getConnectionStartPosition: function( connection ) {
                return getOutputPosition( connection.getFromInstance().getOutput() );
            },
            getInputInstancePositionForPositionIndex: getInputInstancePositionForPositionIndex,
            getConnectionEndPosition: function( connection ) {
                return getInputInstancePosition(
                    connection.getInput().getConnectedInputInstance( connection.getFromInstance() )
                );
            },
            removeComponent: function(component) {
                delete viewInfo[component.getId()];
            }
        };
    }());

    var dragComponent = d3.drag()
        .on( "drag", function(d) {
            var event = d3.event;
            if ( event.sourceEvent.buttons === 1 ) {
                Selection.getSelectedComponents().forEach( function(c) {
                    var currentPosition = Positioning.getComponentPosition(c);
                    Positioning.setComponentPosition( c, {
                        x: currentPosition.x + event.dx,
                        y: currentPosition.y + event.dy
                    } );
                } );
                render();
            }
        });

    // --- Curve Rendering ---------------------------------------------------------------------

    var x = p => p.x, y = p => p.y;
    var line = d3.line().x( x ).y( y );
    var pValueFunctions = d3.range(0.00, 1.05, 0.05).map( p => {
        var p2 = p * p, p3 = p2 * p, mp = 1 - p, mp2 = mp * mp, mp3 = mp2 * mp;
        return function( cPoints ) {
            return {
                x: cPoints[0].x * mp3 + 3 * cPoints[1].x * mp2 * p + 3 * cPoints[2].x * mp * p2 + cPoints[3].x * p3,
                y: cPoints[0].y * mp3 + 3 * cPoints[1].y * mp2 * p + 3 * cPoints[2].y * mp * p2 + cPoints[3].y * p3
            };
        };
    } );
    var getCurve = function( start, end ) {
        var offset = Math.max(Math.min(Math.abs((end.x - start.x)/2), 150),20);
        var startingPoints = [ start, { x: start.x + offset, y: start.y }, { x: end.x - offset, y: end.y }, end ];
        var points = pValueFunctions.map( f => f(startingPoints) );
        return {
            points: points,
            bounds: {
                min: { x: d3.min( points, x ), y: d3.min( points, y ) },
                max: { x: d3.max( points, x ), y: d3.max( points, y ) }
            }
        }

    };
    var padAndAdjustCurve = function( curveData ) {
        return {
            points: curveData.points.map( function(point) {
                return {
                    x: point.x - curveData.bounds.min.x + 3,
                    y: (point.y - curveData.bounds.min.y) + 3
                };
            } ),
            bounds: {
                left: curveData.bounds.min.x - 3,
                top: curveData.bounds.min.y,
                width: (curveData.bounds.max.x - curveData.bounds.min.x) + 6,
                height: (curveData.bounds.max.y - curveData.bounds.min.y) + 6
            }
        };
    };

    // --- Creating New Connections ------------------------------------------------------

    var dragInputOrOutput = d3.drag()
        .subject( function(d) {
            return {
                x: Positioning.getComponentPosition(d.getComponent()).x + d3.event.x,
                y: Positioning.getComponentPosition(d.getComponent()).y + d3.event.y - 3
            };
        } )
        .on('start', function(d) {
            d3.event.sourceEvent.stopPropagation();
            var isOutput = d.getObjectType() === "output";
            if ( isOutput || d.isConnected() ) {
                currentConnectorInfo = {
                    outputInstance : isOutput ? d : d.getConnection().getFromInstance().getOutput(),
                    connectorEndPosition : { x: d3.event.x, y: d3.event.y }
                };
                if ( !isOutput ) {
                    if ( !d.isDefault() ) {
                        currentConnectorInfo.inputInstance = d;
                        currentConnectorInfo.reorderInfo = {
                            componentId: d.getComponent().getId(),
                            inputName: d.getInputName(),
                            baseIndex: d.getInput().getDefaultInstance().getGlobalIndex(),
                            priorTargetIndex: d.getGlobalIndex(),
                            targetIndex: d.getGlobalIndex()
                        };
                    }
                    State.disconnect( d.getConnection() );
                    Selection.syncSelectedConnections();
                    render();
                }
            }
        })
        .on('drag', function(d) {
            if ( currentConnectorInfo ) {
                currentConnectorInfo.connectorEndPosition = { x:d3.event.x, y:d3.event.y };
                render();
            }
        })
        .on('end', function(d) {
            var canCompleteConnection = function( connectorInfo ) {
                return connectorInfo &&
                    connectorInfo.inputInstance !== undefined &&
                    !connectorInfo.inputInstance.getInput().isConnectedTo(connectorInfo.outputInstance.getComponent());
            };
            if ( canCompleteConnection(currentConnectorInfo) ) {
                var index = currentConnectorInfo.reorderInfo && currentConnectorInfo.reorderInfo.targetIndex !== -1
                    ? currentConnectorInfo.reorderInfo.targetIndex - currentConnectorInfo.reorderInfo.baseIndex
                    : undefined;
                State.connect(
                    currentConnectorInfo.outputInstance.getComponentId(),
                    currentConnectorInfo.inputInstance.getComponentId(),
                    currentConnectorInfo.inputInstance.getInputName(),
                    index
                );
                Selection.syncSelectedConnections();
            }
            currentConnectorInfo = null;
            render();
        });

    // --- RENDERING ---------------------------------------------------------------------

    var valueTooltip = (function(){

        var tooltipContainer = mainContainer.select('div[data-pipeline-div-id="return-value-tooltip"]');
        if ( tooltipContainer.size() === 0 ) {
            tooltipContainer = mainContainer.append('div')
                .attr('data-pipeline-div-id',"return-value-tooltip")
                .classed("return-value-tooltip",true)
                .style('display',"none");
        }

        var renderTypeValue = function( container, dataType, value ) {
            if ( value === null ) {
                container.text('<No Value>');
            } else if ( dataType.isList ) {
                var tbody = container.append('table').append('tbody');
                var rowSelector = tbody.selectAll('tr').data(value);
                rowSelector.enter().append('tr').each(function (d) {
                    var row = d3.select(this);
                    var cell = row.append('td');
                    renderTypeValue(cell, dataType.containedType, d);
                });
            } else if ( dataType.isTuple ) {
                var tbody = container.append('table').append('tbody');
                var row = tbody.append('tr');
                renderTypeValue( row.append('td'), dataType.keyType, value[0] );
                renderTypeValue( row.append('td'), dataType.valueType, value[1] );
            } else {
                container.text(value);
            }
        };

        return {
            show : function( d ) {
                if ( showTestResults && latestTestResults && latestTestResults.values ) {

                    var pos = Positioning.getOutputPosition( d );
                    tooltipContainer.style('left', function() { return pos.x + "px"; } );
                    tooltipContainer.style('top', function() { return pos.y + "px"; } );

                    tooltipContainer.html("");
                    var outer = tooltipContainer.append('div');
                    var value = latestTestResults.values[d.getComponentId()];
                    var dataType = d.getDataType().getBoundType();
                    renderTypeValue( outer, dataType, value );
                    tooltipContainer.style('display',"inline-block");
                }
            },
            hide : function() {
                tooltipContainer.style('display',"none");
            }
        };
    }());

    var componentMenu = undefined;

    var addTypeClasses = function( element, inputOrOutput ) {
        var boundType = inputOrOutput.getDataType().getBoundType();
        if ( boundType.isPrimitive ) {
            element
                .classed( 'datatype-boolean', boundType.isBoolean )
                .classed( 'datatype-integer', boundType.isInteger )
                .classed( 'datatype-string', boundType.isString )
                .classed( 'datatype-date', boundType.isDate )
                .classed( 'datatype-period', boundType.isPeriod );
        }
        element
            .classed( 'datatype-object', boundType.isComplexType )
            .classed( 'datatype-map', boundType.isMap )
            .classed( 'datatype-list', boundType.isList )
            .classed( 'datatype-tuple', boundType.isTuple )
            .classed( 'datatype-generic', boundType.isGeneric )
            .classed( 'datatype-any', boundType.isAny);
    };

    var render = function() {
        mainContainer.datum( State );
        var componentSelection = mainContainer.selectAll('div[data-component-type="component"]').data( function(d) {
            return d.getComponents();
        }, function(d) {
            return d.getId();
        } );

        var renderTestResults = showTestResults && latestTestResults;

        componentSelection.enter().append('div')
            .classed('component', true)
            .classed( 'item', true )
            .attr('data-component-type','component')
            .attr( 'id', function(d) { return d.getId(); } )
            .each( function( d ) {
                var item =  d3.select(this);
                var componentType = d.getType();
                item.append('div')
                    .attr('class','item-name-section').attr( 'title', function(d) {
                        return "id : " + d.getId() + "\ntype : " + (componentType ? componentType : "INPUT");
                    } );
                item.append('div').attr('class','item-type-section');
                if ( componentMenu ) {
                    item.append('div').classed('component-menu-button',true);
                }
            } )
            .on( 'mousedown', function(d) {
                if ( d3.event.ctrlKey ) {
                    Selection.toggleSelected( d );
                    onSelectionChanged();
                } else if ( !Selection.isSelected(d) ) {
                    Selection.setSelected(d);
                    onSelectionChanged();
                }
                render();
            } )
            .call(dragComponent)
            .merge(componentSelection)
                .style( 'left', function(d) { return Positioning.getComponentPosition(d).x + "px"; } )
                .style( 'top', function(d) { return Positioning.getComponentPosition(d).y + "px"; } )
                .classed( 'function-input', d => d.isInput() )
                .classed( 'selected', function(d) { return Selection.isSelected(d); } )
                .classed( 'test-result-called', d => renderTestResults && latestTestResults.values[d.getId()] !== undefined )
                .classed( 'test-result-skipped', d => renderTestResults && latestTestResults.values[d.getId()] === undefined )
                .each( function(d) {
                    var componentDiv = d3.select(this);
                    componentDiv.select('div.item-name-section')
                        .html( function(d) { return d.getName(); } )
                        .classed( 'error', function(d) {
                            var s= State.getStatus();
                            return d.isError() || (s.hasErrors() && s.getErrors().find( function(e) {
                                return e.sourceComponent && (e.sourceComponent.getId() === d.getId());
                            } ));
                        } );
                    componentDiv.select('div.item-type-section')
                        .html(d.getTypeDisplayName());

                    var outputSelection = componentDiv.selectAll('div.output').data( function(d) {
                        return [ d.getOutput() ];
                    }, function(d) {
                        return d.getId();
                    } );
                    outputSelection.enter().append('div')
                        .classed( 'output', true )
                        .html('Value Out')
                        .call(dragInputOrOutput)
                        .each( function(d) {
                            var element = d3.select(this);
                            element.append('div')
                                .attr('title',d => "")
                                .classed('output-value','true')
                                .on('mouseover', function( d, i ) {
                                    valueTooltip.show( d );
                                })
                                .on('mouseout', function() {
                                    valueTooltip.hide();
                                });
                        } )
                        .merge(outputSelection)
                            .each( function(d) {
                                var element = d3.select(this);
                                addTypeClasses( element, d );
                                element.select('div.output-value').classed('shown', function(d) {
                                    return showTestResults && latestTestResults && latestTestResults.values[d.getComponentId()] !== undefined;
                                });
                                element.attr( 'title', d.getDataType().getBoundType().toString() );
                                element.select('div.output-value');
                            } );

                    var inputsSelection = d3.select(this).selectAll('div.input').data( function(d) {
                            return d.getInputInstances();
                        }, function(d) {
                            return d.getId();
                        } );
                    inputsSelection.enter()
                        .append('div')
                        .classed('input', true)
                        .on('mouseover', function(d) {
                            if ( currentConnectorInfo ) {
                                if ( d.canConnect(currentConnectorInfo.outputInstance.getComponent()) || isValidReorderPosition(d) ) {
                                    currentConnectorInfo.inputInstance = d;
                                }
                                if ( isReorderingComponent(d.getComponent()) ) {
                                    var reorderInfo = currentConnectorInfo.reorderInfo;
                                    if ( reorderInfo.targetIndex !== -1 ) {
                                        reorderInfo.priorTargetIndex = reorderInfo.targetIndex;
                                    }
                                    if ( d.getInputName() === reorderInfo.inputName && d.isDefault() ) {
                                        reorderInfo.targetIndex = reorderInfo.priorTargetIndex = -1;
                                    }
                                    if ( isValidReorderPosition(d) ) {
                                        var thisIndex = d.getGlobalIndex();
                                        reorderInfo.targetIndex = reorderInfo.priorTargetIndex !== -1 && reorderInfo.priorTargetIndex <= thisIndex
                                            ? thisIndex + 1
                                            : thisIndex;
                                    }
                                }
                            }
                        })
                        .on('mouseout', function(d) {
                            if ( currentConnectorInfo ) {
                                currentConnectorInfo.inputInstance = undefined;
                                var reorderInfo = currentConnectorInfo.reorderInfo;
                                if ( reorderInfo && reorderInfo.targetIndex !== -1 ) {
                                    reorderInfo.priorTargetIndex = reorderInfo.targetIndex;
                                    reorderInfo.targetIndex = -1;
                                }
                            }
                        })
                        .call(dragInputOrOutput)
                        .merge(inputsSelection)
                            .each( function(d) {
                                var element = d3.select(this);
                                addTypeClasses( element, d );
                                element.attr( 'title', d.getDisplayName() + "\n" + d.getDataType().getBoundType().toString() );
                            } )
                            .classed( 'error', d => d.isError() )
                            .html( function(d) { return d.getDisplayName(); } )
                            .style( 'top', function(d) {
                                return (100 + 50 * getAdjustedInputInstanceIndex(d)) + "%";
                            } );
                    inputsSelection.exit().remove();

                    var placeholderInputSelection = d3.select(this).selectAll('div.placeholder-input').data( function(d) {
                        return isReorderingComponent(d) && currentConnectorInfo.reorderInfo.targetIndex !== -1 ? [{
                            inputInstance: d.getInput(currentConnectorInfo.reorderInfo.inputName).getDefaultInstance(),
                            index: currentConnectorInfo.reorderInfo.targetIndex
                        }] : [];
                    } );
                    placeholderInputSelection.enter().append('div')
                        .classed('placeholder-input', true)
                        .on('mouseover', function(d) {
                            currentConnectorInfo.inputInstance = d.inputInstance;
                            currentConnectorInfo.reorderInfo.targetIndex = d.index;
                        })
                        .on('mouseout', function() {
                            currentConnectorInfo.inputInstance = undefined;
                            if ( currentConnectorInfo.reorderInfo ) {
                                currentConnectorInfo.reorderInfo.targetIndex = -1;
                            }
                        })
                        .merge(placeholderInputSelection)
                            .style( 'top', function(d) {
                                return (100 + 50 * currentConnectorInfo.reorderInfo.targetIndex) + "%";
                            } );
                    placeholderInputSelection.exit().remove();
                } );
        componentSelection.exit().transition().duration(500).style('opacity',0).remove();

        var connectionSelection = mainContainer.selectAll('svg.connection').data( function(d) {
            var ret = d.getConnections().map( function(d) {
                var curveData = padAndAdjustCurve(getCurve(
                    Positioning.getConnectionStartPosition(d),
                    Positioning.getConnectionEndPosition(d)
                ));
                return {
                    id: d.getId(),
                    connection: d,
                    isCurrent: false,
                    connectorPath: curveData.points,
                    curveRect: curveData.bounds,
                    isError: d.isError()
                };
            }, d => d.id );
            if ( currentConnectorInfo ) {
                var startPosition = Positioning.getOutputPosition(currentConnectorInfo.outputInstance);
                var endPosition = (function(){
                    if ( currentConnectorInfo.inputInstance ) {
                        if ( currentConnectorInfo.reorderInfo && currentConnectorInfo.reorderInfo.targetIndex !== -1 ) {
                            return Positioning.getInputInstancePositionForPositionIndex(
                                d.getComponent(currentConnectorInfo.reorderInfo.componentId),
                                currentConnectorInfo.reorderInfo.targetIndex
                            );
                        } else {
                            return Positioning.getInputInstancePosition(currentConnectorInfo.inputInstance);
                        }
                    } else {
                        return {
                            x: currentConnectorInfo.connectorEndPosition.x,
                            y: currentConnectorInfo.connectorEndPosition.y
                        };
                    }
                }());
                var curveData = padAndAdjustCurve( getCurve( startPosition, endPosition ) );
                ret.push( {
                    id: "current-connector",
                    isCurrent: true,
                    connectorPath: curveData.points,
                    curveRect: curveData.bounds
                } );
            }
            return ret;
        }, function(d) {
            return d.id;
        } );
        connectionSelection.enter().append('svg')
            .classed('connection',true)
            .classed('current-connection', function(d) { return d.isCurrent; })
            .style('pointer-events','none')
            .each( function(d) {
                d3.select(this).append('path')
            } )
            .merge(connectionSelection)
            .style( 'left', function(d) { return "" + d.curveRect.left + "px"; } )
            .style( 'top', function(d) { return "" + d.curveRect.top + "px"; } )
            .style( 'width', function(d) { return "" + d.curveRect.width + "px"; } )
            .style( 'height', function(d) { return "" + d.curveRect.height + "px"; } )
                .classed( 'selected', function(d) { return Selection.getSelectedConnections()[d.id] !== undefined; } )
                .classed('error', function(d) { return d.isError; })
                .classed( 'can-connect', function(d) { return d.isCurrent && currentConnectorInfo.inputInstance; } )
                .classed( 'test-result-called', d => renderTestResults && latestTestResults.connections.indexOf(d.id) !== -1 )
                .classed( 'test-result-skipped', d => renderTestResults && latestTestResults.connections.indexOf(d.id) === -1 )
                .select('path').attr('d',function(d) { return line(d.connectorPath); });
        connectionSelection.exit().remove();
    };

    var layoutProcessor = function() {
        var getComponentsWithNoInputs = () => State.getComponents().filter( c => Object.keys(c.getInputs()).length === 0 );
        var getComponentsWithNoOutputs = () => State.getComponents().filter( c => Object.keys(c.getOutput().getConnections()).length === 0 );
        var getConnectionsToComponent = (i) => State.getConnections().filter( v => v.getToInstance().getId() == i );
        var getConnectionsFromComponent = (i) => State.getConnections().filter( v => v.getFromInstance().getId() == i );
        var getFromComponents = (a) => a.flatMap( o => getConnectionsToComponent( o.getId() )).map( c => c.getFromInstance() );
        var applyLayout = (v) => State.getComponents().forEach( c => Positioning.setComponentPosition( c, v[c.getName()] ) );
        var layout = function() {
            var componentLevels = [];
            var currentLevel = getComponentsWithNoOutputs();
            do {
                componentLevels.push(currentLevel);
                currentLevel = getFromComponents(currentLevel);
            } while ( currentLevel.length > 0 );

            var componentsAlreadyPlaced = {};
            var viewInfo = {};
            var leftPosition = 20;
            var topPosition = 20;

            componentLevels.reverse();
            var placeComponent = function (component) {
                if ( !componentsAlreadyPlaced[component.getId()] ) {
                    componentsAlreadyPlaced[component.getId()] = component;
                    var position = { x: leftPosition, y: topPosition };
                    viewInfo[ component.getName() ] = position;
                    topPosition += 80;
                }
            };

            getComponentsWithNoInputs().forEach( c => placeComponent(c) );

            componentLevels.forEach( l => {
                l.forEach( c => placeComponent(c) );
                topPosition = 20;
                leftPosition += 250;
            } );

            return viewInfo;
        };

        return {
            layout: layout,
            applyLayout: applyLayout
        };
    };

    var positionByViewInfo = function( viewInfo ) {
        if ( viewInfo ) {
            d3.values(State.getComponentMap()).forEach( function(c) {
                var position = viewInfo[c.getName()];
                if ( position ) {
                    Positioning.setComponentPosition(c,position);
                }
            } );
        }
    };

    return {
        initialise: function( callbacks ) {
            eventCallbacks = callbacks;
        },
        getSelectedComponents: function() {
            return Selection.getSelectedComponents();
        },
        selectComponents: function( componentIds ) {
            (componentIds || []).forEach( function(componentId) {
                var component = State.getComponent( componentId );
                Selection.add( component );
            } );
            render();
            onSelectionChanged();
        },
        removeComponents: function( components ) {
            var selectionChanged = false;
            components.forEach( function(c) {
                selectionChanged = Selection.remove( c ) || selectionChanged;
                Positioning.removeComponent( c );
                State.removeComponent( c );
            } );
            render();
            if ( selectionChanged ) { onSelectionChanged(); }
        },
        addComponent: function( componentTypeKey ) {
            var newComponent = 'input' !== componentTypeKey ?
                State.addComponentDef( { componentType: componentTypeKey } ) :
                State.addInputDef();
            Selection.setSelected(newComponent);
            render();
            onSelectionChanged();
        },
        updateComponentName: function( componentId, newName ) {
            State.setComponentName( componentId, newName );
            onSelectionChanged();
            render();
        },

        updateComponentConfigFromStringValue: function( changeInfo ) {
            var changed = State.updateComponentConfigFromStringValue(
                changeInfo.componentId, changeInfo.key, changeInfo.value );
            if ( changed ) {
                render();
            }
            return changed;
        },
        internaliseConfigProperty: function( component, propertyName ) {
            component.internaliseConfig( propertyName );
            render();
        },
        externaliseConfigProperty: function( component, propertyName ) {
            component.externaliseConfig( propertyName, component.getName() + "-" + propertyName );
            render();
        },
        updateExternalConfigKeyName: function( oldName, newName ) {
            State.updateExternalConfigKeyName( oldName, newName );
            onSelectionChanged();
        },

        getComponentPositions: function() {
            var componentMap = State.getComponentMap();
            return d3.entries(Positioning.getViewInfo()).reduce( function(map,e) {
                map[componentMap[e.key].getName()] = e.value;
                return map;
            }, {} );
        },
        setState: function( state, viewInfo ) {

            Selection.deselectAll();
            latestTestResults = null;
            showTestResults = false;
            State = state;
            Positioning.reset();
            onSelectionChanged();

            if ( !viewInfo || d3.keys(viewInfo).length === 0 ) {
                layoutProcessor().applyLayout( layoutProcessor().layout() );
            } else {
                positionByViewInfo( viewInfo );
            }

            render();
        },
        position: function( viewInfo ) {
            positionByViewInfo( viewInfo );
            render();
        },
        selectByType: function( typeToSelect ) {
            var instances = State.findInstances(typeToSelect);
            Selection.deselectAll();
            instances.forEach(i => Selection.add(i));
            onSelectionChanged();
            render();
        },
        showTestResults: function( testResults ) {

            var convertComponentOutputValue = function( dataType, value ) {
                if ( dataType.isList ) {
                    return value == null ? null : value.map(v => convertComponentOutputValue(dataType.containedType, v));
                } else if ( dataType.isMap ) {
                    return value;
                } else if ( dataType.isTuple ) {
                    return value == null ? null : [
                        convertComponentOutputValue( dataType.keyType, value.firstArgument ),
                        convertComponentOutputValue( dataType.valueType, value.secondArgument )
                    ];
                } else {
                    return value;
                }
            };

            latestTestResults = {
                connections: testResults.calls.reduce( function(ret,call) {
                    if ( call.from ) {
                        var from = State.getOneComponentByName(call.from);
                        if ( from === null ) {
                            console.log( "Component " + call.from + " not found in current pipeline state" );
                        } else {
                            var to = State.getOneComponentByName(call.to);
                            if ( to === null ) {
                                console.log( "Component " + call.to + " not found in current pipeline state" );
                            } else {
                                var componentValue = testResults.subComponents[call.to].value;
                                var connections = from.getConnectionsToOrFrom( to );
                                if ( !connections || connections.length !== 1 ) {
                                    console.log( "There are " + (!connections ? "no" : connections.length)
                                        + " connections between " + call.from + " and " + call.to + "" );
                                } else {
                                    ret.push(connections[0].getId());
                                }
                            }
                        }
                    }
                    return ret;
                }, [] ),
                values: d3.entries(testResults.subComponents).reduce( function(ret,sc) {
                    var component = State.getOneComponentByName(sc.key);
                    if ( component ) {
                        ret[component.getId()] = convertComponentOutputValue(component.getOutput().getDataType().getBoundType(),sc.value.value);
                    } else {
                        console.log("No component of name " + sc.key + " found");
                    }
                    return ret;
                }, {} )
            };

            showTestResults = true;
            render();
            onSelectionChanged();
        },
        render: render,
        toggleShowTestResults: function() {
            showTestResults = !showTestResults;
            render();
        },
        isTestResultAvailable: function() { return latestTestResults !== null; },
        isTestResultVisible: function() { return showTestResults && latestTestResults !== null; }
    }

};
