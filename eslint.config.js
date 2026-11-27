// Configuration ESLint commune à tout le dépôt (format « flat config »).
// Les paquets TypeScript partagent exactement les mêmes règles.
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.expo/**",
      "**/.pio/**",
      "firmware/**",
      "docs/**",
      "supports-cours/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // Les paramètres préfixés par un tiret bas sont volontairement inutilisés.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  // Désactive les règles de style qui entrent en conflit avec Prettier (toujours en dernier).
  prettier,
);
