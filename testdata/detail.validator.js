const Joi = require('joi');

module.exports = {
  name: 'detail',
  path: '/v1/detail/{detailId}',
  type: 'post',
  deprecated: false,
  cors: true,
  enableApiGatewayCaching: true,
  cacheSchema: {
    query: ['id', 'packageAsset'],
    params: ['detailId'],
    headers: ['auth']
  },
  joiSchema: {
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
