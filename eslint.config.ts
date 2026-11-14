import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "**/drizzle/**",
      "pnpm-lock.yaml",
      // vendored recon evidence (Prism's CSS/JS, extracted bundles) — not ours to lint
      "zenno/recon/**",
      // generated pdfjs worker copied into public at build time
      "apps/web/public/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
