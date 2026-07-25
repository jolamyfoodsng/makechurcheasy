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
        for (final candidate in singleChapterCandidates) {
          final v = candidate.verse;
          final ev = candidate.endVerse;
          final label = (ev != null && ev != v)
              ? '$book 1:$v-$ev'
              : '$book 1:$v';
          results.add(BibleSearchResult(
            book: book, chapter: 1, verse: v, endVerse: ev,
            label: label, score: bookScore + candidate.confidence,
          ));
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
      var hasValidResult = false;
      for (final c in candidates) {
        final ch = c.chapter;
        final vs = c.verse;
        final ev = c.endVerse;
        if (ch != null && ch >= 1 && ch <= maxCh) {
          hasValidResult = true;
          if (vs != null) {
            final label = (ev != null && ev != vs)
                ? '$book $ch:$vs-$ev'
                : '$book $ch:$vs';
            results.add(BibleSearchResult(
              book: book, chapter: ch, verse: vs, endVerse: ev,
              label: label, score: bookScore + c.confidence,
            ));
          } else {
            results.add(BibleSearchResult(
              book: book, chapter: ch, verse: null, endVerse: null,
              label: '$book $ch', score: bookScore + c.confidence - 5,
            ));
          }
        } else if (ch != null && vs != null) {
          hasValidResult = true;
          for (final repaired in _recoverInvalidExplicitCandidates(ch, vs, maxCh, c.confidence)) {
            results.add(BibleSearchResult(
              book: book, chapter: repaired.chapter, verse: repaired.verse,
              endVerse: repaired.endVerse,
              label: '$book ${repaired.chapter}:${repaired.verse}',
              score: bookScore + repaired.confidence,
            ));
          }
        }
      }
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

List<_ChapterVerseCandidate> _recoverInvalidExplicitCandidates(
  int chapter, int? verse, int maxChapter, int confidence,
) {
  if (verse == null || chapter <= maxChapter || maxChapter >= 10) return [];

  final recovered = <_ChapterVerseCandidate>[];
  final seen = <String>{};
  final chapterDigits = chapter.toString();

  void pushRecovered(int nextChapter, int? nextVerse, int penalty) {
    if (nextChapter < 1 || nextChapter > maxChapter) return;
    if (nextVerse != null && nextVerse < 1) return;
    final key = '$nextChapter:${nextVerse ?? ""}';
    if (seen.contains(key)) return;
    seen.add(key);
    recovered.add(_ChapterVerseCandidate(
      chapter: nextChapter, verse: nextVerse, endVerse: null,
      confidence: [10, confidence - penalty].reduce((a, b) => a > b ? a : b),
    ));
  }

  if (chapterDigits.endsWith('0')) {
    final stripped = int.tryParse(chapterDigits.substring(0, chapterDigits.length - 1));
    if (stripped != null) pushRecovered(stripped, verse, 4);
  }

  if (chapterDigits.length >= 2) {
    final mergedChapter = int.tryParse(chapterDigits[0]);
    final mergedVerseDigits = '${chapterDigits.substring(1)}$verse';
    final mergedVerse = int.tryParse(mergedVerseDigits.replaceFirst(RegExp(r'^0+'), '')) ?? 0;
    if (mergedChapter != null) pushRecovered(mergedChapter, mergedVerse, 6);
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
