import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildQuoteIndex,
  isVerbatimLikely,
  normalizeQuoteTokens,
  quoteHitConfidence,
  searchQuoteIndex,
  stemWord,
  type QuoteBibleData,
  type QuoteIndex,
} from "./quoteIndex";

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../public/bible-kjv.json", import.meta.url)), "utf8"),
) as QuoteBibleData;

let index: QuoteIndex;
beforeAll(async () => {
  index = await buildQuoteIndex(data, "KJV");
}, 30_000);

const ref = (h: { book: string; chapter: number; verse: number }) => `${h.book} ${h.chapter}:${h.verse}`;

/** Spoken wording (modern English, paraphrase, filler) → verses that must be among the first suggestions. */
const SPOKEN: Array<[string, string[]]> = [
["for God so loved the world that he gave his one and only son",["John 3:16"]],
["the Lord is my shepherd I shall not be in want",["Psalms 23:1"]],
["even though I walk through the valley of the shadow of death I will fear no evil",["Psalms 23:4"]],
["trust in the Lord with all your heart lean not on your own understanding",["Proverbs 3:5"]],
["I can do all things through Christ who strengthens me",["Philippians 4:13"]],
["be anxious for nothing but in everything by prayer and supplication",["Philippians 4:6"]],
["the Lord is my light and my salvation whom shall I fear",["Psalms 27:1"]],
["the Lord is close to the brokenhearted",["Psalms 34:18"]],
["he heals the brokenhearted and binds up their wounds",["Psalms 147:3"]],
["I am the way the truth and the life no one comes to the Father except through me",["John 14:6"]],
["for by grace you have been saved through faith and that not of yourselves it is the gift of God",["Ephesians 2:8"]],
["the wages of sin is death but the gift of God is eternal life",["Romans 6:23"]],
["if we confess our sins he is faithful and just to forgive us",["1 John 1:9"]],
["with God all things are possible",["Matthew 19:26","Mark 10:27"]],
["ask and it will be given to you seek and you will find",["Matthew 7:7","Luke 11:9"]],
["the thief comes only to steal and kill and destroy",["John 10:10"]],
["come to me all you who are weary and burdened and I will give you rest",["Matthew 11:28"]],
["I am the vine you are the branches",["John 15:5"]],
["no weapon formed against you shall prosper",["Isaiah 54:17"]],
["the name of the Lord is a strong tower the righteous run to it and are safe",["Proverbs 18:10"]],
["where two or three are gathered in my name there am I among them",["Matthew 18:20"]],
["in the beginning God created the heavens and the earth",["Genesis 1:1"]],
["the Lord bless you and keep you",["Numbers 6:24"]],
["love is patient love is kind",["1 Corinthians 13:4"]],
["now faith is confidence in what we hope for and assurance about what we do not see",["Hebrews 11:1"]],
["do not be afraid for I am with you",["Isaiah 41:10"]],
["your word is a lamp to my feet and a light to my path",["Psalms 119:105"]],
["God is our refuge and strength an ever present help in trouble",["Psalms 46:1"]],
["seek first his kingdom and his righteousness and all these things will be added to you",["Matthew 6:33"]],
["I will lift up my eyes to the hills where does my help come from",["Psalms 121:1"]],
["God is love",["1 John 4:8","1 John 4:16"]],
["Jesus wept",["John 11:35"]],
["the Lord is my strength and my shield",["Psalms 28:7"]],
["great is your faithfulness",["Lamentations 3:23"]],
["the joy of the Lord is your strength",["Nehemiah 8:10"]],
["Jesus Christ is the same yesterday today and forever",["Hebrews 13:8"]],
["I know the plans I have for you declares the Lord plans to prosper you and not to harm you",["Jeremiah 29:11"]],
["behold I stand at the door and knock",["Revelation 3:20"]],
["he who dwells in the secret place of the Most High",["Psalms 91:1"]],
["there is a time for everything and a season for every activity under heaven",["Ecclesiastes 3:1"]],
["train up a child in the way he should go",["Proverbs 22:6"]],
["a gentle answer turns away wrath",["Proverbs 15:1"]],
["unless the Lord builds the house the builders labor in vain",["Psalms 127:1"]],
["weeping may stay for the night but rejoicing comes in the morning",["Psalms 30:5"]],
["God opposes the proud but shows favor to the humble",["James 4:6"]],
["submit yourselves then to God resist the devil and he will flee from you",["James 4:7"]],
["God has been so good",["Psalms 34:8","Psalms 100:5","Psalms 136:1","Psalms 107:1","Nahum 1:7","1 Chronicles 16:34","Psalms 118:1","Psalms 145:9"]],
["God is good all the time",["Psalms 34:8","Psalms 100:5","Psalms 136:1","Psalms 107:1","Nahum 1:7","1 Chronicles 16:34","Psalms 118:1","Psalms 145:9"]],
["the Lord has been good to me",["Psalms 116:7","Psalms 13:6","Psalms 34:8","Psalms 100:5","Psalms 119:65","1 Chronicles 16:34","Psalms 107:1","Psalms 145:9","Psalms 118:1"]],
];

describe("quote index: word handling", () => {
  it("maps King James forms and modern words to the same stem", () => {
    expect(stemWord("loveth")).toBe(stemWord("loves"));
    expect(stemWord("saith")).toBe(stemWord("say"));
    expect(stemWord("strengtheneth")).toBe(stemWord("strengthens"));
    expect(normalizeQuoteTokens("thou shalt not")).toEqual([]);
    expect(normalizeQuoteTokens("Be careful for nothing")[0]).toBe(normalizeQuoteTokens("don't be anxious", true)[0]);
  });

  it("drops filler the pastor says but the Bible does not need", () => {
    expect(normalizeQuoteTokens("um you know what I mean church amen", true)).toEqual([]);
  });
});

describe("quote index: spoken wording finds the verse", () => {
  it.each(SPOKEN)("%s", (spoken, expected) => {
    const refs = searchQuoteIndex(index, spoken, { limit: 5 }).map(ref);
    expect(refs.slice(0, 5).some((r) => expected.includes(r))).toBe(true);
    const topThree = refs.slice(0, 3);
    expect(topThree.some((r) => expected.includes(r)) || expected.length > 3).toBe(true);
  });

  it("suggests famous verses for a short, generic line like 'God is good'", () => {
    const refs = searchQuoteIndex(index, "God has been so good", { limit: 8 }).map(ref);
    expect(refs.length).toBeGreaterThanOrEqual(3);
    expect(refs.some((r) => ["Psalms 34:8", "Psalms 100:5", "Psalms 136:1", "Psalms 107:1", "1 Chronicles 16:34", "Nahum 1:7"].includes(r))).toBe(true);
  });

  it("returns nothing for pure filler", () => {
    expect(searchQuoteIndex(index, "you know what I mean church")).toEqual([]);
    expect(searchQuoteIndex(index, "thank you so much everybody")).toEqual([]);
    expect(searchQuoteIndex(index, "Thank you, Lord Jesus")).toEqual([]);
    expect(searchQuoteIndex(index, "praise God hallelujah")).toEqual([]);
  });

  it("tolerates a one-letter speech-recognition slip", () => {
    const refs = searchQuoteIndex(index, "the Lord is my sheperd I shall not want", { limit: 3 }).map(ref);
    expect(refs).toContain("Psalms 23:1");
  });

  it("stays inside a book or chapter when asked", () => {
    const hits = searchQuoteIndex(index, "God is good", { scope: { book: "Psalms", chapter: 100 }, limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.book === "Psalms" && h.chapter === 100)).toBe(true);
  });

  it("recognises a verse read out whole and keeps weak matches below the auto-push line", () => {
    const [top] = searchQuoteIndex(index, "For God so loved the world, that he gave his only begotten Son");
    expect(ref(top)).toBe("John 3:16");
    expect(isVerbatimLikely(top)).toBe(true);
    for (const hit of searchQuoteIndex(index, "God has been so good")) {
      expect(quoteHitConfidence(hit)).toBeLessThan(0.9);
    }
  });
});

describe("quote index: speed", () => {
  it("answers each search in well under 100 ms", () => {
    const sentences = SPOKEN.map(([spoken]) => spoken);
    searchQuoteIndex(index, sentences[0]); // warm the JIT
    let worst = 0;
    for (const sentence of sentences) {
      const started = performance.now();
      searchQuoteIndex(index, sentence);
      worst = Math.max(worst, performance.now() - started);
    }
    expect(worst).toBeLessThan(100);
  });

  it("builds in a few seconds at most", () => {
    expect(index.buildMs).toBeLessThan(5_000);
    expect(index.verseCount).toBe(31_100);
  });
});
