import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';

// ============================================================
// Hằng số & helper localStorage
// ============================================================
const LS_SETTINGS = 'epub_trans_settings';
const trKey = (filename, idx) => `epub_${filename}_${idx}`;

const DEFAULT_SETTINGS = {
  provider: 'mymemory',
  mymemoryEmail: '',
  deepseekKey: '',
  qwenKey: '',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  customUrl: '',
  customKey: '',
  customModel: '',
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const saveSettings = (s) => localStorage.setItem(LS_SETTINGS, JSON.stringify(s));

// ============================================================
// Parse EPUB
// ============================================================

// Lấy đường dẫn thư mục chứa file
const dirOf = (path) => {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i + 1);
};

// Resolve đường dẫn tương đối trong EPUB
const resolvePath = (base, rel) => {
  if (!rel) return rel;
  if (rel.startsWith('/')) return rel.slice(1);
  const stack = (base + rel).split('/');
  const out = [];
  for (const p of stack) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
};

// Parse XML/HTML thành DOM
const parseXml = (str, mime = 'application/xml') => new DOMParser().parseFromString(str, mime);

// Bóc text & "blocks" (mảng đoạn văn) từ HTML chương
const extractBlocks = (html) => {
  const doc = parseXml(html, 'text/html');
  // Bỏ thẻ script/style
  doc.querySelectorAll('script,style').forEach((n) => n.remove());

  const blockSelector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, div';
  const nodes = Array.from(doc.body?.querySelectorAll(blockSelector) || []);
  const blocks = [];
  for (const n of nodes) {
    // Bỏ qua div lồng nhau nếu nó vẫn còn block con bên trong (tránh trùng)
    if (n.tagName.toLowerCase() === 'div' && n.querySelector(blockSelector)) continue;
    const txt = n.textContent.replace(/\s+/g, ' ').trim();
    if (txt) blocks.push(txt);
  }
  // Fallback nếu không lấy được block nào
  if (blocks.length === 0) {
    const fullText = (doc.body?.textContent || '').trim();
    if (fullText) {
      fullText
        .split(/\n{2,}|(?<=[。！？!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => blocks.push(s));
    }
  }
  return blocks;
};

// Đọc tên chương từ toc.ncx hoặc nav.xhtml
const buildTitleMap = async (zip, opfDir, manifest) => {
  const map = new Map();

  // Thử toc.ncx
  const ncxItem = manifest.find(
    (m) => m.mediaType === 'application/x-dtbncx+xml' || m.href.toLowerCase().endsWith('.ncx')
  );
  if (ncxItem) {
    const ncxPath = resolvePath(opfDir, ncxItem.href);
    const ncxFile = zip.file(ncxPath);
    if (ncxFile) {
      try {
        const ncxXml = parseXml(await ncxFile.async('string'), 'application/xml');
        const ncxDir = dirOf(ncxPath);
        ncxXml.querySelectorAll('navPoint').forEach((np) => {
          const label = np.querySelector('navLabel > text')?.textContent?.trim();
          const src = np.querySelector('content')?.getAttribute('src');
          if (label && src) {
            const cleanSrc = src.split('#')[0];
            const full = resolvePath(ncxDir, cleanSrc);
            if (!map.has(full)) map.set(full, label);
          }
        });
      } catch (e) {
        console.warn('Lỗi parse toc.ncx:', e);
      }
    }
  }

  // Thử nav.xhtml (EPUB 3)
  const navItem = manifest.find((m) => (m.properties || '').includes('nav'));
  if (navItem) {
    const navPath = resolvePath(opfDir, navItem.href);
    const navFile = zip.file(navPath);
    if (navFile) {
      try {
        const navDoc = parseXml(await navFile.async('string'), 'text/html');
        const navDir = dirOf(navPath);
        navDoc.querySelectorAll('nav a, ol li a, ul li a').forEach((a) => {
          const label = a.textContent.trim();
          const href = a.getAttribute('href');
          if (label && href) {
            const full = resolvePath(navDir, href.split('#')[0]);
            if (!map.has(full)) map.set(full, label);
          }
        });
      } catch (e) {
        console.warn('Lỗi parse nav:', e);
      }
    }
  }

  return map;
};

const parseEpub = async (file) => {
  const zip = await JSZip.loadAsync(file);

  // Đọc container.xml để tìm content.opf
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Không tìm thấy META-INF/container.xml — file EPUB không hợp lệ.');
  const containerXml = parseXml(await containerFile.async('string'));
  const opfPath = containerXml.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Không tìm thấy đường dẫn content.opf trong container.xml.');

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`Không tìm thấy ${opfPath} trong EPUB.`);
  const opfXml = parseXml(await opfFile.async('string'));
  const opfDir = dirOf(opfPath);

  // Tên truyện
  const bookTitle =
    opfXml.querySelector('metadata > title, metadata dc\\:title, metadata [property="dcterms:title"]')
      ?.textContent?.trim() ||
    file.name.replace(/\.epub$/i, '');

  // Manifest
  const manifest = Array.from(opfXml.querySelectorAll('manifest > item')).map((it) => ({
    id: it.getAttribute('id'),
    href: it.getAttribute('href'),
    mediaType: it.getAttribute('media-type'),
    properties: it.getAttribute('properties') || '',
  }));
  const manifestById = new Map(manifest.map((m) => [m.id, m]));

  // Spine = thứ tự chương
  const spineRefs = Array.from(opfXml.querySelectorAll('spine > itemref'))
    .map((ir) => ir.getAttribute('idref'))
    .filter(Boolean);

  const titleMap = await buildTitleMap(zip, opfDir, manifest);

  const chapters = [];
  for (let i = 0; i < spineRefs.length; i++) {
    const m = manifestById.get(spineRefs[i]);
    if (!m) continue;
    if (m.mediaType && !m.mediaType.includes('html') && !m.mediaType.includes('xml')) continue;
    const fullPath = resolvePath(opfDir, m.href);
    const file = zip.file(fullPath);
    if (!file) continue;
    const html = await file.async('string');
    const blocks = extractBlocks(html);
    if (blocks.length === 0) continue; // bỏ qua chương rỗng (cover, blank...)
    chapters.push({
      id: m.id,
      path: fullPath,
      title: titleMap.get(fullPath) || `Chương ${chapters.length + 1}`,
      blocks,
    });
  }

  return { title: bookTitle, chapters };
};

// ============================================================
// Chia batches để dịch
// ============================================================
// Giới hạn tuỳ theo provider: MyMemory dùng GET (URL ~500 ký tự max),
// LLM thì có thể nhồi cả ngàn ký tự/lượt.
const BATCH_LIMITS = {
  mymemory: { target: 300, max: 450 },
  llm: { target: 1200, max: 1800 },
};

// Split 1 block dài thành nhiều đoạn ngắn theo dấu câu CJK + Latin
const splitLongBlock = (text, max) => {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^。！？!?…]+[。！？!?…]?/g) || [text];
  const out = [];
  let buf = '';
  for (const s of sentences) {
    // Câu siêu dài (không có dấu câu) — cắt cứng
    if (s.length > max) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    if (buf.length + s.length > max && buf) {
      out.push(buf);
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf) out.push(buf);
  return out;
};

const buildBatches = (blocks, { target, max }) => {
  const batches = [];
  let cur = [];
  let curLen = 0;
  const flush = () => {
    if (cur.length) batches.push(cur);
    cur = [];
    curLen = 0;
  };

  for (const block of blocks) {
    const pieces = splitLongBlock(block, max);
    for (const p of pieces) {
      if (curLen > 0 && curLen + p.length + 2 > max) flush();
      cur.push(p);
      curLen += p.length + 2;
      if (curLen >= target) flush();
    }
  }
  flush();
  return batches;
};

// ============================================================
// Translation API
// ============================================================

const SYSTEM_PROMPT =
  'Bạn là dịch giả chuyên nghiệp. Dịch đoạn truyện tiếng Trung sau sang tiếng Việt. ' +
  'Giữ nguyên tên riêng, dịch tự nhiên, mượt mà, đúng ngữ cảnh truyện. ' +
  'Giữ nguyên cấu trúc đoạn văn (mỗi đoạn cách nhau bằng dòng trống). ' +
  'Chỉ trả về bản dịch, không giải thích, không thêm tiêu đề.';

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });

// MyMemory: GET
const callMyMemory = async (text, settings, signal) => {
  const params = new URLSearchParams({ q: text, langpair: 'zh-CN|vi' });
  if (settings.mymemoryEmail) params.set('de', settings.mymemoryEmail);
  const res = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal });
  if (!res.ok) throw new Error(`MyMemory lỗi HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus && data.responseStatus !== 200 && data.responseStatus !== '200') {
    throw new Error(`MyMemory: ${data.responseDetails || 'Lỗi không rõ'}`);
  }
  return data.responseData?.translatedText || '';
};

// Google Gemini API
const callGemini = async ({ model, key }, text, signal) => {
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
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {}
    throw new Error(`Gemini HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    const reason = data.candidates?.[0]?.finishReason || 'không có nội dung';
    throw new Error(`Gemini không trả về kết quả (${reason})`);
  }
  return parts.map((p) => p.text || '').join('').trim();
};

// OpenAI-compatible (DeepSeek, Qwen, Custom)
const callOpenAILike = async ({ url, key, model }, text, signal) => {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
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
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {}
    throw new Error(`API HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
};

const providerInfo = (settings) => {
  switch (settings.provider) {
    case 'deepseek':
      return {
        kind: 'openai',
        url: 'https://api.deepseek.com/v1/chat/completions',
        key: settings.deepseekKey,
        model: 'deepseek-chat',
        delay: 200,
      };
    case 'qwen':
      return {
        kind: 'openai',
        url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
        key: settings.qwenKey,
        model: 'qwen-plus',
        delay: 200,
      };
    case 'gemini':
      return {
        kind: 'gemini',
        key: settings.geminiKey,
        model: settings.geminiModel || 'gemini-2.5-flash',
        delay: 500, // free tier ~15 RPM, để 500ms cho an toàn
      };
    case 'custom':
      return {
        kind: 'openai',
        url: settings.customUrl,
        key: settings.customKey,
        model: settings.customModel,
        delay: 200,
      };
    case 'mymemory':
    default:
      return { kind: 'mymemory', delay: 500 };
  }
};

// Dịch 1 text với retry + backoff
const translateText = async (text, settings, signal) => {
  const info = providerInfo(settings);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      if (info.kind === 'mymemory') return await callMyMemory(text, settings, signal);
      if (info.kind === 'gemini') {
        if (!info.key) throw new Error('Chưa nhập Gemini API key.');
        return await callGemini(info, text, signal);
      }
      if (!info.url || !info.key) throw new Error('Chưa cấu hình URL hoặc API key.');
      return await callOpenAILike(info, text, signal);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      if (attempt < 2) await sleep(500 * Math.pow(2, attempt), signal);
    }
  }
  throw lastErr || new Error('Lỗi không xác định khi dịch.');
};

// ============================================================
// UI Icons (SVG inline)
// ============================================================
const Icon = {
  Upload: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Settings: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  Menu: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  X: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Check: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Eye: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  EyeOff: (p) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
};

// ============================================================
// Component: Upload Screen
// ============================================================
function UploadScreen({ onFile, error }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">📚 EPUB Trans</h1>
          <p className="text-slate-400">Dịch truyện EPUB từ tiếng Trung sang tiếng Việt — từng chương một.</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
            drag
              ? 'border-emerald-400 bg-emerald-400/10 scale-[1.02]'
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
          }`}
        >
          <Icon.Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <p className="text-lg font-medium text-slate-200 mb-1">Kéo thả file EPUB vào đây</p>
          <p className="text-sm text-slate-400">hoặc click để chọn file</p>
          <input
            ref={inputRef}
            type="file"
            accept=".epub,application/epub+zip"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>

        {error && (
          <div className="mt-4 p-4 bg-rose-900/30 border border-rose-700 rounded-lg text-rose-200 text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-slate-500">
          Mọi xử lý đều thực hiện ngay trong trình duyệt của bạn. Không upload file lên server.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Component: Sidebar
// ============================================================
function Sidebar({ chapters, selectedIdx, onSelect, translatedSet, open, onClose }) {
  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-20" onClick={onClose} />
      )}
      <aside
        className={`fixed md:static top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-800 z-30 transform transition-transform md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">Mục lục</h2>
          <span className="text-xs text-slate-500">{chapters.length} chương</span>
        </div>
        <div className="overflow-y-auto h-[calc(100%-57px)]">
          {chapters.map((ch, idx) => {
            const isSelected = idx === selectedIdx;
            const isTranslated = translatedSet.has(idx);
            return (
              <button
                key={idx}
                onClick={() => {
                  onSelect(idx);
                  onClose();
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-800/60 flex items-start gap-2 transition-colors ${
                  isSelected
                    ? 'bg-emerald-900/40 text-emerald-200 border-l-4 border-l-emerald-400'
                    : 'text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                <span className="text-xs text-slate-500 w-6 shrink-0 pt-0.5">{idx + 1}</span>
                <span className="flex-1 text-sm leading-snug break-words">{ch.title}</span>
                {isTranslated && (
                  <Icon.Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" title="Đã dịch" />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

// ============================================================
// Component: Settings Modal
// ============================================================
function SettingsModal({ open, onClose, settings, onChange, onClearCache }) {
  const [local, setLocal] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => setLocal(settings), [settings, open]);

  if (!open) return null;

  const save = () => {
    onChange(local);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const out = await translateText('你好', local);
      setTestResult({ ok: true, msg: `OK — "你好" → "${out}"` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  const Field = ({ label, children }) => (
    <label className="block">
      <span className="block text-sm text-slate-300 mb-1.5">{label}</span>
      {children}
    </label>
  );

  const inputCls =
    'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500';

  const KeyInput = ({ value, onChange, placeholder }) => (
    <div className="relative">
      <input
        type={showKey ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls + ' pr-10'}
      />
      <button
        type="button"
        onClick={() => setShowKey((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
        tabIndex={-1}
      >
        {showKey ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">⚙️ Cài đặt API dịch</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <Icon.X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Chọn provider */}
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-300">Nguồn dịch</span>
            {[
              { v: 'mymemory', label: 'MyMemory — Miễn phí, không cần key (~1000 từ/ngày)' },
              { v: 'gemini', label: 'Gemini (Google) — Free tier rộng rãi, cần API key' },
              { v: 'deepseek', label: 'DeepSeek — Cần API key' },
              { v: 'qwen', label: 'Qwen (Alibaba) — Cần API key' },
              { v: 'custom', label: 'Custom (OpenAI-compatible)' },
            ].map((p) => (
              <label
                key={p.v}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  local.provider === p.v
                    ? 'border-emerald-500 bg-emerald-900/20'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.v}
                  checked={local.provider === p.v}
                  onChange={() => setLocal({ ...local, provider: p.v })}
                  className="accent-emerald-500"
                />
                <span className="text-sm text-slate-200">{p.label}</span>
              </label>
            ))}
          </div>

          {/* Config từng provider */}
          {local.provider === 'mymemory' && (
            <Field label="Email (tùy chọn, tăng giới hạn miễn phí)">
              <input
                type="email"
                value={local.mymemoryEmail}
                onChange={(e) => setLocal({ ...local, mymemoryEmail: e.target.value })}
                placeholder="your@email.com"
                className={inputCls}
              />
            </Field>
          )}

          {local.provider === 'deepseek' && (
            <Field label="DeepSeek API Key">
              <KeyInput
                value={local.deepseekKey}
                onChange={(v) => setLocal({ ...local, deepseekKey: v })}
                placeholder="sk-..."
              />
            </Field>
          )}

          {local.provider === 'qwen' && (
            <Field label="Qwen / DashScope API Key">
              <KeyInput
                value={local.qwenKey}
                onChange={(v) => setLocal({ ...local, qwenKey: v })}
                placeholder="sk-..."
              />
            </Field>
          )}

          {local.provider === 'gemini' && (
            <div className="space-y-3">
              <Field label="Gemini API Key (lấy free tại aistudio.google.com/apikey)">
                <KeyInput
                  value={local.geminiKey}
                  onChange={(v) => setLocal({ ...local, geminiKey: v })}
                  placeholder="AIza..."
                />
              </Field>
              <Field label="Model">
                <select
                  value={local.geminiModel}
                  onChange={(e) => setLocal({ ...local, geminiModel: e.target.value })}
                  className={inputCls}
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash (khuyến nghị)</option>
                  <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (nhanh hơn)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro (chất lượng cao, chậm)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                </select>
              </Field>
            </div>
          )}

          {local.provider === 'custom' && (
            <div className="space-y-3">
              <Field label="API URL (OpenAI-compatible /chat/completions)">
                <input
                  value={local.customUrl}
                  onChange={(e) => setLocal({ ...local, customUrl: e.target.value })}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className={inputCls}
                />
              </Field>
              <Field label="API Key">
                <KeyInput
                  value={local.customKey}
                  onChange={(v) => setLocal({ ...local, customKey: v })}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="Model name">
                <input
                  value={local.customModel}
                  onChange={(e) => setLocal({ ...local, customModel: e.target.value })}
                  placeholder="gpt-4o-mini"
                  className={inputCls}
                />
              </Field>
            </div>
          )}

          {/* Test */}
          <div>
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-100 disabled:opacity-50"
            >
              {testing ? 'Đang test...' : '🧪 Test kết nối ("你好")'}
            </button>
            {testResult && (
              <div
                className={`mt-2 p-2 rounded text-sm ${
                  testResult.ok
                    ? 'bg-emerald-900/30 text-emerald-200 border border-emerald-700'
                    : 'bg-rose-900/30 text-rose-200 border border-rose-700'
                }`}
              >
                {testResult.msg}
              </div>
            )}
          </div>

          {/* Clear cache */}
          <div className="pt-3 border-t border-slate-700">
            <button
              onClick={() => {
                if (confirm('Xóa tất cả bản dịch đã lưu trong trình duyệt?')) onClearCache();
              }}
              className="px-4 py-2 text-sm text-rose-300 hover:bg-rose-900/30 rounded-lg"
            >
              🗑️ Xóa toàn bộ cache bản dịch
            </button>
          </div>
        </div>

        <div className="p-5 border-t border-slate-700 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg">
            Hủy
          </button>
          <button onClick={save} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium">
            Lưu cài đặt
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Component: Chapter View
// ============================================================
function ChapterView({
  chapter,
  chapterIdx,
  total,
  translation, // { paragraphs: string[] }
  translating, // { progress: 0..100 } | null
  showOriginal,
  onToggle,
  onTranslate,
  onStop,
  onPrev,
  onNext,
}) {
  const contentRef = useRef(null);

  // Scroll to top khi đổi chương
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [chapterIdx]);

  const hasTranslation = translation?.paragraphs?.length > 0;
  const showTranslated = !showOriginal && hasTranslation;

  return (
    <div ref={contentRef} className="flex-1 overflow-y-auto">
      {/* Toolbar chương */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 md:px-8 py-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onPrev}
          disabled={chapterIdx === 0 || !!translating}
          className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ⬅ Chương trước
        </button>
        <button
          onClick={onNext}
          disabled={chapterIdx >= total - 1 || !!translating}
          className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Chương sau ➡
        </button>

        <div className="flex-1" />

        {hasTranslation && !translating && (
          <button
            onClick={onToggle}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200"
            title="Chuyển đổi bản gốc / bản dịch"
          >
            {showOriginal ? '中 → Vi' : 'Vi → 中'}
          </button>
        )}

        {!translating ? (
          <button
            onClick={onTranslate}
            className="px-4 py-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white"
          >
            🔄 {hasTranslation ? 'Dịch lại' : 'Dịch chương này'}
          </button>
        ) : (
          <button
            onClick={onStop}
            className="px-4 py-1.5 text-sm font-medium bg-rose-600 hover:bg-rose-500 rounded-lg text-white"
          >
            ⏹ Dừng dịch
          </button>
        )}
      </div>

      {/* Progress bar */}
      {translating && (
        <div className="px-4 md:px-8 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Đang dịch...</span>
            <span>{Math.round(translating.progress)}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
              style={{ width: `${translating.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Nội dung */}
      <article className="max-w-3xl mx-auto px-4 md:px-8 py-8 font-reader leading-[1.85] text-[17px] text-slate-200 reader-content">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-100 mb-6">{chapter.title}</h1>

        {showTranslated ? (
          <>
            {translation.paragraphs.map((p, i) => (
              <p key={i} className="fade-in">
                {p}
              </p>
            ))}
            {translating && (
              <p className="text-slate-500 italic">▍ đang dịch tiếp...</p>
            )}
          </>
        ) : (
          chapter.blocks.map((b, i) => <p key={i}>{b}</p>)
        )}
      </article>
    </div>
  );
}

// ============================================================
// Component: App (root)
// ============================================================
export default function App() {
  const [view, setView] = useState('upload'); // 'upload' | 'reader'
  const [filename, setFilename] = useState('');
  const [book, setBook] = useState(null); // { title, chapters }
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [translations, setTranslations] = useState({}); // { [idx]: { paragraphs: [] } }
  const [translating, setTranslating] = useState(null); // { idx, progress }
  const [showOriginal, setShowOriginal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [uploadError, setUploadError] = useState('');

  const abortRef = useRef(null);

  // Load bản dịch cho từng chương từ localStorage khi mở book mới
  useEffect(() => {
    if (!book || !filename) return;
    const loaded = {};
    book.chapters.forEach((_, i) => {
      try {
        const raw = localStorage.getItem(trKey(filename, i));
        if (raw) loaded[i] = JSON.parse(raw);
      } catch {}
    });
    setTranslations(loaded);
  }, [book, filename]);

  // Set tiêu đề tab
  useEffect(() => {
    document.title = book?.title ? `${book.title} · EPUB Trans` : 'EPUB Trans';
  }, [book?.title]);

  const handleFile = useCallback(async (file) => {
    setUploadError('');
    try {
      const parsed = await parseEpub(file);
      if (!parsed.chapters.length) throw new Error('Không tìm thấy chương nào trong EPUB.');
      setBook(parsed);
      setFilename(file.name);
      setSelectedIdx(0);
      setView('reader');
      setShowOriginal(false);
    } catch (e) {
      setUploadError(e.message || 'Lỗi khi đọc file EPUB.');
    }
  }, []);

  const translatedSet = useMemo(
    () => new Set(Object.entries(translations).filter(([, v]) => v?.paragraphs?.length).map(([k]) => +k)),
    [translations]
  );

  // === Bắt đầu dịch chương ===
  const startTranslate = useCallback(async () => {
    if (selectedIdx == null || !book) return;
    const idx = selectedIdx;
    const chapter = book.chapters[idx];
    const limits = settings.provider === 'mymemory' ? BATCH_LIMITS.mymemory : BATCH_LIMITS.llm;

    const batches = buildBatches(chapter.blocks, limits);
    if (batches.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;

    // Reset bản dịch cũ (nếu dịch lại)
    setTranslations((t) => ({ ...t, [idx]: { paragraphs: [] } }));
    setShowOriginal(false);
    setTranslating({ idx, progress: 0 });

    const info = providerInfo(settings);
    const allParagraphs = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        if (controller.signal.aborted) break;
        const batchText = batches[i].join('\n\n');
        const result = await translateText(batchText, settings, controller.signal);
        // Tách kết quả ra các đoạn
        const paras = result
          .split(/\n{2,}/)
          .map((s) => s.trim())
          .filter(Boolean);
        // Fallback: nếu chỉ ra 1 đoạn mà input có nhiều đoạn, dùng nguyên chunk
        allParagraphs.push(...(paras.length ? paras : [result]));
        const progress = ((i + 1) / batches.length) * 100;
        setTranslations((t) => ({ ...t, [idx]: { paragraphs: [...allParagraphs] } }));
        setTranslating({ idx, progress });
        if (i < batches.length - 1) {
          try {
            await sleep(info.delay, controller.signal);
          } catch {
            break;
          }
        }
      }

      if (!controller.signal.aborted) {
        // Lưu vào localStorage
        localStorage.setItem(trKey(filename, idx), JSON.stringify({ paragraphs: allParagraphs }));
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        alert('Lỗi khi dịch: ' + e.message);
      }
    } finally {
      setTranslating(null);
      abortRef.current = null;
    }
  }, [book, selectedIdx, settings, filename]);

  const stopTranslate = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClearCache = useCallback(() => {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('epub_') && k !== LS_SETTINGS) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    setTranslations({});
  }, []);

  const handleSettingsChange = (s) => {
    setSettings(s);
    saveSettings(s);
  };

  // === Render ===
  if (view === 'upload' || !book) {
    return (
      <>
        <UploadScreen onFile={handleFile} error={uploadError} />
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onChange={handleSettingsChange}
          onClearCache={handleClearCache}
        />
      </>
    );
  }

  const currentChapter = book.chapters[selectedIdx];
  const currentTranslation = translations[selectedIdx];

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 md:px-5 py-3 border-b border-slate-800 bg-slate-900">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden text-slate-300 hover:text-slate-100">
          <Icon.Menu className="w-5 h-5" />
        </button>
        <h1 className="flex-1 truncate font-semibold text-slate-100">{book.title}</h1>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
          title="Cài đặt API"
        >
          <Icon.Settings className="w-5 h-5" />
        </button>
        <button
          onClick={() => {
            if (translating) {
              if (!confirm('Đang dịch — chuyển file sẽ huỷ tác vụ. Tiếp tục?')) return;
              abortRef.current?.abort();
            }
            setView('upload');
            setBook(null);
            setSelectedIdx(null);
            setTranslations({});
            setUploadError('');
          }}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
          title="Upload file mới"
        >
          <Icon.Upload className="w-5 h-5" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          chapters={book.chapters}
          selectedIdx={selectedIdx}
          onSelect={(i) => {
            if (translating) {
              if (!confirm('Đang dịch — chuyển chương sẽ huỷ tác vụ. Tiếp tục?')) return;
              abortRef.current?.abort();
            }
            setSelectedIdx(i);
            setShowOriginal(false);
          }}
          translatedSet={translatedSet}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          {currentChapter && (
            <ChapterView
              chapter={currentChapter}
              chapterIdx={selectedIdx}
              total={book.chapters.length}
              translation={currentTranslation}
              translating={translating?.idx === selectedIdx ? translating : null}
              showOriginal={showOriginal}
              onToggle={() => setShowOriginal((s) => !s)}
              onTranslate={startTranslate}
              onStop={stopTranslate}
              onPrev={() => {
                if (selectedIdx > 0) {
                  setSelectedIdx(selectedIdx - 1);
                  setShowOriginal(false);
                }
              }}
              onNext={() => {
                if (selectedIdx < book.chapters.length - 1) {
                  setSelectedIdx(selectedIdx + 1);
                  setShowOriginal(false);
                }
              }}
            />
          )}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={handleSettingsChange}
        onClearCache={handleClearCache}
      />
    </div>
  );
}
