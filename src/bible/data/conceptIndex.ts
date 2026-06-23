/**
 * Sermon concept engine — maps theological concepts to scripture references.
 * Each concept has keywords that trigger verse suggestions.
 */

export interface ConceptEntry {
  keywords: string[];
  verses: string[];
}

export const CONCEPT_INDEX: ConceptEntry[] = [
  {
    keywords: ["future", "plans", "hope", "tomorrow", "destiny", "purpose"],
    verses: ["Jeremiah 29:11", "Isaiah 43:18", "Isaiah 43:19", "Philippians 3:13", "Philippians 3:14", "Ephesians 2:10"],
  },
  {
    keywords: ["faith", "believe", "trust", "confidence", "assurance"],
    verses: ["Hebrews 11:1", "Romans 10:17", "Proverbs 3:5", "Mark 11:22", "James 1:6"],
  },
  {
    keywords: ["purpose", "calling", "destiny", "plan", "designed", "created"],
    verses: ["Jeremiah 29:11", "Ephesians 2:10", "Romans 8:28", "Psalm 139:14", "Colossians 3:23"],
  },
  {
    keywords: ["provision", "supply", "need", "enough", "sufficient", "provide"],
    verses: ["Psalm 23:1", "Philippians 4:19", "Matthew 6:33", "2 Corinthians 9:8", "Psalm 34:10"],
  },
  {
    keywords: ["victory", "overcome", "conquer", "win", "triumph", "more than"],
    verses: ["Romans 8:37", "1 Corinthians 15:57", "Romans 8:28", "1 John 5:4", "Revelation 12:11"],
  },
  {
    keywords: ["strength", "strong", "power", "mighty", "courage", "brave"],
    verses: ["Philippians 4:13", "Isaiah 40:31", "Joshua 1:9", "Ephesians 6:10", "2 Timothy 1:7"],
  },
  {
    keywords: ["love", "loved", "loves", "beloved", "affection"],
    verses: ["John 3:16", "Romans 5:8", "1 John 4:19", "1 John 4:8", "Romans 8:38", "Romans 8:39"],
  },
  {
    keywords: ["peace", "calm", "rest", "still", "quiet", "anxiety", "worry"],
    verses: ["Philippians 4:6", "John 14:27", "Psalm 46:10", "Isaiah 26:3", "Matthew 11:28"],
  },
  {
    keywords: ["forgive", "forgiven", "mercy", "grace", "pardon", "cleanse"],
    verses: ["1 John 1:9", "Ephesians 2:8", "Romans 6:23", "Psalm 103:12", "Micah 7:18"],
  },
  {
    keywords: ["wisdom", "wise", "understand", "knowledge", "discern"],
    verses: ["James 1:5", "Proverbs 3:5", "Proverbs 9:10", "Colossians 3:16", "Daniel 2:21"],
  },
  {
    keywords: ["comfort", "grief", "loss", "mourning", "sorrow", "sad"],
    verses: ["Psalm 23:4", "Matthew 5:4", "2 Corinthians 1:3", "Revelation 21:4", "Isaiah 61:3"],
  },
  {
    keywords: ["guidance", "lead", "direct", "path", "way", "guide"],
    verses: ["Proverbs 3:5", "Psalm 119:105", "Psalm 32:8", "Isaiah 30:21", "John 16:13"],
  },
  {
    keywords: ["healing", "heal", "restore", "recovery", "wholeness"],
    verses: ["Jeremiah 30:17", "Psalm 103:3", "Isaiah 53:5", "James 5:16", "3 John 1:2"],
  },
  {
    keywords: ["generosity", "give", "giving", "tithe", "offering", "generous"],
    verses: ["2 Corinthians 9:7", "Malachi 3:10", "Luke 6:38", "Acts 20:35", "Proverbs 11:25"],
  },
  {
    keywords: ["patience", "wait", "waiting", "endure", "persevere"],
    verses: ["Isaiah 40:31", "Romans 12:12", "James 1:3", "Galatians 6:9", "Hebrews 10:36"],
  },
  {
    keywords: ["joy", "happy", "rejoice", "glad", "delight"],
    verses: ["Philippians 4:4", "Psalm 118:24", "Nehemiah 8:10", "Romans 15:13", "Psalm 16:11"],
  },
  {
    keywords: ["obey", "obedience", "command", "follow", "submit"],
    verses: ["John 14:15", "Deuteronomy 5:33", "James 1:22", "1 Samuel 15:22", "Romans 6:16"],
  },
  {
    keywords: ["worship", "praise", "glorify", "honor", "exalt"],
    verses: ["Psalm 95:6", "John 4:24", "Psalm 100:4", "Romans 12:1", "Hebrews 13:15"],
  },
  {
    keywords: ["pray", "prayer", "petition", "intercession", "supplication"],
    verses: ["Philippians 4:6", "1 Thessalonians 5:17", "Matthew 6:9", "James 5:16", "Jeremiah 33:3"],
  },
  {
    keywords: ["past", "behind", "former", "old", "forget", "previous"],
    verses: ["Isaiah 43:18", "Philippians 3:13", "2 Corinthians 5:17", "Isaiah 43:19", "Jeremiah 29:11"],
  },
  {
    keywords: ["imagine", "dream", "envision", "possible", "exceedingly", "abundantly"],
    verses: ["Ephesians 3:20", "Jeremiah 29:11", "Mark 9:23", "Luke 1:37", "Matthew 19:26"],
  },
  {
    keywords: ["seek", "search", "find", "look", "pursue"],
    verses: ["Matthew 6:33", "Jeremiah 29:13", "Proverbs 8:17", "Deuteronomy 4:29", "Matthew 7:7"],
  },
  {
    keywords: ["separate", "separated", "apart", "distance", "abandon", "forsake"],
    verses: ["Romans 8:38", "Romans 8:39", "Hebrews 13:5", "Deuteronomy 31:6", "Psalm 27:10"],
  },
  {
    keywords: ["together", "work", "works", "good", "all things"],
    verses: ["Romans 8:28", "Ephesians 2:10", "Genesis 50:20", "Jeremiah 29:11"],
  },
  {
    keywords: ["weak", "weakness", "powerless", "feeble", "frail"],
    verses: ["2 Corinthians 12:9", "Isaiah 40:31", "Philippians 4:13", "Isaiah 40:29"],
  },
  {
    keywords: ["conquer", "conqueror", "overcome", "victory", "triumph", "more than", "win"],
    verses: ["Romans 8:37", "1 Corinthians 15:57", "1 John 5:4", "Revelation 12:11", "Romans 8:28"],
  },
  {
    keywords: ["plans", "plan", "purpose", "future", "hope", "destiny"],
    verses: ["Jeremiah 29:11", "Isaiah 43:18", "Isaiah 43:19", "Philippians 3:13", "Philippians 3:14", "Ephesians 2:10", "Romans 8:28"],
  },
  {
    keywords: ["creation", "created", "beginning", "world", "heavens", "earth"],
    verses: ["Genesis 1:1", "Genesis 1:27", "John 1:1", "Colossians 1:16", "Hebrews 11:3"],
  },
  {
    keywords: ["salvation", "saved", "born again", "new birth", "eternal life"],
    verses: ["John 3:16", "John 3:3", "Ephesians 2:8", "Romans 6:23", "John 14:6", "Acts 16:31"],
  },
  {
    keywords: ["resurrection", "raised", "risen", "death", "died", "tomb", "empty"],
    verses: ["John 11:25", "1 Corinthians 15:3", "1 Corinthians 15:4", "Romans 6:4", "1 Corinthians 15:57"],
  },
  {
    keywords: ["holy spirit", "spirit", "comforter", "helper", "pentecost", "tongues"],
    verses: ["John 14:26", "Acts 2:1", "Galatians 5:22", "2 Corinthians 3:17", "Romans 8:11"],
  },
  {
    keywords: ["armor", "spiritual warfare", "battle", "fight", "stand", "sword"],
    verses: ["Ephesians 6:10", "Ephesians 6:11", "Ephesians 6:12", "Ephesians 6:13", "Ephesians 6:14", "Ephesians 6:15", "Ephesians 6:16", "Ephesians 6:17"],
  },
  {
    keywords: ["money", "riches", "wealth", "treasure", "mammon"],
    verses: ["Matthew 6:19", "Matthew 6:20", "Matthew 6:21", "Matthew 6:24", "1 Timothy 6:10"],
  },
  {
    keywords: ["family", "children", "parents", "honor", "father", "mother"],
    verses: ["Proverbs 22:6", "Ephesians 6:1", "Exodus 20:12", "Deuteronomy 6:6", "Psalm 127:3"],
  },
  {
    keywords: ["tongue", "words", "speech", "speak", "mouth", "lips"],
    verses: ["James 3:5", "James 3:6", "Proverbs 18:21", "Ephesians 4:29", "Proverbs 12:18"],
  },
];
