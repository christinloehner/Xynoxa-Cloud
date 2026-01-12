/*
 * Copyright (C) 2025 Christin Löhner
 */

import next from "eslint-config-next";

/** @type {import("eslint").Linter.FlatConfig[]} */
const config = [
  {
    ignores: ["volumes/**", "node_modules/**", ".next/**", ".turbo/**", "dist/**"]
  },
  ...next,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  }
];

export default config;
