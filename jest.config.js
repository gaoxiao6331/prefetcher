const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json'); // 确保引入了 tsconfig

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  roots: ['<rootDir>/src'],

  collectCoverage: true,

  modulePaths: [compilerOptions.baseUrl],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/',
  }),

  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.+(test|spec).+(ts|tsx|js|jsx)',
  ],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts'
  ],

  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
};