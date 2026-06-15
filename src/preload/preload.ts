import { contextBridge, ipcRenderer } from "electron";
import type { AppApi, AppSettings, AppView, TranslatePayload } from "../shared/types";

const api: AppApi = {
  captureFullScreen: () => ipcRenderer.invoke("capture:full-screen"),
  ocrImage: (imageDataUrl: string) => ipcRenderer.invoke("ocr:image", imageDataUrl),
  translateText: (payload: TranslatePayload) => ipcRenderer.invoke("translate:text", payload),
  listHistory: (query?: string, favoritesOnly?: boolean) => ipcRenderer.invoke("history:list", query, favoritesOnly),
  toggleFavorite: (id: number) => ipcRenderer.invoke("history:favorite", id),
  deleteHistory: (id: number) => ipcRenderer.invoke("history:delete", id),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings),
  startCapture: () => ipcRenderer.invoke("capture:start"),
  openView: (view: AppView) => ipcRenderer.invoke("view:open", view),
  closeCapture: () => ipcRenderer.invoke("capture:close"),
  showResultWindow: () => ipcRenderer.invoke("window:show-result"),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  onCaptureStarted: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("capture:started", listener);
    return () => ipcRenderer.removeListener("capture:started", listener);
  }
};

contextBridge.exposeInMainWorld("appApi", api);
