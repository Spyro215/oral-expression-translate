export type AppView = "result" | "history" | "settings" | "capture";

export interface TranslationResult {
  translation: string;
  natural_chinese: string;
  tone: string;
  expression_notes: string;
  literal_meaning: string;
}

export interface HistoryItem {
  id: number;
  sourceText: string;
  ocrText: string;
  translation: string;
  tone: string;
  expressionNotes: string;
  literalMeaning: string;
  sourceType: "screenshot" | "manual";
  favorite: boolean;
  createdAt: string;
}

export interface AppSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  hotkey: string;
}

export interface CapturePayload {
  imageDataUrl: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TranslatePayload {
  text: string;
  sourceType: "screenshot" | "manual";
}

export interface TranslateResponse {
  item: HistoryItem;
  raw: TranslationResult;
}

export interface OcrResponse {
  text: string;
  confidence?: number;
}

export interface AppApi {
  captureFullScreen: () => Promise<string>;
  ocrImage: (imageDataUrl: string) => Promise<OcrResponse>;
  translateText: (payload: TranslatePayload) => Promise<TranslateResponse>;
  listHistory: (query?: string, favoritesOnly?: boolean) => Promise<HistoryItem[]>;
  toggleFavorite: (id: number) => Promise<HistoryItem>;
  deleteHistory: (id: number) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  startCapture: () => Promise<void>;
  openView: (view: AppView) => Promise<void>;
  closeCapture: () => Promise<void>;
  showResultWindow: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  quitApp: () => Promise<void>;
  copyText: (text: string) => Promise<void>;
  onCaptureStarted: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    appApi: AppApi;
  }
}
