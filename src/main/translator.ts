import type { AppSettings, TranslationResult } from "../shared/types";

const fallback: TranslationResult = {
  translation: "",
  natural_chinese: "",
  tone: "未能解析模型返回的语气说明。",
  expression_notes: "模型返回格式不完整，已保留原始译文。",
  literal_meaning: ""
};

export async function translateExpression(text: string, settings: AppSettings): Promise<TranslationResult> {
  if (!settings.apiKey.trim()) {
    throw new Error("请先在设置里填写 API Key。");
  }

  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是英语口语、游戏、影视台词翻译助手。只输出 JSON，不要 Markdown。翻译要自然中文，解释语气、潜台词、俚语或固定表达。字段必须包含 translation, natural_chinese, tone, expression_notes, literal_meaning。"
        },
        {
          role: "user",
          content: `请翻译并解释这句英文：\n${text}`
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`翻译请求失败：${response.status} ${message.slice(0, 180)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型没有返回内容。");

  try {
    return normalize(JSON.parse(content));
  } catch {
    return normalize({ ...fallback, translation: content, natural_chinese: content });
  }
}

function normalize(value: Partial<TranslationResult>): TranslationResult {
  return {
    translation: value.translation || value.natural_chinese || "",
    natural_chinese: value.natural_chinese || value.translation || "",
    tone: value.tone || "未提供语气说明。",
    expression_notes: value.expression_notes || "未提供表达解释。",
    literal_meaning: value.literal_meaning || "未提供直译。"
  };
}
