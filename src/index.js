#! /usr/bin/env node
const { argv } = require('yargs') // eslint-disable-line
  .alias('v', 'validator')
  .alias('o', 'output')
  .alias('h', 'header')
  .alias('b', 'baseUrl')
  .describe('v', 'Location of validator directory of the folder')
  .describe('o', 'Location of the output file location')
  .describe('h', 'Location of the header file in json format')
  .describe('b', 'Override base url')
  .demandOption(['v', 'o', 'h'])
  .help('help')
  .example('swagger-generator -r -v ./validators -h ./header.json -o ./swagger.json');

const glob = require('glob');
const path = require('path');
const fs = require('fs-extra');
const _ = require('lodash');
const j2s = require('joi-to-swagger');

const baseUrl = argv.baseUrl ? argv.baseUrl : 'http://${stageVariables.url}'; // eslint-disable-line
const validatorFile = argv.validator;
const relativeHeaderPath = argv.header;
const relativeOutputFile = argv.output;

const checkers = {
  headers: 'header',
  params: 'path',
  query: 'query',
  body: 'body'
};

const requestMapping = {
  query: 'querystring',
  headers: 'header',
  params: 'path'
};

String.prototype.capitalize = function () { // eslint-disable-line
  return this.charAt(0).toUpperCase() + this.slice(1);
};

const constructSwaggerParams = (swaggerJson, validator) => {
  const { joiSchema } = validator;
  const parameters = [];
  Object.keys(checkers).forEach((checker) => {
    if (joiSchema[checker]) {
      const { swagger } = j2s(joiSchema[checker]);
      for (let key in swagger.properties) { // eslint-disable-line
        const temp = {
          name: key,
          in: checkers[checker],
          required: swagger.required ? swagger.required.includes(key) : false,
          type: swagger.properties[key].type
        };
        if (checker === 'body') {
          delete temp.type;
          const modelName = `${validator.name.replace(/\s/g, '')}${validator.type.capitalize()}Body`;
          swaggerJson.definitions[modelName] = swagger; // eslint-disable-line
          temp.schema = {
            $ref: `#/definitions/${modelName}`
          };
        }
        parameters.push(temp);
      }
    }
  });
  return parameters;
};

const constructSwaggerMapping = (validator, parameters, responses, deprecated) => ({
  summary: validator.name,
  consumes: [
    'application/json'
  ],
  produces: [
    'application/json'
  ],
  parameters,
  deprecated,
  responses
});

const constructAwsApiIntegration = (validator, parameters) => {
  const apiGateway = {
    passthroughBehavior: 'when_no_match',
    httpMethod: validator.type,
    type: 'http_proxy',
    uri: baseUrl + validator.path,
    timeoutInMillis: validator.timeout || 29000,
    responses: {
      default: {
        statusCode: '200',
        responseParameters: {
          'method.response.header.Access-Control-Allow-Headers': '\'Content-Type,X-Amz-Date,Authorization,X-Api-Key\'',
          'method.response.header.Access-Control-Allow-Methods': '\'*\'',
          'method.response.header.Access-Control-Allow-Origin': '\'*\''
        }
      }
    }
  };

  const requestParams = {};
  parameters.forEach((param) => {
    if (requestMapping[param.in]) {
      const keyName = `integration.request.${requestMapping[param.in]}.${param.name}`;
      const value = `method.request.${requestMapping[param.in]}.${param.name}`;
      requestParams[keyName] = value;
    }
  });
  apiGateway.requestParameters = requestParams;
  apiGateway.cacheKeyParameters = [];
  if (validator.enableApiGatewayCaching) {
    Object.keys(validator.cacheSchema).forEach((cacheSchema) => {
      validator.cacheSchema[cacheSchema].forEach((param) => {
        apiGateway.cacheKeyParameters.push(`method.request.${requestMapping[cacheSchema]}.${param}`);
      });
    });
  }
  return apiGateway;
};

const constructSwaggerResponse = (swaggerJson, validator) => {
  const responses = {};
  const { swagger } = j2s(validator.joiSchema.response);
  for (let statusCode in swagger.properties) { // eslint-disable-line
    const modelName = `${validator.name.replace(/\s/g, '')}${validator.type.capitalize()}${statusCode}Response`;
    swaggerJson.definitions[modelName] = swagger.properties[statusCode].properties.body; // eslint-disable-line

    const data = {
      description: swagger.properties[statusCode].properties.description.enum[0],
      schema: {
        $ref: `#/definitions/${modelName}`
      }
    };

    if (swagger.properties[statusCode].properties.header) {
      data.headers = swagger.properties[statusCode].properties.header.properties;
    }

    if (statusCode >= 200 && statusCode < 400) {
      if (!data.headers) {
        data.headers = {};
      }
      data.headers['Access-Control-Allow-Headers'] = {
        type: 'string'
      };
      data.headers['Access-Control-Allow-Methods'] = {
        type: 'string'
      };
      data.headers['Access-Control-Allow-Origin'] = {
        type: 'string'
      };
    }
    responses[statusCode] = data;
  }
  return responses;
};

const getCorsDefaultResponse = () => ({
  200: {
    description: 'Default response for CORS method',
    headers: {
      'Access-Control-Allow-Headers': {
        type: 'string'
      },
      'Access-Control-Allow-Methods': {
        type: 'string'
      },
      'Access-Control-Allow-Origin': {
        type: 'string'
      }
    }
  }
});

const curateDocumentation = (json, validators) => {
  const swaggerJson = setDefaultDocumentation(json);
  validators.forEach((validator) => {
    if (_.isEmpty(validator.joiSchema) || _.isEmpty(validator.joiSchema.response)) {
      console.log(`Invalid Joi Schema - ${validator.name}`);
      process.exit(0);
    }
    const apiOptions = {
      corsEnabled: _.get(validator, 'cors', true),
      deprecated: _.get(validator, 'deprecated', false)
    };
    const parameters = constructSwaggerParams(swaggerJson, validator, apiOptions);
    const responses = constructSwaggerResponse(swaggerJson, validator);

    const swaggerMapping = constructSwaggerMapping(validator, parameters, responses, apiOptions.deprecated);
    swaggerMapping['x-amazon-apigateway-integration'] = constructAwsApiIntegration(validator, parameters);
    const apiDoc = {};
    apiDoc[validator.type] = swaggerMapping;
    if (apiOptions.corsEnabled) {
      const corsSwaggerMapping = _.cloneDeep(swaggerMapping);
      corsSwaggerMapping.responses = getCorsDefaultResponse();
      apiDoc.options = corsSwaggerMapping;
    }
    swaggerJson.paths[validator.path] = apiDoc;
  });
  return swaggerJson;
};

const setDefaultDocumentation = (swagger) => {
  swagger.info.title = `${swagger.info.title} ${process.env.NODE_ENV}`; // eslint-disable-line
  swagger.info.description = `${swagger.info.description} for ${process.env.NODE_ENV} environment`; // eslint-disable-line
  swagger.paths = {}; // eslint-disable-line
  swagger.definitions = {}; // eslint-disable-line
  swagger['x-amazon-apigateway-gateway-responses'] = { // eslint-disable-line
    DEFAULT_4XX: {
      responseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin': '\'*\''
      },
      responseTemplates: {
        'application/json': '{"message":$context.error.messageString}'
      }
    },
    DEFAULT_5XX: {
      responseParameters: {
        'gatewayresponse.header.Access-Control-Allow-Origin': '\'*\''
      },
      responseTemplates: {
        'application/json': '{"message":$context.error.messageString}'
      }
    }
  };
  return swagger;
};

const init = () => {
  glob(path.join(validatorFile, '**/*.validator.js'), (err, files) => {
    if (err) {
      console.log('Failed to read files');
      process.exit(0);
    }
    const validationFiles = [];
    files.forEach((value) => {
      validationFiles.push(require(path.resolve(value))); // eslint-disable-line
    });

    const headerFile = path.resolve(relativeHeaderPath);
    const outputFile = path.resolve(relativeOutputFile);

    let swaggerJson = require(headerFile); // eslint-disable-line
    swaggerJson = curateDocumentation(swaggerJson, validationFiles);
    fs.outputFile(outputFile, JSON.stringify(swaggerJson, null, 4), (error) => {
      if (error) {
        console.error(error);
      } else {
        console.log(`Successfully write swagger file to ${outputFile}`);
      }
    });
  });
};

init();
