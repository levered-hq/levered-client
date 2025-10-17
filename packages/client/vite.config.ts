import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), dts({ insertTypesEntry: true })],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "LeveredClient",
      fileName: (format) => `levered-client.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        banner: '"use client";',
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
  },
});
