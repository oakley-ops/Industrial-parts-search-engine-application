module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'babel-jest',
      {
        presets: ['@babel/preset-typescript'],
        plugins: [
          '@babel/plugin-transform-modules-commonjs',
          '@babel/plugin-transform-block-scoping',
        ],
      },
    ],
  },
};
