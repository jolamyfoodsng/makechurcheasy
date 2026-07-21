/// <reference lib="webworker" />

import { parseLayoutSongs } from "./layoutParser";
import { detectSongs } from "./songDetector";
import { analyzeLocalWorshipImport } from "./smartImportService";
import type { SmartImportWorkerRequest, SmartImportWorkerResponse } from "./smartImportWorkerTypes";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<SmartImportWorkerRequest>) => {
  const request = event.data;

  try {
    if (request.kind === "parse-layout") {
      const response: SmartImportWorkerResponse = {
        kind: "parse-layout",
        requestId: request.requestId,
        layoutResult: parseLayoutSongs(request.elements),
      };
      workerScope.postMessage(response);
      return;
    }

    const detection = detectSongs(request.rawText);
    const analysis = analyzeLocalWorshipImport({
      rawText: request.rawText,
      detection,
      layoutResult: request.layoutResult,
      usedLayoutParser: request.usedLayoutParser,
      languageMode: request.languageMode,
    });

    const response: SmartImportWorkerResponse = {
      kind: "analyze-import",
      requestId: request.requestId,
      analysis,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: SmartImportWorkerResponse = {
      kind: "error",
      requestId: request.requestId,
      error: toErrorMessage(error),
    };
    workerScope.postMessage(response);
  }
};

export {};
