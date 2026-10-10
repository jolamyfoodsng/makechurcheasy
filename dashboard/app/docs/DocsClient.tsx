"use client";

import { DocsShell } from "./DocsShell";
import { DOC_PAGES } from "./docs-data";

export function DocsClient() {
  return <DocsShell page={DOC_PAGES.overview} />;
}
