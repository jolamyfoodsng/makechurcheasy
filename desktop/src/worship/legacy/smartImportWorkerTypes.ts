import type { LayoutParseResult, TextElement } from "./layoutParser";
import type { LanguageMode } from "./pdfImportService";
import type { SmartImportAnalysis } from "./smartImportTypes";

export type SmartImportWorkerRequest =
  | {
    kind: "parse-layout";
    requestId: number;
    elements: TextElement[];
  }
  | {
    kind: "analyze-import";
    requestId: number;
    rawText: string;
    layoutResult: LayoutParseResult | null;
    usedLayoutParser: boolean;
    languageMode: LanguageMode;
  };

export type SmartImportWorkerResponse =
  | {
    kind: "parse-layout";
    requestId: number;
    layoutResult: LayoutParseResult;
  }
  | {
    kind: "analyze-import";
    requestId: number;
    analysis: SmartImportAnalysis;
  }
  | {
    kind: "error";
    requestId: number;
    error: string;
  };
