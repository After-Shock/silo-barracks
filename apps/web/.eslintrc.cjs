module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended"
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs", "dev-harness"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "18.2" } },
  plugins: ["react-refresh"],
  rules: {
    "no-extra-semi": "off",
    "no-undef": "off",
    "no-unused-vars": "off",
    "react/no-unknown-property": "off",
    "react/prop-types": "off",
    "react-hooks/exhaustive-deps": "off",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true }
    ]
  },
  overrides: [
    {
      // shadcn/ui primitives export cva variant helpers next to components.
      files: ["src/components/ui/**/*.{js,jsx}"],
      rules: { "react-refresh/only-export-components": "off" }
    }
  ]
};
