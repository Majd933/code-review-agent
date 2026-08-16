import path from "node:path";
import childProcess from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import { startup } from "vite-plugin-electron";

function killElectronTree(pid: number): void {
  try {
    childProcess.execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 128 || status === 1) return;
    throw error;
  }
}

startup.exit = async () => {
  const electronApp = (process as NodeJS.Process & { electronApp?: childProcess.ChildProcess }).electronApp;
  const pid = electronApp?.pid;
  if (!electronApp || pid == null) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(done, 2000);
    electronApp.removeAllListeners();
    electronApp.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    try {
      killElectronTree(pid);
    } catch {
      clearTimeout(timer);
      done();
    }
  });
  (process as NodeJS.Process & { electronApp?: childProcess.ChildProcess }).electronApp = undefined;
};

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
