import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import tailwindcss from "tailwindcss";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "./lib/index.js"),
      name: "react-beautiful-timeline",
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "tailwindcss"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          tailwindcss: "tailwindcss",
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss],
    },
  },
  optimizeDeps: {
    exclude: ["node-fetch"],
  },
});
