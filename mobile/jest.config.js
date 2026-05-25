module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { esModuleInterop: false },
      diagnostics: { ignoreCodes: ['TS151001'] },
    }],
  },
};
