import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import { createWorker } from "tesseract.js";
import type { AppView } from "../shared/types";
import { loadSettings, saveSettings } from "./settings";
import { HistoryStore } from "./store";
import { translateExpression } from "./translator";

let resultWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: HistoryStore | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === "development";
const devUrl = "http://127.0.0.1:5173";

function iconPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, "icon.ico");
  return path.join(__dirname, "../../../assets/icon.ico");
}

function preloadPath() {
  return path.join(__dirname, "../preload/preload.js");
}

function rendererUrl(view: AppView) {
  if (isDev) return `${devUrl}?view=${view}`;
  return `${pathToFileURL(path.join(__dirname, "../../renderer/index.html")).href}?view=${view}`;
}

async function createResultWindow(view: AppView = "result") {
  if (resultWindow && !resultWindow.isDestroyed()) {
    await resultWindow.loadURL(rendererUrl(view));
    resultWindow.show();
    resultWindow.focus();
    return resultWindow;
  }

  resultWindow = new BrowserWindow({
    width: 430,
    height: 560,
    minWidth: 360,
    minHeight: 420,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#f7f7f2",
    icon: iconPath(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  resultWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      resultWindow?.hide();
    }
  });

  resultWindow.on("closed", () => {
    resultWindow = null;
  });

  await resultWindow.loadURL(rendererUrl(view));
  resultWindow.show();
  return resultWindow;
}

async function createCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.show();
    captureWindow.webContents.send("capture:started");
    return;
  }

  const display = screen.getPrimaryDisplay();
  captureWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    icon: iconPath(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  captureWindow.setIgnoreMouseEvents(false);
  captureWindow.on("closed", () => {
    captureWindow = null;
  });

  await captureWindow.loadURL(rendererUrl("capture"));
  captureWindow.webContents.once("did-finish-load", () => {
    captureWindow?.webContents.send("capture:started");
  });
}

function setupTray() {
  const icon = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Oral Expression Translate");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Capture Translate", click: () => createCaptureWindow() },
      { label: "History", click: () => createResultWindow("history") },
      { label: "Settings", click: () => createResultWindow("settings") },
      { type: "separator" },
      {
        label: "Exit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function registerHotkey() {
  const settings = loadSettings();
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(settings.hotkey, () => createCaptureWindow());
  if (!ok) console.warn(`Failed to register hotkey: ${settings.hotkey}`);
}

async function captureFullScreen(): Promise<string> {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.floor(display.size.width * display.scaleFactor),
      height: Math.floor(display.size.height * display.scaleFactor)
    }
  });
  const primary = sources[0];
  if (!primary) throw new Error("Unable to capture the screen.");
  return primary.thumbnail.toDataURL();
}

function requireStore() {
  if (!store) throw new Error("History store is not initialized.");
  return store;
}

function setupIpc() {
  ipcMain.handle("capture:full-screen", () => captureFullScreen());
  ipcMain.handle("capture:start", () => createCaptureWindow());
  ipcMain.handle("capture:close", () => captureWindow?.close());
  ipcMain.handle("window:show-result", () => createResultWindow("result"));
  ipcMain.handle("window:minimize", () => resultWindow?.minimize());
  ipcMain.handle("app:quit", () => { isQuitting = true; app.quit(); });
  ipcMain.handle("view:open", (_event, view: AppView) => createResultWindow(view));
  ipcMain.handle("clipboard:write", (_event, text: string) => clipboard.writeText(text));

  ipcMain.handle("ocr:image", async (_event, imageDataUrl: string) => {
    const langPath = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, "../../..");
    const worker = await createWorker("eng", undefined, { langPath });
    try {
      const result = await worker.recognize(imageDataUrl);
      return {
        text: result.data.text.replace(/\s+/g, " ").trim(),
        confidence: result.data.confidence
      };
    } finally {
      await worker.terminate();
    }
  });

  ipcMain.handle("translate:text", async (_event, payload) => {
    const text = String(payload.text || "").trim();
    if (!text) throw new Error("No English text to translate.");
    const raw = await translateExpression(text, loadSettings());
    const item = requireStore().add(text, payload.sourceType || "manual", raw);
    await createResultWindow("result");
    return { item, raw };
  });

  ipcMain.handle("history:list", (_event, query?: string, favoritesOnly?: boolean) => {
    return requireStore().list(query, Boolean(favoritesOnly));
  });
  ipcMain.handle("history:favorite", (_event, id: number) => {
    return requireStore().toggleFavorite(id);
  });
  ipcMain.handle("history:delete", (_event, id: number) => {
    return requireStore().delete(id);
  });
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:save", (_event, settings) => {
    const saved = saveSettings(settings);
    registerHotkey();
    return saved;
  });
}

app.whenReady().then(async () => {
  store = new HistoryStore();
  setupIpc();
  setupTray();
  registerHotkey();
  await createResultWindow("settings");
});

app.on("window-all-closed", () => {
  // Keep the tray app alive until the user chooses Exit.
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
