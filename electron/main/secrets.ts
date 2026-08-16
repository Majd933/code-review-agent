import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

const TOKEN_FILE = "token.enc";

function tokenPath(): string {
  return path.join(app.getPath("userData"), TOKEN_FILE);
}

export function hasStoredToken(): boolean {
  return fs.existsSync(tokenPath());
}

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable on this machine");
  }
  const encrypted = safeStorage.encryptString(token.trim());
  fs.writeFileSync(tokenPath(), encrypted);
}

export function loadToken(): string | null {
  const file = tokenPath();
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable on this machine");
  }
  const buf = fs.readFileSync(file);
  return safeStorage.decryptString(buf);
}

export function clearToken(): void {
  const file = tokenPath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
