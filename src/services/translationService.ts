// ────────────────────────────────────────────────────────────────────────────
// Translation Service
//
// Routes translation through the Tauri backend (Rust) to avoid CORS issues.
// Backend calls OpenCode Go (mimo-2.5-pro) via reqwest.
// ────────────────────────────────────────────────────────────────────────────

import { invoke } from '@tauri-apps/api/core';

export interface TranslationResult {
  translatedText: string;
}

/**
 * Translate a sermon transcript into the target language.
 * The actual HTTP request is made by the Tauri Rust backend.
 */
export async function translateTranscript(
  transcriptText: string,
  targetLanguage: string,
): Promise<TranslationResult> {
  const translatedText = await invoke<string>('translate_transcript', {
    transcriptText,
    targetLanguage,
  });

  if (!translatedText?.trim()) {
    throw new Error('Translation returned empty content');
  }

  return { translatedText: translatedText.trim() };
}
