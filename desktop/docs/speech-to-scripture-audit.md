# Speech to Scripture: detection and projection audit

Date: 5 September 2026

Numbered-book follow-up: 6 September 2026

The reported failures came from several stages between the transcript and the projected verse. The fixes cover the reference parser, conversational context, quote search, ranking, service queues, the Speech to Scripture page, and the LM dock's projection settings.

## Confirmed defects and fixes

- **Chapter numbers were reinterpreted as verses.** Psalm 23 and Romans 11 were split into Psalm 2:3 and Romans 1:1. Valid chapter numbers now remain chapters; joined-number recovery is reserved for otherwise impossible chapters.
- **Spoken numbers and punctuation changed references.** Compound numbers, numbered books ending in punctuation, single-chapter books, and spoken verse ranges now share normalization. “Romans chapter eight verse twenty eight” resolves to Romans 8:28.
- **Old context survived a passage change.** Navigation previously preferred historical verses over the newly selected chapter. Book changes clear the previous chapter, chapter changes update the active passage, and corrections update navigation history. Book/chapter/verse can arrive in separate audio turns.
- **Unfinished references could reach projection.** Reference commands now commit once the speech turn is finalized; live quote suggestions remain available during speech.
- **Quotation search could be skipped or replaced by unrelated text.** A book-like word in ordinary speech no longer blocks quotation search. Short quote fragments can continue across adjacent finalized turns. A trailing “Amen” no longer cancels a completed quotation search.
- **Older asynchronous work could overwrite newer speech.** Searches become stale as soon as a newer query or reference arrives, and results from an earlier listening session are discarded.
- **Short exact quotations were filtered out.** Actual corpus lookup now considers two distinct content words, while keeping confidence and winner-gap checks. “The race is not to the swift” resolves to Ecclesiastes 9:11.
- **Reranking weakened correct phrases.** Phrase scoring now keeps short words in sequence. Story bonuses apply to the actual story references instead of every verse in the same book. Generic fragments such as “of the world” no longer receive confident alias matches.
- **The main match panel excluded explicit references.** It now follows the newest detected reference or quotation, with manual selection still available.
- **The dock could retain the wrong queue order.** Newly selected and revisited references now lead retained history. Updated text/translation replaces the existing queue entry.
- **A selected translation could only change the label.** Projection now loads the actual verse text in the selected installed translation. Missing verses/translations produce an error rather than relabelling another version. Multi-verse quote results carry their range through projection.
- **Automatic projection accepted weak suggestions.** Only the strongest non-fuzzy suggestion with confidence at least 0.90 can auto-project. Lower-confidence matches remain available for manual review.
- **Suggestion expiry was reset by polling.** Detection timestamps now survive relay polling. Duplicate-projection timing is recorded after a successful push.
- **Auto Navigate had no effect.** It now stages the latest detected reference in the Bible dock when enabled.
- **Semantic lookup rebuilt the extractor for each query.** Consecutive/concurrent queries now share one model initialization.
- **Numbered-book spellings were inconsistent.** The follow-up regression suite reproduced 45 failures across grouped book-name tests. Ordinal words, numeric ordinals, Roman numerals, abbreviations, punctuation, joined forms, and repeated ordinals now share normalization before chapter aliases are expanded. Examples include “firstcor”, “1st Cor.”, “second 2nd Kings”, “1 Ch”, and “1Cor13:4”. “Isa” remains Isaiah rather than being read as compact “I Sa”.
- **A pause after an ordinal lost the book number.** Finalized segments such as “first” → “Cor” → “chapter thirteen” → “verse four” now resolve to 1 Corinthians 13:4 and reach the live service queue. Pending ordinals expire after eight seconds, are cleared by unrelated speech, and are not committed from interim revisions.
- **Reference normalization could disagree with live detection.** The reranker now uses the speech parser before fuzzy lookup. Exact abbreviations such as “Am” no longer resolve to a different book, and “Phlm” is recognized as Philemon.
- **The native speech service finalized partial words.** A live provider check reproduced “seventeen” becoming a finalized “seven” followed by “17” when the Sharp profile forced a turn after four words. Word-count forcing has been removed from every profile. Sharp now waits for 200–1,000 ms of silence, and all profiles send 93 Bible-name hints, including every canonical book and common numbered abbreviations. The same generated recordings then produced all three intended references with no incorrect intermediate reference.
- **Every new phrase rescored almost the whole corpus.** A reusable word index now retrieves matching entries, prioritizes complete word coverage, and skips detailed scoring only when a mathematical score bound cannot beat the shortlist. At most 32 recent searches are cached, with translation eviction clearing related caches. Concurrent preload and transcript requests share the same constructed corpus.
- **Connecting words and scattered matches weakened short quotations.** “Are” is ignored as a connecting word and spoken “shall” can also match “should.” Compact phrases outrank words scattered through verse combinations. Searches prefer distinct passages over several windows around the same exact verse. “Shall be called sons of God” now ranks 1 John 3:1 above an unrelated Kings passage; “blessed are the peacemakers” finds Matthew 5:9.
- **A new short quotation inherited unrelated sermon words.** Finalized turns now search their own words first. Previous words are tried only when needed to complete or disambiguate a split quotation. “God loved the world” finds John 3:16 after unrelated speech or Psalms 91, and “next verse” then resolves John 3:17.
- **Shared phrases waited for the semantic model.** High lexical matches shared by several passages now return immediate suggestions. Uncertain lexical winners include alternatives. Alias ranking boosts no longer inflate displayed confidence above 100% or manufacture a confidence gap between equally exact quotations. “Sons of men” returns several actual verses; “You shall be called sons of men” returns possible matches rather than qualifying for automatic projection.
- **Cold semantic-index construction repeatedly traversed the graph to trim local neighbours.** The real transcript replay reached this fallback when no prebuilt HNSW asset was present. Trimming now ranks only existing connections and excludes self-edges; vector magnitudes are computed once per stored vector and once per query traversal. A deterministic 160-vector check found 250 self-edges before and none after, with all 160 exact-vector lookups preserved. Three new tests cover bounded connections, persistence, and agreement with exhaustive cosine ranking. The full 807-test scripture suite and frontend production build pass. Building the complete raw index is still a significant first-use cost; this patch does not establish instant cold semantic matching.

## Settings checked

| Setting | Behavior |
| --- | --- |
| Microphone | The page and dock use the same native saved microphone preference, retaining migration from the previous page preference. |
| Input gain | Saved gain is applied at capture startup; invalid/non-finite values fall back safely and the supported multiplier is clamped to 0–3. |
| Detection speed | The active service uses Sharp. Its native turn detection now uses 200–1,000 ms of silence and does not cut off speech based on word count. |
| Translation | Default KJV; the selected installed version is fetched before projection. The page and dock share the saved setting loader. |
| Fullscreen / lower third | Shared saved setting, with the global Bible overlay preference as fallback. The page no longer forces fullscreen. |
| Auto-project references | Existing default remains off; when enabled, finalized explicit references enter the automatic queue. |
| Auto-project suggestions | Existing default remains off; when enabled, only confident top suggestions qualify. |
| Duplicate window | Existing default 15 seconds, applied to a verse across detection updates. Failed pushes do not record a successful push time. |
| Auto Navigate | Existing default off; now stages detected references when enabled. |
| Suggestion lifetime | Existing default 20 seconds; normalized to 5–120 seconds and measured from detection rather than each poll. |
| Push target / scene routing | Existing dock output routing is preserved. |
| Transcript auto-scroll | Existing behavior and default are preserved. |
| Legacy voice Bible semantic/audio settings | These belong to the separate `voiceBibleService`/`voiceBibleMatcher` path. They do not configure the active `lmDockService` pipeline used by this page. |

## Verification

- The initial regression suite reproduced 21 failures before the fixes.
- 318 focused tests passed across nine files, including parser, real bundled Bible corpus, ranking, service races, projection settings, dock helpers, and a rendered page component.
- An additional 66-book matrix passed: canonical 1:1 references and every book's final chapter remain correctly identified. Total: 384 checks.
- Follow-up coverage now totals 778 passing tests across eleven files. The book-name matrix checks 1,849 numbered-reference spellings in both the parser and reranker, abbreviations spanning all 66 books, split ordinal/book/chapter/verse turns, interim revisions, expiry, and live service queue routing. Two older semantic tests were aligned with the corrected behavior: vague fragments are not certain aliases, while confident complete quotations can change the active book and subsequent navigation.
- Desktop TypeScript and production frontend build passed. The build reports existing dependency/bundle-size warnings.
- Three native Rust tests passed, covering provisional versus final transcripts and all-book vocabulary within the provider's limits.
- The native desktop development binary rebuilt successfully. One overlapping frontend build/test run timed out on four corpus-heavy tests; the complete 778-test suite then passed with one worker after the build finished.
- The [recorded provider comparison](verification/scripture-audio-2026-09-06.json) uses 15.85 seconds of generated English speech per run. Before: “First Cor” was transcribed as “First Paul,” and 2 Corinthians 5:7 was emitted before the intended 5:17. After: 1 Corinthians 13:4, 2 Kings 6:17, and 2 Corinthians 5:17 were all detected, and their actual KJV projection text resolved correctly. The protocol was checked against [AssemblyAI's current WebSocket guide](https://www.assemblyai.com/blog/raw-websocket-voice-agent-with-assemblyai-universal-3-pro-streaming).
- Existing unrelated worktree changes were preserved. UI layout, spacing, and existing components were retained using `../../docs/DESIGN.md` and `../../docs/COMPONENT_LIBRARY.md`.
- The short-quotation follow-up passes 804 tests across twelve files, including actual corpus matches, shared phrases, fresh versus split turns, stale results, numbered books, projection, and navigation. TypeScript and the production frontend build also pass. The [phrase benchmark](verification/scripture-quotes-2026-09-06.json) records three warm repetitions per example. “God loved the world” decreased from a median 206 ms to 27 ms for an uncached query; repeated cached revisions were below 1 ms. The one-time corpus/index preload took 2.34 seconds. These are local text-search timings, excluding transcription, rendering, and OBS latency.

## Verification boundaries

The regression suite exercises supplied transcript text; the follow-up provider comparison additionally sends generated audio through the live streaming model. Semantic embedding initialization remains mocked in its focused regression test. Browser credit verification initially blocked access but subsequently completed, and the live page opened. The component rendering test confirms that an explicit reference appears in the main match panel.

No real microphone capture, live OBS projection, packaged desktop installation, or release deployment was performed. OBS was inspected and was neither streaming nor recording. Three synthetic samples are not a general accuracy or accent benchmark. A live microphone-to-OBS check is still required before calling the production incident resolved.

Arbitrary speech does not always identify a unique Bible verse. Ambiguous or weak matches remain suggestions for manual selection rather than being presented as certain scripture.

## Real sermon transcript replay — 6 September 2026

The two supplied sermon transcripts were replayed through the actual `LmDockService` finalized-turn queue, parser, quote engine, reranker, local semantic model/index, and KJV verse resolution at revision `4ac184c`. Outbound dock/status notifications were disabled. Each original physical line was tested, followed by a separate sentence replay retaining context. Sentence boundaries came from punctuation, not audio timestamps. Previously displayed results were excluded from new detections. The complete transcripts and per-line HTML/CSV/JSON reports remain local in Downloads.

These runs reveal unresolved detection defects despite the earlier passing regression tests:

| Transcript | Text paragraphs | Sentences | Reviewed passage checks | Confident catches in sentence replay | Suggestion only | Missed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BREAKOUT | 37 | 914 | 15 | 6 | 4 | 5 |
| HUNDREDFOLD_SERVICE | 249 | 1,071 | 57 | 8 | 25 | 24 |

The HUNDREDFOLD checks include 28 clear quotations, 18 paraphrases, eight damaged quotations, and three brief or damaged allusions. Among the 28 clear quotations, the sentence replay produced eight confident catches, 14 suggestions, and six misses. Whole-paragraph replay found only one confident catch, 18 suggestions, and 38 misses across all 57 checks. These are reviewed occurrences, including repetitions and accepted parallel passages, not an overall accuracy percentage for arbitrary speech.

- **False book context remains possible.** Outline phrases such as “number two” and “number three” become Numbers chapters. “Other one” can become Esther chapter 1. Later quotations can remain constrained by that accidental context.
- **A reference can consume an entire finalized paragraph.** An opening “Genesis 26” followed by quoted verses in the same turn sets chapter context but yields no fresh verse from the rest of the paragraph.
- **Some generic fragments still qualify for automatic projection.** The sentence replay accepted “When Abraham's” as Genesis 24:52, “He looked at the land” as Isaiah 5:30, and a damaged “hundred footer” fragment as Exodus 12:37. Matching a few words does not establish the intended passage.
- **Clear quoted words are still missed.** The HUNDREDFOLD sentence replay missed “the power of an endless life” (Hebrews 7:16) and the promises being “yes and amen” (2 Corinthians 1:20), despite finding Acts 20:32, Romans 8:14, and Proverbs 8:12 confidently elsewhere.
- **Cold semantic startup is still unacceptable for live use.** With the prebuilt HNSW asset absent, HUNDREDFOLD's first semantic lookup took 629,929 ms, about 10 minutes 30 seconds. Once loaded, sentence matching had a median of 114 ms and a 95th percentile of 669 ms in this local run. Timings include queue processing and 5 ms completion polling, exclude transcription/projection, and are not controlled hardware benchmarks.

All 497 HUNDREDFOLD physical lines, including 248 blank lines, and all 1,071 sentence records were verified in the saved reports. Every returned candidate resolved to actual KJV verse text. That verifies candidate validity, not relevance. No live microphone, speech-recognition provider, rendered projection, or OBS output was exercised in these transcript replays. The production detection incident remains unresolved.
