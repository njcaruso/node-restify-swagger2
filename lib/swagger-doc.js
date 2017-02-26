/**
 * Copyright (c) 2012 Eirikur Nilsson,
 * code changed by Nick Caruso in 2017 to support Swagger 2.0
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the Software), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';

var _ = require('underscore');
var spec = require('swagger-tools').specs.v2;
var util = require('util');

var SWAGGER_METHODS = ['get', 'patch', 'post', 'put', 'delete'];
var SWAGGER_VERSION = '2.0';

/**
 * Creates a resource opbject
 * @param {string} path           The path
 * @param {object} options        The options
 * @param {object} options.models The models
 * @param {string} options.description The description
 * @return {undefined}
 */
function Resource(path, options) {
  options = options || {};

  this.path = path;
  this.models = options.models || {};
  this.apis = {};
  this.description = options.description;
}

Resource.prototype.getApi = function(path) {
  if (!(path in this.apis)) {
    this.apis[path] = {
      path: path,
      description: '',
      operations: []
    };
  }
  return this.apis[path];
};

var operationType = function(method) {
  method = method.toUpperCase();

  return function(path, summary, operation) {
    if (!operation) {
      operation = summary;
      summary = '';
    } else {
      operation.summary = summary;
    }
    operation.httpMethod = method;
    operation.method = method;

    var api = this.getApi(path);
    api.operations.push(operation);
  };
};

for (var i = 0; i < SWAGGER_METHODS.length; i += 1) {
  var m = SWAGGER_METHODS[i];
  Resource.prototype[m] = operationType(m);
}


var swagger = module.exports = {};

swagger.Resource = Resource;

swagger.resources = [];

/**
 * Configures swagger-doc for a express or restify server.
 * @param  {Server} server  A server object from express or restify.
 * @param  {Object} options Options object
 * @param  {string} options.discoveryUrl  The discovery url
 * @param  {string} options.version       The version
 * @param  {string} options.basePath      The base path
 * @returns {undefined} All changes are mapped to the server attribute
 */
swagger.configure = function(server, options) {
  options = options || {};

  var discoveryUrl = options.discoveryUrl || '/resources.json';
  var self = this;

  this.server = server;
  this.apiVersion = options.version || this.server.versions || '1.0.0';
  this.basePath = options.basePath;
  this.info = options.info;
  this.responseMessages = options.responseMessages;
  var $this = this;

  this.server.get(discoveryUrl, function(req, res, next) {
    var result = self._createResponse(req);
    result.apis = self.resources.map(function(r) {
      return {
        path: r.path,
        description: r.description || '',
      };
    });
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, PATCH, POST, DELETE, PUT');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    var swaggerFilter = req.params.swaggerFilter;

    convertSwagger2(options, result, $this.resources, swaggerFilter, function(errConvert, swagger2output) {
      res.send(swagger2output);
      next();
    });
  });
};

function convertSwagger2(options, result, resources, swaggerFilter, cbConvertSwagger) { // eslint-disable-line
  var paths = {};
  var definitions = options.definitions;

  // console.log('resources = ', JSON.stringify(resources, null, 4));

  resources.forEach(function(resource) {
    _.each(resource.models, function(model, key) {
      var defintion = {
        type: 'object',
        properties: model.properties,
      };

      definitions[key] = defintion;
    });

    _.each(resource.apis, function(api) {
      paths[api.path] = {};

      api.operations.forEach(function(operation) {
        var operationName = operation.method.toLowerCase();

        var parameters = [];
        if (operation.originalParameters) {
          parameters = operation.originalParameters;
        } else {
          operation.parameters.forEach(function(parameter) {
            parameters.push({
              // https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#parameterObject
              name: parameter.name,
              in: parameter.paramType,
              description: parameter.description,
              required: parameter.required,
              schema: parameter.schema,
              type: parameter.type, // if !body
              format: parameter.format, // TODO not mapped
              allowEmptyValue: parameter.allowEmptyValue, // TODO
              items: parameter.items, // TODO required if type is Array
              default: parameter.default, // TODO
            });
          });
        }

        var convertedOperation = {
          tags: operation.tags,
          summary: operation.summary,
          description: operation.description,
          operationId: operation.operationId,
          consumes: operation.consumes,
          produces: operation.produces,
          parameters: parameters,
          responses: operation.responses,
          security: operation.security,
        };

        paths[api.path][operationName] = convertedOperation;

        if (swaggerFilter) {
          if (swaggerFilter !== operation.swaggerFilter) {
            delete paths[api.path][operationName];
          }
        } else {
          if (operation.swaggerFilter) {
            delete paths[api.path][operationName];
          }
        }
      });
    });
  });

  var swagger2 = {
    swagger: '2.0',
    info: {
      description: options.description,
      version: options.version,
      title: options.title,
    },
    host: options.host,
    basePath: options.basePath,
    schemes: options.schemes,
    paths: paths,
    definitions: definitions,
  };

  if (options.securityDefinitions) {
    swagger2.securityDefinitions = options.securityDefinitions;
  }

  var swaggerSpec = JSON.stringify(swagger2, null, 4);
  swaggerSpec = JSON.parse(swaggerSpec);

  spec.validate(swaggerSpec, function(errSwaggerTools, specResolve) {
    if (errSwaggerTools) {
      console.log('errSwaggerTools = ', errSwaggerTools); // eslint-disable-line
      return cbConvertSwagger(errSwaggerTools);
    }

    if (specResolve && specResolve.errors && specResolve.errors.length > 0) {
      console.log('Error, invalid swagger: \n' + util.inspect(specResolve.errors, false, 10, true));  // eslint-disable-line
    }

    if (specResolve && specResolve.warnings && specResolve.warnings.length > 0) {
      console.log('Warning, invalid swagger: \n' + util.inspect(specResolve.warnings, false, 10, true));  // eslint-disable-line
    }

    // swagger2 = require('./sample.json');

    return cbConvertSwagger(null, swagger2);
  });
}

/**
 * Registers a Resource with the specified path and options.
 * @param  {!String} path     The path of the resource.
 * @param  {{models}} options Optional options that can contain models.
 * @return {Resource}         The new resource.
 */
swagger.createResource = function(path, options) {
  var resource = new Resource(path, options);
  var self = this;
  this.resources.push(resource);

  this.server.get(path, function(req, res) {
    var result = self._createResponse(req);
    result.resourcePath = path;
    result.apis = Object.keys(resource.apis).map(function(k) {
      return resource.apis[k];
    });
    result.models = resource.models;
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, PATCH, POST, DELETE, PUT');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.send(result);
  });

  return resource;
};

swagger._createResponse = function(req) {
  var basePath = this.basePath || 'http://' + req.headers.host;
  return {
    swaggerVersion: SWAGGER_VERSION,
    apiVersion: this.apiVersion,
    basePath: basePath,
    info: this.info
  };
};
