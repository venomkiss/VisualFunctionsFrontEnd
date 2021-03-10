var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.common = com.mobysoft.common || {};

com.mobysoft.common.createDatatypeService = function( functions ) {

    var getFunction = function (functionName) {
        return functions && functions[functionName] ? functions[functionName] : null;
    };
    var parseDate = getFunction('Parse Date')
        || function (dateString) {
            if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                var date = new Date(dateString);
                return ( !date || isNaN(date.getDate()) ) ? null : date;
            } else {
                return null;
            }
        };

    var PrimitiveType = {
        BOOLEAN: "Boolean",
        STRING: "String",
        INTEGER: "Integer",
        DATE: "Date",
        PERIOD: "Period"
    };
    var ComplexType = {
        OBJECT: "object"
    };
    var MetaType = {
        PRIMITIVE: "primitive",
        COMPLEX: "complex",
        ANY: "any",
        GENERIC: "generic",
        TYPE: "type",
        LIST: "list",
        MAP: "map",
        TUPLE: "tuple",
        PREDICATE: "predicate"
    };
    var Predicates = {
        "String:IS_EQUAL_IGNORE_CASE" : {
            id:"String:IS_EQUAL_IGNORE_CASE",
            display:"String:IS_EQUAL_IGNORE_CASE",
            dataType:"String"
        },
        "String:START_WITH" : {
            id:"String:START_WITH",
            display:"String:START_WITH",
            dataType:"String"
        },
        "String:END_WITH" : {
            id:"String:END_WITH",
            display:"String:END_WITH",
            dataType:"String"
        },
        "String:CONTAINED_IN_IGNORE_CASE" : {
            id:"String:CONTAINED_IN_IGNORE_CASE",
            display:"String:CONTAINED_IN_IGNORE_CASE",
            dataType:"String"
        },
        "String:CONTAINED_BY_IGNORE_CASE" : {
            id:"String:CONTAINED_BY_IGNORE_CASE",
            display:"String:CONTAINED_BY_IGNORE_CASE",
            dataType:"String"
        },

        "Integer:IS_EQUALS_OR_OVER" : {
            id:"Integer:IS_EQUALS_OR_OVER",
            display:"Integer:IS_EQUALS_OR_OVER",
            dataType:"Integer"
        },
        "Integer:IS_EQUALS_OR_UNDER" : {
            id:"Integer:IS_EQUALS_OR_UNDER",
            display:"Integer:IS_EQUALS_OR_UNDER",
            dataType:"Integer"
        },
        "Integer:IS_UNDER" : {
            id:"Integer:IS_UNDER",
            display:"Integer:IS_UNDER",
            dataType:"Integer"
        },
        "Integer:IS_OVER" : {
            id:"Integer:IS_OVER",
            display:"Integer:IS_OVER",
            dataType:"Integer"
        },

        "Date:IS_BEFORE" : {
            id:"Date:IS_BEFORE",
            display:"Date:IS_BEFORE",
            dataType:"Date"
        },
        "Date:IS_AFTER_OR_EQUAL" : {
            id:"Date:IS_AFTER_OR_EQUAL",
            display:"Date:IS_AFTER_OR_EQUAL",
            dataType:"Date"
        },
        "Date:IS_AFTER" : {
            id:"Date:IS_AFTER",
            display:"Date:IS_AFTER",
            dataType:"Date"
        },
        "Date:IS_EQUAL" : {
            id:"Date:IS_EQUAL",
            display:"Date:IS_EQUAL",
            dataType:"Date"
        },
        "Date:IS_SAME_DAY_MONTH" : {
            id:"Date:IS_SAME_DAY_MONTH",
            display:"Date:IS_SAME_DAY_MONTH",
            dataType:"Date"
        }
    };

    const BINDING_TYPE = {
        NON_NEGOTIABLE : "non-negotiable",
        LOOSE : "loose"
    };

    var BooleanValues = {"true": true, "false": false};
    var exists = function( val ) { return val !== undefined && val !== null; };

    var primitives = {};
    var anyType = null;
    var createDataTypeFactory = function (ownerId, sharedGenericTypes) {

        var createPrimitiveType = function (primitiveTypeName) {

            var isValidValue = (function () {
                switch (primitiveTypeName) {
                    case PrimitiveType.BOOLEAN:
                        return val => exists(val) && val.constructor === Boolean;
                    case PrimitiveType.INTEGER:
                        return val => exists(val) && val.constructor === Number && Number.isInteger(val);
                    case PrimitiveType.STRING:
                        return val => exists(val) && val.constructor === String;
                    case PrimitiveType.DATE:
                        return val => exists(val) && val.constructor === String && parseDate(val) !== null;
                    case PrimitiveType.PERIOD:
                        return val => exists(val) && val.constructor === String
                            && val.match(/^P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/) !== null;
                }
            }());
            var equals = function (type) {
                return type.metaType === MetaType.PRIMITIVE && type.typeName === primitiveTypeName;
            };
            var matches = function (type) {
                return type.metaType === MetaType.GENERIC || equals(type);
            };
            var getEnclosingType = function(type) {
                return equals(type) ? type : any();
            };

            var valueFromString = (function () {
                switch (primitiveTypeName) {
                    case PrimitiveType.DATE:
                    case PrimitiveType.PERIOD:
                        return str => exists(str) && isValidValue(str) ? str : null;
                    case PrimitiveType.STRING:
                        return str => exists(str) ? str : null;
                    case PrimitiveType.INTEGER:
                        return str => exists(str)  && /^-?[0-9]+$/.test(str.trim()) ? parseInt(str) : null;
                    case PrimitiveType.BOOLEAN:
                        return function (str) {
                            var bool = exists(str) ? BooleanValues[str.toLowerCase()] : undefined;
                            return bool !== undefined ? bool : null;
                        };
                }
            }());
            var valueToString = (function () {
                switch (primitiveTypeName) {
                    case PrimitiveType.DATE:
                    case PrimitiveType.PERIOD:
                    case PrimitiveType.STRING:
                        return val => val;
                    default:
                        return val => JSON.stringify(val);
                }
            }());

            return {
                metaType: MetaType.PRIMITIVE,
                typeName: primitiveTypeName,

                isBoolean: PrimitiveType.BOOLEAN === primitiveTypeName,
                isInteger: PrimitiveType.INTEGER === primitiveTypeName,
                isString: PrimitiveType.STRING === primitiveTypeName,
                isDate: PrimitiveType.DATE === primitiveTypeName,
                isPeriod: PrimitiveType.PERIOD === primitiveTypeName,

                isPrimitive: true,
                toString: function () { return primitiveTypeName; },
                getBoundType: function () { return primitiveType(primitiveTypeName); },
                addBindAttempt: function () { },
                removeBindAttempt: function () { },
                getEnclosingType: getEnclosingType,
                valueFromString: valueFromString,
                isValidValue: isValidValue,
                valueToString: valueToString,
                matches: matches,
                defaultValue: (function () {
                    switch (primitiveTypeName) {
                        case PrimitiveType.BOOLEAN:
                            return false;
                        case PrimitiveType.INTEGER:
                            return null;
                        case PrimitiveType.STRING:
                            return "";
                        case PrimitiveType.DATE:
                            return null;
                        case PrimitiveType.PERIOD:
                            return null;
                    }

                }()),
                equals: equals
            };
        };

        var primitiveType = function (primitiveTypeName) {
            const typeName = primitiveTypeName === "LocalDate" ? PrimitiveType.DATE : primitiveTypeName;
            if (!primitives[typeName]) {
                primitives[typeName] = createPrimitiveType(typeName);
            }
            return primitives[typeName];
        };
        var complexType = function (complexTypeName) {
            var equals = function (type) {
                return type.metaType === MetaType.COMPLEX && type.typeName === complexTypeName;
            };
            var matches = function (type) {
                return type.metaType === MetaType.GENERIC || equals(type);
            };
            return {
                metaType: MetaType.COMPLEX,
                typeName: complexTypeName,

                isComplexType: true,
                toString: function() { return complexTypeName; },
                getBoundType: function() { return complexType(complexTypeName); },
                getEnclosingType: function( type ) {
                    return equals(type) ? type : any();
                },

                addBindAttempt: function() {},
                removeBindAttempt: function() {},

                valueFromString: JSON.parse,
                valueToString: JSON.stringify,
                matches: matches,
                defaultValue: {},
                equals: equals
            };
        };
        var genericType = function (typeLabel) {

            var boundType = undefined;

            var bindAttempts = {
                nonNegotiable: null,
                loose: []
            };

            var getBoundType = function () {
                if ( boundType === undefined ) {
                    boundType = null;
                    if ( bindAttempts.nonNegotiable && bindAttempts.nonNegotiable.type ) {
                        boundType = bindAttempts.nonNegotiable.type.getBoundType();
                    }
                    if ((!boundType || boundType.isGeneric) && bindAttempts.loose.length > 0) {
                        boundType = bindAttempts.loose.reduce( (boundType, ba) => {
                            if ( boundType === null ) {
                                return ba.type ? ba.type.getBoundType() : null;
                            } else {
                                return boundType.getEnclosingType(ba.type);
                            }
                        }, boundType );
                    }
                    if ( boundType === null ) {
                        boundType = GenericTypeAPI;
                    }
                }
                return boundType;
            };
            var equals = function (type) {
                return type.MetaType === MetaType.GENERIC &&
                    type.typeLabel === typeLabel &&
                    getBoundType().equals(type.getBoundType());
            };

            var GenericTypeAPI = null;
            if (sharedGenericTypes && sharedGenericTypes[typeLabel]) {
                GenericTypeAPI = sharedGenericTypes[typeLabel];
            } else {
                GenericTypeAPI = {
                    ownerId: ownerId,
                    isGeneric: true,
                    metaType: MetaType.GENERIC,
                    typeLabel: typeLabel,
                    toString: function() { return typeLabel; },

                    addBindAttempt: function (type, id, salience) {

                        if ( salience === BINDING_TYPE.NON_NEGOTIABLE ) {
                            bindAttempts.nonNegotiable = { type: type, id: id };
                        } else {
                            var existing = bindAttempts.loose.filter(ba => ba.id === id);
                            if (existing.length > 0) {
                                existing[0].type = type;
                            } else {
                                bindAttempts.loose.push({type: type, id: id});
                            }
                        }

                        boundType = undefined;
                    },
                    removeBindAttempt: function (id) {
                        if ( bindAttempts.nonNegotiable && bindAttempts.nonNegotiable.id === id ) {
                            bindAttempts.nonNegotiable = null;
                        } else {
                            bindAttempts.loose = bindAttempts.loose.filter(ba => ba.id !== id);
                        }
                        boundType = undefined;
                    },

                    getBoundType: getBoundType,
                    getEnclosingType: function() { return GenericTypeAPI; },

                    valueFromString: function (str) {
                        return str;
                    },
                    valueToString: function (value) {
                        return value;
                    },
                    matches: function() { return true; },
                    defaultValue: primitiveType(PrimitiveType.STRING).defaultValue,
                    equals: equals
                };
                if (sharedGenericTypes) {
                    sharedGenericTypes[typeLabel] = GenericTypeAPI;
                }
            }
            return GenericTypeAPI;
        };
        var listOf = function (containedType) {

            var matches = function (type) {
                return type.metaType === MetaType.LIST && ret.containedType.matches(type.containedType);
            };
            var isValidValue = function (val) {
                return val.constructor === Array &&
                    val.every(value => ret.containedType.isValidValue(value));
            };

            var ret = {
                metaType: MetaType.LIST,
                containedType: containedType,
                isList: true,
                isContainer: true,

                toString: function () {
                    return "[" + ret.containedType.toString() + "]";
                },
                getBoundType: function () {
                    var containedBoundType = ret.containedType.getBoundType();
                    return containedBoundType === null ? null : listOf(containedBoundType);
                },
                getEnclosingType: function( type ) {
                    if (type.isList) {
                        return listOf(
                            ret.containedType.getEnclosingType(type.containedType)
                        );
                    } else {
                        return any();
                    }
                },

                addBindAttempt: function (type, id, salience) {
                    if (type.metaType === MetaType.LIST) {
                        ret.containedType.addBindAttempt(type.containedType, id, salience);
                    }
                },
                removeBindAttempt: function (id) {
                    ret.containedType.removeBindAttempt(id);
                },

                isValidValue: isValidValue,

                valueFromString: function (str) {
                    var ret = null;
                    try {
                        ret = JSON.parse(str);
                        if (ret.constructor !== Array || !isValidValue(ret)) {
                            return null;
                        }
                    } catch (syntaxError) {
                    }
                    return ret;
                },
                valueToString: function (value) {
                    return value !== undefined && value !== null ? JSON.stringify(value) : null;
                },
                matches: matches,
                defaultValue: [],
                equals: function (type) {
                    return type.metaType === MetaType.LIST && ret.containedType.equals(type.containedType);
                }
            };
            return ret;
        };
        var tupleOf = function(keyType, valueType) {

            if ( !exists(keyType) ) { throw "Attempt to create Tuple with a null key type"; }
            if ( !exists(valueType) ) { throw "Attempt to create Tuple with a null value type"; }

            var matches = function(type) {
                return type.metaType === MetaType.TUPLE && keyType.matches(type.keyType) && valueType.matches(type.valueType);
            };
            var isValidValue = function (val) {
                return exists(val) && Array.isArray(val) && val.length === 2 && ret.keyType.isValidValue(val[0]) && ret.valueType.isValidValue(val[1]);
            };
            var ret = {
                metaType: MetaType.TUPLE,
                keyType: keyType,
                valueType: valueType,
                isTuple: true,
                isContainer: true,
                toString: function() {
                    return "(" + ret.keyType.toString() + "," + ret.valueType.toString() + ")";
                },
                getBoundType: function () {
                    return tupleOf(ret.keyType.getBoundType(), ret.valueType.getBoundType());
                },
                getEnclosingType: function( type ) {
                    if (type.isTuple) {
                        return tupleOf(
                            ret.keyType.getEnclosingType(type.keyType),
                            ret.valueType.getEnclosingType(type.valueType)
                        );
                    } else {
                        return any();
                    }
                },
                addBindAttempt: function (type, id, salience) {
                    if ( type.MetaType === MetaType.TUPLE ) {
                        ret.keyType.addBindAttempt(type.keyType, id, salience);
                        ret.valueType.addBindAttempt(type.valueType, id, salience);
                    }
                },
                removeBindAttempt: function (id) {
                    ret.keyType.removeBindAttempt(id);
                    ret.valueType.removeBindAttempt(id);
                },
                isValidValue: isValidValue,
                valueFromString: function (str) {
                    var ret = null;
                    try {
                        ret = JSON.parse(str);
                        if (ret.constructor !== Array || !isValidValue(ret)) {
                            return null;
                        }
                    } catch ( syntaxError ) {}
                    return ret;
                },
                valueToString: function (value) {
                    return value !== undefined && value !== null ? JSON.stringify(value) : null;
                },
                matches: matches,
                defaultValue: [],
                equals: function (type) {
                    return type.metaType === MetaType.TUPLE &&
                        ret.keyType.equals(type.keyType) &&
                        ret.valueType.equals(type.valueType);
                }
            };
            return ret;
        };
        var mapOf = function (keyType, valueType) {

            var matches = function (type) {
                return type.metaType === MetaType.MAP && keyType.matches(type.keyType) && valueType.matches(type.valueType);
            };

            var isValidValue = function (val) {
                return exists(val) && d3.entries(val).reduce(
                    (valid,entry) => valid && ret.keyType.isValidValue(entry.key) && ret.valueType.isValidValue(entry.value),
                    true
                );
            };

            var ret = {
                metaType: MetaType.MAP,
                keyType: keyType,
                valueType: valueType,
                isMap: true,
                isContainer: true,

                toString: function () {
                    return "{" + ret.keyType.toString() + "," + ret.valueType.toString() + "}";
                },

                getBoundType: function () {
                    return mapOf(ret.keyType.getBoundType(), ret.valueType.getBoundType());
                },
                getEnclosingType: function( type ) {
                    if (type.isMap) {
                        return mapOf(
                            ret.keyType.getEnclosingType(type.keyType),
                            ret.valueType.getEnclosingType(type.valueType)
                        );
                    } else {
                        return any();
                    }
                },
                addBindAttempt: function (type, id, salience) {
                    if (type.metaType === MetaType.MAP) {
                        ret.keyType.addBindAttempt(type.keyType, id, salience);
                        ret.valueType.addBindAttempt(type.valueType, id, salience);
                    }
                },
                removeBindAttempt: function (id) {
                    ret.keyType.removeBindAttempt(id);
                    ret.valueType.removeBindAttempt(id);
                },

                isValidValue: isValidValue,

                valueFromString: function (str) {
                    var ret = null;
                    try {
                        ret = JSON.parse(str);
                        if (ret.constructor !== Object || !isValidValue(ret)) {
                            return null;
                        }
                    } catch ( syntaxError ) {}
                    return ret;
                },
                valueToString: function (value) {
                    return value !== undefined && value !== null ? JSON.stringify(value) : null;
                },
                matches: matches,
                defaultValue: {},
                equals: function (type) {
                    return type.metaType === MetaType.MAP &&
                        ret.keyType.equals(type.keyType) &&
                        ret.valueType.equals(type.valueType);
                }
            };
            return ret;
        };
        var metatypeFor = function (genericType) {
            return {
                metaType: MetaType.TYPE,
                type: genericType,
                toString: function() { return "type(" + genericType.toString() + ")"; },
                getBoundType: function() { return genericType.getBoundType(); },
                defaultValue: primitiveType(PrimitiveType.STRING),
                equals: function (type) {
                    return type.metaType === MetaType.TYPE && genericType.equals(type.type);
                }
            };
        };
        var predicateOf = function (comparedType) {

            var isValidValue = function (val) {
                var def = Predicates.forString(val);
                if (!def) {
                    return false;
                } else {
                    return comparedType.getBoundType().matches(primitiveType(def.dataType));
                }
            };

            return {
                metaType: MetaType.PREDICATE,
                type: comparedType,
                toString: function() { return "predicate(" + comparedType.toString() + ")"; },

                getBoundType: function () {
                    return predicateOf(comparedType.getBoundType());
                },
                addBindAttempt: function (type, id, salience) {
                    if (type.metaType === MetaType.PREDICATE) {
                        comparedType.addBindAttempt(type.type, id, salience);
                    }
                },
                removeBindAttempt: function( id ) { comparedType.removeBindAttempt( id ); },

                isValidValue: isValidValue,

                valueFromString: function (str) {
                    return isValidValue(str) ? str : null;
                },
                valueToString: function( value ) { return value; },
                defaultValue: "String:IS_EQUAL_IGNORE_CASE",
                equals: function (_type) {
                    return _type.metaType === MetaType.PREDICATE && _type.type === comparedType;
                }
            };
        };
        var any = function () {
            if (!anyType) {
                anyType = {
                    metaType: MetaType.ANY,
                    isAny: true,
                    toString: function () {
                        return "any";
                    },
                    equals: function (type) {
                        return type.metaType === MetaType.ANY;
                    },
                    matches: function() { return true; },
                    getBoundType: function() { return anyType; },
                    getEnclosingType: function() { return anyType; }
                };
            }
            return anyType;
        };

        var TypeParser = (function () {

            var expressions = com.mobysoft.common.expressions;

            var mapOp = expressions.createOutfixFunction("{", "}", function (arg) {
                return mapOf(arg[0], arg[1]);
            });
            var tupleOp = expressions.createOutfixFunction("(", ")", function(arg) {
                return tupleOf(arg[0], arg[1]);
            });
            var listOp = expressions.createOutfixFunction("[", "]", function (arg) {
                return listOf(arg);
            });
            var typeOp = expressions.createOutfixFunction("type(", ")", function (arg) {
                return metatypeFor(arg);
            });
            var predicateOp = expressions.createOutfixFunction("predicate(", ")", function (arg) {
                return predicateOf(arg);
            });
            var sequenceOp = expressions.createInfixFunction(",", function (args) {
                return args;
            });
            var typeNameCaptureOp = expressions.createTokenCaptureFunction(/^\s*[A-Za-z0-9]+\s*/, function (token) {
                switch (token) {
                    case PrimitiveType.BOOLEAN:
                    case PrimitiveType.STRING:
                    case PrimitiveType.INTEGER:
                    case PrimitiveType.DATE:
                    case "LocalDate":
                    case PrimitiveType.PERIOD:
                        return primitiveType(token);
                    case ComplexType.OBJECT:
                        return complexType(token);
                    case MetaType.ANY:
                        return any();
                    default:
                        return genericType(token);
                }
            });

            return expressions.createExpressionParser(
                expressions.connectFunctions([mapOp, tupleOp, sequenceOp, listOp, typeOp, predicateOp, typeNameCaptureOp], true)
            );
        }());

        return {
            parseDataType: TypeParser.parseExpression,

            primitiveType: primitiveType,
            genericType: genericType,
            listOf: listOf,
            mapOf: mapOf,
            tupleOf: tupleOf,
            predicateOf: predicateOf,
            metatypeFor: metatypeFor,
            anyType: any,

            BINDING_TYPE: BINDING_TYPE,

            defaultForTypeLabel: function( typeLabel ) {
                switch ( typeLabel ) {
                    case PrimitiveType.STRING:
                    case PrimitiveType.INTEGER:
                    case PrimitiveType.DATE:
                    case PrimitiveType.PERIOD:
                    case PrimitiveType.BOOLEAN:
                        return primitiveType( typeLabel );
                    case MetaType.MAP:
                        return mapOf( primitiveType(PrimitiveType.STRING), anyType );
                    case MetaType.LIST:
                        return listOf( anyType );
                    case MetaType.TUPLE:
                        return tupleOf( anyType, anyType );
                    case MetaType.ANY:
                        return anyType;
                }
            }
        };
    };

    var translatePredicateName = function( name ) {
        return name.indexOf('LocalDate') === 0 ? 'Date' + name.substr(9) : name;
    };

    return {
        createDataTypeFactory: createDataTypeFactory,
        TypeGroups : (function () {
            var ret = {
                keyprimitives: [{
                    key: "String", value: "String"
                }, {
                    key: "Integer", value: "Integer"
                }, {
                    key: "Date", value: "Date"
                }],
                containertypes: [{
                    key: "list", value: "List"
                }, {
                    key: "map", value: "Map"
                }, {
                    key: "tuple", value: "Tuple"
                }]
            };
            ret.primitives = ret.keyprimitives.concat([{
                key: "Boolean", value: "Boolean"
            }, {
                key: "Period", value: "Period"
            }]);
            ret.standardtypes = ret.primitives.concat(ret.containertypes);
            ret.alltypes = ret.standardtypes.concat([{
                key: "any", value: "Any"
            }]);
            return ret;
        }()),
        MetaType: MetaType,
        PrimitiveType: PrimitiveType,
        Predicates: {
            all: Predicates,
            forString: function(name) { return Predicates[translatePredicateName(name)]; }
        },
        BINDING_TYPE: BINDING_TYPE
    };
};
