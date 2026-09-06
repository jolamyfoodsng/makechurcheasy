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

## Verification boundaries

The regression suite exercises supplied transcript text; the follow-up provider comparison additionally sends generated audio through the live streaming model. Semantic embedding initialization remains mocked in its focused regression test. Browser credit verification initially blocked access but subsequently completed, and the live page opened. The component rendering test confirms that an explicit reference appears in the main match panel.

No real microphone capture, live OBS projection, packaged desktop installation, or release deployment was performed. OBS was inspected and was neither streaming nor recording. Three synthetic samples are not a general accuracy or accent benchmark. A live microphone-to-OBS check is still required before calling the production incident resolved.

Arbitrary speech does not always identify a unique Bible verse. Ambiguous or weak matches remain suggestions for manual selection rather than being presented as certain scripture.
