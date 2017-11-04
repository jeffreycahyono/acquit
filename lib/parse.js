var _ = require('lodash');
var esprima = require('esprima');
var marked = require('marked');
var util = require('util');

module.exports = function(transforms, contents, cb) {
  if (cb && !(typeof cb === 'function')) {
    throw Error('Second parameter must be a function.');
  }

  var tree = esprima.parse(contents, { attachComment: true, range: true });

  var visitorFactory = function() {
    var ret = {};

    ret.result = {};

    ret.visit = function(node, parent, context, parentBlock) {
      if (node.type === 'ExpressionStatement' &&
        _.get(node, 'expression.type') === 'CallExpression' &&
        _.get(node, 'expression.callee.name') === 'describe' &&
        _.get(node, 'expression.arguments.length', 0) > 0) {
        var block = {
          type: 'describe',
          contents: node.expression.arguments[0].value,
          blocks: [],
          comments: _.map(node.leadingComments || [], 'value')
        };
        context.push(block);
        return {
          block: block,
          newContext: block.blocks
        };
      } else if (node.type === 'ExpressionStatement' &&
        _.get(node, 'expression.type') === 'CallExpression' &&
        _.get(node, 'expression.callee.name') === 'it' &&
        _.get(node, 'expression.arguments.length', 0) > 1) {
        var block = {
          type: 'it',
          contents: node.expression.arguments[0].value,
          comments: _.map(node.leadingComments || [], 'value'),
          code: contents.substring(node.expression.arguments[1].body.range[0] + 1, node.expression.arguments[1].body.range[1] - 1)
        };

        for (var i = 0; i < transforms.length; ++i) {
          transforms[i](block);
        }

        if (typeof cb !== 'undefined') {
          cb(block);
        }
        context.push(block);

        // Once we've reached an 'it' block, no need to go further
        return null;
      } else if (node.type === 'ExpressionStatement' &&
        _.get(node, 'expression.type') === 'CallExpression' &&
        (_.get(node, 'expression.callee.name') === 'beforeEach' ||
          _.get(node, 'expression.callee.name') === 'before' ||
          _.get(node, 'expression.callee.name') === 'after' ||
          _.get(node, 'expression.callee.name') === 'afterEach') &&
        _.get(node, 'expression.arguments.length', 0) > 0) {
        var theType = _.get(node, 'expression.callee.name');
        var block = {
          type: theType,
          comments: _.map(node.leadingComments || [], 'value'),
          code: contents.substring(node.expression.arguments[0].body.range[0] + 1, node.expression.arguments[0].body.range[1] - 1)
        };

        for (var i = 0; i < transforms.length; ++i) {
          transforms[i](block);
        }

        if (typeof cb !== 'undefined') {
          cb(block);
        }
        if (parentBlock) {
          parentBlock[theType] = block;
        }

        // Once we've reached an 'before' & 'beforeEach' block, no need to go further
        return null;
      }


      return {
        block: parentBlock,
        newContext: context
      };
    };

    return ret;
  };

  var recurse = function (node, parent, context, visitor, parentBlock) {
    if (node instanceof Array || node instanceof Object) {
      var blockData = visitor.visit(node, parent, context, parentBlock);
      if (!blockData) {
        return;
      }
      var newContext = blockData.newContext;

      _.each(node, function (child) {
        recurse(child, node, newContext, visitor, blockData.block);
      });
    }
  };

  var ret = [];
  var visitor = visitorFactory();

  recurse(tree, null, ret, visitor);

  return ret;
};
