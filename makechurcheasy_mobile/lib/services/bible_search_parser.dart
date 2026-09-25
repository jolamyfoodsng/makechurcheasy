/// bible_search_parser.dart — Smart Bible reference parser for the mobile app
///
/// Dart port of desktop/src/dock/bibleSearchParser.ts
/// Parses fuzzy queries like:
///   "gen1vs1"     → Genesis 1:1
///   "g11"         → Genesis 1:1
///   "jn3:16"      → John 3:16
///   "1cor13"      → 1 Corinthians 13
///   "ps23"        → Psalms 23

// ---------------------------------------------------------------------------
// Bible book lists
// ---------------------------------------------------------------------------

const List<String> _otBooks = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
  "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
  "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
];

const List<String> _ntBooks = [
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation",
];

const List<String> allBooks = [..._otBooks, ..._ntBooks];

/// Number of chapters per book

const Map<String, List<int>> bookChapterVerses = {
  "Genesis": [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26],
  "Exodus": [22, 25, 22, 31, 23, 30, 25, 32, 35, 29, 10, 51, 22, 31, 27, 36, 16, 27, 25, 26, 36, 31, 33, 18, 40, 37, 21, 43, 46, 38, 18, 35, 23, 35, 35, 38, 29, 31, 43, 38],
  "Leviticus": [17, 16, 17, 35, 19, 30, 38, 36, 24, 20, 47, 8, 59, 57, 33, 34, 16, 30, 37, 27, 24, 33, 44, 23, 55, 46, 34],
  "Numbers": [54, 34, 51, 49, 31, 27, 89, 26, 23, 36, 35, 16, 33, 45, 41, 50, 13, 32, 22, 29, 35, 41, 30, 25, 18, 65, 23, 31, 40, 16, 54, 42, 56, 29, 34, 13],
  "Deuteronomy": [46, 37, 29, 49, 33, 25, 26, 20, 29, 22, 32, 32, 18, 29, 23, 22, 20, 22, 21, 20, 23, 30, 25, 22, 19, 19, 26, 68, 29, 20, 30, 52, 29, 12],
  "Joshua": [18, 24, 17, 24, 15, 27, 26, 35, 27, 43, 23, 24, 33, 15, 63, 10, 18, 28, 51, 9, 45, 34, 16, 33],
  "Judges": [36, 23, 31, 24, 31, 40, 25, 35, 57, 18, 40, 15, 25, 20, 20, 31, 13, 31, 30, 48, 25],
  "Ruth": [22, 23, 18, 22],
  "1 Samuel": [28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30, 24, 43, 15, 23, 29, 22, 44, 25, 12, 25, 11, 31, 13],
  "2 Samuel": [27, 32, 39, 12, 25, 23, 29, 18, 13, 19, 27, 31, 39, 33, 37, 23, 29, 33, 43, 26, 22, 51, 39, 25],
  "1 Kings": [53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46, 21, 43, 29, 54],
  "2 Kings": [18, 25, 27, 44, 27, 33, 20, 29, 37, 36, 21, 21, 25, 29, 38, 20, 41, 37, 37, 21, 26, 20, 37, 20, 30],
  "1 Chronicles": [54, 55, 24, 43, 26, 81, 40, 40, 44, 14, 47, 40, 14, 17, 29, 43, 27, 17, 19, 8, 30, 19, 32, 31, 31, 32, 34, 21, 30],
  "2 Chronicles": [17, 18, 17, 22, 14, 42, 22, 18, 31, 19, 23, 16, 22, 15, 19, 14, 19, 34, 11, 37, 20, 12, 21, 27, 28, 23, 9, 27, 36, 27, 21, 33, 25, 33, 27, 23],
  "Ezra": [11, 70, 13, 24, 17, 22, 28, 36, 15, 44],
  "Nehemiah": [11, 20, 32, 23, 19, 19, 73, 18, 38, 39, 36, 47, 31],
  "Esther": [22, 23, 15, 17, 14, 14, 10, 17, 32, 3],
  "Job": [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24, 34, 17],
  "Psalms": [6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9, 13, 31, 6, 10, 22, 12, 14, 9, 11, 12, 24, 11, 22, 22, 28, 12, 40, 22, 13, 17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17, 12, 8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13, 19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17, 16, 15, 5, 23, 11, 13, 12, 9, 9, 5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7, 12, 15, 21, 10, 20, 14, 9, 6],
  "Proverbs": [33, 22, 35, 27, 23, 35, 27, 36, 18, 32, 31, 28, 25, 35, 33, 33, 28, 24, 29, 30, 31, 29, 35, 34, 28, 28, 27, 28, 27, 33, 31],
  "Ecclesiastes": [18, 26, 22, 16, 20, 12, 29, 17, 18, 20, 10, 14],
  "Song of Solomon": [17, 17, 11, 16, 16, 13, 13, 14],
  "Isaiah": [31, 22, 26, 6, 30, 13, 25, 22, 21, 34, 16, 6, 22, 32, 9, 14, 14, 7, 25, 6, 17, 25, 18, 23, 12, 21, 13, 29, 24, 33, 9, 20, 24, 17, 10, 22, 38, 22, 8, 31, 29, 25, 28, 28, 25, 13, 15, 22, 26, 11, 23, 15, 12, 17, 13, 12, 21, 14, 21, 22, 11, 12, 19, 12, 25, 24],
  "Jeremiah": [19, 37, 25, 31, 31, 30, 34, 22, 26, 25, 23, 17, 27, 22, 21, 21, 27, 23, 15, 18, 14, 30, 40, 10, 38, 24, 22, 17, 32, 24, 40, 44, 26, 22, 19, 32, 21, 28, 18, 16, 18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34],
  "Lamentations": [22, 22, 66, 22, 22],
  "Ezekiel": [28, 10, 27, 17, 17, 14, 27, 18, 11, 22, 25, 28, 23, 23, 8, 63, 24, 32, 14, 49, 32, 31, 49, 27, 17, 21, 36, 26, 21, 26, 18, 32, 33, 31, 15, 38, 28, 23, 29, 49, 26, 20, 27, 31, 25, 24, 23, 35],
  "Daniel": [21, 49, 30, 37, 31, 28, 28, 27, 27, 21, 45, 13],
  "Hosea": [11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 16, 9],
  "Joel": [20, 32, 21],
  "Amos": [15, 16, 15, 13, 27, 14, 17, 14, 15],
  "Obadiah": [21],
  "Jonah": [17, 10, 10, 11],
  "Micah": [16, 13, 12, 13, 15, 16, 20],
  "Nahum": [15, 13, 19],
  "Habakkuk": [17, 20, 19],
  "Zephaniah": [18, 15, 20],
  "Haggai": [15, 23],
  "Zechariah": [21, 13, 10, 14, 11, 15, 14, 23, 17, 12, 17, 14, 9, 21],
  "Malachi": [14, 17, 18, 6],
  "Matthew": [25, 22, 17, 25, 48, 34, 29, 34, 38, 42, 30, 50, 58, 36, 39, 28, 27, 35, 30, 34, 46, 45, 39, 51, 46, 74, 66, 20],
  "Mark": [45, 28, 35, 40, 43, 56, 36, 37, 50, 52, 33, 44, 37, 72, 47, 20],
  "Luke": [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47, 38, 71, 56, 53],
  "John": [51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31, 25],
  "Acts": [26, 47, 26, 37, 42, 15, 60, 40, 43, 48, 30, 25, 52, 28, 41, 40, 34, 28, 41, 38, 40, 30, 35, 27, 27, 32, 44, 31],
  "Romans": [32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27],
  "1 Corinthians": [31, 16, 23, 21, 13, 20, 40, 13, 27, 33, 34, 31, 13, 40, 58, 24],
  "2 Corinthians": [24, 17, 18, 18, 21, 18, 16, 24, 15, 18, 33, 21, 14],
  "Galatians": [24, 21, 29, 31, 26, 18],
  "Ephesians": [23, 22, 21, 32, 33, 24],
  "Philippians": [30, 30, 21, 23],
  "Colossians": [29, 23, 25, 18],
  "1 Thessalonians": [10, 20, 13, 18, 28],
  "2 Thessalonians": [12, 17, 18],
  "1 Timothy": [20, 15, 16, 16, 25, 21],
  "2 Timothy": [18, 26, 17, 22],
  "Titus": [16, 15, 15],
  "Philemon": [25],
  "Hebrews": [14, 18, 19, 16, 14, 20, 28, 13, 28, 39, 40, 29, 25],
  "James": [27, 26, 18, 17, 20],
  "1 Peter": [25, 25, 22, 19, 14],
  "2 Peter": [21, 22, 18],
  "1 John": [10, 29, 24, 21, 21],
  "2 John": [13],
  "3 John": [15],
  "Jude": [25],
  "Revelation": [20, 29, 22, 11, 14, 17, 17, 13, 21, 11, 19, 18, 18, 20, 8, 21, 18, 24, 21, 15, 27, 21],
};

int? getCanonicalVerseCount(String book, int chapter) {
  final verses = bookChapterVerses[book];
  if (verses == null || chapter < 1 || chapter > verses.length) return null;
  return verses[chapter - 1];
}

const Map<String, int> bookChapters = {
  "Genesis": 50, "Exodus": 40, "Leviticus": 27, "Numbers": 36,
  "Deuteronomy": 34, "Joshua": 24, "Judges": 21, "Ruth": 4,
  "1 Samuel": 31, "2 Samuel": 24, "1 Kings": 22, "2 Kings": 25,
  "1 Chronicles": 29, "2 Chronicles": 36, "Ezra": 10, "Nehemiah": 13,
  "Esther": 10, "Job": 42, "Psalms": 150, "Proverbs": 31,
  "Ecclesiastes": 12, "Song of Solomon": 8, "Isaiah": 66,
  "Jeremiah": 52, "Lamentations": 5, "Ezekiel": 48, "Daniel": 12,
  "Hosea": 14, "Joel": 3, "Amos": 9, "Obadiah": 1, "Jonah": 4,
  "Micah": 7, "Nahum": 3, "Habakkuk": 3, "Zephaniah": 3,
  "Haggai": 2, "Zechariah": 14, "Malachi": 4, "Matthew": 28,
  "Mark": 16, "Luke": 24, "John": 21, "Acts": 28, "Romans": 16,
  "1 Corinthians": 16, "2 Corinthians": 13, "Galatians": 6,
  "Ephesians": 6, "Philippians": 4, "Colossians": 4,
  "1 Thessalonians": 5, "2 Thessalonians": 3, "1 Timothy": 6,
  "2 Timothy": 4, "Titus": 3, "Philemon": 1, "Hebrews": 13,
  "James": 5, "1 Peter": 5, "2 Peter": 3, "1 John": 5,
  "2 John": 1, "3 John": 1, "Jude": 1, "Revelation": 22,
};

// ---------------------------------------------------------------------------
// Abbreviation map
// ---------------------------------------------------------------------------

class _BookAlias {
  final String book;
  final List<String> aliases;
  const _BookAlias(this.book, this.aliases);
}

const List<_BookAlias> _bookAliases = [
  _BookAlias("Genesis", ["gen", "ge", "gn", "gs"]),
  _BookAlias("Exodus", ["exo", "ex", "exod"]),
  _BookAlias("Leviticus", ["lev", "le", "lv"]),
  _BookAlias("Numbers", ["num", "nu", "nm", "nb"]),
  _BookAlias("Deuteronomy", ["deut", "de", "dt"]),
  _BookAlias("Joshua", ["josh", "jos", "jsh"]),
  _BookAlias("Judges", ["judg", "jdg", "jg", "jdgs"]),
  _BookAlias("Ruth", ["ruth", "rth", "ru"]),
  _BookAlias("1 Samuel", ["1sam", "1sa", "1sm", "1s"]),
  _BookAlias("2 Samuel", ["2sam", "2sa", "2sm", "2s"]),
  _BookAlias("1 Kings", ["1kgs", "1ki", "1k", "1kin"]),
  _BookAlias("2 Kings", ["2kgs", "2ki", "2k", "2kin"]),
  _BookAlias("1 Chronicles", ["1chr", "1ch", "1chron"]),
  _BookAlias("2 Chronicles", ["2chr", "2ch", "2chron"]),
  _BookAlias("Ezra", ["ezr", "ez"]),
  _BookAlias("Nehemiah", ["neh", "ne"]),
  _BookAlias("Esther", ["esth", "est", "es"]),
  _BookAlias("Job", ["job", "jb"]),
  _BookAlias("Psalms", ["psa", "ps", "pss", "psalm"]),
  _BookAlias("Proverbs", ["prov", "pro", "pr", "prv"]),
  _BookAlias("Ecclesiastes", ["eccl", "ecc", "ec", "eccles"]),
  _BookAlias("Song of Solomon", ["song", "sos", "ss", "sol", "sg"]),
  _BookAlias("Isaiah", ["isa", "is"]),
  _BookAlias("Jeremiah", ["jer", "je", "jr"]),
  _BookAlias("Lamentations", ["lam", "la"]),
  _BookAlias("Ezekiel", ["ezek", "eze", "ezk"]),
  _BookAlias("Daniel", ["dan", "da", "dn"]),
  _BookAlias("Hosea", ["hos", "ho"]),
  _BookAlias("Joel", ["joel", "jl"]),
  _BookAlias("Amos", ["amos", "am"]),
  _BookAlias("Obadiah", ["obad", "ob", "obadia", "obadya", "obedia", "obediah"]),
  _BookAlias("Jonah", ["jonah", "jon", "jnh"]),
  _BookAlias("Micah", ["mic", "mc"]),
  _BookAlias("Nahum", ["nah", "na"]),
  _BookAlias("Habakkuk", ["hab", "hb"]),
  _BookAlias("Zephaniah", ["zeph", "zep", "zp"]),
  _BookAlias("Haggai", ["hag", "hg"]),
  _BookAlias("Zechariah", ["zech", "zec", "zc"]),
  _BookAlias("Malachi", ["mal", "ml"]),
  _BookAlias("Matthew", ["matt", "mat", "mt"]),
  _BookAlias("Mark", ["mark", "mrk", "mk"]),
  _BookAlias("Luke", ["luke", "luk", "lk"]),
  _BookAlias("John", ["john", "joh", "jhn", "jn", "j"]),
  _BookAlias("Acts", ["acts", "act", "ac"]),
  _BookAlias("Romans", ["rom", "ro", "rm"]),
  _BookAlias("1 Corinthians", ["1cor", "1co"]),
  _BookAlias("2 Corinthians", ["2cor", "2co"]),
  _BookAlias("Galatians", ["gal", "ga"]),
  _BookAlias("Ephesians", ["eph", "ep"]),
  _BookAlias("Philippians", ["phil", "php", "pp"]),
  _BookAlias("Colossians", ["col", "co", "coloss", "collossians"]),
  _BookAlias("1 Thessalonians", ["1thes", "1th", "1thess"]),
  _BookAlias("2 Thessalonians", ["2thes", "2th", "2thess"]),
  _BookAlias("1 Timothy", ["1tim", "1ti", "1tm"]),
  _BookAlias("2 Timothy", ["2tim", "2ti", "2tm"]),
  _BookAlias("Titus", ["titus", "tit", "ti"]),
  _BookAlias("Philemon", ["phm", "philem", "pm"]),
  _BookAlias("Hebrews", ["heb", "he"]),
  _BookAlias("James", ["jas", "ja", "jm"]),
  _BookAlias("1 Peter", ["1pet", "1pe", "1pt", "1p"]),
  _BookAlias("2 Peter", ["2pet", "2pe", "2pt", "2p"]),
  _BookAlias("1 John", ["1jn", "1jo", "1joh", "1john"]),
  _BookAlias("2 John", ["2jn", "2jo", "2joh", "2john"]),
  _BookAlias("3 John", ["3jn", "3jo", "3joh", "3john"]),
  _BookAlias("Jude", ["jude", "jud", "jd"]),
  _BookAlias("Revelation", ["rev", "re", "rv"]),
];

const Map<String, String> _romanPrefixes = {
  "1": "i",
  "2": "ii",
  "3": "iii",
};

List<String> _getExtendedAliases(_BookAlias entry) {
  final aliases = entry.aliases.toSet();
  final numberedMatch = RegExp(r'^(\d)\s+(.+)$').firstMatch(entry.book);
  if (numberedMatch != null) {
    final digit = numberedMatch.group(1)!;
    final romanPrefix = _romanPrefixes[digit];
    if (romanPrefix != null) {
      for (final alias in entry.aliases) {
        if (alias.startsWith(digit)) {
          aliases.add('$romanPrefix${alias.substring(1)}');
        }
      }
      final rest = numberedMatch.group(2)!.toLowerCase().replaceAll(RegExp(r'\s+'), '');
      aliases.add('$romanPrefix$rest');
    }
  }
  return aliases.toList();
}

/// Build flat lookup: alias → book name
final Map<String, String> _aliasMap = () {
  final map = <String, String>{};
  for (final entry in _bookAliases) {
    for (final alias in _getExtendedAliases(entry)) {
      map[alias] = entry.book;
    }
    map[entry.book.toLowerCase().replaceAll(RegExp(r'\s+'), '')] = entry.book;
  }
  return map;
}();

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

class BibleSearchResult {
  final String book;
  final int? chapter;
  final int? verse;
  final int? endVerse;
  final String label;
  final int score;

  const BibleSearchResult({
    required this.book,
    this.chapter,
    this.verse,
    this.endVerse,
    required this.label,
    required this.score,
  });

  @override
  String toString() => label;
}

class _ChapterVerseCandidate {
  final int? chapter;
  final int? verse;
  final int? endVerse;
  final int confidence;

  const _ChapterVerseCandidate({
    this.chapter,
    this.verse,
    this.endVerse,
    required this.confidence,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Parse a fuzzy Bible reference query into search results.
List<BibleSearchResult> parseBibleSearch(String query) {
  final raw = query.trim();
  if (raw.isEmpty) return [];

  // Normalize: lowercase, collapse whitespace
  final q = raw.toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

  // Handle numbered books: "1 samuel" → "1samuel"
  final normalized = q.replaceFirst(RegExp(r'^(\d|iii|ii|i)\s+'), r'$1');

  // Split into book text and number portion
  final splitMatch = RegExp(r'^(\d?[a-z]+)\s*(\d.*)?$').firstMatch(normalized);

  if (splitMatch == null) {
    return _matchBooksByName(q);
  }

  final bookPart = splitMatch.group(1)!;
  final numPart = splitMatch.group(2) ?? '';

  // Find matching books
  final matchedBooks = _findBooks(bookPart);
  if (matchedBooks.isEmpty) return [];

  // Parse chapter:verse candidates from number part
  final candidates = _parseChapterVerseCandidates(numPart);

  // Build results
  final results = <BibleSearchResult>[];

  for (final match in matchedBooks) {
    final book = match['book'] as String;
    final bookScore = match['score'] as int;
    final maxCh = bookChapters[book] ?? 1;

    if (maxCh == 1 && numPart.isNotEmpty) {
      final singleChapterCandidates = _parseSingleChapterVerseCandidates(numPart);
      if (singleChapterCandidates.isNotEmpty) {
        final maxV = getCanonicalVerseCount(book, 1);
        for (final candidate in singleChapterCandidates) {
          final v = candidate.verse;
          final ev = candidate.endVerse;
          final isVsValid = maxV == null || (v != null && v <= maxV);
          final label = (ev != null && ev != v)
              ? "$book 1:$v-$ev"
              : "$book 1:$v";
          results.add(BibleSearchResult(
            book: book, chapter: 1, verse: v, endVerse: ev,
            label: label, score: bookScore + candidate.confidence,
          ));

          if (!isVsValid && v != null) {
            for (final rep in _recoverInvalidReference(book, 1, v, ev, candidate.confidence - 5)) {
              final repV = rep.verse;
              final repLabel = repV != null ? "$book 1:$repV" : "$book 1";
              results.add(BibleSearchResult(
                book: book, chapter: 1, verse: repV, endVerse: rep.endVerse,
                label: repLabel, score: bookScore + rep.confidence,
              ));
            }
          }
        }
        continue;
      }
    }

    if (candidates.isEmpty) {
      results.add(BibleSearchResult(
        book: book, chapter: null, verse: null, endVerse: null,
        label: book, score: bookScore,
      ));
    } else {
      final canonicalMatches = <BibleSearchResult>[];
      final invalidCandidates = <_ChapterVerseCandidate>[];

      for (final c in candidates) {
        final ch = c.chapter;
        final vs = c.verse;
        final ev = c.endVerse;

        if (ch != null && ch >= 1 && ch <= maxCh) {
          final maxVerse = getCanonicalVerseCount(book, ch);
          final isVerseValid = vs == null || (maxVerse != null && vs >= 1 && vs <= maxVerse);
          final isEndVerseValid = ev == null || (maxVerse != null && vs != null && ev >= vs && ev <= maxVerse);

          if (isVerseValid && isEndVerseValid) {
            if (vs != null) {
              final label = (ev != null && ev != vs)
                  ? "$book $ch:$vs-$ev"
                  : "$book $ch:$vs";
              canonicalMatches.add(BibleSearchResult(
                book: book, chapter: ch, verse: vs, endVerse: ev,
                label: label, score: bookScore + c.confidence,
              ));
            } else {
              canonicalMatches.add(BibleSearchResult(
                book: book, chapter: ch, verse: null, endVerse: null,
                label: "$book $ch", score: bookScore + c.confidence - 5,
              ));
            }
          } else {
            invalidCandidates.add(c);
          }
        } else if (ch != null) {
          invalidCandidates.add(c);
        }
      }

      if (canonicalMatches.isNotEmpty) {
        results.addAll(canonicalMatches);
      } else if (invalidCandidates.isNotEmpty) {
        for (final inv in invalidCandidates) {
          if (inv.chapter != null) {
            for (final rep in _recoverInvalidReference(book, inv.chapter!, inv.verse, inv.endVerse, inv.confidence)) {
              final repV = rep.verse;
              final repEv = rep.endVerse;
              final repLabel = repV != null
                  ? (repEv != null && repEv != repV ? "$book ${rep.chapter}:$repV-$repEv" : "$book ${rep.chapter}:$repV")
                  : "$book ${rep.chapter}";
              results.add(BibleSearchResult(
                book: book, chapter: rep.chapter, verse: repV, endVerse: repEv,
                label: repLabel, score: bookScore + rep.confidence,
              ));
            }
          }
        }
      }

      final hasValidResult = results.any((r) => r.book == book && r.chapter != null);
      if (!hasValidResult) {
        results.add(BibleSearchResult(
          book: book, chapter: null, verse: null, endVerse: null,
          label: book, score: bookScore - 10,
        ));
      }
    }
  }

  // Deduplicate by label
  final seen = <String>{};
  final deduped = results.where((r) => seen.add(r.label)).toList();

  // Sort by score descending
  deduped.sort((a, b) => b.score.compareTo(a.score));

  return deduped.take(10).toList();
}

/// Check if a query looks like a Bible reference (for search routing).
bool isReferenceLikeBibleQuery(String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return false;
  // Has digits → likely reference
  if (RegExp(r'\d').hasMatch(q)) return true;
  // Matches a known book name
  for (final book in allBooks) {
    if (book.toLowerCase().contains(q) || q.contains(book.toLowerCase())) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

List<Map<String, dynamic>> _findBooks(String bookPart) {
  final results = <Map<String, dynamic>>[];

  // 1. Exact alias match
  final exact = _aliasMap[bookPart];
  if (exact != null) {
    return [{'book': exact, 'score': 100}];
  }

  // 2. Prefix match on aliases
  for (final entry in _bookAliases) {
    for (final alias in _getExtendedAliases(entry)) {
      if (alias.startsWith(bookPart)) {
        results.add({'book': entry.book, 'score': 80});
        break;
      }
    }
  }

  // 3. Prefix match on full book names
  if (results.isEmpty) {
    for (final book in allBooks) {
      final bookLower = book.toLowerCase().replaceAll(RegExp(r'\s+'), '');
      if (bookLower.startsWith(bookPart)) {
        results.add({'book': book, 'score': 70});
      }
    }
  }

  // 4. Substring match
  if (results.isEmpty) {
    for (final book in allBooks) {
      final bookLower = book.toLowerCase().replaceAll(RegExp(r'\s+'), '');
      if (bookLower.contains(bookPart)) {
        results.add({'book': book, 'score': 50});
      }
    }
  }

  // Deduplicate
  final seen = <String>{};
  return results.where((r) => seen.add(r['book'] as String)).toList();
}

List<_ChapterVerseCandidate> _recoverInvalidReference(
  String book, int chapter, int? verse, [int? endVerse, int baseConfidence = 20]
) {
  final maxCh = bookChapters[book] ?? 1;
  final recovered = <_ChapterVerseCandidate>[];
  final seen = <String>{};

  void pushCandidate(int c, int? v, int? eV, int conf) {
    if (c < 1 || c > maxCh) return;
    final maxV = getCanonicalVerseCount(book, c);
    if (v != null) {
      if (v < 1 || (maxV != null && v > maxV)) return;
      if (eV != null && (eV < v || (maxV != null && eV > maxV))) return;
    }
    final key = "$c:${v ?? ""}-${eV ?? ""}";
    if (seen.contains(key)) return;
    seen.add(key);
    recovered.add(_ChapterVerseCandidate(
      chapter: c, verse: v, endVerse: eV,
      confidence: [8, conf].reduce((a, b) => a > b ? a : b),
    ));
  }

  final chDigits = chapter.toString();
  final vsDigits = verse != null ? verse.toString() : "";
  final combinedDigits = "$chDigits$vsDigits";

  // 1. Repartition raw combined digits (e.g. 3:31 -> 331 -> 33:1)
  if (combinedDigits.length >= 2) {
    for (var i = 1; i < combinedDigits.length; i++) {
      final cPart = combinedDigits.substring(0, i);
      final vPart = combinedDigits.substring(i);
      if (vPart.length > 1 && vPart.startsWith("0")) continue;
      final c = int.tryParse(cPart);
      final v = int.tryParse(vPart);
      if (c == null || v == null) continue;
      if (c == chapter && v == verse) continue;
      if (c >= 1 && c <= maxCh) {
        final maxV = getCanonicalVerseCount(book, c);
        if (maxV != null && v >= 1 && v <= maxV) {
          pushCandidate(c, v, null, baseConfidence + 6);
        }
      }
    }
  }

  // 2. Transpose adjacent digits (e.g. 331 -> 313 -> 31:3)
  if (combinedDigits.length >= 3) {
    for (var i = 0; i < combinedDigits.length - 1; i++) {
      final arr = combinedDigits.split("");
      final tmp = arr[i];
      arr[i] = arr[i + 1];
      arr[i + 1] = tmp;
      final swapped = arr.join("");
      if (swapped == combinedDigits) continue;
      for (var j = 1; j < swapped.length; j++) {
        final cPart = swapped.substring(0, j);
        final vPart = swapped.substring(j);
        if (vPart.length > 1 && vPart.startsWith("0")) continue;
        final c = int.tryParse(cPart);
        final v = int.tryParse(vPart);
        if (c == null || v == null) continue;
        if (c >= 1 && c <= maxCh) {
          final maxV = getCanonicalVerseCount(book, c);
          if (maxV != null && v >= 1 && v <= maxV) {
            pushCandidate(c, v, null, baseConfidence + 2);
          }
        }
      }
    }
  }

  // 3. Swap chapter and verse if verse is a valid chapter
  if (verse != null && verse >= 1 && verse <= maxCh && chapter >= 1) {
    final maxV = getCanonicalVerseCount(book, verse);
    if (maxV != null && chapter <= maxV) {
      pushCandidate(verse, chapter, null, baseConfidence + 3);
    }
  }

  // 4. In requested chapter, if verse exceeds max verse
  if (chapter >= 1 && chapter <= maxCh) {
    final maxV = getCanonicalVerseCount(book, chapter);
    if (maxV != null) {
      pushCandidate(chapter, maxV, null, baseConfidence);
      pushCandidate(chapter, null, null, baseConfidence - 2);
      pushCandidate(chapter, 1, null, baseConfidence - 4);
    }
  }

  // 5. If chapter > maxCh
  if (chapter > maxCh) {
    if (chDigits.endsWith("0")) {
      final stripped = int.tryParse(chDigits.substring(0, chDigits.length - 1));
      if (stripped != null && stripped >= 1 && stripped <= maxCh) {
        final maxV = getCanonicalVerseCount(book, stripped);
        final safeV = verse != null && maxV != null ? (verse > maxV ? maxV : verse) : verse;
        pushCandidate(stripped, safeV, null, baseConfidence);
      }
    }
    final maxChMaxV = getCanonicalVerseCount(book, maxCh);
    pushCandidate(maxCh, verse != null && maxChMaxV != null ? (verse > maxChMaxV ? maxChMaxV : verse) : null, null, baseConfidence - 4);
    pushCandidate(maxCh, null, null, baseConfidence - 6);
  }

  // 6. Closest chapter with that verse
  if (verse != null && verse >= 1) {
    int? closestChapter;
    var closestDist = 999999;
    for (var c = 1; c <= maxCh; c++) {
      if (c == chapter) continue;
      final maxV = getCanonicalVerseCount(book, c);
      if (maxV != null && maxV >= verse) {
        final dist = (c - chapter).abs();
        if (dist < closestDist) {
          closestDist = dist;
          closestChapter = c;
        }
      }
    }
    if (closestChapter != null) {
      pushCandidate(closestChapter, verse, null, baseConfidence - 5);
    }
  }

  return recovered;
}

List<_ChapterVerseCandidate> _parseSingleChapterVerseCandidates(String numPart) {
  if (numPart.isEmpty) return [];

  final cleaned = numPart
      .replaceAll(RegExp(r'vs', caseSensitive: false), ':')
      .replaceAll(RegExp(r'v', caseSensitive: false), ':')
      .replaceAll('.', ':')
      .replaceAll(RegExp(r'[-–—]'), ':')
      .replaceAll(RegExp(r'\s+'), ':');

  final parts = cleaned.split(':').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return [];

  if (parts.length >= 2) {
    final chapter = int.tryParse(parts[0]);
    final verse = int.tryParse(parts[1]);
    if (chapter == 1 && verse != null && verse >= 1) {
      return [_ChapterVerseCandidate(chapter: 1, verse: verse, confidence: 32)];
    }
  }

  if (parts.length == 1) {
    final verse = int.tryParse(parts[0]);
    if (verse != null && verse >= 1) {
      final conf = parts[0].length == 1 ? 26 : 23;
      return [_ChapterVerseCandidate(chapter: 1, verse: verse, confidence: conf)];
    }
  }

  return [];
}

List<_ChapterVerseCandidate> _parseChapterVerseCandidates(String numPart) {
  if (numPart.isEmpty) return [];

  final cleaned = numPart
      .replaceAll(RegExp(r'vs', caseSensitive: false), ':')
      .replaceAll(RegExp(r'v', caseSensitive: false), ':')
      .replaceAll('.', ':')
      .replaceAll(RegExp(r'[-–—]'), ':')
      .replaceAll(RegExp(r'\s+'), ':');

  final parts = cleaned.split(':').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return [];

  // Two or more explicit parts → chapter:verse
  if (parts.length >= 2) {
    final ch = int.tryParse(parts[0]);
    final vs = int.tryParse(parts[1]);
    final endVs = parts.length >= 3 ? int.tryParse(parts[2]) : null;
    if (ch == null) return [];
    return [_ChapterVerseCandidate(
      chapter: ch,
      verse: vs,
      endVerse: (endVs != null && vs != null && endVs >= vs) ? endVs : null,
      confidence: 30,
    )];
  }

  // Single jammed number
  final digits = parts[0];
  final num = int.tryParse(digits);
  if (num == null) return [];

  final candidates = <_ChapterVerseCandidate>[];

  // Try all split positions
  for (var i = 1; i < digits.length; i++) {
    final chStr = digits.substring(0, i);
    final vsStr = digits.substring(i);
    if (vsStr.length > 1 && vsStr.startsWith('0')) continue;

    final ch = int.tryParse(chStr);
    final vs = int.tryParse(vsStr);
    if (ch == null || ch < 1 || vs == null || vs < 1) continue;

    int conf;
    if (digits.length >= 3) {
      conf = 25 - (i - 1) * 7;
    } else {
      conf = 12 - (i - 1) * 3;
    }
    candidates.add(_ChapterVerseCandidate(
      chapter: ch, verse: vs, confidence: [conf, 8].reduce((a, b) => a > b ? a : b),
    ));
  }

  // Chapter-only
  if (num >= 1 && num <= 150) {
    final chapterConf = digits.length <= 2 ? 15 : 5;
    candidates.add(_ChapterVerseCandidate(chapter: num, confidence: chapterConf));
  }

  // Smart ambiguous shorthand: "334" → 3:3-4
  if (digits.length >= 3) {
    final chapterDigits = digits.substring(0, digits.length - 2);
    final startDigit = digits[digits.length - 2];
    final endDigit = digits[digits.length - 1];
    final chapter = int.tryParse(chapterDigits);
    final verse = int.tryParse(startDigit);
    final endVerse = int.tryParse(endDigit);
    if (chapter != null && chapter >= 1 &&
        verse != null && verse >= 1 &&
        endVerse != null && endVerse >= 1 && endVerse > verse) {
      candidates.add(_ChapterVerseCandidate(
        chapter: chapter, verse: verse, endVerse: endVerse, confidence: 22,
      ));
    }
  }

  return candidates;
}

List<BibleSearchResult> _matchBooksByName(String query) {
  final results = <BibleSearchResult>[];
  final q = query.toLowerCase().replaceAll(RegExp(r'\s+'), '');

  for (final book in allBooks) {
    final bookLower = book.toLowerCase().replaceAll(RegExp(r'\s+'), '');
    if (bookLower.contains(q) || q.contains(bookLower)) {
      results.add(BibleSearchResult(
        book: book, chapter: null, verse: null, endVerse: null,
        label: book,
        score: bookLower.startsWith(q) ? 90 : 60,
      ));
    }
  }

  results.sort((a, b) => b.score.compareTo(a.score));
  return results.take(8).toList();
}
