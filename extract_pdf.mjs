import * as pdfjsLib from './desktop/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';

const data = new Uint8Array(readFileSync('./F3A8E1F6-3C53-462D-B9B5-05E89E66E030-export.pdf'));
const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, stopAtErrors: false }).promise;
console.log('numPages:', doc.numPages);

for (let p = 1; p <= Math.min(doc.numPages, 6); p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const items = content.items.filter(i => i.str && i.str.trim());
  console.log(`\n=== PAGE ${p} (${items.length} items) ===`);
  items.slice(0, 50).forEach(i => {
    const x = Math.round(i.transform[4]);
    const y = Math.round(i.transform[5]);
    const fs = Math.round(Math.max(Math.abs(i.transform[3]), i.height) || 12);
    console.log(`  [x=${x} y=${y} fs=${fs}] "${i.str}"`);
  });
}
