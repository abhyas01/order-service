module.exports = {
  env: { node: true, es2021: true, jest: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 2021 },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    semi: ['error', 'always'],
    quotes: ['error', 'single', { avoidEscape: true }],
    'no-var': 'error',
    'prefer-const': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
  },
};
