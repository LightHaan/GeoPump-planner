import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: repositoryName === undefined ? "/" : `/${repositoryName}/`,
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
