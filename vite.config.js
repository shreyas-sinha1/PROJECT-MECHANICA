import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "app",
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
