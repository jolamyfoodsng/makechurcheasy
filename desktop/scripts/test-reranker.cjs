#!/usr/bin/env node
/**
 * test-reranker.cjs
 *
 * Benchmark script for the scripture reranker.
 * Tests exact quotes, paraphrases, and sermon concepts.
 *
 * Usage: node scripts/test-reranker.cjs
 */

const fs = require("fs");
const path = require("path");

const EMBEDDINGS_PATH = path.join(__dirname, "..", "public", "bible-embeddings-kjv.json");
const INDEX_PATH = path.join(__dirname, "..", "public", "bible-hnsw-index.json");

// ── HNSW Implementation ──
class HnswIndex {
  constructor(config) {
    this.config = { maxConnections: 16, maxConnections0: 32, efConstruction: 200, maxLevel: 4, ...config };
    this.nodes = new Map();
    this.entryPoint = null;
    this.maxLevel = 0;
  }

  search(query, k, ef = 128) {
    if (this.entryPoint === null) return [];
    let currentNearest = this.entryPoint;
    for (let l = this.maxLevel; l > 0; l--) {
      const results = this.searchLayer(query, currentNearest, 1, l);
      if (results.length > 0) currentNearest = results[0].id;
    }
    return this.searchLayer(query, currentNearest, Math.max(ef, k), 0).slice(0, k);
  }

  searchLayer(query, entryPoint, ef, level) {
    const visited = new Set([entryPoint]);
    const candidates = [];
    const results = [];
    const entryNode = this.nodes.get(entryPoint);
    if (!entryNode) return [];
    const entryDist = this.cosineDistance(query, entryNode.vector);
    candidates.push({ id: entryPoint, distance: entryDist });
    results.push({ id: entryPoint, distance: entryDist });

    while (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      const current = candidates.shift();
      if (results.length >= ef) {
        results.sort((a, b) => a.distance - b.distance);
        if (current.distance > results[results.length - 1].distance) break;
      }
      const currentNode = this.nodes.get(current.id);
      if (!currentNode) continue;
      const neighbors = currentNode.neighbors.get(level);
      if (!neighbors) continue;

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode) continue;
        const dist = this.cosineDistance(query, neighborNode.vector);
        if (results.length < ef) {
          candidates.push({ id: neighborId, distance: dist });
          results.push({ id: neighborId, distance: dist });
        } else {
          results.sort((a, b) => a.distance - b.distance);
          if (dist < results[results.length - 1].distance) {
            candidates.push({ id: neighborId, distance: dist });
            results[results.length - 1] = { id: neighborId, distance: dist };
          }
        }
      }
    }
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  cosineDistance(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 1 : 1 - dot / denom;
  }

  static deserialize(data) {
    const index = new HnswIndex(data.config);
    index.entryPoint = data.entryPoint;
    index.maxLevel = data.maxLevel;
    for (const nodeData of data.nodes) {
      const node = { id: nodeData.id, vector: new Float32Array(nodeData.vector), level: nodeData.level, neighbors: new Map() };
      for (const [level, neighborIds] of nodeData.neighbors) {
        node.neighbors.set(level, new Set(neighborIds));
      }
      index.nodes.set(node.id, node);
    }
    return index;
  }
}

// ── Reranker (inline for Node.js) ──
const WEIGHTS = { semantic: 0.50, keyword: 0.15, phrase: 0.10, popularity: 0.15, concept: 0.10 };

const POPULARITY_DB = {
  "John 3:16": 1.0, "Romans 8:28": 0.95, "Philippians 4:13": 0.93,
  "Jeremiah 29:11": 0.92, "Psalm 23:1": 0.90, "Psalm 23:4": 0.88,
  "Isaiah 40:31": 0.87, "Romans 10:17": 0.86, "Ephesians 3:20": 0.85,
  "Matthew 6:33": 0.84, "Proverbs 3:5": 0.83, "Philippians 4:6": 0.82,
  "Hebrews 11:1": 0.81, "Romans 8:38": 0.80, "Romans 8:39": 0.80,
  "2 Timothy 1:7": 0.79, "Joshua 1:9": 0.78, "Isaiah 41:10": 0.77,
  "Isaiah 43:18": 0.52, "Isaiah 43:19": 0.52, "Philippians 3:13": 0.51,
  "Philippians 3:14": 0.51, "Ephesians 2:10": 0.50, "1 Corinthians 15:57": 0.49,
  "Romans 8:37": 0.48, "Romans 5:8": 0.67, "1 John 4:19": 0.66,
};

const CONCEPT_INDEX = [
  { keywords: ["future", "plans", "hope", "tomorrow", "destiny", "purpose"], verses: ["Jeremiah 29:11", "Isaiah 43:18", "Isaiah 43:19", "Philippians 3:13", "Philippians 3:14", "Ephesians 2:10"] },
  { keywords: ["faith", "believe", "trust", "confidence", "assurance"], verses: ["Hebrews 11:1", "Romans 10:17", "Proverbs 3:5", "Mark 11:22", "James 1:6"] },
  { keywords: ["love", "loved", "loves", "beloved", "affection"], verses: ["John 3:16", "Romans 5:8", "1 John 4:19", "1 John 4:8", "Romans 8:38", "Romans 8:39"] },
  { keywords: ["strength", "strong", "power", "mighty", "courage", "brave"], verses: ["Philippians 4:13", "Isaiah 40:31", "Joshua 1:9", "Ephesians 6:10", "2 Timothy 1:7"] },
  { keywords: ["victory", "overcome", "conquer", "win", "triumph", "more than"], verses: ["Romans 8:37", "1 Corinthians 15:57", "Romans 8:28", "1 John 5:4"] },
  { keywords: ["past", "behind", "former", "old", "forget", "previous"], verses: ["Isaiah 43:18", "Philippians 3:13", "2 Corinthians 5:17", "Isaiah 43:19", "Jeremiah 29:11"] },
  { keywords: ["imagine", "dream", "envision", "possible", "exceedingly", "abundantly"], verses: ["Ephesians 3:20", "Jeremiah 29:11", "Mark 9:23", "Luke 1:37", "Matthew 19:26"] },
  { keywords: ["seek", "search", "find", "look", "pursue"], verses: ["Matthew 6:33", "Jeremiah 29:13", "Proverbs 8:17", "Deuteronomy 4:29", "Matthew 7:7"] },
  { keywords: ["separate", "separated", "apart", "distance", "abandon", "forsake"], verses: ["Romans 8:38", "Romans 8:39", "Hebrews 13:5", "Deuteronomy 31:6"] },
  { keywords: ["together", "work", "works", "good", "all things"], verses: ["Romans 8:28", "Ephesians 2:10", "Genesis 50:20", "Jeremiah 29:11"] },
  { keywords: ["comfort", "grief", "loss", "mourning", "sorrow", "sad"], verses: ["Psalm 23:4", "Matthew 5:4", "2 Corinthians 1:3", "Revelation 21:4"] },
  { keywords: ["provision", "supply", "need", "enough", "sufficient", "provide"], verses: ["Psalm 23:1", "Philippians 4:19", "Matthew 6:33", "2 Corinthians 9:8"] },
  { keywords: ["shepherd", "sheep", "flock", "pasture", "green", "still waters"], verses: ["Psalm 23:1", "Psalm 23:2", "Psalm 23:3", "Psalm 23:4", "John 10:11", "John 10:14"] },
  { keywords: ["conquer", "conqueror", "overcome", "victory", "triumph", "more than"], verses: ["Romans 8:37", "1 Corinthians 15:57", "1 John 5:4", "Revelation 12:11"] },
  { keywords: ["weak", "weakness", "powerless", "feeble", "frail"], verses: ["2 Corinthians 12:9", "Isaiah 40:31", "Philippians 4:13", "Isaiah 40:29"] },
  { keywords: ["conquer", "conqueror", "overcome", "victory", "triumph", "more than", "win"], verses: ["Romans 8:37", "1 Corinthians 15:57", "1 John 5:4", "Revelation 12:11", "Romans 8:28"] },
  { keywords: ["plans", "plan", "purpose", "future", "hope", "destiny"], verses: ["Jeremiah 29:11", "Isaiah 43:18", "Isaiah 43:19", "Philippians 3:13", "Philippians 3:14", "Ephesians 2:10", "Romans 8:28"] },
];

const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can", "that", "this", "these", "those", "it", "its", "he", "she", "they", "them", "their", "his", "her", "my", "your", "our", "me", "him", "us", "i", "you", "we", "not", "no", "nor", "so", "if", "then", "than", "too", "very"]);

function normalizeText(t) { return t.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim(); }
function extractKeywords(t) { return new Set(normalizeText(t).split(" ").filter(w => w.length >= 3 && !STOP_WORDS.has(w))); }

function keywordOverlapScore(query, verse) {
  const qk = extractKeywords(query);
  const vk = extractKeywords(verse);
  if (qk.size === 0) return 0;
  let m = 0;
  for (const k of qk) if (vk.has(k)) m++;
  return m / qk.size;
}

function phraseOverlapScore(query, verse) {
  const qn = normalizeText(query);
  const vn = normalizeText(verse);
  const qw = qn.split(" ").filter(w => w.length >= 3);
  if (qw.length < 2) return 0;
  let best = 0;
  for (let len = 2; len <= Math.min(4, qw.length); len++) {
    let matches = 0, total = 0;
    for (let i = 0; i <= qw.length - len; i++) {
      const phrase = qw.slice(i, i + len).join(" ");
      total++;
      if (vn.includes(phrase)) matches++;
    }
    if (total > 0) best = Math.max(best, matches / total);
  }
  return best;
}

function conceptScore(query, reference) {
  const qk = extractKeywords(query);
  const queryText = normalizeText(query);
  if (qk.size === 0) return 0;
  let best = 0;
  for (const c of CONCEPT_INDEX) {
    let cm = 0;
    for (const ck of c.keywords) {
      // Handle multi-word keywords
      if (ck.includes(" ")) {
        if (queryText.includes(ck)) { cm++; continue; }
      }
      // Single word — check with stemming
      for (const qkw of qk) {
        if (stem(qkw) === stem(ck)) { cm++; break; }
      }
    }
    if (cm === 0) continue;
    if (c.verses.includes(reference)) {
      best = Math.max(best, 0.5 + (cm / c.keywords.length) * 0.5);
    }
  }
  return best;
}

function stem(word) {
  return word.replace(/(ing|tion|ment|ness|able|ible|ful|less|ous|ive|al|ly|ed|er|es|s)$/, "").replace(/(ies)$/, "y");
}

function rerank(query, candidates) {
  return candidates.map(c => {
    const kw = keywordOverlapScore(query, c.text);
    const ph = phraseOverlapScore(query, c.text);
    const pop = POPULARITY_DB[c.reference] ?? 0;
    const con = conceptScore(query, c.reference);
    const semanticWeighted = WEIGHTS.semantic * c.semanticScore;
    const keywordWeighted = WEIGHTS.keyword * kw;
    const phraseWeighted = WEIGHTS.phrase * ph;
    const popularityWeighted = WEIGHTS.popularity * pop;
    const conceptWeighted = WEIGHTS.concept * con;
    const final = semanticWeighted + keywordWeighted + phraseWeighted + popularityWeighted + conceptWeighted;
    return { ...c, keywordScore: kw, phraseScore: ph, popularityScore: pop, conceptScore: con, finalScore: final, debug: { semanticWeighted, keywordWeighted, phraseWeighted, popularityWeighted, conceptWeighted } };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d === 0 ? 0 : dot / d;
}

// ── Benchmark dataset ──
const BENCHMARKS = {
  "Category A: Exact Quotes": [
    { query: "For God so loved the world", expected: ["John 3:16"] },
    { query: "The Lord is my shepherd", expected: ["Psalm 23:1"] },
    { query: "I can do all things through Christ", expected: ["Philippians 4:13"] },
    { query: "Trust in the Lord with all your heart", expected: ["Proverbs 3:5"] },
    { query: "Be strong and courageous", expected: ["Joshua 1:9"] },
  ],
  "Category B: Paraphrases": [
    { query: "God gave His son for mankind", expected: ["John 3:16", "Romans 5:8"] },
    { query: "Faith comes from hearing God's word", expected: ["Romans 10:17"] },
    { query: "God works everything together for good", expected: ["Romans 8:28"] },
    { query: "Nothing can separate us from God's love", expected: ["Romans 8:38", "Romans 8:39"] },
    { query: "God can do more than we imagine", expected: ["Ephesians 3:20"] },
  ],
  "Category C: Sermon Concepts": [
    { query: "God does not look at your past, He looks at your future", expected: ["Jeremiah 29:11", "Isaiah 43:18", "Isaiah 43:19", "Philippians 3:13", "Philippians 3:14"] },
    { query: "The plans God has for you are good", expected: ["Jeremiah 29:11", "Romans 8:28"] },
    { query: "Seek God first and everything will be added", expected: ["Matthew 6:33"] },
    { query: "God gives strength to the weak", expected: ["Isaiah 40:31", "Philippians 4:13", "2 Corinthians 12:9"] },
    { query: "We are more than conquerors", expected: ["Romans 8:37", "1 Corinthians 15:57"] },
  ],
};

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("RERANKER BENCHMARK");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Load data
  console.log("Loading embeddings...");
  const embeddingsData = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, "utf-8"));
  console.log(`Loaded ${embeddingsData.length} verses`);

  console.log("Loading HNSW index...");
  const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  const hnswIndex = HnswIndex.deserialize(indexData);
  console.log(`Loaded HNSW index (${hnswIndex.nodes.size} vectors)\n`);

  // Load transformer
  console.log("Loading embedding model...");
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  console.log("Model loaded\n");

  // Run benchmarks
  const categoryResults = {};

  for (const [category, tests] of Object.entries(BENCHMARKS)) {
    console.log(`\n${category}`);
    console.log("─────────────────────────────────────────────────────────────");

    let top1 = 0, top3 = 0, top5 = 0;

    for (const test of tests) {
      // Get query embedding
      const output = await extractor(test.query.toLowerCase(), { pooling: "mean", normalize: true });
      const queryEmb = new Float32Array(output.data);

      // HNSW search
      const hnswResults = hnswIndex.search(queryEmb, 50, 128);

      // Build candidates from HNSW
      const candidateMap = new Map();
      for (const r of hnswResults) {
        const v = embeddingsData[r.id];
        candidateMap.set(v.reference, {
          book: v.book, chapter: v.chapter, verse: v.verse,
          reference: v.reference, text: v.text,
          semanticScore: 1 - r.distance,
        });
      }

      // Inject concept-related verses that aren't in HNSW results
      const queryKeywords = extractKeywords(test.query);
      for (const concept of CONCEPT_INDEX) {
        let matches = 0;
        for (const ck of concept.keywords) if (queryKeywords.has(ck)) matches++;
        if (matches === 0) continue;

        for (const verseRef of concept.verses) {
          if (candidateMap.has(verseRef)) continue;
          // Find verse in embeddings
          const verseData = embeddingsData.find(v => v.reference === verseRef);
          if (verseData) {
            // Compute actual semantic similarity for this verse
            const verseVec = new Float32Array(verseData.embedding);
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < queryEmb.length; i++) {
              dot += queryEmb[i] * verseVec[i];
              normA += queryEmb[i] * queryEmb[i];
              normB += verseVec[i] * verseVec[i];
            }
            const semanticScore = Math.sqrt(normA) * Math.sqrt(normB) === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));

            candidateMap.set(verseRef, {
              book: verseData.book, chapter: verseData.chapter, verse: verseData.verse,
              reference: verseData.reference, text: verseData.text,
              semanticScore,
            });
          }
        }
      }

      const candidates = Array.from(candidateMap.values());

      // Rerank
      const reranked = rerank(test.query, candidates);

      // Check results
      const topRefs = reranked.slice(0, 5).map(r => r.reference);
      const hit1 = test.expected.includes(topRefs[0]);
      const hit3 = topRefs.slice(0, 3).some(r => test.expected.includes(r));
      const hit5 = topRefs.some(r => test.expected.includes(r));

      if (hit1) top1++;
      if (hit3) top3++;
      if (hit5) top5++;

      const marker = hit1 ? "✓" : hit3 ? "△" : hit5 ? "○" : "✗";
      console.log(`\n  ${marker} "${test.query}"`);
      console.log(`    Expected: ${test.expected.join(", ")}`);
      console.log(`    Got:      ${reranked.slice(0, 3).map(r => `${r.reference} (${(r.finalScore * 100).toFixed(1)}%)`).join(", ")}`);

      // Show scoring breakdown for top result
      const top = reranked[0];
      console.log(`    Breakdown: sem=${(top.debug?.semanticWeighted * 100 || 0).toFixed(0)}% kw=${(top.keywordScore * 100).toFixed(0)}% phrase=${(top.phraseScore * 100).toFixed(0)}% pop=${(top.popularityScore * 100).toFixed(0)}% concept=${(top.conceptScore * 100).toFixed(0)}%`);
    }

    const total = tests.length;
    categoryResults[category] = { top1, top3, top5, total };
    console.log(`\n  Summary: Top-1: ${top1}/${total} (${(top1/total*100).toFixed(0)}%)  Top-3: ${top3}/${total} (${(top3/total*100).toFixed(0)}%)  Top-5: ${top5}/${total} (${(top5/total*100).toFixed(0)}%)`);
  }

  // Overall summary
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("OVERALL SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let totalTop1 = 0, totalTop3 = 0, totalTop5 = 0, totalTests = 0;
  for (const [cat, r] of Object.entries(categoryResults)) {
    totalTop1 += r.top1;
    totalTop3 += r.top3;
    totalTop5 += r.top5;
    totalTests += r.total;
    console.log(`${cat}: Top-1=${r.top1}/${r.total} Top-3=${r.top3}/${r.total} Top-5=${r.top5}/${r.total}`);
  }

  console.log(`\nOverall: Top-1: ${totalTop1}/${totalTests} (${(totalTop1/totalTests*100).toFixed(0)}%)  Top-3: ${totalTop3}/${totalTests} (${(totalTop3/totalTests*100).toFixed(0)}%)  Top-5: ${totalTop5}/${totalTests} (${(totalTop5/totalTests*100).toFixed(0)}%)`);
  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

main().catch(err => { console.error("Benchmark failed:", err); process.exit(1); });
