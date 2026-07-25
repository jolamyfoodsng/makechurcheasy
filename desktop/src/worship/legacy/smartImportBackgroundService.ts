import type { LayoutParseResult, TextElement } from "./layoutParser";
import type { LanguageMode } from "./pdfImportService";
import type { SmartImportAnalysis } from "./smartImportTypes";
import type { SmartImportWorkerRequest, SmartImportWorkerResponse } from "./smartImportWorkerTypes";

let workerRequestId = 0;

type SmartImportWorkerRequestBody =
  | Omit<Extract<SmartImportWorkerRequest, { kind: "parse-layout" }>, "requestId">
  | Omit<Extract<SmartImportWorkerRequest, { kind: "analyze-import" }>, "requestId">;

function nextRequestId(): number {
  workerRequestId += 1;
  return workerRequestId;
}

function runWorkerRequest<T>(
  request: SmartImportWorkerRequestBody,
  extract: (response: SmartImportWorkerResponse) => T | null,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId();
    const worker = new Worker(new URL("./smartImportWorker.ts", import.meta.url), { type: "module" });

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<SmartImportWorkerResponse>) => {
      const response = event.data;
      if (!response || response.requestId !== requestId) {
        return;
      }

      if (response.kind === "error") {
        cleanup();
        reject(new Error(response.error || "Smart import worker failed."));
        return;
      }

      const result = extract(response);
      if (result === null) {
        cleanup();
        reject(new Error("Smart import worker returned an unexpected response."));
        return;
      }

      cleanup();
      resolve(result);
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Smart import worker crashed."));
    };

    worker.postMessage({ ...request, requestId } as SmartImportWorkerRequest);
  });
}

export function parseLayoutSongsInBackground(elements: TextElement[]): Promise<LayoutParseResult> {
  return runWorkerRequest(
    {
      kind: "parse-layout",
      elements,
    },
    (response) => (response.kind === "parse-layout" ? response.layoutResult : null),
  );
}

export function analyzeSmartImportInBackground(input: {
  rawText: string;
  layoutResult: LayoutParseResult | null;
  usedLayoutParser: boolean;
  languageMode: LanguageMode;
}): Promise<SmartImportAnalysis> {
  return runWorkerRequest(
    {
      kind: "analyze-import",
      rawText: input.rawText,
      layoutResult: input.layoutResult,
      usedLayoutParser: input.usedLayoutParser,
      languageMode: input.languageMode,
    },
    (response) => (response.kind === "analyze-import" ? response.analysis : null),
  );
}
