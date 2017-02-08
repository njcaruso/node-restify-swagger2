/*
 * Copyright (c) 2013 Timo Behrmann. All rights reserved.
 * code changed by Nick Caruso in 2017 to support Swagger 2.0
 */

var _ = require('underscore');
var swagger = module.exports.swagger = require('./swagger-doc');
var assert = require('assert');
var lingo = require('lingo');
var path = require('path');
// var restifyValidation = require('node-restify-validation');
// var validationUtils = restifyValidation.utils;

module.exports.swaggerPathPrefix = '/swagger/';
module.exports.apiDescriptions = {};

var getApiDescription = module.exports.getApiDescription = function(tempPath) {
  if (tempPath && tempPath.indexOf(module.exports.swaggerPathPrefix) === 0) {
    tempPath = tempPath.substr(module.exports.swaggerPathPrefix.length);
  }

  return module.exports.apiDescriptions[tempPath];
};

var defaultOptions = {
  discoveryUrl: module.exports.swaggerPathPrefix + 'resources.json'
};

var convertToSwagger = module.exports._convertToSwagger = function(tempPath) {
  return tempPath.replace(/:([^/]+)/g, '{$1}');
};

var mapToSwaggerType = module.exports._mapToSwaggerType = function(value) {
  var type = 'string';

  if (!value) {
    // don't care
  } else if (_.has(value, 'swaggerType')) {
    type = value.swaggerType;
  } else if (value.isDate) {
    type = 'dateTime';
  } else if (value.isBoolean) {
    type = 'boolean';
  } else if (value.isInt || value.isNumeric) {
    type = 'integer';
  } else if (value.isFloat || value.isDecimal) {
    type = 'float';
  } else if (value && value.isJSONObject) {
    type = 'object';
  } else if (value && value.isJSONArray) {
    type = 'array';
  }

  return type;
};

module.exports.configure = function(server, options) {
  this.options = _.extend(defaultOptions, options);
  this.server = server;

  if (this.options.apiDescriptions) {
    module.exports.apiDescriptions = this.options.apiDescriptions;
  }

  swagger.configure(this.server, this.options);
};

module.exports.findOrCreateResource = function(resource, options) {
  assert.ok(swagger.resources, 'Swagger not initialized! Execution of configure required!');

  var found = _.find(swagger.resources, function(myResource) {
    return _.isEqual(resource, myResource.path);
  });

  if (found && options.models) {
    _.extend(found.models, options.models);
  }

  var docs = found || swagger.createResource(resource, options || {
    models: {},
    description: getApiDescription(resource)
  });
  return docs;
};

// var pushPathParameters = module.exports._pushPathParameters = function(item, validationModel, parameters) {
//   var hasPathParameters = false;
//
//   _.each(item.path.restifyParams, function(param) {
//     if (!_.has(validationModel, param)) {
//       parameters.push({
//         name: param,
//         description: null,
//         required: true,
//         dataType: 'String',
//         paramType: 'path'
//       });
//       hasPathParameters = true;
//     }
//   });
//
//   return hasPathParameters;
// };

var extractSubtypes = module.exports._extractSubtypes = function(model, swaggerDoc) {
  _.each(model.properties, function(element, key) {
    var isSubtype = !(element.type && element.dataType);
    var submodelName = lingo.capitalize(lingo.camelcase(key));

    if (isSubtype) {
      if (!_.has(swaggerDoc, submodelName)) {
        swaggerDoc.models[submodelName] = {
          properties: element
        };
        extractSubtypes(swaggerDoc.models[submodelName], swaggerDoc);
      }
      model.properties[key] = {
        type: submodelName
      };
    }
  });
};

module.exports.loadRestifyRoutes = function() {
  var self = this;
  var defined = {};

  _.each(this.server.router.mounts, function(item) {

    var spec = item.spec;
    var validationModel = spec.validation;

    if (validationModel) {
      var url = spec.url || item.path;
      var name = lingo.camelcase(url.replace(/[/_]/g, ' '));
      var method = spec.method;
      var specSwagger = spec.swagger || {};
      var mySwaggerPathParts = specSwagger.docPath || url.split(path.sep)[1];
      var mySwaggerPath = module.exports.swaggerPathPrefix + mySwaggerPathParts;
      var models = spec.models || {};

      if (!_.contains(self.options.blacklist, mySwaggerPathParts)) {
        var swaggerDoc = self.findOrCreateResource(mySwaggerPath, {
          models: models,
          description: getApiDescription(mySwaggerPath)
        });
        var parameters = [];

        var description = specSwagger.description;
        if (!description || (description === undefined)) {
          description = '';
        }

        if (spec.requiredRoles) {
          description += '<br /><h4>Security Roles</h4>';
          description += '<span style="font-size: 80%;">(requires permission ' + spec.requiredRoles['required-permission'] + ')</span>';

          description += '<ul>';

          _.each(spec.requiredRoles.groups, function(accessRole) {
            var caveat = '';
            if (accessRole.hasAccess && (accessRole.hasAccess !== true)) {
              caveat = ' <span style="font-style: italic;">' + accessRole.hasAccess + '</span>';
            }

            description += '<li>' + accessRole.name + caveat + '</li>';
          });
          description += '</ul>';
        }

        _.each(validationModel, function(httpValueArray, httpKey) {

          _.each(httpValueArray, function(valueArray, key) {
            // console.log('valueArray = ', valueArray);
            // console.log('key = ', key);

            var value = _.reduce(_.isArray(valueArray) ? valueArray : [valueArray],
              function(memo, entry) {
                return _.extend(memo, entry);
              }, {});

            var swaggerType = mapToSwaggerType(value);
            var myProperty = {
              type: swaggerType,
              dataType: value.swaggerType || swaggerType,
              name: key,
              description: value.description || undefined
            };

            myProperty.schema = value.schema;
            myProperty.description = value.description;

            if (value.type === 'array') {
              myProperty.type = 'array';
              myProperty.items = {
                $ref: swaggerType
              };
            }

            if (_.isArray(value.isIn)) {
              myProperty.allowableValues = {
                valueType: 'LIST',
                values: value.isIn
              };
              if (value.defaultValue) {
                myProperty.defaultValue = value.defaultValue;
              }

            }

            if (_.isBoolean(value.isRequired) && value.isRequired) {
              myProperty.required = true;
            }

            if (_.isEqual(value.scope, 'path')) {
              myProperty.paramType = 'path';
              // hasPathParameters = true;
              parameters.push(myProperty);

            } else if (_.isEqual(value.swaggerType, 'file')) {
              myProperty.paramType = value.swaggerScope || value.scope;
              // hasQueryParameters = true;
              parameters.push(myProperty);

            } else if (_.isEqual(value.scope, 'body')) {
              // model.properties[key] = myProperty;
              // hasBodyParameters = true;
              myProperty.paramType = 'body';
              delete myProperty.type;
              parameters.push(myProperty);
            } else if (_.isEqual(value.scope, 'header')) {
              myProperty.paramType = 'header';
              // hasPathParameters = false;
              parameters.push(myProperty);
            } else if (httpKey === 'resources') {
              myProperty.paramType = 'path';
              parameters.push(myProperty);
            } else {
              myProperty.paramType = 'query';
              // hasQueryParameters = true;
              parameters.push(myProperty);
            }
          });
        });

        // if (hasBodyParameters) {
        //   model.properties = validationUtils.deflat(model.properties);
        //   extractSubtypes(model, swaggerDoc);
        //   swaggerDoc.models[modelName] = model;
        //   parameters.push({
        //     name: 'Body',
        //     description: swagger.summary,
        //     required: true,
        //     dataType: modelName,
        //     paramType: 'body',
        //   });
        // }

        // avoid duplicated routes
        if (!defined[spec.method + spec.url]) {
          swaggerDoc[method.toLowerCase()](convertToSwagger(url), specSwagger.summary, {
            notes: specSwagger.notes || null,
            nickname: specSwagger.nickname || name,
            responseClass: specSwagger.responseClass || undefined,
            produces: specSwagger.produces || swagger.produces || [
              'application/json'
            ],
            consumes: specSwagger.consumes || swagger.consumes || [
              'application/json'
            ],
            responseMessages: specSwagger.responseMessages || swagger.responseMessages || [{
              code: 500,
              message: 'Internal Server Error'
            }],
            originalParameters: specSwagger.parameters,
            parameters: parameters,
            // swagger2
            tags: specSwagger.tags,
            security: specSwagger.security,
            responses: specSwagger.responses,
            description: description,
            operationId: specSwagger.operationId,
          });
          defined[spec.method + spec.url] = true;
        }
      }
    }
  });
};
