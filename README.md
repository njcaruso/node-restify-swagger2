node-restify-swagger2
=======================

This is based of https://github.com/z0mt3c/node-restify-swagger, but rewritten to work with Swagger 2.0.

There will be breaking changes, and this project has just started.

DO NOT USE (YET)

## Requirements
This project depends on https://github.com/z0mt3c/node-restify-validation.

## Example

    var restify = require('restify');
    var restifySwagger = require('node-restify-swagger');
    var restifyValidation = require('node-restify-validation');

    var server = restify.createServer();
    server.use(restify.queryParser());
    server.use(restifyValidation.validationPlugin({
        errorsAsArray: false,
    }));
    restifySwagger.configure(server, {
        description: 'Description of my API',
        title: 'Title of my API',
        allowMethodInModelNames: true
    });

    server.post({
        url: '/animals',
        swagger: {
                summary: 'Add animal',
                docPath: 'zoo'
        },
        validation: {
            name: { isRequired: true, isAlpha:true, scope: 'body' },
            locations: { isRequired: true, type:'array', swaggerType: 'Location', scope: 'body' }
        },
        models: {
            Location: {
                id: 'Location',
                properties: {
                    name: { type: 'string' },
                    continent: { type: 'string' }
                }
            },
        }
    }, function (req, res, next) {
        res.send(req.params);
    });

    restifySwagger.loadRestifyRoutes();
    server.listen(8001, function () {
        console.log('%s listening at %s', server.name, server.url);
    });


Above will validate and accept at POST /animals:

    {
        "name": "Tiger",
        "location": [
            { "name": "India", continent: "Asia" },
            { "name": "China", continent: "Asia" }
        ]
    }

And produce swagger spec doc at http://localhost:8001/swagger/resources.json

    {
      "swaggerVersion": "1.2",
      "apiVersion": [],
      "basePath": "http://localhost:8001",
      "apis": [
        {
          "path": "/swagger/zoo",
          "description": ""
        }
      ]
    }

And endpoint documentation at http://localhost:8001/swagger/zoo

    {
      "swaggerVersion": "2.0",
      "apiVersion": [],
      "basePath": "http://localhost:8001",
      "resourcePath": "/swagger/zoo",
      "apis": [
        {
          "path": "/animals",
          "description": "",
          "operations": [
            {
              "notes": null,
              "nickname": "Animals",
              "produces": [
                "application/json"
              ],
              "consumes": [
                "application/json"
              ],
              "responseMessages": [
                {
                  "code": 500,
                  "message": "Internal Server Error"
                }
              ],
              "parameters": [
                {
                  "name": "Body",
                  "required": true,
                  "dataType": "POSTAnimals",
                  "paramType": "body"
                }
              ],
              "summary": "Add animal",
              "httpMethod": "POST",
              "method": "POST"
            }
          ]
        }
      ],
      "models": {
        "Location": {
          "id": "Location",
          "properties": {
            "name": {
              "type": "string"
            },
            "continent": {
              "type": "string"
            }
          }
        },
        "POSTAnimals": {
          "properties": {
            "name": {
              "type": "string",
              "dataType": "string",
              "name": "name",
              "required": true
            },
            "locations": {
              "type": "array",
              "dataType": "Location",
              "name": "locations",
              "items": {
                "$ref": "Location"
              },
              "required": true
            }
          }
        }
      }
    }


## Install

TBD (not yet on NPM)

## License


The MIT License (MIT)

Copyright (c) 2016 Nick Caruso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
