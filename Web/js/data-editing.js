
var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.dataEditing = com.mobysoft.dataEditing || {};

com.mobysoft.dataEditing.createDataEditorFactory = function( d3, DataTypeService ) {

    const log = console.log || (() => {});

    const DataTypeFactory = DataTypeService.createDataTypeFactory( "", {} );
    const MetaType = DataTypeService.MetaType;

    const attributeDescriptor = function( attr ) {
        return '[' + attr.name + '="' + attr.value + '"]';
    };
    const elementWithDataId = function( elementName, id ) {
        const attrs = [
            { name: "data-id", value: id }
        ];
        return elementName + attrs.reduce( (ret,attr) => ret + attributeDescriptor(attr), "" );
    };
    const elementWithDataParentId = function( elementName, id ) {
        return elementName + '[data-parent-id="' + id + '"]';
    };

    const createSet = function( isEqualFunc ) {
        const isEqual = isEqualFunc || ((a,b) => a === b);
        let items = [];
        const getExisting = item => {
            for ( let i = 0 ; i < items.length; i++ ) {
                if ( isEqual(item,items[i]) ) {
                    return { index: i, item: items[i] };
                }
            }
            return null;
        };
        const add = item => {
            if ( !getExisting(item) ) {
                items.push( item );
                return true;
            } else {
                return false;
            }
        };
        const addRelative = ( item, after ) => {
            if ( !getExisting(item) ) {
                let start = 0;
                if ( after ) {
                    const afterItem = getExisting(after);
                    if ( afterItem ) {
                        start = afterItem.index + 1;
                    }
                }
                items.splice( start, 0, item );
            } else {
                return false;
            }
        };
        const addAll = items => {
            items.forEach( i => add(i) );
        };
        const remove = item => {
            const existing = getExisting(item);
            if ( existing ) {
                items.splice( existing.index, 1 );
                return true;
            } else {
                return false;
            }
        };
        const clear = () => items = [];
        const setSize = ( count, createNew ) => {
            let difference = items.length - count;
            if ( difference > 0 ) {
                items.splice( count - 1, difference );
            } else if ( difference < 0 ) {
                while( difference++ < 0 ) {
                    add( createNew() );
                }
            }
        };
        return {
            add : add,
            addRelative : addRelative,
            remove : remove,
            clear : clear,
            addAll : addAll,
            clearAndAddAll : items => { clear(); addAll(items); },
            items : () => items.map( i => i ),
            setSize : setSize
        };
    };

    const createIdGenerator = function() {
        let nextId = 0;
        return { next : () => nextId++ };
    };

    const defaultValueForType = function( dataType ) {
        switch ( dataType.metaType ) {
            case MetaType.ANY:
                return { type : "String", value : "" };
            case MetaType.TUPLE:
                return [ defaultValueForType(dataType.keyType), defaultValueForType(dataType.valueType) ];
            default:
                return dataType.defaultValue;
        }
    };

    const setupTypeSelector = function( typeSelector, onselect ) {
        typeSelector.on( 'change', function() {
            if ( onselect ) { onselect( this.value ); }
        } );
    };
    const updateTypeSelector = function( typeSelector, selectableTypes, selectedType ) {
        const selectedCompareStr = selectedType.isPrimitive ? selectedType.typeName : selectedType.metaType;
        const options = typeSelector.selectAll('option').data( selectableTypes.map( st => {
            return {
                key : st.key,
                value : st.value,
                selected : selectedCompareStr === st.key
            };
        } ) );
        options.enter().append('option')
            .property('value',d => d.key)
            .text( d => d.value )
            .merge(options)
            .property('selected',d => d.selected);
        options.exit().remove();
    };
    const getOrCreateElement = function( containerElement, elementName, id, onCreateFunc ) {
        let element = containerElement.select(elementWithDataId(elementName,id));
        if ( element.empty() ) {
            element = containerElement.append(elementName).attr('data-id',id);
            if ( onCreateFunc ) { onCreateFunc(element); }
        }
        return element;
    };

    const appendButton = function( container, text, onclick ) {
        container.append('button') .attr('type','button') .html( "&nbsp;" + text + "&nbsp;" ) .on( 'click', onclick );
    };

    // TODO: replace this if new mechanism works ...
    const oldConvertInternalValue = function( oldDataType, newDataTypeLabel, oldDataValueAsString ) {

        switch ( newDataTypeLabel ) {
            case "String":
            case "Integer":
            case "Date":
            case "Period":
            case "Boolean":
                const newDataType = DataTypeFactory.parseDataType(newDataTypeLabel);
                switch ( oldDataType.metaType ) {
                    case MetaType.PRIMITIVE:
                        return newDataType.equals(oldDataType) ? null : { type: newDataType, value: oldDataValueAsString };
                    case MetaType.LIST:
                        if ( oldDataType.containedType.metaType === MetaType.PRIMITIVE && oldDataValueAsString.length === 1 ) {
                            return { type: newDataType, value: oldDataValueAsString[0] };
                        }
                        break;
                    case MetaType.MAP:
                        if ( oldDataType.valueType.metaType === MetaType.PRIMITIVE ) {
                            const mapEntries = d3.entries(oldDataValueAsString);
                            if ( mapEntries.length === 1 ) {
                                return { type: newDataType, value: mapEntries[0].value }
                            }
                        }
                        break;
                }
                return { type: newDataType, value: newDataType.defaultValue };
            case "map":
                switch ( oldDataType.metaType ) {
                    case MetaType.PRIMITIVE:
                        return {
                            type: DataTypeFactory.mapOf(DataTypeFactory.primitiveType("String"),oldDataType),
                            value: { "" : oldDataValueAsString }
                        };
                    default:
                        return {
                            type: DataTypeFactory.mapOf(DataTypeFactory.primitiveType("String"),DataTypeFactory.primitiveType("String")),
                            value: { "":"" }
                        };
                }
            case "list":
                switch ( oldDataType.metaType ) {
                    default:
                        return {
                            type: DataTypeFactory.listOf(oldDataType),
                            value: [ oldDataValueAsString ]
                        };
                }
            case "tuple":
                switch ( oldDataType.metaType ) {
                    default:
                        return {
                            type: DataTypeFactory.tupleOf(DataTypeFactory.primitiveType("String"),DataTypeFactory.primitiveType("String")),
                            value: [ "", "" ]
                        };
                }
            case "any":
                return {
                    type: DataTypeFactory.anyType(),
                    value: {
                        type: oldDataType.toString(),
                        value: oldDataValueAsString
                    }
                };
        }

        return null;
    };

    const createDataTypePath = function( pathElement, parent ) {
        const dataTypePathAPI = {
            getParent : () => parent,
            getPathElement : () => pathElement,
            equals : other => {
                return (pathElement === other.getPathElement())
                    && (parent ? parent.equals(other.getParent()) : !other.getParent());
            },
            getPathSections : () => (parent ? parent.getPathSections() : []).concat([pathElement])
        };
        return dataTypePathAPI;
    };

    const createTypeEditor = function( id, parent, dataTypePath ) {

        const typeEditorAPI = {};

        let dataType = null;
        let currentContainerElement = null;

        const idGenerator = createIdGenerator();

        const createChildDataTypePath = function( pathElement ) {
            return createDataTypePath( pathElement, dataTypePath );
        };
        const sameDataTypePath = other => (dataTypePath && dataTypePath.equals(other)) || (dataTypePath === undefined && other === undefined);

        // === Type Editors ----------------------------------------------------------------------------

        const createPrimitiveTypeEditor = function() {

            let currentValueAsString = null;
            let currentValue = null;

            const render = function( containerElement ) {
                const input = getOrCreateElement( containerElement, "input", id, (e) => {
                    e.property("value",currentValueAsString);
                    e.attr("type","text").on('keyup',function() {
                        if ( this.value !== currentValueAsString ) {
                            currentValueAsString = this.value;
                            currentValue = dataType.valueFromString(currentValueAsString);
                            render( containerElement );
                        }
                    });
                } );
                input.classed( "error", currentValue === null );
            };
            const setValue = value => { currentValue = dataType.isValidValue(value) ? value : null; };

            const getValue = () => currentValue;
            const getInternalValue = () => { return { type: dataType, value:currentValueAsString }; };
            const setInternalValue = typedValue => {
                if ( typedValue.type.metaType === MetaType.PRIMITIVE ) {
                    dataType = typedValue.type;
                    currentValueAsString = typedValue.value;
                    currentValue = dataType.valueFromString( currentValueAsString );
                    return true;
                } else {
                    return false;
                }
            };
            const attemptTypeChange = function( newDataTypeLabel,originDataTypePath ) {
                if ( !sameDataTypePath(originDataTypePath) ) {
                    return {
                        type: dataType,
                        value: currentValueAsString
                    };
                } else {
                    switch ( newDataTypeLabel ) {
                        case "String":
                        case "Integer":
                        case "Date":
                        case "Period":
                        case "Boolean":
                            return {
                                type: DataTypeFactory.parseDataType(newDataTypeLabel),
                                value:currentValueAsString
                            };
                        default:
                            log( "Primitive cannot convert from " + dataType.toString() + " to " + newDataTypeLabel );
                            return null;
                    }
                }
            };

            return {
                render : render,
                getValue : getValue,
                setValue: v => {
                    setValue(v);
                    if ( v === null ) {
                        currentValueAsString = "";
                    } else {
                        currentValueAsString = typeof v === "string" ? v : JSON.stringify(v);
                    }
                },
                getInternalValue: getInternalValue,
                setInternalValue: setInternalValue,
                handlesDataType: dataType => dataType.metaType === MetaType.PRIMITIVE,
                unrender : function() {
                    const existing = d3.select( elementWithDataId( "input", id ) );
                    if ( !existing.empty() ) {
                        existing.remove();
                    }
                },
                attemptTypeChange : attemptTypeChange
            };
        };

        const createTupleEditor = function() {

            const subEditors = [];

            const createSubEditor = function( subId ) {
                return createTypeEditor( id + "-" + subId, typeEditorAPI, createChildDataTypePath(subId) );
            };

            const render = function( containerElement ) {

                const table = getOrCreateElement( containerElement, 'table', id );
                const header = getOrCreateElement( table, 'thead', id + "-header" );

                const headerRowId = id + "-header-row";
                const headerRow = getOrCreateElement( header, 'tr', headerRowId, (e) => {
                    setupTypeSelector(
                        e.append("th").append("select").attr('data-id',id + '-key-type-select'),
                        function onchange(newDataTypeLabel) {
                            typeEditorAPI.requestTypeChange(
                                dataType.keyType, newDataTypeLabel, createChildDataTypePath("1")
                            );
                        }
                    );
                    setupTypeSelector(
                        e.append("th").append("select").attr('data-id',id + '-value-type-select'),
                        function onchange(newDataTypeLabel) {
                            typeEditorAPI.requestTypeChange(
                                dataType.valueType, newDataTypeLabel, createChildDataTypePath("2")
                            );
                        }
                    );
                } );

                updateTypeSelector(
                    headerRow.select(elementWithDataId('select',id + "-key-type-select")),
                    DataTypeService.TypeGroups.alltypes,
                    dataType.keyType
                );
                updateTypeSelector(
                    headerRow.select(elementWithDataId('select',id + "-value-type-select")),
                    DataTypeService.TypeGroups.alltypes,
                    dataType.valueType
                );

                const bodyId = id + "-body";
                const body = getOrCreateElement( table, 'tbody', bodyId );

                const bodyRowId = bodyId + "-row";
                const row = getOrCreateElement( body, 'tr', bodyRowId );

                getOrCreateElement( row, 'td', bodyRowId + "-1", (e) => { subEditors[0].render( e ); } );
                getOrCreateElement( row, 'td', bodyRowId + "-2", (e) => { subEditors[1].render( e ); } );
            };

            const getValue = function() {
                return [ subEditors[0].getValue(), subEditors[1].getValue() ];
            };
            const getInternalValue = function() {
                return {
                    type : dataType,
                    value : [ subEditors[0].getInternalValue().value, subEditors[1].getInternalValue().value ]
                };
            };
            const setValue = function( v ) {
                subEditors[0] = createSubEditor( "1" );
                subEditors[1] = createSubEditor( "2" );
                subEditors[0].setValue( v[0], dataType.keyType );
                subEditors[1].setValue( v[1], dataType.valueType );
            };
            const setInternalValue = function( typedValue ) {
                if ( typedValue.type.metaType === MetaType.TUPLE ) {
                    dataType = typedValue.type;
                    subEditors[0] = createSubEditor( "1" );
                    subEditors[0].setInternalValue( { type: dataType.keyType, value: typedValue.value[0] } );
                    subEditors[1] = createSubEditor( "2" );
                    subEditors[1].setInternalValue( { type: dataType.valueType, value: typedValue.value[1] } );
                    return true;
                } else {
                    return false;
                }
            };
            const attemptTypeChange = function( newDataTypeLabel,originDataTypePath ) {
                if ( !sameDataTypePath(originDataTypePath) ) {
                    const firstResult = subEditors[0].attemptTypeChange( newDataTypeLabel, originDataTypePath );
                    const secondResult = subEditors[1].attemptTypeChange( newDataTypeLabel, originDataTypePath );
                    if ( firstResult !== null && secondResult !== null ) {
                        return {
                            type : DataTypeFactory.tupleOf( firstResult.type, secondResult.type ),
                            value : [ firstResult.value, secondResult.value ]
                        };
                    } else {
                        return null;
                    }
                } else {
                    alert("Tuple handling data type change from " + dataType.toString() + " to " + newDataTypeLabel);
                }
            };

            return {
                render : render,
                getValue : getValue,
                getInternalValue : getInternalValue,
                setValue : setValue,
                setInternalValue : setInternalValue,
                handlesDataType : dataType => dataType.metaType === MetaType.TUPLE,
                attemptTypeChange : attemptTypeChange,
                unrender : function() {
                    const existing = d3.select( elementWithDataId( "table", id ) );
                    if ( !existing.empty() ) {
                        existing.remove();
                    }
                }
            };
        };

        const createMapEditor = function() {

            const subEditors = createSet();

            const createSubEditorEntry = function() {
                const rowId = id + "-" + idGenerator.next();
                return {
                    id : rowId,
                    key : createTypeEditor( rowId + "-key", typeEditorAPI, createChildDataTypePath("key") ),
                    value : createTypeEditor( rowId + "-value", typeEditorAPI, createChildDataTypePath("value") )
                };
            };
            const setSubEntryValues = function( subEntry, k, v ) {
                subEntry.key.setValue( dataType.keyType.valueFromString(k), dataType.keyType );
                subEntry.value.setValue( v, dataType.valueType );
            };
            const setSubEntryInternalValue = function( subEntry, k, v ) {
                subEntry.key.setInternalValue( { type:dataType.keyType, value:k } );
                subEntry.value.setInternalValue( { type:dataType.valueType, value:v } );
            };

            const appendNew = function( subEditor ) {
                const newSE = createSubEditorEntry();
                setSubEntryValues( newSE, defaultValueForType(dataType.keyType), defaultValueForType(dataType.valueType) );
                subEditors.addRelative( newSE, subEditor );
            };

            const render = function( containerElement ) {

                const table = getOrCreateElement( containerElement, 'table', id );
                const header = getOrCreateElement( table, 'thead', id + "-header" );

                const headerRowId = id + "-header-row";
                const headerRow = getOrCreateElement( header, 'tr', headerRowId, (e) => {
                    setupTypeSelector(
                        e.append("th").append("select").attr('data-id',id + '-key-type-select'),
                        function onchange(newDataTypeLabel) {
                            typeEditorAPI.requestTypeChange(
                                dataType.keyType, newDataTypeLabel, createChildDataTypePath("key")
                            );
                        }
                    );
                    setupTypeSelector(
                        e.append("th").append("select").attr('data-id',id + '-value-type-select'),
                        function onchange(newDataTypeLabel) {
                            typeEditorAPI.requestTypeChange(
                                dataType.valueType, newDataTypeLabel, createChildDataTypePath("value")
                            );
                        }
                    );
                    appendButton( e.append('th'), '+', () => { appendNew(); render( containerElement ); } );
                } );

                updateTypeSelector(
                    headerRow.select(elementWithDataId('select',id + "-key-type-select")),
                    DataTypeService.TypeGroups.keyprimitives,
                    dataType.keyType
                );
                updateTypeSelector(
                    headerRow.select(elementWithDataId('select',id + "-value-type-select")),
                    DataTypeService.TypeGroups.alltypes,
                    dataType.valueType
                );

                const body = getOrCreateElement( table, 'tbody', id + "-body" );
                const rowSelection = body.selectAll(elementWithDataParentId("tr",id)).data( subEditors.items(), d => d.id );
                rowSelection.enter()
                    .append('tr').attr('data-id',d => d.id).attr('data-parent-id',d => id)
                    .style('opacity',0)
                    .merge(rowSelection)
                        .each( function(d) {
                            const rowId = d.id;
                            const cellSelection = d3.select(this).selectAll(elementWithDataParentId('td', rowId)).data( function(d) {
                                return [
                                    { id: rowId + "-key-editor", type: "editor", editor: d.key },
                                    { id: rowId + "-value-editor", type: "editor", editor: d.value },
                                    { id: rowId + "-add-button", type: "row-button", text: "+", onclick: () => {
                                        appendNew( d ); render(containerElement); }
                                    },
                                    { id: rowId + "-remove-button", type: "row-button", text: "-", onclick: () => {
                                        subEditors.remove(d); render(containerElement);
                                    } }
                                ];
                            }, d => d.id );
                            cellSelection.enter().append('td').attr('data-id',d => d.id).attr('data-parent-id',() => rowId)
                                .merge(cellSelection).each( function(d) {
                                    const cellElement = d3.select(this);
                                    cellElement.selectAll('table, button').remove();
                                    switch ( d.type ) {
                                        case "editor": d.editor.render( cellElement ); break;
                                        case "row-button": appendButton( cellElement, d.text, d.onclick ); break;
                                    }
                                } );
                        } )
                        .transition().duration(500).style('opacity',1);
                rowSelection.exit().transition().duration(500).style('opacity',0).remove();
            };

            const setValue = function( v ) {
                const entries = d3.entries(v);
                subEditors.setSize( entries.length, createSubEditorEntry );
                d3.zip(subEditors.items(),entries).forEach( z => setSubEntryValues( z[0], z[1].key, z[1].value ) );
            };
            const setInternalValue = function( typedValue ) {
                if ( typedValue.type.metaType === MetaType.MAP ) {
                    subEditors.setSize( typedValue.value.length, createSubEditorEntry );
                    d3.zip(subEditors.items(),typedValue.value).forEach(
                        z => setSubEntryInternalValue(z[0],z[1].key,z[1].value)
                    );
                    return true;
                } else {
                    return false;
                }
            };
            const getValue = function() {
                return subEditors.items().reduce( (ret,se) => {
                    ret[se.key.getValue()] = se.value.getValue();
                    return ret;
                }, {} );
            };
            const getInternalValue = function() {
                return {
                    type: dataType,
                    value: subEditors.items().map( se => {
                        return {
                            key: se.key.getInternalValue().value,
                            value: se.value.getInternalValue().value
                        };
                    }, {} )
                };
            };
            const attemptTypeChange = function( newDataTypeLabel,originDataTypePath ) {
                if ( !sameDataTypePath(originDataTypePath) ) {

                    const rawResults = subEditors.items().map( se => {
                        const keyResult = se.key.attemptTypeChange( newDataTypeLabel,originDataTypePath );
                        const valueResult = se.value.attemptTypeChange( newDataTypeLabel,originDataTypePath );
                        const valid = keyResult !== null && valueResult !== null;
                        return {
                            valid: valid,
                            types: valid ? {
                                key: keyResult.type,
                                value: valueResult.type
                            } : null,
                            value: valid ? {
                                key:keyResult.value,
                                value:valueResult.value
                            } : null
                        };
                    } );

                    if ( rawResults.filter( r => !r.valid ).length === 0 ) {
                        const byTypes = rawResults.reduce( (ret,r,index) => {
                            const typeStr = r.types.key.toString() + ":" + r.types.value.toString();
                            if ( !ret[typeStr] ) {
                                ret[typeStr] = { types: r.types, entries:[] };
                            }
                            ret[typeStr].entries.push( { index: index, result: r } );
                            return ret;
                        }, {} );

                        const typeList = d3.entries(byTypes);
                        if ( typeList.length === 1 ) {
                            return {
                                type: DataTypeFactory.mapOf(typeList[0].value.types.key,typeList[0].value.types.value),
                                value: typeList[0].value.entries.map( e => e.result.value )
                            };
                        } else {
                            return null;
                        }

                    } else {
                        return null;
                    }

                } else {
                    alert("Map handling data type change from " + dataType.toString() + " to " + newDataTypeLabel);
                }
            };

            return {
                render : render,
                getValue : getValue,
                getInternalValue: getInternalValue,
                setValue : setValue,
                setInternalValue : setInternalValue,
                handlesDataType : dataType => dataType.metaType === MetaType.MAP,
                unrender : function() {
                    const existing = d3.select( elementWithDataId( "table", id ) );
                    if ( !existing.empty() ) {
                        existing.remove();
                    }
                },
                attemptTypeChange : attemptTypeChange
            };
        };

        const createListEditor = function() {

            const subEditors = createSet();

            const createSubEditorEntry = function() {
                const rowId = id + "-" + idGenerator.next();
                return {
                    id : rowId,
                    editor : createTypeEditor( rowId, typeEditorAPI, createChildDataTypePath("contained") )
                };
            };
            const setSubEntryValue = function( subEntry, v ) {
                subEntry.editor.setValue( v, dataType.containedType );
            };
            const setSubEntryInternalValue = function( subEntry, v ) {
                subEntry.editor.setInternalValue( { type:dataType.containedType, value:v } );
            };

            const appendNew = function( subEditor ) {
                const newSE = createSubEditorEntry();
                setSubEntryValue( newSE, defaultValueForType(dataType.containedType) );
                subEditors.addRelative( newSE, subEditor );
            };

            const render = function( containerElement ) {

                const table = getOrCreateElement( containerElement, 'table', id );
                const header = getOrCreateElement( table, "thead", id + "-header" );

                const headerRowId = id + "-header-row";
                const headerRow = getOrCreateElement( header, 'tr', headerRowId, (e) => {
                    setupTypeSelector(
                        e.append("th").append("select").attr('data-id',id + '-type-select'),
                        function onchange(newDataTypeLabel) {
                            typeEditorAPI.requestTypeChange(
                                dataType.keyType, newDataTypeLabel, createChildDataTypePath("contained")
                            );
                        }
                    );
                    appendButton( e.append('th'), '+', () => { appendNew(); render( containerElement ); } );
                } );

                updateTypeSelector(
                    headerRow.select(elementWithDataId('select',id + "-type-select")),
                    DataTypeService.TypeGroups.alltypes,
                    dataType.containedType
                );

                const body = getOrCreateElement( table, "tbody", id + "-body" );
                const rowSelection = body.selectAll(elementWithDataParentId("tr",id)).data( subEditors.items(), d => d.id );
                rowSelection.enter()
                    .append('tr').attr('data-id', d=> d.id).attr('data-parent-id',d => id)
                    .style('opacity',0)
                    .merge(rowSelection)
                        .each( function(d) {
                            const rowId = d.id;
                            const cellSelection = d3.select(this).selectAll(elementWithDataParentId('td', rowId)).data( function(d) {
                                return [
                                    { id: rowId + "-editor", type: "editor", editor: d.editor },
                                    { id: rowId + "-add-button", type: "row-button", text: "+", onclick: function() {
                                        appendNew( d ); render(containerElement);
                                    } },
                                    { id: rowId + "-remove-button", type: "row-button", text: "-", onclick: function() {
                                        subEditors.remove(d); render(containerElement);
                                    } }
                                ];
                            }, function(d) {
                                return d.id;
                            } );
                            cellSelection.enter().append('td').attr('data-id',d => d.id).attr('data-parent-id',() => rowId)
                                .merge(cellSelection).each( function(d) {
                                    const cellElement = d3.select(this);
                                    cellElement.selectAll('table, button').remove();
                                    switch ( d.type ) {
                                        case "editor": d.editor.render( cellElement ); break;
                                        case "row-button": appendButton( cellElement, d.text, d.onclick ); break;
                                    }
                                } );
                            cellSelection.exit().remove();
                        } )
                        .transition().duration(500).style('opacity',1);
                rowSelection.exit().transition().duration(200).style('opacity',0).remove();
            };

            const getValue = function() {
                return subEditors.items().map( se => se.editor.getValue() );
            };
            const getInternalValue = function() {
                return {
                    type: dataType,
                    value: subEditors.items().map( se => se.editor.getInternalValue().value )
                };
            };
            const setValue = function( v ) {
                subEditors.setSize( v.length, createSubEditorEntry );
                d3.zip(subEditors.items(),v).forEach( z => setSubEntryValue(z[0],z[1]) );
            };
            const setInternalValue = function( typedValue ) {
                if ( typedValue.type.metaType === MetaType.LIST ) {
                    subEditors.setSize( typedValue.value.length, createSubEditorEntry );
                    d3.zip(subEditors.items(),typedValue.value).forEach( z => setSubEntryInternalValue(z[0],z[1]) );
                    return true;
                } else {
                    return false;
                }
            };
            const attemptTypeChange = function( newDataTypeLabel,originDataTypePath ) {
                if ( !sameDataTypePath(originDataTypePath) ) {
                    const rawResults = subEditors.items().map( se => {
                        const result = se.editor.attemptTypeChange(newDataTypeLabel,originDataTypePath);
                        const valid = result !== null;
                        return {
                            valid: valid,
                            type: result.type,
                            value: valid ? result.value : null
                        }
                    } );

                    if ( rawResults.filter( r => !r.valid ).length === 0 ) {
                        const byTypes = rawResults.reduce( (ret,r,index) => {
                            const typeStr = r.type.toString();
                            if ( !ret[typeStr] ) { ret[typeStr] = {type: r.type,entries:[]}; }
                            ret[typeStr].entries.push( {
                                index: index,
                                result: r
                            } );
                            return ret;
                        }, {} );

                        const typeList = d3.entries(byTypes);
                        if ( typeList.length === 1 ) {
                            return {
                                type: DataTypeFactory.listOf(typeList[0].value.type),
                                value: typeList[0].value.entries.map( e => e.result.value )
                            };
                        } else {
                            return null;
                        }

                    } else {
                        // At least one entry can't conform to the new type ...
                        return null;
                    }
                } else {
                    alert("List handling data type change from " + dataType.toString() + " to " + newDataTypeLabel);
                }
            };

            return {
                render : render,
                getValue : getValue,
                getInternalValue : getInternalValue,
                setValue: setValue,
                setInternalValue : setInternalValue,
                handlesDataType : dataType => dataType.metaType === MetaType.LIST,
                unrender : function() {
                    const existing = d3.select( elementWithDataId( "table", id ) );
                    if ( !existing.empty() ) {
                        existing.remove();
                    }
                },
                attemptTypeChange : attemptTypeChange
            };
        };

        const createAnyEditor = function() {

            let currentDataType = null;
            let currentTypeEditor = null;

            const render = function( containerElement ) {

                const table = getOrCreateElement( containerElement, 'table', id );
                const row = getOrCreateElement( table, 'row', id );

                const typeSelectId = id + "-type";
                const typeSelectCell = getOrCreateElement( row, 'td', typeSelectId );
                const typeSelect = getOrCreateElement( typeSelectCell, 'select', typeSelectId );
                setupTypeSelector( typeSelect, function onchange(newDataTypeLabel) {


                    const typeChangeAttemptResult = currentTypeEditor.attemptTypeChange(newDataTypeLabel);
                    if ( typeChangeAttemptResult !== null ) {
                        currentTypeEditor.setInternalValue( typeChangeAttemptResult );
                        currentTypeEditor.render();
                    }

                    // const result = currentTypeEditor.attemptTypeChange(newDataTypeLabel);
                    // if ( result !== null ) {
                    //     currentTypeEditor
                    // }
                    //
                    // const newTypedValue = oldConvertInternalValue( currentTypeEditor.getDataType(), newDataTypeLabel, currentTypeEditor.getInternalValue() );
                    // if ( newTypedValue !== null ) {
                    //     currentDataType = newTypedValue.type;
                    //     currentTypeEditor.setInternalValue( newTypedValue.value );
                    // }
                    // currentTypeEditor.render( valueEditorCell );
                } );

                updateTypeSelector(
                    typeSelect,
                    DataTypeService.TypeGroups.standardtypes,
                    currentDataType
                );

                const valueEditorId = id + "-value";
                const valueEditorCell = getOrCreateElement( row, 'td', valueEditorId );
                currentTypeEditor.render( valueEditorCell );
            };

            const setValue = v => {
                currentDataType = DataTypeFactory.parseDataType(v.type);
                currentTypeEditor = createTypeEditor( id + "-value", typeEditorAPI );
                currentTypeEditor.setValue( v.value, currentDataType );
            };
            const setInternalValue = function (typedValue) {
                if ( typedValue.type.metaType === MetaType.ANY ) {
                    currentDataType = DataTypeFactory.parseDataType(typedValue.value.type);
                    if ( !currentTypeEditor ) {
                        currentTypeEditor = createTypeEditor( id + "-value", typeEditorAPI );
                    }
                    if ( !currentTypeEditor.setInternalValue( { type: currentDataType, value:typedValue.value.value } ) ) {
                        currentTypeEditor.replaceSubEditor( typedValue.value.value );
                    }
                    return true;
                } else {
                    return false;
                }
            };
            const getValue = function() {
                return { type : currentDataType.toString(), value : currentTypeEditor.getValue() };
            };
            const getInternalValue = function() {
                return { type: currentDataType.toString(), value: currentTypeEditor.getInternalValue() };
            };

            return {
                render : render,
                getValue : getValue,
                getInternalValue: getInternalValue,
                setInternalValue : setInternalValue,
                handlesDataType : dataType => dataType.metaType === MetaType.ANY,
                setValue : setValue,
                unrender : function() {
                    const existing = d3.select( elementWithDataId( "table", id ) );
                    if ( !existing.empty() ) {
                        existing.remove();
                    }
                }
            };
        };

        const createSubEditor = function( dataType ) {
            switch ( dataType.metaType ) {
                case MetaType.PRIMITIVE: return createPrimitiveTypeEditor();
                case MetaType.TUPLE: return createTupleEditor();
                case MetaType.MAP: return createMapEditor();
                case MetaType.LIST: return createListEditor();
                case MetaType.ANY: return createAnyEditor();
            }
        };

        // ----------------------------------------------------------------------------------------------

        let subEditor = null;

        const setCorrectSubEditor = newDataType => {
            dataType = newDataType;
            if ( subEditor && !subEditor.handlesDataType(dataType) ) {
                subEditor.unrender();
                subEditor = null;
            }
            if ( !subEditor ) {
                subEditor = createSubEditor( dataType );
            }
        };

        typeEditorAPI.render = (containerElement) => {
            if ( containerElement ) {
                currentContainerElement = containerElement;
            } else if ( !currentContainerElement ) {
                log("No current container exists, and non was passed in to render(...)");
            }
            subEditor.render(currentContainerElement);
        };
        typeEditorAPI.getValue  = () => subEditor.getValue();
        typeEditorAPI.getInternalValue = () => subEditor.getInternalValue();
        typeEditorAPI.setInternalValue = internalValue => {
            setCorrectSubEditor( internalValue.type );
            return subEditor.setInternalValue(internalValue);
        };
        typeEditorAPI.setValue = (value,newDataType) => {
            setCorrectSubEditor( newDataType );
            subEditor.setValue( value );
        };
        typeEditorAPI.getId = () => id;
        typeEditorAPI.getDataType = () => dataType;
        typeEditorAPI.unrender = () => subEditor.unrender();
        typeEditorAPI.attemptTypeChange = (newDataTypeLabel,originDataTypePath) =>
            subEditor.attemptTypeChange(newDataTypeLabel,originDataTypePath);
        typeEditorAPI.requestTypeChange = function(newDataTypeLabel,originDataTypePath) {
            if ( parent ) {
                parent.requestTypeChange(newDataTypeLabel,originDataTypePath);
            } else {
                const typeChangeAttemptResult = subEditor.attemptTypeChange(newDataTypeLabel,originDataTypePath);
                if ( typeChangeAttemptResult !== null ) {
                    typeEditorAPI.setInternalValue( typeChangeAttemptResult );
                    typeEditorAPI.render();
                }
            }
        };

        return typeEditorAPI;
    };

    // === Data Editor Factory PUBLIC API --------------------------------------------------------------------------------

    return {
        createTypeEditor : function( datatypeStr, initialValue, id ) {
            const rootDataType = DataTypeFactory.parseDataType( datatypeStr );
            const rootEditor = createTypeEditor( id || "root" );
            rootEditor.setValue( initialValue, rootDataType );

            return {
                render : function( containerSelector ) {
                    rootEditor.render( d3.select(containerSelector) );
                },
                getValue : () => { return { type:rootEditor.getDataType().toString(), value:rootEditor.getValue() }; },
                setValue : value => {
                    rootEditor.setValue( value.value, DataTypeFactory.parseDataType(value.type) );
                    rootEditor.render();
                }
            };
        }
    };

};
