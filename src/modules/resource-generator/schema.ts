// schemas/prefetch.ts
export default {
  body: {
    type: 'object',
    required: ['targetUrl'], // 👈 已声明为必填
    properties: {
      targetUrl: { 
        type: 'string',
        minLength: 1 // 可选：防止空字符串
      }
    },
    additionalProperties: false // 可选：禁止传多余字段
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