import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { HistoryItem, TranslationResult } from "../shared/types";

interface StoredData {
  nextId: number;
  history: HistoryItem[];
}

export class HistoryStore {
  private db: any | null = null;
  private jsonPath = path.join(app.getPath("userData"), "history.json");

  constructor() {
    this.tryInitSqlite();
  }

  add(sourceText: string, sourceType: "screenshot" | "manual", result: TranslationResult): HistoryItem {
    const now = new Date().toISOString();

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO history
        (source_text, ocr_text, translation, tone, expression_notes, literal_meaning, source_type, favorite, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `);
      const row = stmt.run(
        sourceText,
        sourceText,
        result.natural_chinese || result.translation,
        result.tone,
        result.expression_notes,
        result.literal_meaning,
        sourceType,
        now
      );
      return this.get(Number(row.lastInsertRowid));
    }

    const data = this.readJson();
    const item: HistoryItem = {
      id: data.nextId++,
      sourceText,
      ocrText: sourceText,
      translation: result.natural_chinese || result.translation,
      tone: result.tone,
      expressionNotes: result.expression_notes,
      literalMeaning: result.literal_meaning,
      sourceType,
      favorite: false,
      createdAt: now
    };
    data.history.unshift(item);
    this.writeJson(data);
    return item;
  }

  list(query = "", favoritesOnly = false): HistoryItem[] {
    const q = query.trim().toLowerCase();
    if (this.db) {
      let sql = "SELECT * FROM history";
      const clauses: string[] = [];
      const args: any[] = [];
      if (favoritesOnly) clauses.push("favorite = 1");
      if (q) {
        clauses.push("(LOWER(source_text) LIKE ? OR LOWER(translation) LIKE ?)");
        args.push(`%${q}%`, `%${q}%`);
      }
      if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
      sql += " ORDER BY created_at DESC";
      return this.db.prepare(sql).all(...args).map(rowToHistoryItem);
    }

    return this.readJson().history.filter((item) => {
      const matchesFavorite = !favoritesOnly || item.favorite;
      const haystack = `${item.sourceText} ${item.translation}`.toLowerCase();
      return matchesFavorite && (!q || haystack.includes(q));
    });
  }

  get(id: number): HistoryItem {
    if (this.db) {
      const row = this.db.prepare("SELECT * FROM history WHERE id = ?").get(id);
      if (!row) throw new Error("History item not found");
      return rowToHistoryItem(row);
    }

    const item = this.readJson().history.find((entry) => entry.id === id);
    if (!item) throw new Error("History item not found");
    return item;
  }

  toggleFavorite(id: number): HistoryItem {
    if (this.db) {
      this.db.prepare("UPDATE history SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
      return this.get(id);
    }

    const data = this.readJson();
    const item = data.history.find((entry) => entry.id === id);
    if (!item) throw new Error("History item not found");
    item.favorite = !item.favorite;
    this.writeJson(data);
    return item;
  }

  delete(id: number): void {
    if (this.db) {
      this.db.prepare("DELETE FROM history WHERE id = ?").run(id);
      return;
    }

    const data = this.readJson();
    data.history = data.history.filter((entry) => entry.id !== id);
    this.writeJson(data);
  }

  private tryInitSqlite() {
    try {
      // Electron versions with Node 22+ expose this built-in module.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DatabaseSync } = require("node:sqlite");
      const dbPath = path.join(app.getPath("userData"), "history.db");
      this.db = new DatabaseSync(dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_text TEXT NOT NULL,
          ocr_text TEXT NOT NULL,
          translation TEXT NOT NULL,
          tone TEXT NOT NULL,
          expression_notes TEXT NOT NULL,
          literal_meaning TEXT NOT NULL,
          source_type TEXT NOT NULL,
          favorite INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
      `);
    } catch {
      this.db = null;
      fs.mkdirSync(path.dirname(this.jsonPath), { recursive: true });
      if (!fs.existsSync(this.jsonPath)) this.writeJson({ nextId: 1, history: [] });
    }
  }

  private readJson(): StoredData {
    try {
      return JSON.parse(fs.readFileSync(this.jsonPath, "utf8")) as StoredData;
    } catch {
      return { nextId: 1, history: [] };
    }
  }

  private writeJson(data: StoredData) {
    fs.mkdirSync(path.dirname(this.jsonPath), { recursive: true });
    fs.writeFileSync(this.jsonPath, JSON.stringify(data, null, 2), "utf8");
  }
}

function rowToHistoryItem(row: any): HistoryItem {
  return {
    id: Number(row.id),
    sourceText: row.source_text,
    ocrText: row.ocr_text,
    translation: row.translation,
    tone: row.tone,
    expressionNotes: row.expression_notes,
    literalMeaning: row.literal_meaning,
    sourceType: row.source_type === "manual" ? "manual" : "screenshot",
    favorite: Boolean(row.favorite),
    createdAt: row.created_at
  };
}
