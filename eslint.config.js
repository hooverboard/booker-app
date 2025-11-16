import globals from "globals";
import js from "@eslint/js";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  // 1. Global ignores
  {
    ignores: [
      "node_modules/",
      ".vite/",
      "out/",
      "dist/",
      "forge.config.js",
      "vite.main.config.mjs",
      "vite.preload.config.mjs",
      "vite.renderer.config.mjs",
    ],
  },

  // 2. Apply base recommended rules
  js.configs.recommended,
  reactRecommended,

  // 3. Project-wide settings and custom rules
  {
    languageOptions: {
      sourceType: "module", // Treat all JS files as ES modules
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        MAIN_WINDOW_VITE_DEV_SERVER_URL: "readonly",
        MAIN_WINDOW_VITE_NAME: "readonly",
      },
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // Your custom rules
      "no-unused-vars": ["warn", { "args": "after-used", "ignoreRestSiblings": true }],
      "unused-imports/no-unused-imports": "warn",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      
      // Override default rule that is too noisy
      "no-undef": "error"
    },
  },
];