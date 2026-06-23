/**
 * bibleEmbeddings.ts — Pre-computed embedding search for Bible verses
 *
 * Uses HNSW (Hierarchical Navigable Small World) indexing for O(log n)
 * approximate nearest neighbor search. Replaces O(n) brute-force scan.
 *
 * Architecture:
 *   Query → Embed → HNSW ANN Search → Top-K Results
 *
 * Target latency: 1-5ms (search only), 10-50ms (including embedding)
 */

import { HnswIndex } from "./hnswIndex";

export interface EmbeddedVerse {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  text: string;
}

export interface EmbeddingSearchResult {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  text: string;
  score: number;
  semanticScore: number; // Added for reranker compatibility
}

// In-memory storage
let verses: EmbeddedVerse[] = [];
let hnswIndex: HnswIndex | null = null;

// Query embedding cache (LRU)
const queryCache = new Map<string, Float32Array>();
const QUERY_CACHE_MAX = 100;

/**
 * Load pre-computed embeddings and build HNSW index.
 * Call once on app init — subsequent searches use the in-memory index.
 */
export async function loadBibleEmbeddings(): Promise<void> {
  if (hnswIndex) return;

  // Try loading pre-built HNSW index first (faster)
  try {
    const indexUrl = `${import.meta.env.BASE_URL}bible-hnsw-index.json`;
    const indexRes = await fetch(indexUrl);
    if (indexRes.ok) {
      const indexData = await indexRes.json();
      hnswIndex = HnswIndex.deserialize(indexData);

      // Also load verse metadata
      const versesUrl = `${import.meta.env.BASE_URL}bible-embeddings-kjv.json`;
      const versesRes = await fetch(versesUrl);
      if (versesRes.ok) {
        const data = await versesRes.json() as Array<{
          book: string;
          chapter: number;
          verse: number;
          reference: string;
          text: string;
        }>;
        verses = data.map((v) => ({
          book: v.book,
          chapter: v.chapter,
          verse: v.verse,
          reference: v.reference,
          text: v.text,
        }));
      }

      return;
    }
  } catch {
    // Fall through to building index from raw embeddings
  }

  // Fallback: load raw embeddings and build HNSW index
  try {
    const url = `${import.meta.env.BASE_URL}bible-embeddings-kjv.json`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[BibleEmbeddings] Failed to load embeddings file:", res.statusText);
      return;
    }

    const data = await res.json() as Array<{
      book: string;
      chapter: number;
      verse: number;
      reference: string;
      text: string;
      embedding: number[];
    }>;

    // Build HNSW index
    hnswIndex = new HnswIndex({
      maxConnections: 16,
      maxConnections0: 32,
      efConstruction: 200,
      efSearch: 64,
      maxLevel: 4,
    });

    verses = [];
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      verses.push({
        book: v.book,
        chapter: v.chapter,
        verse: v.verse,
        reference: v.reference,
        text: v.text,
      });
      hnswIndex.add(i, new Float32Array(v.embedding));
    }
  } catch (err) {
    console.warn("[BibleEmbeddings] Failed to load embeddings:", err);
  }
}

/**
 * Check if embeddings are loaded and ready.
 */
export function hasEmbeddings(): boolean {
  return hnswIndex !== null && hnswIndex.size > 0;
}

/**
 * Get or compute the embedding for a query string.
 * Uses the browser-based transformers.js pipeline.
 */
export async function embedQuery(text: string): Promise<Float32Array | null> {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  // Check cache
  const cached = queryCache.get(normalized);
  if (cached) return cached;

  try {
    const { pipeline } = await import("@xenova/transformers");
    const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    const output = await extractor(normalized, { pooling: "mean", normalize: true });
    const embedding = new Float32Array(output.data);

    // Cache
    if (queryCache.size >= QUERY_CACHE_MAX) {
      const firstKey = queryCache.keys().next().value;
      if (firstKey) queryCache.delete(firstKey);
    }
    queryCache.set(normalized, embedding);

    return embedding;
  } catch (err) {
    console.warn("[BibleEmbeddings] Failed to compute query embedding:", err);
    return null;
  }
}

/**
 * Search for verses similar to the query text using HNSW index.
 * Includes concept-based candidate injection for sermon-style queries.
 * Returns candidates for reranking.
 */
export async function searchByEmbedding(
  query: string,
  limit = 30,
  minScore = 0.25,
): Promise<EmbeddingSearchResult[]> {
  if (!hnswIndex || hnswIndex.size === 0) return [];

  const queryEmbedding = await embedQuery(query);
  if (!queryEmbedding) return [];

  // HNSW search — get more candidates for reranking
  const hnswResults = hnswIndex.search(queryEmbedding, limit, 128);

  // Build candidate map
  const candidateMap = new Map<string, EmbeddingSearchResult>();
  for (const result of hnswResults) {
    const similarity = 1 - result.distance;
    if (similarity >= minScore && result.id < verses.length) {
      const verse = verses[result.id];
      candidateMap.set(verse.reference, {
        book: verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
        reference: verse.reference,
        text: verse.text,
        score: similarity,
        semanticScore: similarity,
      });
    }
  }

  // Inject concept-related verses
  try {
    const { getConceptVerses } = await import("./scriptureReranker");
    const conceptVerses = getConceptVerses(query);

    for (const ref of conceptVerses) {
      if (candidateMap.has(ref)) continue;

      // Find verse in our list
      const verseIdx = verses.findIndex((v) => v.reference === ref);
      if (verseIdx < 0) continue;

      // Compute semantic similarity for this verse
      const verseData = await getVerseEmbedding(verseIdx);
      if (!verseData) continue;

      const similarity = cosineSimilarity(queryEmbedding, verseData);
      if (similarity >= minScore) {
        const verse = verses[verseIdx];
        candidateMap.set(ref, {
          book: verse.book,
          chapter: verse.chapter,
          verse: verse.verse,
          reference: verse.reference,
          text: verse.text,
          score: similarity,
          semanticScore: similarity,
        });
      }
    }
  } catch {
    // Reranker not available — continue without concept injection
  }

  return Array.from(candidateMap.values());
}

/**
 * Get the embedding vector for a verse by index.
 */
async function getVerseEmbedding(index: number): Promise<Float32Array | null> {
  if (!hnswIndex) return null;
  const node = (hnswIndex as any).nodes?.get(index);
  return node?.vector ?? null;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
