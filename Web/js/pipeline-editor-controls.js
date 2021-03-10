var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.pipeline = com.mobysoft.pipeline || {};

com.mobysoft.pipeline.createPipelineEditorControls = function( containerSelector, d3 ) {

    var mainContainer = d3.select(containerSelector);

    var stringEmpty = function( str ) { return str === undefined || str === null || str.trim() === ""; };

    var className = function( id, type ) {
        return 'controls-' + id + '-' + type;
    };

    var pipelineState = null;
    var selectionState = null;
    var callbacks = null;
    var atRoot = true;
    var isTestResultVisible = false;
    var functionId = null;

    var render = function() {

        var getCallbackDefault = function( callbackName ) {
            return callbacks ? callbacks[callbackName] : d => d;
        };

        var componentTypes = function() {
            return pipelineState ? d3.entries(pipelineState.getAvailableComponentTypes()).map( function(entry) {
                return {
                    id: entry.key,
                    componentDef: entry.value
                };
            } ) : [];
        };

        var getInstanceCount = id => pipelineState ? pipelineState.findInstances(id).length : 0;

        var getTypeState = function() {
            var element = mainContainer.select('select').classed(className("typesSelect",'select'),true);
            var node = element.node();
            var componentTypeIndex = Math.min(Math.max(node ? node.selectedIndex : 0, 0), Math.max(componentTypes().length - 1, 0));
            var selectedComponentType = componentTypes().length > 0 ? componentTypes()[componentTypeIndex] : undefined;
            var instances = pipelineState ? pipelineState.findInstances(selectedComponentType.id).length : 0;
            return {
                index: componentTypeIndex,
                componentType: selectedComponentType,
                count: instances
            };
        } ;

        var getSelectionState = function() {
            return {
                selection: selectionState ? selectionState.getSelectedComponents() : [],
                isFunction: selectionState ? selectionState.isFunction() : false
            };
        };

        var getSelectedComponentText = function() {
            var selectedComponents = getSelectionState().selection;
            if (selectedComponents.length === 0) {
                return "";
            }
            return "Remove : " + (selectedComponents.length > 1 ? "Selected Components" : selectedComponents[0].getName());
        };

        var isTrue = function(value) {
            if (typeof value === "function") {
                return (value)();
            }
            return value;
        };

        var fromConstant = function( valueConstant ) {
            return function() {
                return valueConstant;
            };
        };

        var fromFunction = function( valueFunction ) {
            return function() {
                var v = valueFunction.apply(this, arguments);
                return v == null ? "" : v;
            };
        };

        var getValueFromConstantOrFunction = function( constantOrFunction ) {
            return (typeof constantOrFunction === "function" ? fromFunction : fromConstant)(constantOrFunction)();
        };


        var safeDisableControl = function(control, config) {
            try{
                control.attr("disabled", config.enabled ? null : "disabled");
            } catch (e) {}
        };

        var sectionSelectionNew = mainContainer.selectAll('div').data( function(d) {
            var sectionDefs = [
                {
                    name: "function-name",
                    visible: true,
                    contains: [{
                        name:"function-name",
                        type: "input", text: d=>(pipelineState ? pipelineState.getPipelineName() : null) || "",
                        placeHolder:"Please provide a name",
                        onKeyup: d => {getCallbackDefault("onChangeName")(d);render()},
                        visible: true,
                        enabled: true
                    }]
                }, {
                    name: "save",
                    visible: () => atRoot,
                    contains: [{
                        name: "saveButton",
                        type: "button",
                        text: "Save configuration",
                        onClick: d => getCallbackDefault('save')(),
                        visible: true,
                        enabled: true
                    },{
                        name: "testButton",
                        type: "button",
                        text: "Test Pipeline",
                        onClick: d => getCallbackDefault('test')(),
                        visible: true,
                        enabled: true
                    },{
                        name: "toggleShowTestResultsButton",
                        type: "button",
                        text: ( getCallbackDefault('isTestResultVisible')() ? "Hide" : "Show" ) + " Test Results",
                        onClick: d => { getCallbackDefault('toggleShowTestResults')(); render() },
                        visible: () => {
                            return getCallbackDefault('isTestResultAvailable')();
                        },
                        enabled: true
                    }]
                }, {
                    name:"add-new",
                    visible: true,
                    contains:[{
                        name: "add-new",
                        type: "button",
                        text: "Add New",
                        onClick: d => getCallbackDefault('add')(getTypeState().componentType.id),
                        visible: true,
                        enabled: true
                    }, {
                        name: "typesSelect",
                        type: "select",
                        options: componentTypes(),
                        onChange: d => render(),
                        visible: true,
                        enabled: true
                    },{
                        name: "editButton",
                        type: "button",
                        text: "Edit",
                        onClick: d => getCallbackDefault('editComponentType')(getTypeState().componentType.id),
                        visible: () => getTypeState().componentType && getTypeState().componentType.componentDef.editState === "editable",
                        enabled: true
                    },{
                        name: "viewButton",
                        type: "button",
                        text: "View",
                        onClick: d => getCallbackDefault('editComponentType')(getTypeState().componentType.id),
                        visible: () => getTypeState().componentType && getTypeState().componentType.componentDef.editState === "viewable",
                        enabled: true
                    },{
                        name: "selectButton",
                        type: "button",
                        text: "Select",
                        onClick: function(d){ getCallbackDefault('selectByType')(getTypeState().componentType); render();},
                        visible: getTypeState().count > 0,
                        enabled: true
                    },{
                        name: "removeInnerButton",
                        type: "button",
                        text: "Remove Inner",
                        onClick: function(d){ getCallbackDefault('removeInner')(getTypeState().componentType.id); render();},
                        visible: () => getTypeState().count == 0 && getTypeState().componentType && getTypeState().componentType.componentDef.editState === "editable",
                        enabled: true
                    }]
                }, {
                    name: "remove",
                    visible: getSelectionState().selection.length > 0,
                    contains: [{
                        name: "remove",
                        type: "button",
                        text: getSelectedComponentText(),
                        onClick: d => getCallbackDefault('remove')(),
                        visible: true,
                        enabled: true}]
                }, {
                    name: "extract",
                    visible: getSelectionState().selection.length > 1
                        && getSelectionState().isFunction
                        && getSelectionState().selection.every(s => s.getType() && !s.getType().startsWith("inner/")),
                    contains: [{
                        name: "extract",
                        type: "button",
                        text: "Extract as Function",
                        onClick: d => getCallbackDefault('extract')(),
                        visible: true,
                        enabled: true
                    }]
                }, {
                    name: "back",
                    visible: !atRoot,
                    contains: [{
                        name: "back",
                        type: "button",
                        text: "Back",
                        onClick: d => getCallbackDefault('back')(),
                        visible: true,
                        enabled: true
                    }]
                }, {
                    name: "back-and-save",
                    visible: () => !atRoot && !stringEmpty(pipelineState.getPipelineName()) && pipelineState.getId().startsWith("inner/"),
                    contains: [{
                        name: "back-and-save",
                        type: "button",
                        text: "Save Function and Go Back",
                        onClick: d => getCallbackDefault('backAndSave')(),
                        visible: true,
                        enabled: true
                    }]
                }
            ];

            sectionDefs = sectionDefs.filter(sd => isTrue(sd.visible));
            sectionDefs.forEach(sd => sd.contains = sd.contains.filter(c => isTrue(c.visible)));

            return sectionDefs;
        }, d => d.name );

        sectionSelectionNew.enter().append('div')
            .classed('controls-section', true)
            .each(function(d) {
                var div = d3.select(this);
                var controlSelect = div.selectAll("input,button,select").data(d.contains, k => k.name);
                controlSelect.enter()
                    .each(function (dd) {
                        var control = d3.select(this);
                        switch (dd.type) {
                            case "button" :
                                control.append("button")
                                    .attr('data-pipeline-control-id', dd.name)
                                    .classed(className(dd.name, 'button'), true)
                                    .on('click', dd.onClick);
                                break;
                            case "select" :
                                control.append("select")
                                    .attr('data-pipeline-control-id', dd.name)
                                    .classed(className(dd.name, 'select'), true);
                                break;
                            case "input" :
                                control.append("input")
                                    .attr('placeholder', dd.placeHolder || "")
                                    .attr("disabled", dd.enabled ? null : "disabled")
                                    .classed(className(dd.name, 'input'), true)
                                    .on('keyup', function(kd){dd.onKeyup(this.value)})
                                    .attr('data-pipeline-control-id', dd.name);
                                break;
                            default:
                                break;
                        }
                    });
            })
            .merge(sectionSelectionNew).each( function(d) {
                var div = d3.select(this);
                var controlSelect = div.selectAll("input,button,select").data(d.contains, k => k.name);
                controlSelect.enter()
                .each(function (dd) {
                    var control = d3.select(this);
                    switch (dd.type) {
                        case "button" :
                            control.append("button")
                                .attr('data-pipeline-control-id', dd.name)
                                .classed(className(dd.name, 'button'), true)
                                .on('click', dd.onClick)
                                .text(dd.text);
                            break;
                        case "select" :
                            control.append("select")
                                .attr('data-pipeline-control-id', dd.name)
                                .classed(className(dd.name, 'select'), true);
                            break;
                        case "input" :
                            control.append("input")
                                .attr('placeholder', dd.placeHolder || "")
                                .attr("disabled", dd.enabled ? null : "disabled")
                                .classed(className(dd.name, 'input'), true)
                                .on('keyup', kd => dd.onKeyup(this.value))
                                .attr('data-pipeline-control-id', dd.name);
                            break;
                        default:
                            break;
                    }
                }).merge(controlSelect)
                .each(function (dd) {
                    var control = d3.select(this);
                    switch (dd.type) {
                        case "button" :
                            control.text(dd.text);
                            safeDisableControl(control, dd);
                            break;
                        case "select" :
                            safeDisableControl(control, dd);
                            control.on('change', dd.onChange);
                            var optionSelection = control.selectAll('option').data( sd => dd.options, sd => sd.id);
                            optionSelection.enter().each(function(od){
                                d3.select(this).append('option').property( 'value', d=> d.id ).text( d => d.componentDef.name + " (" + getInstanceCount(d.id) + ")");
                            }).merge(optionSelection).each(function(od) {
                                d3.select(this).text( d => d.componentDef.name + " (" + getInstanceCount(d.id) + ")");
                            });
                            optionSelection.exit().remove();
                            break;
                        case "input" :
                            if (control.property("value") !== getValueFromConstantOrFunction(dd.text)) {
                                control.property("value", dd.text);
                            }
                            safeDisableControl(control, dd);
                            break;
                        default:
                            break;
                    }

                });
                controlSelect.exit().transition().duration(500).style('opacity',0).remove();
            });

        sectionSelectionNew.exit().transition().duration(500).style('opacity',0).remove();
    };

    var setState = function( controlsDefinition ) {
        pipelineState = controlsDefinition.pipelineState;
        selectionState = controlsDefinition.selectionState;
        callbacks = controlsDefinition.callbacks;
        atRoot = controlsDefinition.isAtRoot;
        isTestResultVisible: controlsDefinition.isTestResultVisible;
        functionId = pipelineState ? pipelineState.getId() : null;
        render();
    };

    return {
        setState: setState
    };
};
