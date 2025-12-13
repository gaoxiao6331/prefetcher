// schemas/prefetch.ts
export default {
  body: {
    type: 'object',
    required: ['targetUrl'],
    properties: {
      targetUrl: {
        type: 'string',
        minLength: 1
      }
    },
    additionalProperties: false
  },
  response: {
    '2xx': {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    },
    '4xx': {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    },
    '5xx': {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    }
  }
};