'use client';

import { useEffect, useState } from 'react';
import type { ClientSettings } from '@/lib/client-settings';
import { DEFAULT_SETTINGS } from '@/lib/client-settings';
import type { TranslateProvider } from '@/lib/types';

type Props = {
  open: boolean;
  onClose: () => void;
  settings: ClientSettings;
  onSave: (s: ClientSettings) => void;
};

const PROVIDERS: { v: TranslateProvider; label: string; help: string }[] = [
  { v: 'gemini', label: 'Gemini (Google)', help: 'Free tier rộng rãi. Lấy key tại aistudio.google.com/apikey' },
  { v: 'deepseek', label: 'DeepSeek / ds2api', help: 'Official API hoặc ds2api OpenAI-compatible' },
  { v: 'openrouter', label: 'OpenRouter', help: 'OpenAI-compatible, dùng key từ openrouter.ai' },
  { v: 'qwen', label: 'Qwen (Alibaba)', help: 'dashscope-intl.aliyuncs.com' },
  { v: 'mymemory', label: 'MyMemory', help: 'Free, không cần key. Email tăng quota (optional)' },
];

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

export default function SettingsModal({ open, onClose, settings, onSave }: Props) {
  const [local, setLocal] = useState<ClientSettings>(settings);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) setLocal(settings);
  }, [open, settings]);

  if (!open) return null;

  const save = () => {
    onSave(local);
    onClose();
  };

  const inputCls =
    'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500';

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">⚙️ Cài đặt API dịch</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-300">Nguồn dịch</span>
            {PROVIDERS.map((p) => (
              <label
                key={p.v}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
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
                  className="accent-emerald-500 mt-0.5"
                />
                <div>
                  <div className="text-sm text-slate-200">{p.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.help}</div>
                </div>
              </label>
            ))}
          </div>

          {local.provider === 'gemini' && (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">Gemini API Key</span>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={local.geminiKey}
                    onChange={(e) => setLocal({ ...local, geminiKey: e.target.value })}
                    placeholder="AIza..."
                    className={inputCls + ' pr-16'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 px-2"
                  >
                    {showKey ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">Model</span>
                <select
                  value={local.geminiModel}
                  onChange={(e) => setLocal({ ...local, geminiModel: e.target.value })}
                  className={inputCls}
                >
                  {GEMINI_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {local.provider === 'deepseek' && (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">DeepSeek / ds2api API Key</span>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={local.deepseekKey}
                  onChange={(e) => setLocal({ ...local, deepseekKey: e.target.value })}
                  placeholder="sk-... hoặc key cấu hình trong ds2api"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">Base URL</span>
                <input
                  type="url"
                  value={local.deepseekBaseUrl}
                  onChange={(e) => setLocal({ ...local, deepseekBaseUrl: e.target.value })}
                  placeholder="Để trống = backend /api/ds2api"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">Model</span>
                <input
                  type="text"
                  value={local.deepseekModel}
                  onChange={(e) => setLocal({ ...local, deepseekModel: e.target.value })}
                  placeholder="deepseek-chat"
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {local.provider === 'openrouter' && (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">OpenRouter API Key</span>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={local.openrouterKey}
                  onChange={(e) => setLocal({ ...local, openrouterKey: e.target.value })}
                  placeholder="sk-or-v1-..."
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">Base URL</span>
                <input
                  type="url"
                  value={local.openrouterBaseUrl}
                  onChange={(e) => setLocal({ ...local, openrouterBaseUrl: e.target.value })}
                  placeholder="Để trống = https://openrouter.ai/api"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="block text-sm text-slate-300 mb-1.5">Model</span>
                <input
                  type="text"
                  value={local.openrouterModel}
                  onChange={(e) => setLocal({ ...local, openrouterModel: e.target.value })}
                  placeholder="deepseek/deepseek-chat"
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {local.provider === 'qwen' && (
            <label className="block">
              <span className="block text-sm text-slate-300 mb-1.5">Qwen / DashScope API Key</span>
              <input
                type={showKey ? 'text' : 'password'}
                value={local.qwenKey}
                onChange={(e) => setLocal({ ...local, qwenKey: e.target.value })}
                placeholder="sk-..."
                className={inputCls}
              />
            </label>
          )}

          {local.provider === 'mymemory' && (
            <label className="block">
              <span className="block text-sm text-slate-300 mb-1.5">Email (optional)</span>
              <input
                type="email"
                value={local.mymemoryEmail}
                onChange={(e) => setLocal({ ...local, mymemoryEmail: e.target.value })}
                placeholder="your@email.com"
                className={inputCls}
              />
            </label>
          )}

          <div className="pt-2 border-t border-slate-700">
            <button
              onClick={() =>
                setLocal({
                  ...local,
                  provider: DEFAULT_SETTINGS.provider,
                  geminiKey: DEFAULT_SETTINGS.geminiKey,
                  geminiModel: DEFAULT_SETTINGS.geminiModel,
                  deepseekKey: DEFAULT_SETTINGS.deepseekKey,
                  deepseekBaseUrl: DEFAULT_SETTINGS.deepseekBaseUrl,
                  deepseekModel: DEFAULT_SETTINGS.deepseekModel,
                  openrouterKey: DEFAULT_SETTINGS.openrouterKey,
                  openrouterBaseUrl: DEFAULT_SETTINGS.openrouterBaseUrl,
                  openrouterModel: DEFAULT_SETTINGS.openrouterModel,
                  qwenKey: DEFAULT_SETTINGS.qwenKey,
                  mymemoryEmail: DEFAULT_SETTINGS.mymemoryEmail,
                })
              }
              className="text-xs text-slate-400 hover:text-rose-300"
            >
              Reset về mặc định
            </button>
          </div>
        </div>

        <div className="p-5 border-t border-slate-700 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg">
            Hủy
          </button>
          <button
            onClick={save}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
