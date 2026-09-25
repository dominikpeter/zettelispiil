import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { plugin as shadcn } from "@shadcn/lint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // design system: only classes Tailwind can generate, colors from the theme tokens (globals.css), few magic numbers
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { shadcn },
    rules: {
      "shadcn/no-unknown-classes": "error",
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // generated: the Capacitor phone projects (Gradle/Xcode copy web assets and plugin code in), agent worktrees
    "android/**",
    "ios/**",
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
