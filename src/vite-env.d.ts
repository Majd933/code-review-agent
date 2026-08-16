/// <reference types="vite/client" />

import type { DesktopApi } from "../../electron/preload/index";

declare global {
  interface Window {
    api: DesktopApi;
  }
}

export {};
