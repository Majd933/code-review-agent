import path from "node:path";
import childProcess from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";

// vite-plugin-electron uses taskkill on Windows; a missing PID throws and kills `npm run dev`.
const originalExecSync = childProcess.execSync;
childProcess.execSync = ((command: string, options?: Parameters<typeof originalExecSync>[1]) => {
  try {
    return originalExecSync(command, options);
  } catch (error) {
    if (typeof command === "string" && command.toLowerCase().includes("taskkill")) {
      return Buffer.alloc(0);
    }
    throw error;
  }
}) as typeof originalExecSync;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload/index.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "preload.mjs",
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
