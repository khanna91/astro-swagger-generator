A library to generate a swagger file from joi file. The output will be in json format.

Usage:
Define your joi validator class

Define the header.json file that will be used as the header information in the swagger file
The basePath will be join together with the path in validator class, in the example all url will be /users/*
```
{
  "swagger": "2.0",
  "info": {
      "description": "Test account",
      "version": "1.0.0",
      "title": "Test Service",
      "contact": {
          "email": "rahul_khanna@astro.com.my"
      }
  },
  "basePath": "/users",
  "schemes": [
      "http",
      "https"
  ]
}
```

You can install the package globally or just include them in the scripts in the package.json
```
    "swagger-generator": "astro-swagger-generator -v ./src -h ./swagger/header.json -o ./swagger/swagger.json"
```
```
-h is the path to the header file
-v is the path to your validators
-o is the location of the swagger file will be generated
```

Example for multiple validator file
```
const Joi = require('joi')
const JoiPhone = Joi.extend(require('joi-phone-number'))

module.exports =  {
    name: 'login',
    path: '/login',
    type: 'post',
    deprecated: false,
    cors: true,
    enableApiGatewayCaching: true,
    cacheSchema: {
      query: ['id', 'packageAsset'],
      params: ['detailId'],
      headers: ['auth']
    }
    JoiSchema: {
      query: Joi.object({
        id: Joi.string(),
        packageAsset: Joi.string()
      }).xor('id', 'packageAsset'),
      body: Joi.object({
        fname: Joi.string().required()
      }),
      params: Joi.object({
        detailId: Joi.string().required()
      }),
      headers: Joi.object({
        auth: Joi.string().required()
      }),
      response: {
          200: {
              description: "successfully login",
              header: Joi.object().keys({
                          Authorization: Joi.string().required()
                      }),
              body: Joi.object().keys({
                  resultMessage: Joi.string().required(),
                  resultDescription: Joi.string().required(),
                  body: Joi.object().keys({
                      accessToken: Joi.string().required(),
                      refreshToken: Joi.string().required()
                  })
              })
          },
          400: {
              description: "invalid request body",
              body: Joi.object().keys({
                  resultMessage: Joi.string().required(),
                  resultDescription: Joi.string().required()
              })
          },
          401: {
              description: "invalid credential",
              body: Joi.object().keys({
                  resultMessage: Joi.string().required(),
                  resultDescription: Joi.string().required()
              })
          }
      }
  }
}
```