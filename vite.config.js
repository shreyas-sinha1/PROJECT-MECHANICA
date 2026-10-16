import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "app",
  test: {
    root: ".",
    include: ["spec/__tests__/**/*.test.js"],
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "app/index.html"),
        sim: resolve(__dirname, "app/sim.html"),
      },
    },
  },
});
