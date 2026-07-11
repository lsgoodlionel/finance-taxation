import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendors into their own long-cache chunks
        // so a page edit doesn't invalidate the whole vendor bundle.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          antd: ["antd", "@ant-design/icons"],
          charts: ["recharts"]
        }
      }
    }
  }
});
