// Server-side translation logic — gọi trực tiếp từ /api/translate.
// API keys lấy từ env vars Vercel, không bao giờ lộ ra client.

import type { TranslateProvider } from './types';

const SYSTEM_PROMPT =
  'Bạn là dịch giả chuyên nghiệp dịch truyện Trung → Việt. ' +
  'QUAN TRỌNG: Chuyển TẤT CẢ tên người, địa danh, môn phái, vật phẩm, ' +
  'kỹ năng, chiêu thức từ tiếng Trung sang ÂM HÁN VIỆT (KHÔNG dùng pinyin). ' +
  'Ví dụ: 赵芷诺 → Triệu Chỉ Nặc (KHÔNG phải "Zhao Zhinuo"); ' +
  '林夕 → Lâm Tịch (KHÔNG phải "Lin Xi"); 青云宗 → Thanh Vân Tông. ' +
  'Dịch văn phong tự nhiên, mượt mà, phù hợp truyện tiên hiệp / đô thị / ngôn tình. ' +
  'Giữ nguyên cấu trúc đoạn văn (mỗi đoạn cách nhau bằng dòng trống). ' +
  'Chỉ trả về bản dịch, không giải thích, không thêm tiêu đề chương.';

export const BATCH_LIMITS: Record<TranslateProvider, { target: number; max: number }> = {
  mymemory: { target: 300, max: 450 },
  gemini: { target: 1200, max: 1800 },
  deepseek: { target: 1200, max: 1800 },
  qwen: { target: 1200, max: 1800 },
};

export const PROVIDER_DELAY: Record<TranslateProvider, number> = {
  mymemory: 500,
  gemini: 500,
  deepseek: 200,
  qwen: 200,
};

async function callMyMemory(text: string, email: string | undefined, signal?: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ q: text, langpair: 'zh-CN|vi' });
  if (email) params.set('de', email);
  const res = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus && data.responseStatus !== 200 && data.responseStatus !== '200') {
    throw new Error(`MyMemory: ${data.responseDetails || 'lỗi không rõ'}`);
  }
  return data.responseData?.translatedText || '';
}

async function callOpenAILike(
  url: string,
  key: string,
  model: string,
  text: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`API HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(
  model: string,
  key: string,
  text: string,
  signal?: AbortSignal
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    throw new Error(`Gemini không trả về nội dung (${data.candidates?.[0]?.finishReason || 'unknown'})`);
  }
  return parts.map((p: { text?: string }) => p.text || '').join('').trim();
}

export type TranslateOverrides = {
  apiKey?: string;
  geminiModel?: string;
  mymemoryEmail?: string;
};

export async function translateOnce(
  provider: TranslateProvider,
  text: string,
  overrides: TranslateOverrides = {},
  signal?: AbortSignal
): Promise<string> {
  switch (provider) {
    case 'mymemory':
      return callMyMemory(text, overrides.mymemoryEmail || process.env.MYMEMORY_EMAIL, signal);
    case 'gemini': {
      const key = overrides.apiKey || process.env.GEMINI_API_KEY;
      if (!key) throw new Error('Chưa có Gemini API key (mở ⚙️ Cài đặt để nhập)');
      const model = overrides.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      return callGemini(model, key, text, signal);
    }
    case 'deepseek': {
      const key = overrides.apiKey || process.env.DEEPSEEK_API_KEY;
      if (!key) throw new Error('Chưa có DeepSeek API key (mở ⚙️ Cài đặt để nhập)');
      return callOpenAILike(
        'https://api.deepseek.com/v1/chat/completions',
        key,
        'deepseek-chat',
        text,
        signal
      );
    }
    case 'qwen': {
      const key = overrides.apiKey || process.env.QWEN_API_KEY;
      if (!key) throw new Error('Chưa có Qwen API key (mở ⚙️ Cài đặt để nhập)');
      return callOpenAILike(
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
        key,
        'qwen-plus',
        text,
        signal
      );
    }
    default:
      throw new Error(`Provider không hỗ trợ: ${provider}`);
  }
}

// Retry với exponential backoff
export async function translateWithRetry(
  provider: TranslateProvider,
  text: string,
  overrides: TranslateOverrides = {},
  signal?: AbortSignal
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await translateOnce(provider, text, overrides, signal);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// Chia text thành batches tôn trọng giới hạn provider
export function buildBatches(blocks: string[], provider: TranslateProvider): string[][] {
  const { target, max } = BATCH_LIMITS[provider];
  const batches: string[][] = [];
  let cur: string[] = [];
  let curLen = 0;
  const flush = () => {
    if (cur.length) batches.push(cur);
    cur = [];
    curLen = 0;
  };

  const splitLong = (s: string): string[] => {
    if (s.length <= max) return [s];
    const sentences = s.match(/[^。！？!?…]+[。！？!?…]?/g) || [s];
    const out: string[] = [];
    let buf = '';
    for (const sen of sentences) {
      if (sen.length > max) {
        if (buf) {
          out.push(buf);
          buf = '';
        }
        for (let i = 0; i < sen.length; i += max) out.push(sen.slice(i, i + max));
        continue;
      }
      if (buf.length + sen.length > max && buf) {
        out.push(buf);
        buf = sen;
      } else buf += sen;
    }
    if (buf) out.push(buf);
    return out;
  };

  for (const block of blocks) {
    for (const piece of splitLong(block)) {
      if (curLen > 0 && curLen + piece.length + 2 > max) flush();
      cur.push(piece);
      curLen += piece.length + 2;
      if (curLen >= target) flush();
    }
  }
  flush();
  return batches;
}
