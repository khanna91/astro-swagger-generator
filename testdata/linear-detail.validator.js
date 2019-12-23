const Joi = require('joi');

module.exports = {
  name: 'linearDetail',
  path: '/v1/linearDetail',
  type: 'get',
  awsApiIntegration: false,
  joiSchema: {
    query: Joi.object({
      siTrafficKey: Joi.string().required()
    }),
    response: {
      200: {
        description: 'OK',
        body: {
          responseCode: 200,
          responseMessage: Joi.string().required(),
          response: {}
        }
      },
      400: {
        description: 'Error Response',
        body: {
          responseCode: 400,
          responseMessage: Joi.string().required(),
          response: {
            errors: Joi.array().items(Joi.object().keys({
              errorCode: Joi.string().required(),
              errorTitle: Joi.string().required(),
              errorDescription: Joi.string().required(),
              errorDebugDescription: Joi.string()
            }))
          }
        }
      }
    }
  }
};
