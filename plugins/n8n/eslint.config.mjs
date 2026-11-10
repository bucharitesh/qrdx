// The lint config `n8n-node lint` uses (`config` from @n8n/node-cli/eslint,
// the n8n Cloud-eligible one), written out with the same plugins so the
// package doesn't need the whole CLI. Keep it in step with that file.

import js from "@eslint/js";
import { n8nCommunityNodesPlugin } from "@n8n/eslint-plugin-community-nodes";
import { defineConfig, globalIgnores } from "eslint/config";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importPlugin from "eslint-plugin-import-x";
import n8nNodesBase from "eslint-plugin-n8n-nodes-base";
import tseslint from "typescript-eslint";

const communityNodesRecommended = n8nCommunityNodesPlugin.configs.recommended;

export default defineConfig(
  globalIgnores(["dist", "node_modules"]),
  {
    files: ["**/*.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      communityNodesRecommended,
      importPlugin.configs["flat/recommended"],
    ],
    rules: {
      "prefer-spread": "off",
      "no-console": "error",
    },
  },
  {
    plugins: { "n8n-nodes-base": n8nNodesBase },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
    },
  },
  {
    files: ["package.json", "**/*.node.json"],
    extends: [communityNodesRecommended],
    rules: {
      ...n8nNodesBase.configs.community.rules,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        extraFileExtensions: [".json"],
      },
    },
  },
  {
    files: ["./credentials/**/*.ts"],
    rules: {
      ...n8nNodesBase.configs.credentials.rules,
      "n8n-nodes-base/cred-class-field-documentation-url-miscased": "off",
      "n8n-nodes-base/cred-class-field-type-options-password-missing": "off",
    },
  },
  {
    files: ["./nodes/**/*.ts"],
    rules: {
      ...n8nNodesBase.configs.nodes.rules,
      "n8n-nodes-base/node-class-description-inputs-wrong-regular-node": "off",
      "n8n-nodes-base/node-class-description-outputs-wrong": "off",
      "n8n-nodes-base/node-param-type-options-max-value-present": "off",
    },
  },
  {
    // Tests aren't published (package.json `files` is dist/ only), so they
    // may read the package's own files from disk.
    files: ["test/**/*.ts"],
    rules: {
      "@n8n/community-nodes/no-restricted-imports": "off",
    },
  }
);
