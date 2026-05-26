module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    quotes: ["error", "double", {allowTemplateLiterals: true}],
    "max-len": ["error", {code: 120, ignoreComments: true}],
    indent: ["error", 2], // 确保你的缩进设置与你实际使用的(2或4空格)一致
    "quote-props": ["error", "as-needed"],
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
