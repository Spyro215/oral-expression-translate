import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { AppSettings } from "../shared/types";

const defaultSettings: AppSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  hotkey: "CommandOrControl+Shift+E"
};

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized = {
    ...defaultSettings,
    ...settings,
    baseUrl: settings.baseUrl.replace(/\/+$/, "")
  };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
