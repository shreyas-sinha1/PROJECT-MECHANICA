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
    // Increase the chunk size warning threshold to 1000 kB
    chunkSizeWarningLimit: 1000, 

    rollupOptions: {
      input: {
        main: resolve(__dirname, "app/index.html"),
        sim: resolve(__dirname, "app/sim.html"),
      },
    },
  },
});
