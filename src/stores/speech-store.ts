import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SpeechConfig } from '@/lib/tauri-api';

// 语音与文本模型分别配置，兼容本地 Whisper 服务，不强制依赖某一家供应商。
export const useSpeechStore = create<{ config: SpeechConfig; update: (patch: Partial<SpeechConfig>) => void }>()(
  persist((set) => ({
    config: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'whisper-1', language: '', ffmpegPath: '' },
    update: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
  }), { name: 'resumer_speech_v1' }),
);
