var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.pipeline = com.mobysoft.pipeline || {};

com.mobysoft.pipeline.createPipelineStateFactory = function( d3, datatypeService ) {

    if ( datatypeService === null || datatypeService === undefined ) {
        throw "Datatype Service cannot be null";
    }

    var MetaType = datatypeService.MetaType;
    var exists = function( val ) { return val !== undefined && val !== null; };

    var log = function( message ) { if ( console ) { console.log( message ); } };
    var error = function( message ) { throw message; };

    var componentTypeDefinitions = {};
    var compositeComponents = {};
    var compositeComponentStates = {};

    var EditStates = { STATIC: "static", VIEWABLE: "viewable", EDITABLE: "editable" };

    var ValidationStatus = { OK: "ok", ERROR: "error" };
    var ErrorType = [
        { id:"COMPONENT_HAS_NO_CONNECTIONS", text:"No Connections", fatal:false },
        { id:"INVALID_INPUT_DELEGATION", text:"Invalid input delegation", fatal:false },
        { id:"INVALID_CONFIG_PROPERTY", text:"Invalid config property", fatal:false },
        { id:"EMPTY_CONNECTION", text:"Empty connection", fatal:false },
        { id: "NOT_A_FUNCTION", text: "Not a function", fatal:false },

        { id:"DUPLICATE_COMPONENT_NAME", text:"Duplicate component name", fatal:true }
    ].reduce( (ret,et) => { ret[et.id] = et; return ret; }, {} );

    var MappingState = {
        REMOVED:"removed",
        CHANGED:"changed",
        UNCHANGED:"unchanged"
    };

    var createStatus = function() {

        var status = ValidationStatus.OK;
        var errors = [];
        var typeMatch = function(type) { return e => type.id === e.type.id; };

        var statusApi = {
            addError: function( error ) {
                status = ValidationStatus.ERROR;
                errors.push( error );
            },
            addSubStatus: function( statusObj ) {
                if ( statusObj.getStatus() === ValidationStatus.ERROR ) {
                    statusObj.getErrors().forEach( function(e) { errors.push(e) } );
                    status = ValidationStatus.ERROR;
                }
            },
            removeMatching: function( matchFunction ) {
                errors = errors.filter( function(e) { return !matchFunction(e); } );
                if ( errors.length > 0 ) {
                    status = ValidationStatus.OK;
                }
            },
            removeMatchingType: function( type ) {
                statusApi.removeMatching( typeMatch(type) );
            },
            getErrors: function() { return errors; },
            getErrorsOfType: function( type ) {
                return errors.filter( typeMatch(type) );
            },
            getStatus: function() { return status; },
            hasErrors: function() { return status === ValidationStatus.ERROR; },
            hasErrorsOfType: function(type) { return statusApi.getErrorsOfType(type).length > 0; },
            hasFatalErrors: function() {
                return errors.filter( e => e.type.fatal ).length > 0;
            },
            reset: function() {
                errors = [];
                status = ValidationStatus.OK;
            }
        };
        return statusApi;
    };

    // ----------

    var createPipelineState = function( _pipelineId, editState ) {

        var pipelineId = _pipelineId || 0;

        var pipelineEditState = editState || EditStates.EDITABLE;

        var pipelineStateAPI = {};

        var missingTypeError = function( typeName ) { error("No definition found for type '" + typeName + "'"); };

        var inputValueDef = {
            name: "\u2192 Pipeline Input",
            output: { dataType: "A" }
        };

        var availableComponentTypes = d3.keys(componentTypeDefinitions).reduce( function(map,defKey) {
            map[defKey] = componentTypeDefinitions[defKey];
            return map;
        }, {} );

        var pipelineName = null;

        var orderedComponents = [];
        var components = {};
        var connections = {};

        var innerComposites = {};

        var newInnerPipelineIndex = 1;
        var newComponentIndex = 1;
        var newComponentNameIndex = 1;

        var status = createStatus();

        var createConnection = function( fromInstance, toInstance, inputName ) {
            var isError = false;
            return {
                getId: function() { return fromInstance.getId() + ":" + toInstance.getId() + ":" + inputName },
                getFromInstance: function() { return fromInstance; },
                getToInstance: function() { return toInstance; },
                getToInputName: function() { return inputName; },
                getInput: function() { return toInstance.getInput(inputName); },
                getOutput: function() { return fromInstance.getOutput(); },
                setError: function( trueOrFalse ) {
                    isError = trueOrFalse;
                },
                isError: function() { return isError; }
            };
        };

        // === CREATE COMPONENT ---------------------------------------------------------------------

        var createComponentInstance = function( instanceDetails, isInput ) {

            var componentAPI = {};

            var componentType = isInput ? null : instanceDetails.type;

            var typeDef = isInput ? inputValueDef : availableComponentTypes[componentType];
            if ( !typeDef ) { missingTypeError( componentType ); }

            var instanceName = instanceDetails.name;
            var componentId = instanceDetails.id;

            var genericTypes = {};
            var DataTypeFactory = datatypeService.createDataTypeFactory( componentId, genericTypes );

            var status = createStatus();
            var requiresRevalidation = true;

            var config = typeDef.config ? d3.entries(typeDef.config).sort( function(c1,c2) {
                // Sort so that metatype config properties come first, and therefore take priority for bindings ...
                return DataTypeFactory.parseDataType(c1.value.dataType).metaType === MetaType.TYPE ? -1 : (
                    DataTypeFactory.parseDataType(c2.value.dataType).metaType === MetaType.TYPE ? 1 : 0
                );
            } ).reduce( function(map,ce) {
                var propertyName = ce.key, propertyInfo = ce.value;
                if ( !propertyInfo.dataType ) {
                    throw( instanceName );
                }
                var type = DataTypeFactory.parseDataType(propertyInfo.dataType);
                var valueAsString = "";
                var bindId = "config:" + propertyName;
                var setValueFromString = function( str ) {
                    valueAsString = str;
                    if ( type.metaType === MetaType.TYPE ) {
                        configEntry.type.type.addBindAttempt(
                            DataTypeFactory.parseDataType( str ),
                            bindId,
                            DataTypeFactory.BINDING_TYPE.NON_NEGOTIABLE
                        );
                        configEntry.value = str;
                    } else if ( type.metaType === MetaType.PREDICATE ) {
                        var predicateInfo = datatypeService.Predicates.forString(str);
                        if ( configEntry.valid = exists(predicateInfo) ) {
                            configEntry.value = predicateInfo.id;
                            configEntry.type.type.addBindAttempt(
                                DataTypeFactory.parseDataType( predicateInfo.dataType ),
                                bindId,
                                DataTypeFactory.BINDING_TYPE.NON_NEGOTIABLE
                            );
                        } else {
                            configEntry.type.type.removeBindAttempt( bindId );
                            configEntry.value = str;
                        }
                    } else {
                        configEntry.value = type.getBoundType().valueFromString( str );
                        configEntry.valid = configEntry.value !== null;
                    }
                };
                var setValue = function( value ) {
                    var representedType = null;
                    if ( type.metaType === MetaType.TYPE ) {
                        representedType = value ? DataTypeFactory.parseDataType(value) : type.defaultValue;
                        configEntry.type.type.addBindAttempt( representedType, bindId, DataTypeFactory.BINDING_TYPE.NON_NEGOTIABLE );
                        configEntry.value = representedType.toString();
                        valueAsString = representedType.toString();
                    } else if ( type.metaType === MetaType.PREDICATE ) {
                        var predicateType = value ? value : type.defaultValue;
                        var predicateInfo = datatypeService.Predicates.forString(predicateType);
                        if ( predicateInfo ) {
                            representedType = DataTypeFactory.parseDataType(predicateInfo.dataType);
                            configEntry.type.type.addBindAttempt( representedType, bindId, DataTypeFactory.BINDING_TYPE.NON_NEGOTIABLE );
                            configEntry.value = predicateInfo.id;
                            valueAsString = predicateInfo.id;
                        }
                    } else {
                        configEntry.value = exists( value ) ? value : type.getBoundType().defaultValue;
                        if ( configEntry.value === null ) {
                            configEntry.valid = false;
                        }
                        valueAsString = type.getBoundType().valueToString( configEntry.value );
                    }
                };
                var configEntry = map[propertyName] = {
                    valid: true,
                    type: type,
                    display: propertyInfo.display,
                    getValueAsString: function() { return valueAsString; },
                    setValueFromString: setValueFromString,
                    setValue: setValue,
                    revalidate: function() {
                        setValueFromString( valueAsString );
                        return configEntry.valid;
                    },
                    externalise: function() {
                        if ( type.metaType === MetaType.TYPE || type.metaType === MetaType.PREDICATE ) {
                            type.type.removeBindAttempt( bindId );
                        }
                        valid = true;
                    },
                    internalise: function() {
                        configEntry.revalidate();
                    },
                    getEditState: function() { return pipelineEditState; }
                };

                setValue(instanceDetails.config ? instanceDetails.config[propertyName] : null);

                return map;
            }, {} ) : {};

            var externalConfig = {};
            var getExternalisedConfigKey = function( configKey ) {
                return externalConfig[configKey] ? externalConfig[configKey] : null;
            };
            var isExternalisedConfig = function( configKey ) {
                return getExternalisedConfigKey(configKey) != null;
            };

            var createOutput = function( outputDef ) {

                var id = componentId + ":" + "output";
                var connections = {};
                var dataType = DataTypeFactory.parseDataType(outputDef.dataType);

                return {
                    getId: function() { return id; },
                    getDataType: function() { return dataType; },
                    getObjectType: function() { return "output"; },
                    getComponentId: function() { return componentId; },
                    getComponent: function() { return componentAPI; },
                    addConnection: function( connection ) {
                        var id = connection.getToInstance().getId() + ":" + connection.getToInputName();
                        connections[id] = connection;
                    },
                    removeConnection: function( connection ) {
                        var id = connection.getToInstance().getId() + ":" + connection.getToInputName();
                        delete connections[id];
                    },
                    getConnections: function() { return connections; },
                    getConnectionsTo: function( component ) {
                        return d3.values(connections).filter( c => c.getToInstance() === component );
                    },
                    isConnected: function() { return d3.keys(connections).length > 0; }
                };
            };
            var createInput = function( inputName, inputDef, index ) {

                var inputAPI = {};

                var baseId = componentId + ":input:" + inputName;
                var isMultiple = inputDef.cardinality === 'multiple';

                var dataType = DataTypeFactory.parseDataType(inputDef.dataType);
                var bindId = function(connection) {
                    var ret = "input:" + inputName;
                    return isMultiple ? ret + ":" + connection.getFromInstance().getId() : ret;
                };

                var status = createStatus();
                var requiresRevalidation = true;

                var createInputInstance = function( connectionIn ) {

                    var connection = connectionIn || null;
                    var id = connection ? baseId + ":" + connectionIn.getFromInstance().getId() : baseId;
                    var isDefault = connection === null;

                    var getComponentInputIndex = function() {
                        var index = 0, allComponentInstances = getInputInstances();
                        while ( index < allComponentInstances.length ) {
                            if ( id === allComponentInstances[index].getId() ) { return index; }
                            index++;
                        }
                        return -1;
                    };
                    var isFull = function() {
                        return (isMultiple && !isDefault) || connection !== null;
                    };

                    var inputInstanceAPI = {
                        getId: function() { return id; },
                        getObjectType: function() { return "input-instance"; },
                        getDataType: function() { return dataType; },
                        getIndex: function() { return index; },
                        getLocalIndex: function() { return inputAPI.getInstanceIndex(inputInstanceAPI) },
                        getComponentId: function() { return componentId; },
                        getComponent: function() { return inputAPI.getComponent(); },
                        getDisplayName: function() {
                            return isMultiple && isDefault ? "\u2192 " + inputDef.display : inputDef.display;
                        },
                        getInputName: function() { return inputName },
                        getInput: function() { return inputAPI; },
                        setConnection: function(connectionIn) { connection = connectionIn; },
                        removeConnection: function() { connection = null; },
                        isConnected: function() { return connection !== null; },
                        isConnectedTo: function( component ) {
                            return connection && connection.getFromInstance() === component;
                        },
                        getConnection: function() { return connection; },
                        isDefault: function() { return isDefault; },
                        getGlobalIndex: getComponentInputIndex,
                        isFull: isFull,
                        canConnect: function( component ) {
                            return !isFull() && inputAPI.canConnect(component);
                        },
                        isError: function() { return status.hasErrors(); }
                    };
                    return inputInstanceAPI;
                };

                var defaultInstance = createInputInstance();
                var instances = {};
                var orderedInstances = [ defaultInstance ];

                var getConnections = function( optionalContainer ) {
                    return orderedInstances.reduce( function(ret, inputInstance) {
                        var connection = inputInstance.getConnection();
                        if ( connection ) { ret[connection.getId()] = connection; }
                        return ret;
                    }, optionalContainer || {} );
                };
                var getConnectedInputInstance = function( component ) {
                    if ( inputDef.cardinality === 'multiple' && !component.isInput() ) {
                        var instance = instances[component.getId()];
                        return instance === undefined ? null : instance;
                    } else {
                        return defaultInstance.isConnectedTo(component) ? defaultInstance : null;
                    }
                };

                var validate = function( force ) {
                    if ( requiresRevalidation || force ) {
                        status.reset();
                        if ( !inputAPI.isConnected() ) {
                            status.addError( {
                                type: ErrorType.EMPTY_CONNECTION,
                                sourceComponent: componentAPI
                            } );
                        } else {
                            d3.values(getConnections()).forEach( function(c) {
                                c.setError(!dataType.getBoundType().matches(c.getOutput().getDataType().getBoundType()));
                            } );
                        }
                        requiresRevalidation = false;
                    }
                    return status;
                };

                // INPUT API ------------------------------------------------------

                inputAPI.getDataType = function() { return dataType; };
                inputAPI.getComponent = function() { return componentAPI; };
                inputAPI.getInputName = function() { return inputName; };
                inputAPI.getDisplayName = function() { return inputDef.display; };
                inputAPI.getOrderedInstances = function() { return orderedInstances; };
                inputAPI.getDefaultInstance = function() { return defaultInstance; };

                inputAPI.bindTypeThroughConnection = function(connection) {
                    dataType.addBindAttempt( connection.getOutput().getDataType().getBoundType(), bindId(connection) );
                    requiresRevalidation = true;
                };
                inputAPI.unbindTypeThroughConnection = function(connection) {
                    dataType.removeBindAttempt( bindId(connection) );
                    requiresRevalidation = true;
                };

                inputAPI.addConnection = function( connection, index ) {
                    inputAPI.bindTypeThroughConnection(connection);
                    if ( inputDef.cardinality === 'single' || connection.getFromInstance().isInput() ) {
                        defaultInstance.setConnection( connection );
                    } else {
                        var instance = createInputInstance( connection );
                        if ( index && index !== -1 ) {
                            orderedInstances.splice( index, 0, instance );
                        } else {
                            orderedInstances.push( instance );
                        }
                        instances[connection.getFromInstance().getId()] = instance;
                    }
                };
                inputAPI.removeConnection = function( connection ) {
                    inputAPI.unbindTypeThroughConnection(connection);
                    if ( inputDef.cardinality === 'single' || connection.getFromInstance().isInput() ) {
                        defaultInstance.removeConnection();
                    } else {
                        var key = connection.getFromInstance().getId();
                        var instance = instances[key];
                        delete instances[key];
                        orderedInstances = orderedInstances.filter( function(i) { return i !== instance; } );
                    }
                };
                inputAPI.getConnections = getConnections;
                inputAPI.getConnectedInputInstance = getConnectedInputInstance;
                inputAPI.isConnectedTo = function( component ) { return getConnectedInputInstance(component) !== null; };
                inputAPI.getConnectionTo = function( component ) {
                    var connectedInstance = getConnectedInputInstance(component);
                    return connectedInstance ? connectedInstance.getConnection() : null;
                };
                inputAPI.isConnected = function() {
                    return defaultInstance.isConnected() || isMultiple && orderedInstances.length > 1;
                };
                inputAPI.isMultiple = function() { return isMultiple; };
                inputAPI.canConnect = function( component ) {
                    return !inputAPI.isConnectedTo(component) &&
                        (!component.isInput() || (!inputAPI.isConnected() && (!isMultiple || !component.getOutput().isConnected()))) &&
                        !isInReturnPath(component);
                };
                inputAPI.validate = validate;
                inputAPI.isError = function() { return isError; };
                inputAPI.getInstanceIndex = function( inputInstance ) {
                    return orderedInstances.indexOf(inputInstance);
                };

                return inputAPI;
            };

            var orderedInputs = [];
            var inputs = {};
            d3.keys(typeDef.inputs).forEach( function(inputName, index) {
                orderedInputs.push( inputs[inputName] = createInput(inputName, typeDef.inputs[inputName], index) );
            } );
            var hasInputs = orderedInputs.length > 0;

            var output = createOutput(typeDef.output);

            var getInputInstances = function() {
                return orderedInputs.reduce( function(previous, next) {
                    return previous.concat( next.getOrderedInstances() )
                }, [] );
            };

            var collectInputConnections = function( optionalContainer ) {
                var container = optionalContainer || {};
                d3.values(inputs).forEach( i => i.getConnections(container) );
                return container;
            };
            var collectOutputConnections = function( optionalContainer ) {
                var container = optionalContainer || {};
                d3.values(output.getConnections()).forEach( function(connection) {
                    container[connection.getId()] = connection;
                } );
                return container;
            };
            var getConnections = function() {
                return collectOutputConnections( collectInputConnections() );
            };

            var validateConfig = function() {
                d3.entries(config).forEach( function(ce) {
                    if ( !isExternalisedConfig(ce.key) ) {
                        if ( !ce.value.revalidate() ) {
                            status.addError( {
                                type: ErrorType.INVALID_CONFIG_PROPERTY,
                                sourceComponent: componentAPI
                            } );
                        }
                    } else {
                        ce.value.valid = true;
                    }
                } );
            };
            var validateInputs = function( force ) {
                if (hasInputs) {
                    orderedInputs.forEach(function (i) {
                        status.addSubStatus( i.validate( force ) );
                    });
                }
            };
            var validateAsFunctionInput = function() {
                if ( isInput ) {
                    var outputConnections = d3.values(output.getConnections());
                    if ( outputConnections.length > 1 ) {
                        // Inputs that connect to multiple components CANNOT connect to any multiple-connector inputs
                        //  on those components.  Function inputs are either :
                        //  - a single exposed multi-input for a single internal component, or
                        //  - they can feed singular inputs on one or more internal components.
                        outputConnections.forEach(function (connection) {
                            var toInstance = connection.getToInstance();
                            var toInput = toInstance.getInput(connection.getToInputName());
                            if (toInput.isMultiple()) {
                                ret.addError({
                                    type: ErrorType.INVALID_INPUT_DELEGATION,
                                    sourceComponent: componentAPI
                                });
                            }
                        });
                    }
                }
            };
            var validateComponent = function( force ) {
                if ( requiresRevalidation || force ) {
                    status.reset();
                    validateConfig();
                    validateInputs( force );
                    validateAsFunctionInput();
                    requiresRevalidation = false;
                }
                return status;
            };
            var rebindOutputConnectionTypes = function() {
                d3.values(output.getConnections()).forEach( function(connection) {
                    connection.getToInstance().rebindTypeToConnection(connection);
                } );
            };
            var rebindTypeToConnection = function( connection ) {
                connection.getInput().bindTypeThroughConnection(connection);
                rebindOutputConnectionTypes();
                validateComponent( true );
            };

            var isInReturnPath = function( component ) {
                return component === componentAPI || d3.values(output.getConnections()).reduce( function(ret,c) {
                    return ret || c.getToInstance().isInReturnPath( component );
                }, false );
            };

            // Component API ------------------------------------------------

            componentAPI.getId = function() { return componentId; };
            componentAPI.getName = function() { return instanceName; };
            componentAPI.setName = function(name) { instanceName = name; };
            componentAPI.getType = function() { return componentType; };
            componentAPI.getTypeDisplayName = function() { return typeDef.name; };
            componentAPI.isInput = function() { return isInput; };
            componentAPI.getInputInstances = getInputInstances;
            componentAPI.getInput = function( inputName ) { return inputs[inputName]; };
            componentAPI.getInputs = function() { return inputs; };
            componentAPI.getOrderedInputs = function() { return orderedInputs; };
            componentAPI.getOutput = function() { return output; };

            componentAPI.isError = function() { return validateComponent().hasErrors(); };

            // Connections ...
            componentAPI.addOutputConnection = function( connection ) { output.addConnection( connection ); };
            componentAPI.addInputConnection = function( connection, index ) {
                if (!inputs[connection.getToInputName()]) {
                    log("addInputConnection:: Input name " + connection.getToInputName() + " not found in inputs");
                } else {
                    inputs[connection.getToInputName()].addConnection( connection, index );
                    rebindTypeToConnection( connection );
                }
            };
            componentAPI.removeOutputConnection = function( connection ) { output.removeConnection(connection); };
            componentAPI.removeInputConnection = function( connection ) {
                inputs[connection.getToInputName()].removeConnection( connection );
                validateComponent( true );
            };
            componentAPI.getConnections = getConnections;
            componentAPI.getInputConnections = collectInputConnections;
            componentAPI.isInReturnPath = isInReturnPath;
            componentAPI.getConnectionsToOrFrom = function(component) {
                return output.getConnectionsTo(component).concat( orderedInputs.reduce( function(a,input) {
                    var connection = input.getConnectionTo(component);
                    if ( connection ) { a.push(connection); }
                    return a;
                }, [] ) );
            };
            componentAPI.rebindTypeToConnection = rebindTypeToConnection;

            // Config ...
            componentAPI.getConfig = function() { return config; };
            componentAPI.setConfigPropertyFromStringValue = function( propertyName, strValue ) {
                var changed = true;
                var configItem = config[propertyName];
                if ( componentAPI.isExternalisedConfig(propertyName) ) {
                    componentAPI.internaliseConfig( propertyName );
                    componentAPI.externaliseConfig( propertyName, strValue );
                } else {
                    configItem.setValueFromString( strValue );
                }
                validateComponent(true);
                rebindOutputConnectionTypes();
                return changed;
            };
            componentAPI.hasConfig = function() { return d3.entries(config).length > 0; };
            componentAPI.externaliseConfig = function( configKey, externalConfigKey ) {
                externalConfig[configKey] = externalConfigKey;

                // TODO: What if the key has already been used, or is null or empty?
                config[configKey].externalise();
                validateComponent( true );

                rebindOutputConnectionTypes();
            };
            componentAPI.internaliseConfig = function( configKey ) {
                delete externalConfig[configKey];

                config[configKey].internalise();
                validateComponent( true );

                rebindOutputConnectionTypes();
            };
            componentAPI.getExternalisedConfigKey = getExternalisedConfigKey;
            componentAPI.isExternalisedConfig = isExternalisedConfig;
            componentAPI.getExternalisedConfigMapping = function() { return externalConfig; };
            componentAPI.updateExternalConfigKeyName = function( oldName, newName ) {
                d3.entries(externalConfig).forEach( function(ec) {
                    if ( ec.value === oldName ) {
                        externalConfig[ec.key] = newName;
                    }
                } );
            };

            componentAPI.validateComponent = validateComponent;

            componentAPI.get = function() {
                var def = {};
                if ( !isInput ) {
                    def.instanceName = instanceName;
                    def.componentType = componentType.indexOf("inner") === 0 ?
                    'inner/' + pipelineStateAPI.getInnerPipelineMap()[componentType].getPipelineName() :
                        componentType;
                    var configEntries = d3.entries(config);
                    if ( configEntries.length > 0 ) {
                        def.config = configEntries.reduce( function(map, e) {
                            if ( !componentAPI.isExternalisedConfig(e.key) ) {
                                map[e.key] = e.value.value;
                            }
                            return map;
                        }, {} );
                    }
                } else {
                    var connections = output.getConnections();
                    def.connections = d3.keys(connections).map( function(cName) {
                        var connection = connections[cName];
                        return {
                            instanceName: connection.getToInstance().getName(),
                            connector: connection.getToInputName()
                        };
                    } );
                }
                return def;
            };
            componentAPI.getEditState = function() {
                return pipelineEditState;
            };

            return componentAPI;
        };

        // === --------------------------------------------------------------------------------------

        // Returns the component if the component is considered to have changed as a result of this property
        //  update, or null otherwise.
        var updateComponentConfigFromStringValue = function( componentId, configPropertyKey, newConfigPropertyValue ) {
            var component = components[componentId];
            var componentChanged = component.setConfigPropertyFromStringValue( configPropertyKey, newConfigPropertyValue );

            return componentChanged ? component : null;
        };
        var updateExternalConfigKeyName = function( oldName, newName ) {
            orderedComponents.forEach( c => c.updateExternalConfigKeyName(oldName,newName) );
        };

        var getInputs = function() { return orderedComponents.filter( c => c.isInput() ); };

        var componentsByName = function() {
            return orderedComponents.reduce( function(ret,next) {
                var name = next.getName();
                if ( ret[name] === undefined ) {
                    ret[name] = [];
                }
                ret[name].push(next);
                return ret;
            }, {} );
        };
        var getDuplicateNamedComponents = function() {
            var result = d3.entries(componentsByName()).reduce( function(ret,next) {
                if ( next.value.length > 1 ) {
                    ret[next.key] = next.value;
                }
                return ret;
            }, {} );
            return {
                hasDuplicates: function() {
                    return d3.keys(result).length > 0;
                },
                getDuplicates: function() {
                    return result;
                }
            };
        };

        var calculateAndSetDuplicateComponentNameErrors = function() {

            // Reset existing duplicate name issues ...
            status.removeMatchingType( ErrorType.DUPLICATE_COMPONENT_NAME );

            var result = getDuplicateNamedComponents();
            if ( result.hasDuplicates() ) {
                d3.values(result.getDuplicates()).forEach( function(components) {
                    components.forEach( function(component) {
                        status.addError({
                            type: ErrorType.DUPLICATE_COMPONENT_NAME,
                            sourceComponent: component
                        })
                    } );
                } );
            }
        };

        var validateAll = function() {
            status.reset();
            orderedComponents.forEach( function(component) {
                status.addSubStatus( component.validateComponent() );
            } );
            if ( !isFunction(components) ) {
                status.addError( { type: ErrorType.NOT_A_FUNCTION } );
            }
            calculateAndSetDuplicateComponentNameErrors();
            return status;
        };

        var addComponentFromInstanceDetails = function( instanceDetails, isInput ) {
            var componentId = instanceDetails.id || generateUniqueComponentId();
            var newComponent = createComponentInstance( {
                name: instanceDetails.instanceName || generateUniqueComponentName(),
                id: componentId,
                type: instanceDetails.componentType,
                config: instanceDetails.config
            }, isInput );
            orderedComponents.push( components[newComponent.getId()] = newComponent );
            return newComponent;
        };

        var hasComponent = function( componentId ) { return components[componentId] !== undefined; };
        var getComponent = function( componentId ) { return components[componentId]; };

        var getConnection = function( fromInstanceName, toInstanceName, inputName ) {
            return connections[ fromInstanceName + ":" + toInstanceName + ":" + inputName ];
        };

        var disconnect = function( connection ) {
            if ( connection ) {
                connection.getFromInstance().removeOutputConnection( connection );
                connection.getToInstance().removeInputConnection( connection );
                delete connections[connection.getFromInstance().getId() + ":" +
                connection.getToInstance().getId() + ":" + connection.getToInputName()];
            }
        };
        var connect = function( fromInstanceId, toInstanceId, inputName, index ) {

            var fromInstance = components[fromInstanceId];
            var toInstance = components[toInstanceId];

            var connection = createConnection( fromInstance, toInstance, inputName );
            connections[fromInstanceId + ":" + toInstanceId + ":" + inputName] = connection;
            fromInstance.addOutputConnection( connection );
            toInstance.addInputConnection( connection, index );

            return connection;
        };
        var disconnectComponent = function( component ) {
            d3.values(component.getOutput().getConnections()).forEach( disconnect );
            d3.values(component.getInputs()).forEach( function(input) {
                input.getOrderedInstances().forEach( function(instance) {
                    disconnect( instance.getConnection() );
                } );
            } );
        };
        var removeComponent = function( component ) {
            disconnectComponent( component );
            orderedComponents = orderedComponents.filter( function(c) { return c !== component; } );
            delete components[component.getId()];
            validateAll();
        };

        var generateUniqueComponentId = function() {
            while ( hasComponent(pipelineId + "-Component-" + newComponentIndex) ) { newComponentIndex++; }
            return pipelineId + "-Component-" + newComponentIndex++;
        };
        var generateUniqueComponentName = function() {
            var byName = componentsByName();
            while ( byName["Component " + newComponentNameIndex] ) { newComponentNameIndex++; }
            return "Component " + newComponentNameIndex++;
        };
        var generateUniqueInnerPipelineId = function() {
            while ( innerComposites["inner/" + newInnerPipelineIndex] ) { newInnerPipelineIndex++; }
            return "inner/" + newInnerPipelineIndex++;
        };

        var getConfigMapping = function() {
            var ret = orderedComponents.reduce( function(list, c) {
                d3.entries( c.getExternalisedConfigMapping() ).reduce( function(map, m) {
                    list.push({
                        component: c,
                        configKey: m.key,
                        externalKey: m.value
                    });
                    return list;
                }, list );
                return list;
            }, [] );
            return ret.length > 0 ? ret : null;
        };

        var get = function() {
            var roots = findRoots( components );
            var ret = {
                name: pipelineName,
                type: "function",
                root: roots.length === 1 ? roots[0].getName() : null,
                inputs: orderedComponents.filter( c => c.isInput() ).reduce(
                    function(obj,c) {
                        obj[c.getName()] = c.get();
                        return obj;
                    }, {}
                ),
                components: orderedComponents.filter( c => !c.isInput() ).map( c => c.get() ),
                connections: orderedComponents
                    .flatMap(c => c.getOrderedInputs())
                    .flatMap(i => d3.values(i.getConnections()))
                    .filter( c => !c.getFromInstance().isInput() )
                    .map(c => {
                        return {
                            from: c.getFromInstance().getName(),
                            to: c.getToInstance().getName(),
                            connector: c.getToInputName()
                        }
                    })

            };

            var configMapping = getConfigMapping();
            if ( configMapping ) {
                ret.configMapping = d3.nest().key(d => d.externalKey).entries(configMapping).reduce( function(map,ek) {
                    map[ek.key] = ek.values.map( function(v) {
                        return {
                            forComponent: v.component.getName(),
                            configKey: v.configKey
                        };
                    } );
                    return map;
                }, {} );
            }

            var innerCompositeEntries = d3.entries(innerComposites);
            if ( innerCompositeEntries.length > 0 ) {
                ret.composites = innerCompositeEntries.reduce( function(map,c) {
                    map[c.value.getPipelineName()] = c.value.get();
                    return map;
                }, {} );
            }
            return ret;
        };

        var extractTypeDefinition = function( editable ) {

            var validationResult = validateAll();
            if ( validationResult.hasErrors() ) {
                console.error( validationResult );
            }

            var exposedTypes = (function(){
                var genericTypes = {};
                var dataTypeFactory = datatypeService.createDataTypeFactory( pipelineId, genericTypes );

                var typeMappings = {};
                var nextGenericLabel = "A";

                // This only works from "A" to "Z".
                var getNewGenericLabel = function() {
                    var ret = nextGenericLabel;
                    nextGenericLabel = String.fromCharCode(nextGenericLabel.charCodeAt(0) + 1);
                    return ret;
                };
                var get = function( type ) {
                    if ( type.metaType === MetaType.TYPE ) {
                        return dataTypeFactory.metatypeFor( get(type.type) );
                    } else {
                        var boundType = type.getBoundType();
                        switch ( boundType.metaType ) {
                            case MetaType.PRIMITIVE:
                            case MetaType.COMPLEX:
                            case MetaType.ANY:
                                return boundType;
                            case MetaType.GENERIC:
                                var key = boundType.ownerId + ":" + boundType.typeLabel;
                                if (!typeMappings[key]) {
                                    typeMappings[key] = getNewGenericLabel();
                                }
                                return dataTypeFactory.genericType(typeMappings[key]);
                            case MetaType.PREDICATE:
                                return dataTypeFactory.predicateOf(get(boundType.type));
                            case MetaType.LIST:
                                return dataTypeFactory.listOf( get(boundType.containedType) );
                            case MetaType.MAP:
                                return dataTypeFactory.mapOf( get(boundType.keyType), get(boundType.valueType) );
                            case MetaType.TUPLE:
                                return dataTypeFactory.tupleOf( get(boundType.keyType), get(boundType.valueType) );
                            default:
                                throw "Unknown type '" + type.metaType + "'";
                        }
                    }
                };

                return {
                    get: get
                };

            }());

            var root = findRoots( components )[0];

            var configMapping = getConfigMapping();
            var config = configMapping ?
                configMapping.reduce( function(map,e) {
                    var type = e.component.getConfig()[e.configKey].type;
                    map[e.externalKey] = {
                        display: e.externalKey,
                        dataType : exposedTypes.get( type ).toString()
                    };
                    return map;
                }, {} ) :
                null;
            var inputs = pipelineStateAPI.getInputs().reduce( function(map,c) {
                var firstOutputConnection = d3.values(c.getOutput().getConnections())[0];
                map[c.getName()] = {
                    display: c.getName(),
                    cardinality: firstOutputConnection && firstOutputConnection.getInput().isMultiple() ? "multiple" : "single",
                    dataType: firstOutputConnection ? exposedTypes.get(firstOutputConnection.getInput().getDataType()).toString() : null
                };
                return map;
            }, {} );

            return {
                name: pipelineName,
                config: config,
                inputs: inputs,
                output: {
                    dataType: exposedTypes.get(root.getOutput().getDataType()).toString()
                },
                type: "inner",
                editState: editable ? EditStates.EDITABLE : EditStates.VIEWABLE
            };
        };
        var addInnerPipelineFunction = function( newFunctionState ) {
            innerComposites[newFunctionState.getId()] = newFunctionState;
            availableComponentTypes[newFunctionState.getId()] = newFunctionState.extractTypeDefinition( true );
            return newFunctionState;
        };
        var addInnerPipelineDef = function(def) {
            var newPipelineId = generateUniqueInnerPipelineId();
            var newState = createPipelineState(newPipelineId, EditStates.EDITABLE);
            newState.initialise(def);
            return addInnerPipelineFunction( newState );
        };
        var updateInnerPipelineFunction = function( newFunctionState ) {

            var typeId = newFunctionState.getId();
            var existingComponentsOfAffectedType = d3.values(components).filter( c => c.getType() === typeId );
            var existingFunctionState = innerComposites[newFunctionState.getId()];

            var mapping = existingFunctionState.getStateChangeMapping( newFunctionState );

            addInnerPipelineFunction( newFunctionState );

            existingComponentsOfAffectedType.forEach( function(component) {
                var connections = { inputs:[] };
                var config = [];
                if ( mapping.output === MappingState.UNCHANGED ) {
                    connections.output = d3.values(component.getOutput().getConnections()).map( function(c) {
                        return {
                            componentId: c.getToInstance().getId(),
                            input: c.getToInputName(),
                            index: c.getInput().getConnectedInputInstance( c.getFromInstance() ).getLocalIndex()
                        };
                    } );
                }
                d3.entries(mapping.inputs).filter( i => i.value === MappingState.UNCHANGED ).map( i => i.key ).forEach( i => {
                    d3.values(component.getInput(i).getConnections()).forEach( c => {
                        connections.inputs.push({
                            componentId: c.getFromInstance().getId(),
                            input: i
                        });
                    } );
                } );
                d3.entries(mapping.config).filter( c => c.value === MappingState.UNCHANGED ).map( c => c.key ).forEach( c => {
                    config.push({
                        propertyName: c,
                        value: component.getConfig()[c].getValueAsString()
                    });
                } );

                var componentDef = {
                    instanceName: component.getName(),
                    id: component.getId(),
                    componentType: component.getType()
                };
                removeComponent(component);
                var newComponent = addComponentFromInstanceDetails( componentDef, false );

                if ( connections.output ) {
                    connections.output.forEach( c => {
                        connect( newComponent.getId(), c.componentId, c.input, c.index );
                    } );
                }
                connections.inputs.forEach( i => {
                    connect( i.componentId, newComponent.getId(), i.input );
                } );
                config.forEach( c => {
                    newComponent.setConfigPropertyFromStringValue(c.propertyName, c.value );
                } );
            } );

        };

        var removeInnerPipelineFunction = function( innerPipelineId ) {
            if (innerComposites[innerPipelineId] && availableComponentTypes[innerPipelineId]) {
                delete innerComposites[innerPipelineId];
                delete availableComponentTypes[innerPipelineId];
            }
        };

        var findRoots = function(components) {
            return d3.values(components).filter( function(component) {
                return !component.getOutput().isConnected() ||
                    d3.values(component.getOutput().getConnections()).filter( function(connection) {
                        return components[connection.getToInstance().getId()] !== undefined;
                    } ).length === 0;
            } );
        };
        var isFunction = function( components ) {
            return findRoots(components).length === 1;
        };

        // === PUBLIC API ===========================================================================

        pipelineStateAPI.getId = function() { return pipelineId; };

        pipelineStateAPI.setPipelineName = function( name ) { pipelineName = name; };
        pipelineStateAPI.getPipelineName = function() { return pipelineName; };
        pipelineStateAPI.getEditState = function() { return pipelineEditState; };

        pipelineStateAPI.addComponentDef = function( instanceDetails ) {
            return addComponentFromInstanceDetails(instanceDetails, false);
        };
        pipelineStateAPI.addInputDef = function( inputName ) {
            return addComponentFromInstanceDetails( { instanceName: inputName }, true );
        };
        pipelineStateAPI.getComponents = function() { return orderedComponents; };
        pipelineStateAPI.getComponentMap = function() { return components; };
        pipelineStateAPI.getInputs = getInputs;
        pipelineStateAPI.getComponent = getComponent;
        pipelineStateAPI.getComponentsByName = function( name ) {
            return orderedComponents.filter( function(c) { return c.getName() === name; } );
        };
        pipelineStateAPI.getOneComponentByName = function( name ) {
            var componentsByName = pipelineStateAPI.getComponentsByName(name);
            return componentsByName.length === 1 ? componentsByName[0] : null;
        };
        pipelineStateAPI.hasComponent = hasComponent;
        pipelineStateAPI.removeComponent = removeComponent;
        pipelineStateAPI.setComponentName = function( componentId, newName ) {
            var component = getComponent( componentId );
            if ( component ) {
                component.setName( newName );
                calculateAndSetDuplicateComponentNameErrors();
            }
        };

        pipelineStateAPI.updateComponentConfigFromStringValue = updateComponentConfigFromStringValue;
        pipelineStateAPI.updateExternalConfigKeyName = updateExternalConfigKeyName;

        pipelineStateAPI.getConfigMappings = function() {
            return orderedComponents.reduce( function(ret, component) {
                return d3.entries(component.getConfig()).reduce( function(ret, configEntry) {
                    if ( component.isExternalisedConfig(configEntry.key) ) {
                        ret.push({
                            componentId: component.getId(),
                            configKey: configEntry.key,
                            externalKey: component.getExternalisedConfigKey( configEntry.key )
                        });
                    }
                    return ret;
                }, ret );
            }, [] );
        };

        pipelineStateAPI.connect = connect;
        pipelineStateAPI.disconnect = disconnect;
        pipelineStateAPI.getConnections = function() { return d3.values(connections); };
        pipelineStateAPI.getConnectionMap = function() { return connections; };
        pipelineStateAPI.hasConnection = function( fromInstanceId, toInstanceId, inputName ) {
            var existingConnection = getConnection( fromInstanceId, toInstanceId, inputName );
            return existingConnection !== null && existingConnection !== undefined;
        };
        pipelineStateAPI.getConnection = getConnection;
        pipelineStateAPI.getElementById = function(id) {
            var sections = id.split(':');
            var component = components[sections[0]];
            return sections[1] === 'output' ? component.getOutput() : component.getInput( sections[2] );
        };

        pipelineStateAPI.getConnectionsFromComponentSet = function( components ) {
            return d3.values(components).reduce( function(map,component) {
                d3.values(component.getConnections()).forEach( function(connection) {
                    map[connection.getId()] = connection;
                } );
                return map;
            }, {} );
        };
        pipelineStateAPI.getConnectionsBetweenComponents = function(components) {
            var getConnectionsBetween = function( map, components ) {
                if ( components.length >= 2 ) {
                    var tail = components.slice(1);
                    tail.forEach( function(component) {
                        components[0].getConnectionsToOrFrom(component).forEach( function(connection) {
                            map[connection.getId()] = connection;
                        } );
                    } );
                    getConnectionsBetween( map, tail );
                }
                return map;
            };
            return getConnectionsBetween( {}, components );
        };

        pipelineStateAPI.extractTypeDefinition = extractTypeDefinition;
        pipelineStateAPI.addInnerPipelineFunction = addInnerPipelineFunction;
        pipelineStateAPI.updateInnerPipelineFunction = updateInnerPipelineFunction;
        pipelineStateAPI.removeInnerPipelineFunction = removeInnerPipelineFunction;
        pipelineStateAPI.getInnerPipelineMap = function() {
            return innerComposites;
        };
        pipelineStateAPI.getAvailableComponentTypes = function() { return availableComponentTypes; };

        pipelineStateAPI.createSubFunction = function( components ) {

            var functionState = createPipelineState( generateUniqueInnerPipelineId(), EditStates.EDITABLE );

            var nonInputComponents = components.filter( c => !c.isInput() );

            var componentIdMapping = {};
            nonInputComponents.forEach( function(component) {
                var componentDef = {
                    instanceName: component.getName(),
                    componentType: component.getType()
                };
                var config = component.getConfig();
                if ( config ) {
                    componentDef.config = d3.keys(config).reduce( function(map,k) {
                        map[k] = config[k].value;
                        return map;
                    }, {} );
                }
                var newComponent = functionState.addComponentDef( componentDef );
                componentIdMapping[component.getId()] = newComponent;
            } );
            var connections = pipelineStateAPI.getConnectionsBetweenComponents( nonInputComponents );
            d3.values(connections).forEach( function(connection) {
                functionState.connect(
                    componentIdMapping[connection.getFromInstance().getId()].getId(),
                    componentIdMapping[connection.getToInstance().getId()].getId(),
                    connection.getToInputName()
                );
            } );
            var inputIdMapping = {};
            d3.keys(componentIdMapping).forEach( function(oldComponentId) {
                var newComponent = componentIdMapping[oldComponentId];
                d3.values(newComponent.getInputs()).forEach( function(input) {
                    if ( !input.isConnected() ) {
                        var functionInput = null;
                        var oldInput = getComponent(oldComponentId).getInput(input.getInputName());
                        if ( oldInput.isConnected() && !oldInput.isMultiple() ) {
                            var oldFromInstance = oldInput.getDefaultInstance().getConnection().getFromInstance();
                            functionInput = inputIdMapping[oldFromInstance.getId()];
                            if ( !functionInput ) {
                                var newInputName = oldFromInstance.getName();
                                if ( !oldFromInstance.isInput() ) {
                                    newInputName += " In";
                                }
                                functionInput = inputIdMapping[oldFromInstance.getId()] = functionState.addInputDef( newInputName );
                            }
                        }
                        if ( !functionInput ) {
                            functionInput = functionState.addInputDef(newComponent.getName() + " " + input.getInputName() + " In");
                        }
                        functionState.connect(
                            functionInput.getId(),
                            newComponent.getId(),
                            input.getInputName()
                        );
                    }
                } );
            } );
            return functionState;
        };
        pipelineStateAPI.getSubFunction = function( functionId ) {
            return innerComposites[functionId] || compositeComponentStates[functionId];
        };

        pipelineStateAPI.isFunction = isFunction;

        pipelineStateAPI.findInstances = function(componentType) {
          return pipelineStateAPI.getComponents().filter(c => componentType === c.getType());
        };

        pipelineStateAPI.getStateChangeMapping = function(otherState ) {

            var existingTypeDef = extractTypeDefinition();
            var newTypeDef = otherState.extractTypeDefinition();

            var getInputChangeMapping = function() {
                var ret = d3.entries(existingTypeDef.inputs).reduce( (ret,e) => {
                    var newInput = newTypeDef.inputs[e.key];
                    if ( newInput && newInput.cardinality === e.value.cardinality && newInput.dataType === e.value.dataType ) {
                        ret[e.key] = MappingState.UNCHANGED;
                        delete existingTypeDef.inputs[e.key];
                        delete newTypeDef.inputs[e.key];
                    }
                    return ret;
                }, {} );
                d3.entries(existingTypeDef.inputs).reduce( (ret,e) => {
                    ret[e.key] = MappingState.REMOVED;
                }, ret );
                return ret;
            };
            var getConfigMapping = function() {
                var ret = d3.entries(existingTypeDef.config).reduce( (ret,e) => {
                    var newProperty = newTypeDef.config[e.key];
                    if ( newProperty && newProperty.dataType === e.value.dataType ) {
                        ret[e.key] = MappingState.UNCHANGED;
                        delete existingTypeDef.config[e.key];
                        delete newTypeDef.config[e.key];
                    }
                    return ret;
                }, {} );
                d3.entries(existingTypeDef.config).reduce( (ret,e) => {
                    ret[e.key] = MappingState.REMOVED;
                }, ret );
                return ret;
            };

            var inputMapping = getInputChangeMapping();
            var configMapping = getConfigMapping();

            return {
                inputs: inputMapping,
                config: configMapping,
                output: existingTypeDef.output.dataType === newTypeDef.output.dataType
                    ? MappingState.UNCHANGED : MappingState.CHANGED
            };
        };

        pipelineStateAPI.validateAll = function() {
            return validateAll();
        };

        pipelineStateAPI.initialise = function( pipelineDefinition ) {

            pipelineName = pipelineDefinition.name;

            var innerPipelinesMappedByName = pipelineDefinition.composites ?
                d3.keys( pipelineDefinition.composites ).reduce( function(map,compositeName) {
                    map["inner/" + compositeName] = addInnerPipelineDef(pipelineDefinition.composites[compositeName]);
                    return map;
                }, {} ) : null;

            var componentsMappedByName = null;
            if ( pipelineDefinition.components ) {
                componentsMappedByName = pipelineDefinition.components.reduce( function(map, componentDef) {
                    var type = componentDef.componentType;
                    var name = componentDef.instanceName;
                    if ( map[name] ) {
                        alert("Duplicate Component Name found : " + name);
                    } else {
                        map[name] = pipelineStateAPI.addComponentDef( {
                            instanceName: name,
                            config: componentDef.config,
                            componentType: type.startsWith("inner") ? innerPipelinesMappedByName[type].getId() : type
                        } );
                    }
                    return map;
                }, {} );
            }
            if ( pipelineDefinition.configMapping ) {
                d3.keys(pipelineDefinition.configMapping).forEach( function(externalConfigKey) {
                    var mappings = pipelineDefinition.configMapping[externalConfigKey];
                    try {
                        mappings.forEach( function(mapping) {
                            componentsMappedByName[mapping.forComponent].externaliseConfig( mapping.configKey, externalConfigKey );
                        } );
                    } catch ( TypeError ) {
                        error( "Pipeline '" + pipelineName +
                            "' needs to contain config mappings for external key '" + externalConfigKey +
                            "' in an array, even if there is only one." );
                    }
                }, {} );
            }
            if ( pipelineDefinition.connections ) {
                pipelineDefinition.connections.forEach( function(connectionDef) {
                    connect(
                        componentsMappedByName[connectionDef.from].getId(),
                        componentsMappedByName[connectionDef.to].getId(),
                        connectionDef.connector
                    );
                } );
            }

            var inputMap = {};
            if ( pipelineDefinition.inputs ) {
                d3.keys(pipelineDefinition.inputs).reduce( function(map, inputName) {
                    map[inputName] = pipelineStateAPI.addInputDef( inputName );
                    return map;
                }, inputMap );
            }
            if ( pipelineDefinition.inputs ) {
                d3.keys(pipelineDefinition.inputs).forEach( function(inputName) {
                    pipelineDefinition.inputs[inputName].connections.forEach( function(connectionDef) {
                        connect(
                            inputMap[inputName].getId(),
                            componentsMappedByName[connectionDef.instanceName].getId(),
                            connectionDef.connector
                        );
                    } );
                } );
            }

            return pipelineStateAPI;
        };
        pipelineStateAPI.get = get;

        pipelineStateAPI.getStatus = function() { return status; };

        return pipelineStateAPI;
    };

    var loadCompositeDefinitions = function(componentDefinitions) {
        var remaining = d3.map( componentDefinitions );
        var remainingCount;
        do {
            remainingCount = remaining.size();

            remaining.each(function ( entry, key ) {
                var fullKey = key;

                try {
                    var compositeTypeDefinition = {};
                    if (entry.pipelineDefinition) {
                        var compositeState = createPipelineState(fullKey, fullKey.startsWith("composite/") ? EditStates.VIEWABLE : EditStates.STATIC);
                        compositeComponentStates[fullKey] = compositeState;
                        compositeState.initialise(entry.pipelineDefinition);
                        compositeTypeDefinition = compositeState.extractTypeDefinition( false );
                    }
                    compositeTypeDefinition.type = "static";
                    if ( fullKey.startsWith("composite/") ) {
                        compositeTypeDefinition.editState = EditStates.VIEWABLE;
                    } else if ( fullKey.startsWith("core/") ) {
                        compositeTypeDefinition.editState = EditStates.STATIC;
                    } else {
                        compositeTypeDefinition.editState = EditStates.EDITABLE;
                    }

                    if (entry.metaData) {
                        compositeTypeDefinition = deepmerge(compositeTypeDefinition, entry.metaData);
                    }
                    componentTypeDefinitions[fullKey] = compositeTypeDefinition;
                    compositeComponents[fullKey] = entry;
                    remaining.remove( key );
                } catch (e) {
                    log(e);
                }
            });
        } while( remainingCount > remaining.size() && remaining.size() > 0 );

        if ( d3.map( remaining ).size() > 0 ) {
            log( "Failed to load the following composite components" );
            log( remaining );
        }
    };


    var initialise = function ( commonComponentDefs, compositeComponentDefinitions) {
        componentTypeDefinitions = Object.assign(componentTypeDefinitions, commonComponentDefs);
        loadCompositeDefinitions(compositeComponentDefinitions);
    };

    return {
        initialise: initialise,
        createPipelineState : createPipelineState,

        EditStates: EditStates,
        ErrorType: ErrorType
    };
};
