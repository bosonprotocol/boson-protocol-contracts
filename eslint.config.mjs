import { defineConfig } from "eslint/config";
import noOnlyTests from "eslint-plugin-no-only-tests";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    extends: compat.extends("eslint:recommended", "prettier"),

    plugins: {
        "no-only-tests": noOnlyTests,
    },

    languageOptions: {
        globals: {
            ...globals.node,
            ...globals.commonjs,
            ...globals.mocha,
            BigInt: true,
        },

        ecmaVersion: 2020,
        sourceType: "commonjs",
    },

    rules: {
        "no-empty": "off",
        "no-only-tests/no-only-tests": "error",
        "no-unused-vars": ["error", {
            caughtErrors: "none",
        }],
    },
}]);