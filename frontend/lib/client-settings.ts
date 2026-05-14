'use client';

import type { TranslateProvider } from './types';

export type ClientSettings = {
  provider: TranslateProvider;
  geminiKey: string;
  geminiModel: string;
  deepseekKey: string;
  qwenKey: string;
  mymemoryEmail: string;
};

const LS_KEY = 'epub_trans_client_settings';

export const DEFAULT_SETTINGS: ClientSettings = {
  provider: 'gemini',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  deepseekKey: '',
  qwenKey: '',
  mymemoryEmail: '',
};

export function loadSettings(): ClientSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: ClientSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

// Lấy key/model phù hợp cho provider hiện tại để gửi kèm /api/translate.
export function getProviderOverrides(s: ClientSettings): {
  apiKey?: string;
  geminiModel?: string;
  mymemoryEmail?: string;
} {
  switch (s.provider) {
    case 'gemini':
      return {
        apiKey: s.geminiKey.trim() || undefined,
        geminiModel: s.geminiModel.trim() || undefined,
      };
    case 'deepseek':
      return { apiKey: s.deepseekKey.trim() || undefined };
    case 'qwen':
      return { apiKey: s.qwenKey.trim() || undefined };
    case 'mymemory':
      return { mymemoryEmail: s.mymemoryEmail.trim() || undefined };
  }
}
