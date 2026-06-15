import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Clipboard, Copy, History, Loader2, ScanLine, Search, Settings, Star, Trash2, X } from "lucide-react";
import type { AppSettings, AppView, HistoryItem } from "../shared/types";
import "./styles.css";

const initialView = new URLSearchParams(window.location.search).get("view") as AppView | null;

function App() {
  const [view, setView] = useState<AppView>(initialView || "result");
  const [latest, setLatest] = useState<HistoryItem | null>(null);

  if (view === "capture") return <CaptureOverlay />;

  return (
    <div className="shell">
      <Titlebar view={view} setView={setView} />
      {view === "result" && <ResultView latest={latest} setLatest={setLatest} />}
      {view === "history" && <HistoryView setLatest={setLatest} setView={setView} />}
      {view === "settings" && <SettingsView />}
    </div>
  );
}

function Titlebar({ view, setView }: { view: AppView; setView: (view: AppView) => void }) {
  const open = async (target: AppView) => {
    setView(target);
    await window.appApi.openView(target);
  };

  return (
    <header className="titlebar">
      <div className="brand">Oral Translate</div>
      <nav>
        <button className={view === "result" ? "active iconButton" : "iconButton"} onClick={() => open("result")} title="翻译">
          <ScanLine size={18} />
        </button>
        <button className={view === "history" ? "active iconButton" : "iconButton"} onClick={() => open("history")} title="历史">
          <History size={18} />
        </button>
        <button className={view === "settings" ? "active iconButton" : "iconButton"} onClick={() => open("settings")} title="设置">
          <Settings size={18} />
        </button>
      </nav>
    </header>
  );
}

function ResultView({ latest, setLatest }: { latest: HistoryItem | null; setLatest: (item: HistoryItem) => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.appApi.listHistory().then((items) => {
      if (items[0]) {
        setLatest(items[0]);
        setText(items[0].sourceText);
      }
    });
  }, [setLatest]);

  const translate = async (sourceText = text, sourceType: "screenshot" | "manual" = "manual") => {
    const normalized = sourceText.trim();
    if (!normalized) {
      setStatus("先输入或框选一句英文。");
      return;
    }
    setBusy(true);
    setStatus("正在理解语境...");
    try {
      const response = await window.appApi.translateText({ text: normalized, sourceType });
      setLatest(response.item);
      setText(response.item.sourceText);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "翻译失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const startCapture = async () => {
    await window.appApi.startCapture();
  };

  return (
    <main className="panel resultPanel">
      <section className="inputArea">
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="输入英文表达，或用快捷键 Ctrl + Shift + E 框选屏幕字幕" />
        <div className="actions">
          <button className="primary" onClick={() => translate()} disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Clipboard size={16} />}
            翻译
          </button>
          <button className="secondary" onClick={startCapture}>
            <ScanLine size={16} />
            框选
          </button>
        </div>
      </section>

      {status && <div className="notice">{status}</div>}

      {latest ? (
        <TranslationCard item={latest} onUpdated={setLatest} />
      ) : (
        <div className="emptyState">
          <p>配置 API Key 后，框选字幕或粘贴台词就能开始。</p>
        </div>
      )}
    </main>
  );
}

function TranslationCard({ item, onUpdated }: { item: HistoryItem; onUpdated?: (item: HistoryItem) => void }) {
  const toggle = async () => onUpdated?.(await window.appApi.toggleFavorite(item.id));
  const copy = async () => window.appApi.copyText(item.translation);

  return (
    <article className="translationCard">
      <div className="cardTop">
        <span>{formatTime(item.createdAt)}</span>
        <div>
          <button className="iconButton" onClick={copy} title="复制译文">
            <Copy size={16} />
          </button>
          <button className={item.favorite ? "iconButton starred" : "iconButton"} onClick={toggle} title="收藏">
            <Star size={16} />
          </button>
        </div>
      </div>
      <p className="source">{item.sourceText}</p>
      <h1>{item.translation}</h1>
      <dl>
        <dt>语气</dt>
        <dd>{item.tone}</dd>
        <dt>表达</dt>
        <dd>{item.expressionNotes}</dd>
        <dt>直译</dt>
        <dd>{item.literalMeaning}</dd>
      </dl>
    </article>
  );
}

function HistoryView({ setLatest, setView }: { setLatest: (item: HistoryItem) => void; setView: (view: AppView) => void }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const load = async () => setItems(await window.appApi.listHistory(query, favoritesOnly));

  useEffect(() => {
    const timer = window.setTimeout(load, 120);
    return () => window.clearTimeout(timer);
  }, [query, favoritesOnly]);

  const open = (item: HistoryItem) => {
    setLatest(item);
    setView("result");
  };

  const remove = async (id: number) => {
    await window.appApi.deleteHistory(id);
    await load();
  };

  return (
    <main className="panel">
      <div className="searchRow">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索原文或译文" />
        <button className={favoritesOnly ? "chip active" : "chip"} onClick={() => setFavoritesOnly((value) => !value)}>
          <Star size={14} />
          收藏
        </button>
      </div>

      <div className="historyList">
        {items.map((item) => (
          <article className="historyItem" key={item.id} onClick={() => open(item)}>
            <div>
              <strong>{item.translation}</strong>
              <p>{item.sourceText}</p>
            </div>
            <button
              className="iconButton"
              onClick={(event) => {
                event.stopPropagation();
                remove(item.id);
              }}
              title="删除"
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
        {!items.length && <div className="emptyState">还没有记录。</div>}
      </div>
    </main>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    window.appApi.getSettings().then(setSettings);
  }, []);

  const save = async () => {
    if (!settings) return;
    setSettings(await window.appApi.saveSettings(settings));
    setStatus("已保存设置。");
  };

  if (!settings) return <main className="panel"><div className="notice">正在读取设置...</div></main>;

  return (
    <main className="panel settingsPanel">
      <label>
        API Key
        <input value={settings.apiKey} type="password" onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder="sk-..." />
      </label>
      <label>
        Base URL
        <input value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} />
      </label>
      <label>
        Model
        <input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} />
      </label>
      <label>
        快捷键
        <input value={settings.hotkey} onChange={(event) => setSettings({ ...settings, hotkey: event.target.value })} />
      </label>
      <button className="primary" onClick={save}>保存</button>
      {status && <div className="notice">{status}</div>}
    </main>
  );
}

function CaptureOverlay() {
  const [image, setImage] = useState("");
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState("拖拽框选英文字幕或台词区域");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    window.appApi.captureFullScreen().then(setImage).catch(() => setStatus("无法获取屏幕截图，按 Esc 退出。"));
  }, []);

  const rect = useMemo(() => {
    if (!start || !end) return null;
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(start.x - end.x),
      height: Math.abs(start.y - end.y)
    };
  }, [start, end]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.appApi.closeCapture();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const finish = async () => {
    if (!rect || rect.width < 8 || rect.height < 8 || !image) {
      setStatus("选区太小，请重新框选。");
      return;
    }
    try {
      setStatus("正在识别文字...");
      const cropped = await cropImage(image, rect);
      const ocr = await window.appApi.ocrImage(cropped);
      if (!ocr.text.trim()) {
        setStatus("没有识别到英文，请重新框选更清晰的区域。");
        return;
      }
      await window.appApi.translateText({ text: ocr.text, sourceType: "screenshot" });
      await window.appApi.closeCapture();
      await window.appApi.showResultWindow();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "识别失败，请按 Esc 退出后手动输入。");
    }
  };

  return (
    <div
      className="captureOverlay"
      onMouseDown={(event) => {
        setStart({ x: event.clientX, y: event.clientY });
        setEnd({ x: event.clientX, y: event.clientY });
      }}
      onMouseMove={(event) => start && setEnd({ x: event.clientX, y: event.clientY })}
      onMouseUp={finish}
    >
      {image && <img className="screenImage" src={image} alt="" draggable={false} />}
      <canvas ref={canvasRef} hidden />
      <div className="captureHint">{status}</div>
      {rect && <div className="selectionBox" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />}
    </div>
  );
}

async function cropImage(imageDataUrl: string, rect: { x: number; y: number; width: number; height: number }) {
  const image = new Image();
  image.src = imageDataUrl;
  await image.decode();
  const scaleX = image.naturalWidth / window.innerWidth;
  const scaleY = image.naturalHeight / window.innerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(rect.width * scaleX));
  canvas.height = Math.max(1, Math.floor(rect.height * scaleY));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建截图裁剪画布。");
  context.drawImage(
    image,
    Math.floor(rect.x * scaleX),
    Math.floor(rect.y * scaleY),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL("image/png");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
