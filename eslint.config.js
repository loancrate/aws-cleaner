import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    ignores: ["dist/", "coverage/", "eslint.config.js", "*.cjs"],
  },
];
