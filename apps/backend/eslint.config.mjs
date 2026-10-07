import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/api/**/*.ts", "lib/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // These integration fixtures intentionally mock partial Prisma delegates
    // and callback transactions. Production changes and pure rule tests remain
    // checked independently; this matches the existing delegate-mock contract.
    files: ["tests/backend.test.ts", "tests/intervention-api.test.ts", "tests/intervention-cases.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts"]),
]);
