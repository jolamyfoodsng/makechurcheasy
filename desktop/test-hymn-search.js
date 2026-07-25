// Standalone test of the hymn search algorithm
// Run with: node test-hymn-search.js

function fuzzyMatch(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function searchSongs(songs, songSearch) {
  const q = songSearch.trim();
  const qLower = q.toLowerCase();
  const numMatch = qLower.match(/(\d+)/);
  const searchNumber = numMatch ? numMatch[1] : null;

  let scored = songs
    .map((song) => {
      const title = song.title.toLowerCase();
      const searchText = `${song.title}\n${song.artist}\n${song.lyrics}`.toLowerCase();
      let score = 0;

      if (searchNumber) {
        const exactTitleRe = new RegExp(`^hymn\\s+${searchNumber}$`);
        const numDotRe = new RegExp(`^${searchNumber}[.\\s]`);
        const bareNumRe = new RegExp(`^${searchNumber}$`);
        if (exactTitleRe.test(title)) score += 10000;
        else if (bareNumRe.test(title)) score += 10000;
        else if (numDotRe.test(title)) score += 10000;
        else if (title.includes(`hymn ${searchNumber}`)) score += 5000;
        else if (title.includes(searchNumber)) score += 2000;
      }

      if (score === 0 && title.startsWith(qLower)) score += 3000;
      if (score === 0 && title.includes(qLower)) score += 1000;
      if (score === 0 && searchText.includes(qLower)) score += 500;
      if (score === 0 && fuzzyMatch(q, searchText)) score += 100;

      return { song, score, title };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestScore = scored.length > 0 ? scored[0].score : 0;
  if (bestScore >= 500) {
    scored = scored.filter((item) => item.score >= 500);
  }

  return scored;
}

// Test data — simulates various hymn title formats
const testSongs = [
  { title: "Hymn 154", artist: "Traditional", lyrics: "Holy holy holy Lord God almighty" },
  { title: "Hymn 1", artist: "Traditional", lyrics: "Holy holy holy Lord God almighty" },
  { title: "Hymn 10", artist: "Traditional", lyrics: "Holy holy holy Lord God almighty" },
  { title: "Hymn 100", artist: "Traditional", lyrics: "Holy holy holy Lord God almighty" },
  { title: "154", artist: "Traditional", lyrics: "Holy holy holy Lord God almighty" },
  { title: "154. Amazing Grace", artist: "Traditional", lyrics: "Amazing grace how sweet the sound" },
  { title: "Amazing Grace", artist: "John Newton", lyrics: "Amazing grace how sweet the sound that saved a wretch like me" },
  { title: "Holy Holy", artist: "Traditional", lyrics: "Holy holy holy Lord God almighty early in the morning" },
  { title: "How Great Thou Art", artist: "Carl Boberg", lyrics: "O Lord my God when I in awesome wonder" },
  { title: "Hymn 153", artist: "Traditional", lyrics: "This is a test hymn number 153" },
  { title: "Hymn 155", artist: "Traditional", lyrics: "Another hymn number 155 in the collection" },
  { title: "Song of Praise", artist: "Various", lyrics: "Let us sing a song of praise to the Lord" },
  { title: "Hymn 2", artist: "Traditional", lyrics: "God of mercy and of grace" },
  { title: "Hymn 20", artist: "Traditional", lyrics: "Come let us worship the Lord" },
  { title: "Hymn 200", artist: "Traditional", lyrics: "Praise to the Lord the Almighty" },
];

// ============================================================
// TEST 1: Search "hymn 154" — should return Hymn 154 first
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 1: Search "hymn 154"');
console.log("═══════════════════════════════════════════════");
let results = searchSongs(testSongs, "hymn 154");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
console.log(`  ✅ PASS: "${results[0]?.title}" is first (score ${results[0]?.score})`);
console.log();

// ============================================================
// TEST 2: Search "154" — should return Hymn 154 first
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 2: Search "154"');
console.log("═══════════════════════════════════════════════");
results = searchSongs(testSongs, "154");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
console.log(`  ✅ PASS: "${results[0]?.title}" is first (score ${results[0]?.score})`);
console.log();

// ============================================================
// TEST 3: Search "hymn 1" — should rank Hymn 1 above Hymn 10/100/154 etc
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 3: Search "hymn 1"');
console.log("═══════════════════════════════════════════════");
results = searchSongs(testSongs, "hymn 1");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
console.log(`  ✅ PASS: "${results[0]?.title}" is first (score ${results[0]?.score})`);
console.log();

// ============================================================
// TEST 4: Search "amazing grace" — text search, not a number
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 4: Search "amazing grace"');
console.log("═══════════════════════════════════════════════");
results = searchSongs(testSongs, "amazing grace");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
console.log();

// ============================================================
// TEST 5: Search "holy" — should return Holy Holy first
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 5: Search "holy"');
console.log("═══════════════════════════════════════════════");
results = searchSongs(testSongs, "holy");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
console.log();

// ============================================================
// TEST 6: Search "2" — should return Hymn 2 first, NOT Hymn 20 or 200
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 6: Search "2"');
console.log("═══════════════════════════════════════════════");
results = searchSongs(testSongs, "2");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
console.log(`  ✅ First result should be Hymn 2: "${results[0]?.title}" (score ${results[0]?.score})`);
console.log();

// ============================================================
// TEST 7: Search "hymn 200" — should return Hymn 200, not 20 or 2
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 7: Search "hymn 200"');
console.log("═══════════════════════════════════════════════");
results = searchSongs(testSongs, "hymn 200");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
console.log(`  ✅ First result should be Hymn 200: "${results[0]?.title}" (score ${results[0]?.score})`);
console.log();

// ============================================================
// TEST 8: Edge case — search "154" with lyrics containing "153" and "155"
// ============================================================
console.log("═══════════════════════════════════════════════");
console.log('TEST 8: Search "154" with similar songs nearby');
console.log("═══════════════════════════════════════════════");
results = searchSongs(testSongs, "154");
console.log(`  Found ${results.length} results:`);
results.forEach((r, i) => {
  console.log(`  ${i + 1}. [score=${r.score}] "${r.title}"`);
});
const hymn154results = results.filter(r => r.title.includes("154"));
console.log(`  All "154" results: ${hymn154results.map(r => `"${r.title}" [${r.score}]`).join(", ")}`);
console.log(`  ✅ PASS if Hymn 154 is #1`);
