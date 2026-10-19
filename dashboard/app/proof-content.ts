/**
 * proof-content.ts — the proof strip under the home page hero.
 *
 * Fill these in with real, permitted details only (ask each church before using its name, logo
 * or a quote). Until something is filled in, the strip shows a dashed placeholder in development
 * and nothing at all in production, so placeholder text can never reach the live site.
 */
export interface ProofQuote {
  /** The words, as the person said them. */
  quote: string;
  /** "Sarah A." */
  name: string;
  /** "Media lead" */
  role: string;
  /** "Grace Community Church, Lagos" */
  church: string;
}

export interface ProofChurch {
  name: string;
  /** Optional logo in /public, e.g. "/homepage/churches/grace.webp". Without one, the name is shown. */
  logo?: string;
}

export const PROOF = {
  /** e.g. "1,200+" — leave empty to hide the count. */
  churchCount: "",
  /** e.g. "churches in 40 countries present with MakeChurchEazy" */
  churchCountLabel: "churches present with MakeChurchEazy",
  /** 3–6 churches that agreed to be named. */
  churches: [] as ProofChurch[],
  /** 2–3 short quotes from pastors or media volunteers. */
  quotes: [] as ProofQuote[],
};

export function hasProof(): boolean {
  return Boolean(PROOF.churchCount.trim()) || PROOF.churches.length > 0 || PROOF.quotes.length > 0;
}
