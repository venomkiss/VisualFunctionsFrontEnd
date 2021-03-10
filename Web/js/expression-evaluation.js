var com = com || {};
com.mobysoft = com.mobysoft || {};
com.mobysoft.common = com.mobysoft.common || {};
com.mobysoft.common.expressions = com.mobysoft.common.expressions || {};

com.mobysoft.common.expressions.createStringConsumer = function( initialString ) {

    var str = initialString;

    var escape = function(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    };
    var remainderAfter = function( str, subStr ) {
        return str.indexOf(subStr) === 0 ? str.slice(subStr.length) : null;
    };
    var consume = function( subStr ) {
        var remainder = remainderAfter( str, subStr );
        if ( remainder !== null ) {
            str = remainder;
            return subStr;
        } else {
            return null;
        }
    };
    var consumeAllMatchingRegEx = function( regEx ) {
        var match = str.match( regEx );
        return match ? consume( match[0] ) : null;
    };

    return {
        consume: consume,
        consumeIgnoreLeadingWhitespace: function( subStr ) {
            var regex = new RegExp( "\\s*" + escape(subStr) );
            var match = consumeAllMatchingRegEx(regex);
            return match ? match.trim() : null;
        },
        consumeAllMatchingRegEx: consumeAllMatchingRegEx,
        getRemaining: function() { return str; }
    };
};

com.mobysoft.common.expressions.createTokenCaptureFunction = function( regEx, processFunc ) {
    var next = null;
    return {
        setNext: function (nextOperator) { next = nextOperator; },
        run: function (stringConsumer) {
            var token = stringConsumer.consumeAllMatchingRegEx(regEx);
            if (token) {
                token = token.trim();
                return processFunc(token);
            } else {
                return next ? next.run(stringConsumer) : null;
            }
        }
    };
};

com.mobysoft.common.expressions.createInfixFunction = function( separator, processFunc ) {
    var next = null;
    return {
        setNext: function (nextOperator) { next = nextOperator; },
        run: function (stringConsumer) {
            var lastArg = next.run(stringConsumer);
            if (stringConsumer.consumeIgnoreLeadingWhitespace(separator)) {
                // Game on.  Store the first arg, find more args ...
                var args = [lastArg];
                do {
                    args.push(next.run(stringConsumer));
                } while (stringConsumer.consumeIgnoreLeadingWhitespace(separator));
                return processFunc(args);
            } else {
                return lastArg;
            }
        }
    };
};

com.mobysoft.common.expressions.createOutfixFunction = function( firstCharacter, lastCharacter, processFunc ) {
    var next = null;
    return {
        setNext: function (nextOperator) { next = nextOperator; },
        run: function (stringConsumer) {
            var first = stringConsumer.consumeIgnoreLeadingWhitespace(firstCharacter);
            var content = next.run(stringConsumer);
            if (first) {
                content = processFunc(content);
                var last = stringConsumer.consumeIgnoreLeadingWhitespace(lastCharacter);
            }
            return content;
        }
    };
};

com.mobysoft.common.expressions.createExpressionParser = function( functionTree ) {

    return {
        parseExpression: function( typeStr ) {
            return functionTree.run( com.mobysoft.common.expressions.createStringConsumer( typeStr ) );
        }
    };
};

com.mobysoft.common.expressions.connectFunctions = function( operations, joinLast ) {
    var connectFunctionsR = function( operations ) {
        if ( operations.length > 1 ) {
            operations[0].setNext(connectFunctionsR( operations.slice(1) ));
        }
        return operations[0];
    };
    if ( operations && operations.length > 0 ) {
        connectFunctionsR( operations );
        if ( joinLast  ) {
            operations[operations.length - 1].setNext( operations[0] );
        }
        return operations[0];
    } else {
        return null;
    }
};

