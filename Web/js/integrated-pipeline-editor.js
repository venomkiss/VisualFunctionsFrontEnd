var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.pipeline = com.mobysoft.pipeline || {};

com.mobysoft.pipeline.createIntegratedPipelineEditor = function( d3, datatypeService, compositeComponentDefinitions ) {

    if ( d3 === null || d3 === undefined ) { throw "d3 cannot be null"; }
    if ( datatypeService === null || datatypeService === undefined ) { throw "datatypeService cannot be null"; }

    var actionListeners = (function(){

        var listeners = {};

        var getListeners = function( listenerAction ) {
            return listeners[listenerAction] || (listeners[listenerAction] = []);
        };

        return {
            getListeners: getListeners,
            registerListener: function( listenerAction, listenerFunction ) {
                var actionListeners = getListeners(listenerAction);
                if ( actionListeners.indexOf(listenerFunction) === -1 ) {
                    actionListeners.push( listenerFunction );
                }
            },
            deregisterListener: function( listenerAction, listenerFunction ) {
                listeners[listenerAction] = getListeners(listenerAction).filter( lf => lf !== listenerFunction );
            },
            callListeners: function( listenerAction, arg ) {
                getListeners(listenerAction).forEach(function (listener) { (listener)(arg); });
            }
        };
    }());

    var testService = null;

    var LISTENER_ACTIONS = {
        SAVE: "save",
        SAVE_WITH_FATAL_ERRORS: "save with fatal errors"
    };

    var KNOWN_DATATYPES = {
        STRING: { id:"String", display:"String" },
        INTEGER: { id:"Integer", display:"Integer" },
        PERIOD: { id:"Period", display:"Period" },
        DATE: { id:"Date", display:"Date" },
        BOOLEAN: { id:"Boolean", display:"Boolean" },
        MAP: { id:"Map", display:"Map of String to ..." },
        LIST: { id: "List", display:"List Of ..." },
        TUPLE: { id: "Tuple", display:"Tuple Of String to ..." }
    };

    var coreComponentTypes = {
        "core/ConditionalValue": {
            name: "If True return Value",
            inputs: {
                "predicate": {display:"Boolean input", cardinality:"single", dataType: "Boolean"},
                "valueProvider": {display:"Value if true", cardinality:"single", dataType: "A"}
            },
            output: {dataType: "A"}
        },
        "core/GetProperty": {
            name: "Get Named Value",
            inputs: {
                "objectProvider": {display: "Source object", cardinality: "single", dataType: "object"},
                "propertyNameProvider": {display: "Value name", cardinality: "single", dataType: "String"}
            },
            config: {
                dataType: {display: "Value Data Type", dataType:"type(A)"}
            },
            output: {dataType: "A"}
        },
        "core/FirstNonNullSelector": {
            name: "Return First Valid Value",
            inputs: {
                "valueProvider": {display: "Values", cardinality: "multiple", dataType: "A"}
            },
            output: {dataType: "A"}
        },
        "core/StaticValueProvider": {
            name: "Static Value",
            config: {
                dataType: {display: "Value Data Type", dataType:"type(A)"},
                value: {display: "Value", dataType: "A"}
            },
            output: {dataType: "A"}
        },
        "core/And": {
            name: "And",
            inputs: {
                "predicate": {display: "?", cardinality:"multiple", dataType: "Boolean"}
            },
            output: {dataType: "Boolean"}
        },
        "core/Or": {
            name: "Or",
            inputs: {
                "predicate": {display: "?", cardinality:"multiple", dataType: "Boolean"}
            },
            output: {dataType: "Boolean"}
        },
        "core/Not": {
            name: "Not",
            inputs: {
                "predicate": {display:"Boolean input", cardinality:"single", dataType: "Boolean"}
            },
            output: {dataType: "Boolean"}
        },
        "core/HasValue": {
            name: "If Value Exists Return True",
            inputs: {
                "valueProvider": {display:"value", cardinality:"single", dataType:"A"}
            },
            output: {dataType: "Boolean"}
        },
        "core/StringAppender": {
            name: "String Concatenator",
            inputs: {
                "valueProvider": {display: "Values to concatenate", cardinality: "multiple", dataType: "String"}
            },
            config: {
                separator: {display: "Separator", dataType: "String"}
            },
            output: {dataType: "String"}
        },
        "core/Addition": {
            name: "Addition",
            inputs: {
                "rootProvider": {display: "Root value for the addition", cardinality: "single", dataType: "A"},
                "valueProvider": {display: "Values to add", cardinality: "multiple", dataType: "B"}
            },
            output: {dataType: "A"}
        },
        "core/BiPredicate": {
            name: "Return True If Values Match",
            inputs: {
                "firstInput": {display:"First value", cardinality:"single", dataType: "A"},
                "secondInput": {display:"Second value", cardinality:"single", dataType: "A"}
            },
            config: {
                predicate: {display: "Comparison type", dataType: "predicate(A)"}
            },
            output: {dataType: "Boolean"}
        },
        "core/ValueInList": {
            name: "If Value in List return True",
            inputs: {
                "valueProvider": {display:"Value", cardinality:"single", dataType: "A"},
                "listProvider": {display: "List", cardinality:"single", dataType: "[A]"}
            },
            config: {
                predicate: {display: "Comparison type", dataType: "predicate(A)"}
            },
            output: {dataType: "Boolean"}
        },
        "core/DatePeriodCompare": {
            name: "If Date is in Period return True",
            inputs: {
                "dateToCheckDateProvider": {display: "Local Date To Check",  cardinality:"single", dataType: "Date"},
                "anchorDateProvider": {display: "Local Date Anchor",  cardinality:"single", dataType: "Date"},
                "periodProvider": {display: "Date Period", cardinality:"single", dataType: "Period"}
            },
            config: {
                predicate: {display: "Comparison type", dataType: "predicate(Date)"}
            },
            output: {dataType: "Boolean"}
        },
        "core/DateFallsWithinRange": {
            name: "If Date is in range return True",
            inputs: {
                "dateToCheckProvider": {display: "Date to check",  cardinality:"single", dataType: "Date"},
                "startOfRangeProvider": {display: "Start of the date range",  cardinality:"single", dataType: "Date"},
                "periodForRangeProvider": {display: "Period of the date range", cardinality:"single", dataType: "Period"}
            },
            output: {dataType: "Boolean"}
        },
        "core/GetValueForKey": {
            name: "Get Value For Key",
            inputs: {
                "objectProvider": {display: "Lookup table",  cardinality:"single", dataType: "{A,B}"},
                "keyProvider": {display: "Key",  cardinality:"single", dataType: "A"}
            },
            output: {dataType: "B"}
        },
        "core/GetKeys": {
            name: "Get Keys from Lookup Table",
            inputs: {
                "objectProvider": {display: "Lookup table", cardinality: "single", dataType: "{A,B}"}
            },
            output: {dataType: "[A]"}
        },
        "core/GetValues": {
            name: "Get Values from Lookup Table",
            inputs: {
                "objectProvider" : {display: "Lookup table", cardinality: "single", dataType: "{A,B}"}
            },
            output: {dataType: "[B]"}
        },
        "core/CollectToList": {
            name: "Collect inputs to a list",
            inputs: {
                "valueProvider": {display: "Values", cardinality: "multiple", dataType: "A"}
            },
            output: {dataType: "[A]"}
        },
        "core/CombineLists": {
            name: "Combine lists to a single list",
            inputs: {
                "valueProvider": {display: "Values", cardinality: "multiple", dataType: "[A]"}
            },
            output: {dataType: "[A]"}
        },
        "core/ToTuple": {
            name: "Convert 2 values to a Tuple",
            inputs: {
                "keyProvider": {display: "Key", cardinality: "single", dataType: "A"},
                "valueProvider": {display: "Value", cardinality: "single", dataType: "B"}
            },
            output: {dataType: "(A,B)"}
        },
        "core/ListIntersection": {
            name: "Return a list containing the common elements of the list inputs",
            inputs: {
                "valueProvider": {display: "List Inputs", cardinality: "multiple", dataType: "[A]"}
            },
            output: {dataType: "[A]"}
        },
        "core/ListSize": {
            name: "Return the number of elements in a list",
            inputs: {
                "valueProvider": {display: "List", cardinality: "single", dataType: "[A]"}
            },
            output: {dataType: "Integer"}
        }
    };

    var commonCompositeTypeDefinitions = {};

    var commonComponentTypes = Object.assign({}, coreComponentTypes, commonCompositeTypeDefinitions);
    var pipelineStateFactory = com.mobysoft.pipeline.createPipelineStateFactory( d3, datatypeService );

    commonComponentTypes.input = { name: "\u2192 New Input \u2192" };
    d3.keys(commonComponentTypes).forEach( function(key) {
        var component = commonComponentTypes[key];
        component.type = "static";
        if (key.startsWith("composite/")) {
            component.editState = pipelineStateFactory.EditStates.VIEWABLE;
        } else if (key.startsWith("core/")) {
            component.editState = pipelineStateFactory.EditStates.STATIC;
        } else {
            component.editState = pipelineStateFactory.EditStates.EDITABLE;
        }
    } );

    pipelineStateFactory.initialise( commonComponentTypes, compositeComponentDefinitions );


    // TODO : Configurable editor options ...
    var pipelineEditorConfiguration = { };

    var pipelineEditor = com.mobysoft.pipeline.createPipelineEditor(
        "#pipelineEditorContainer", d3, pipelineStateFactory, pipelineEditorConfiguration
    );
    var componentEditor = com.mobysoft.pipeline.createPipelineComponentEditor("#componentEditorContainer", d3);
    var configEditor = com.mobysoft.pipeline.createConfigEditor("#componentConfigEditorContainer", d3);
    var pipelineEditorControls = com.mobysoft.pipeline.createPipelineEditorControls("#pipelineEditorControlsContainer", d3);
    var configMappingEditor = com.mobysoft.pipeline.createConfigMappingEditor("#configMappingEditorContainer", d3);


    var createDataInputTester = function() {

        var inputData = {
            type: '{String,any}',
            value: { }
        };
        var lastKnownPipelineState = null;

        var DataSheetEditorFactory = com.mobysoft.dataEditing.createDataEditorFactory( d3, datatypeService );
        var DataTypeFactory = datatypeService.createDataTypeFactory( "",{} );

        var createInputForm = function( outerContainerId, overlayId ) {

            var outerContainer = d3.select('#' + outerContainerId);
            var overlay = d3.select('#' + overlayId);

            var buttonContainer = outerContainer.append('div').classed('button-container',true);
            outerContainer.append('div').classed('inner-container',true);
            var backButton = buttonContainer.append('button').attr('type','button').text('Back');
            var sendButton = buttonContainer.append('button').attr('type','button').text('Send');

            var dataSheetEditor = DataSheetEditorFactory.createTypeEditor( inputData.type, inputData.value );
            dataSheetEditor.render( '#' + outerContainerId + " .inner-container" );

            var show = function() {
                overlay.style("visibility","visible");
                outerContainer.style("visibility","visible");
            };
            var hide = function() {
                overlay.style("visibility","hidden");
                outerContainer.style("visibility","hidden");
            };

            backButton.on( 'click', function() {
                hide();
            } );
            sendButton.on( 'click', function() {
                inputData = dataSheetEditor.getValue();
                makeRequest( lastKnownPipelineState );
            } );

            return {
                setInputData: function( inputData ) {
                    dataSheetEditor.setValue( inputData );
                },
                show : show,
                hide : hide
            };

        };
        var inputForm = createInputForm( "inputFormOuterContainer", "pipelineEditorOverlay" );

        var addDefaultInputValue = function( rootPropertyName, dataType ) {
            return inputData.value[rootPropertyName] || ( inputData.value[rootPropertyName] = { type:dataType.toString(), value:dataType.defaultValue } );
        };

        var addDefaultInputObjectValue = function( rootPropertyName, propertyName, propertyTypeStr ) {
            var obj = addDefaultInputValue( rootPropertyName, DataTypeFactory.mapOf( DataTypeFactory.primitiveType('String'), DataTypeFactory.anyType() ) );
            if ( propertyName ) {
                var typeStr = propertyTypeStr || 'String';
                var propertyType = DataTypeFactory.parseDataType( typeStr );
                obj.value[propertyName] = { type: typeStr, value:propertyType.defaultValue }
            }
        };

        var handleTrace = function( trace ) {

            var initComponentDef = function( baseObj, instanceName, parent, level ) {

                var lastChildCalled = null;
                var childCallStack = [];

                if ( !baseObj.instanceName ) {
                    baseObj.instanceName = instanceName;
                    baseObj.parent = parent;
                    baseObj.level = level || 0;
                    baseObj.allChildCalls = [];
                    baseObj.subComponents = {};
                    baseObj.logReturn = function( value ) {
                        childCallStack.splice(-1,1);
                        var stackSize = childCallStack.length;
                        lastChildCalled = stackSize > 0 ? childCallStack[stackSize-1] : null;
                        if ( stackSize === 0 && baseObj.parent ) {
                            baseObj.value = value;
                            baseObj.parent.logReturn( value );
                        }
                    };
                    baseObj.logCall = function( componentName, componentOperation, child ) {
                        switch ( componentOperation ) {
                            case 'GET_VALUE_CALL':
                                if ( child ) {
                                    if ( lastChildCalled !== child ) {
                                        childCallStack.push( child );
                                        baseObj.allChildCalls.push( { from: lastChildCalled, to:child } );
                                        lastChildCalled = child;
                                    }
                                }
                                if ( parent ) {
                                    parent.logCall( componentName.parent, componentOperation, baseObj );
                                }
                                break;
                            case 'GET_VALUE_RETURN':
                                parent.logReturn( baseObj.value );
                                break;
                        }
                    };
                    baseObj.getFullName = function() {
                        return (parent ? parent.getFullName() : "") + "/" + instanceName;
                    };

                    var valueEntry = trace.componentValues[baseObj.getFullName()];
                    if ( valueEntry ) {
                        baseObj.value = valueEntry.componentValue;
                    }
                }
                return baseObj;
            };

            var groupedTraceItems = trace.traceItems.reduce( (ret,ti) => {
                switch ( ti.componentOperation ) {
                    case 'CONNECTION_ATTEMPT':
                        ret.connections.push(ti); break;
                    case 'GET_VALUE_CALL':
                    case 'GET_VALUE_RETURN':
                        ret.valueCallsAndReturns.push(ti); break;
                    default:
                        ret.other.push(ti); break;
                }
                return ret;
            }, { valueCallsAndReturns:[], connections:[], other:[] } );

            var byLevel = groupedTraceItems.valueCallsAndReturns.reduce( function( ret, i ) {
                var getComponentDef = function( componentName ) {

                    var instanceName = componentName.instanceName;

                    if ( componentName.parent ) {
                        var parentContainer = getComponentDef( componentName.parent );
                        var thisSection = parentContainer.subComponents[instanceName];
                        if ( !thisSection ) {
                            thisSection = parentContainer.subComponents[instanceName] = initComponentDef( {}, instanceName, parentContainer, parentContainer.level + 1 );
                        }
                        return thisSection;
                    } else {
                        return initComponentDef( ret, instanceName );
                    }
                };
                getComponentDef( i.componentName ).logCall( i.componentName, i.componentOperation );
                return ret;
            }, {} );

            var simplify = function( componentDef ) {
                return {
                    value : componentDef.value,
                    subComponents: d3.values(componentDef.subComponents).reduce( function(ret,sc) {
                        ret[sc.instanceName] = simplify( sc );
                        return ret;
                    }, {} ),
                    calls: componentDef.allChildCalls.map( function(cc) {
                        return {
                            from : cc.from ? cc.from.instanceName : null,
                            to : cc.to.instanceName
                        };
                    } )
                };
            };
            var simplified = simplify( byLevel );

            inputForm.hide();
            pipelineEditor.showTestResults( simplified );
        };

        var handleInputErrors = function( errors ) {
            errors.forEach( e => {
                switch ( e.errorCode ) {
                    case 'INVALID':
                        alert("Pipeline is invalid : " + e.componentPartId + " : " + e.errorMessage);
                        break;
                    case 'UNCONNECTED_INPUT':
                    case 'INPUT_VALUE_UNAVAILABLE':
                        var componentName = e.componentPartId;
                        var componentsByName = lastKnownPipelineState.getComponentsByName(componentName);
                        if ( componentsByName.length === 0 ) {
                            alert("Cannot find a component of name " + componentName);
                        } else if ( componentsByName > 1 ) {
                            alert("More than one component with name " + componentName);
                        } else {
                            var component = componentsByName[0];
                            var isInput = component.isInput();
                            if ( isInput ) {
                                if ( e.additionalInfo ) {
                                    var propertyName = e.additionalInfo.propertyName;
                                    var propertyType = e.additionalInfo.propertyType;
                                    addDefaultInputObjectValue( componentName, propertyName, propertyType );
                                } else {
                                    // Try to establish the required type for the input ...
                                    var dataType = d3.entries(component.getConnections())[0].value.getInput().getDataType().toString();
                                    addDefaultInputValue( componentName, dataType );
                                }
                            }
                        }
                        break;
                    default:
                        alert("Don't know how to handle the received error.  Please check the console");
                        console.log( "Don't know how to handle error with code " + e.errorCode + " : " + JSON.stringify(e) );
                }
                inputForm.setInputData( inputData );
                inputForm.show();
            } );
        };

        var makeRequest = function() {
            testService( lastKnownPipelineState, inputData.value, function( responseData ) {

                switch ( responseData.outcome ) {
                    case 'RUNTIME_ERROR':
                    case 'PIPELINE_CONSTRUCTION_ERROR':
                        handleInputErrors( responseData.errors ); break;
                    case 'OK': handleTrace( responseData.trace ); break;
                    default:
                        console.log( "Unknown outcome : " + responseData.outcome );
                        console.log( responseData );
                }
            } );
        };

        return {
            testPipeline: function( pipelineState ) {
                var firstCall = lastKnownPipelineState === null;
                lastKnownPipelineState = pipelineState;
                if ( firstCall ) {
                    makeRequest();
                } else {
                    inputForm.show();
                }
            }
        };
    };
    var DataInputTester = createDataInputTester();


    var ConfigEditorCallbacks = ( function() {
        var currentComponent = null;
        var stringPropertyMap = {};
        return {
            setComponent: function( component ) { currentComponent = component; },
            getStoredState: function( stateId ) { return stringPropertyMap[stateId]; },
            callbacks: {
                onChange: function( changeInfo ) {
                    if ( currentComponent ) {
                        var newValue = null;
                        if ( currentComponent.isExternalisedConfig(changeInfo.propertyId) ) {
                            newValue = changeInfo.value;
                        } else {
                            var stateMap = stringPropertyMap[changeInfo.stateId];

                            if ( !stateMap ) {
                                stateMap = stringPropertyMap[changeInfo.stateId] = {};
                            }
                            stateMap[changeInfo.propertyId] = changeInfo.value;

                            var type = currentComponent.getConfig()[changeInfo.propertyId].type;
                            var metaType = type.metaType;
                            if ( metaType === "generic" ) {
                                metaType = type.getBoundType().metaType;
                            }
                            switch ( metaType ) {
                                case "map":
                                case "list":
                                    newValue =
                                        (metaType === "map" ? "{" : "[") +
                                        changeInfo.value.filter( l => l.trim() !== "" ).join(',') +
                                        (metaType === "map" ? "}" : "]");
                                    break;
                                case "tuple":
                                    newValue = "[" + changeInfo.value + "]";
                                    break;
                                case "type":
                                    if (changeInfo.value === "Map") {
                                        newValue = "{String,String}";
                                    } else if (changeInfo.value === "List") {
                                        newValue = "[String]";
                                    } else if (changeInfo.value === "Tuple") {
                                        newValue = "(String,String)";
                                    } else {
                                        newValue = changeInfo.value;
                                    }
                                    break;
                                default:
                                    newValue = changeInfo.value;
                                    break;
                            }
                        }
                        var result = pipelineEditor.updateComponentConfigFromStringValue({
                            componentId: changeInfo.stateId,
                            key: changeInfo.propertyId,
                            value: newValue
                        });
                        setConfigMappingEditorState( pipelineEditor.getCurrentState() );
                        if ( result === null ) {
                            return null;
                        } else {
                            return createConfigEditorState( result );
                        }
                    }
                }
            }
        };
    }() );

    var createConfigEditorState = function( component ) {
        ConfigEditorCallbacks.setComponent( component );
        if ( component ) {
            var sections = [];

            var storedVersions = ConfigEditorCallbacks.getStoredState(component.getId()) || {};
            var config = component.getConfig();

            var mapMetaTypeToEditorInputType = function( metaType ) {
                switch ( metaType ) {
                    case "map":
                    case "list":
                        return { inputType : "[text]" };
                    case "predicate":
                    case "type":
                        return {
                            inputType : "select",
                            availableOptions : metaType === "type" ? d3.values(KNOWN_DATATYPES) : d3.values(datatypeService.Predicates.all)
                        };
                    default:
                        return { inputType : "text" };
                }
            };

            var convertValueForMetaType = function( metaType, value ) {
                switch ( metaType ) {
                    case "primitive":
                        return value || "";
                    case "map":
                        try {
                            return d3.entries(JSON.parse(value)).map(function (e) {
                                return JSON.stringify(e.key) + ":" + JSON.stringify(e.value);
                            });
                        } catch (e) {
                            return null;
                        }
                    case "list":
                        try {
                            return JSON.parse(value).map( v => JSON.stringify(v) );
                        } catch(e) {
                            return null;
                        }
                    default:
                        return value;
                }
            };
            var createEditorPropertyDefinitionList = function() {
                return d3.keys( config )
                    .filter( configKey => !component.isExternalisedConfig(configKey) )
                    .reduce(function(acc, configKey){
                        var propertyConfig = config[configKey];

                        var type = propertyConfig.type;
                        if ( type.metaType === "generic" ) {
                            type = type.getBoundType();
                        }

                        var editorInputType = mapMetaTypeToEditorInputType(type.metaType);

                        var value = storedVersions[configKey];
                        if ( value === undefined || value === null ) {
                            value = convertValueForMetaType( type.metaType, propertyConfig.getValueAsString() );
                        }
                        var props  = [];

                        if (type.metaType === "type") {
                            var factory = datatypeService.createDataTypeFactory(configKey, {});
                            var typeTree = factory.parseDataType(propertyConfig.value);
                            var typeType = mapMetaTypeToEditorInputType("type");
                            var valueType;
                            switch (typeTree.metaType) {
                                case "map":valueType="Map";break;
                                case "list":valueType="List";break;
                                case "tuple":valueType="Tuple";break;
                                default:valueType=typeTree.typeName;break;}

                            props.push({
                                id: configKey,
                                editable: true,
                                label: propertyConfig.display || configKey,
                                type: editorInputType.inputType,
                                availableValues: editorInputType.availableOptions,
                                value: valueType,
                                valid: propertyConfig.valid,
                                additional: [{
                                    id: "externalise",
                                    type: "button",
                                    text: "\u2193",
                                    onClick: function() {
                                        pipelineEditor.externaliseConfigProperty( component, configKey );
                                        configEditor.setState( createConfigEditorState(component) );
                                    }
                                }]
                            });

                            var getValueType = function(type) {
                                type;
                                switch (type.metaType === "map" || type.metaType === "tuple" ? type.valueType.metaType : type.containedType.metaType) {
                                    case "map":
                                        return "Map";
                                    case "list":
                                        return "List";
                                    case "tuple":
                                        return "Tuple";
                                    default:
                                        return type.metaType == "map" || type.metaType === "tuple" ? type.valueType.typeName : type.containedType.typeName;
                                }
                            };
                            var onChangeHandler = function(changeInfo) {
                                if ( changeInfo.propertyId.includes("::>>") ) {
                                    var splitId = changeInfo.propertyId.split("::>>");
                                    changeInfo.propertyId = splitId[0];
                                    var buildType = function(root, level) {
                                        if ( level == 1 ) {
                                            switch( changeInfo.value ) {
                                                case "Map" :
                                                    return "{String,String}";
                                                case "List" :
                                                    return "[String]";
                                                case "Tuple" :
                                                    return "(String,String)";
                                                default :
                                                    return changeInfo.value;
                                            }
                                        } else {
                                            switch (root.metaType) {
                                                case "map":
                                                    return "{String," + buildType(root.valueType, level - 1) + "}";
                                                case "list":
                                                    return "[" + buildType(root.containedType, level - 1) + "]";
                                                case "tuple":
                                                    return "(String," + buildType(root.valueType, level - 1) + ")";
                                                default:
                                                    return type = root.typeName;
                                            }
                                        }
                                    }
                                }
                                changeInfo.value = buildType(typeTree, splitId.length);
                                return changeInfo;
                            };

                            var expandTypes = function(rootType, props, propConfigKey) {
                                if ( rootType.metaType == "primitive" ) {
                                    return props;
                                }

                                propConfigKey = propConfigKey + "::>>";
                                props.push({
                                    id: propConfigKey,
                                    editable: true,
                                    label: "",
                                    type: typeType.inputType,
                                    availableValues: typeType.availableOptions,
                                    value: getValueType(rootType),
                                    valid: propertyConfig.valid,
                                    additional: [],
                                    onChange: onChangeHandler
                                });

                                return expandTypes(
                                    rootType.metaType === "map" || rootType.metaType === "tuple" ? rootType.valueType : rootType.containedType,
                                    props, propConfigKey);
                            };

                            expandTypes(typeTree, props, configKey);
                        } else {
                            props.push({
                                id: configKey,
                                editable: true,
                                label: propertyConfig.display || configKey,
                                type: editorInputType.inputType,
                                availableValues: editorInputType.availableOptions,
                                value: value,
                                valid: propertyConfig.valid,
                                additional: [{
                                    id: "externalise",
                                    type: "button",
                                    text: "\u2193",
                                    onClick: function() {
                                        pipelineEditor.externaliseConfigProperty( component, configKey );
                                        configEditor.setState( createConfigEditorState(component) );
                                    }
                                }]
                            });
                        }

                        return acc.concat(props);
                    }, []);
            };

            if ( config ) {
                sections.push( {
                    sectionId: component.getId() + ":" + "internal-properties",
                    sectionName: "Component Config Properties",
                    headings: [ "Property Key", "Current Value", "Expose" ],
                    properties: createEditorPropertyDefinitionList()
                } );

                sections.push( {
                    sectionId: component.getId() + ":" + "external-properties",
                    sectionName: "Externally Defined Properties",
                    headings: [ "Property Key", "External Key", "Move Back" ],
                    properties: d3.keys( config )
                        .filter( configKey => component.isExternalisedConfig(configKey) )
                        .map( function(configKey) {
                            return {
                                id: configKey,
                                editable: true,
                                label: config[configKey].display || configKey,
                                type: "text",
                                value: component.getExternalisedConfigKey(configKey) || "",
                                valid: config[configKey].valid,
                                additional: [{
                                    id: "internalise",
                                    type: "button",
                                    text: "\u2191",
                                    onClick: function() {
                                        pipelineEditor.internaliseConfigProperty( component, configKey );
                                        configEditor.setState( createConfigEditorState(component) );
                                    }
                                }]
                            };
                        } )
                } );
            }
            return { id: component.getId(), sections: sections };
        } else {
            return null;
        }
    };

    var setConfigEditorState = function( selectionState, pipelineEditState ) {
        configEditor.setState(
            createConfigEditorState(
                selectionState && selectionState.isSingleSelection() ?
                    selectionState.getSelectedComponents()[0] :
                    null
            ),
            pipelineEditState === pipelineStateFactory.EditStates.EDITABLE
        );
    };

    var setPipelineEditorControlsState = function( pipelineState, selectionState ) {
        var selectedComponents = selectionState ? selectionState.getSelectedComponents() : null;
        pipelineEditorControls.setState( {
            pipelineState: pipelineState,
            selectionState: selectionState,
            isAtRoot: pipelineEditor.isAtRoot(),
            callbacks: {
                remove: function () {
                    pipelineEditor.removeComponents(selectedComponents);
                },
                add: function (componentType) {
                    pipelineEditor.addComponent(componentType);
                },
                save: function () {
                    var status = pipelineEditor.getCurrentState().validateAll();
                    if ( status.hasFatalErrors() ) {
                        actionListeners.callListeners( LISTENER_ACTIONS.SAVE_WITH_FATAL_ERRORS, status );
                    } else {
                        actionListeners.callListeners( LISTENER_ACTIONS.SAVE, pipelineEditor.get() );
                    }
                },
                back: function () {
                    pipelineEditor.popState();
                },
                backAndSave: function () {
                    pipelineEditor.popStateAndSaveOnParent();
                },
                extract: function () {
                    pipelineEditor.extract(selectedComponents);
                },
                editComponentType: function(functionId) {
                    pipelineEditor.editInnerFunction(functionId);
                },
                onChangeName: function (newName) {
                    if (pipelineState) {
                        pipelineState.setPipelineName(newName);
                    }
                },
                selectByType: function(componentType) {
                    pipelineEditor.selectByType(componentType.id);
                },
                removeInner: function(innerPipelineId) {
                    pipelineState.removeInnerPipelineFunction(innerPipelineId);
                },
                test: function() {
                    DataInputTester.testPipeline( pipelineEditor.getCurrentState() );
                },
                toggleShowTestResults: function() {
                    pipelineEditor.toggleShowTestResults();
                },
                isTestResultAvailable: function() { return pipelineEditor.isTestResultAvailable(); },
                isTestResultVisible: function() { return pipelineEditor.isTestResultVisible(); }
            }
        } );
    };
    var setConfigMappingEditorState = function( pipelineState ) {
        configMappingEditor.setState( pipelineState );
    };

    componentEditor.initialise( {
        onchange: pipelineEditor.updateComponentName
    } );
    var showInComponentEditor = function( selectionState ) {
        if ( selectionState.isSingleSelection() ) {
            var component = selectionState.getSelectedComponents()[0];
            componentEditor.show( {
                id: component.getId(),
                name: component.getName(),
                type: component.getType(),
                editable: component.getEditState() === pipelineStateFactory.EditStates.EDITABLE
            } );
        } else {
            componentEditor.show( null );
        }
    };


    var pipelineCallbacks = {
        onSelectionChanged: function( pipelineState, selectionState ) {
            showInComponentEditor( selectionState );
            setConfigEditorState( selectionState, pipelineState.getEditState() );
            setPipelineEditorControlsState( pipelineState, selectionState );
            setConfigMappingEditorState( pipelineState );
        }
    };

    const registerListener = function (listenerAction,newListener) {
        actionListeners.registerListener(listenerAction,newListener);
    };

    const deregisterListener = function(listenerAction,oldListener) {
        actionListeners.deregisterListener(listenerAction,oldListener);
    };

    const registerTestService = function( testServiceFunc ) {
        testService = testServiceFunc;
    };

    configMappingEditor.initialise( {
        onExternalKeyNameChange: function( oldName, newName ) {
            pipelineEditor.updateExternalConfigKeyName( oldName, newName );
        }
    } );
    configEditor.initialise( {
        callbacks: ConfigEditorCallbacks.callbacks,
        additionalButtonDefs: {}
    } );
    setPipelineEditorControlsState();
    pipelineEditor.initialise( pipelineCallbacks );

    return {
        pipelineEditor: pipelineEditor,
        configEditor: configEditor,
        controls: pipelineEditorControls,
        registerListener: registerListener,
        deregisterListener: deregisterListener,
        registerTestService: registerTestService,

        LISTENER_ACTIONS: LISTENER_ACTIONS,
        ErrorType: pipelineStateFactory.ErrorType,
        Utils: {
            QuantifyDuplicateNamesFromStatus: function( status ) {
                return status.hasErrorsOfType( pipelineStateFactory.ErrorType.DUPLICATE_COMPONENT_NAME ) ?
                    d3.entries(
                        status.getErrorsOfType(pipelineStateFactory.ErrorType.DUPLICATE_COMPONENT_NAME)
                            .map(e => e.sourceComponent.getName())
                            .reduce( (ret,e) => {
                                ret[e] = ret[e] ? ret[e] + 1 : 1;
                                return ret;
                            }, {} )
                    )
                    : [];
            }
        }
    };
};

