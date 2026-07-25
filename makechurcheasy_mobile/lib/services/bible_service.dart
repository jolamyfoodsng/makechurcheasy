/// Bible HTTP service — fetches Bible data from the Desktop HTTP server.
///
/// The Desktop server exposes REST endpoints at :45678/api/bible/* that read
/// Bible JSON files synced to ~/Documents/MakeChurchEasy/uploads/.
library;

import 'package:dio/dio.dart';

import '../models/bible_models.dart';

class BibleService {
  BibleService(this._baseUrl);

  final String _baseUrl;
  Dio get _dio => Dio(BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 10),
      ));

  /// GET /api/bible/translations
  Future<List<BibleTranslation>> getTranslations() async {
    final resp = await _dio.get('/api/bible/translations');
    final data = resp.data;
    if (data is List) {
      return data
          .map((e) => BibleTranslation.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// GET /api/bible/books?translation=KJV
  Future<List<BibleBook>> getBooks(String translation) async {
    final resp = await _dio.get('/api/bible/books',
        queryParameters: {'translation': translation});
    final data = resp.data;
    if (data is List) {
      return data
          .map((e) => BibleBook.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// GET /api/bible/chapter?translation=KJV&book=John&chapter=3
  Future<BibleChapter> getChapter(
      String translation, String book, int chapter) async {
    final resp = await _dio.get('/api/bible/chapter', queryParameters: {
      'translation': translation,
      'book': book,
      'chapter': chapter.toString(),
    });
    return BibleChapter.fromJson(resp.data as Map<String, dynamic>);
  }

  /// GET /api/bible/verse?translation=KJV&book=John&chapter=3&verse=16
  Future<BibleSingleVerse> getVerse(
      String translation, String book, int chapter, int verse) async {
    final resp = await _dio.get('/api/bible/verse', queryParameters: {
      'translation': translation,
      'book': book,
      'chapter': chapter.toString(),
      'verse': verse.toString(),
    });
    return BibleSingleVerse.fromJson(resp.data as Map<String, dynamic>);
  }

  /// GET /api/bible/search?translation=KJV&query=love&limit=20
  Future<BibleSearchResponse> search(
      String translation, String query, {int limit = 20}) async {
    final resp = await _dio.get('/api/bible/search', queryParameters: {
      'translation': translation,
      'query': query,
      'limit': limit.toString(),
    });
    return BibleSearchResponse.fromJson(resp.data as Map<String, dynamic>);
  }

  /// GET /api/bible/current-reading — returns the Desktop dock's current chapter.
  Future<CurrentReadingResponse?> getCurrentReading() async {
    try {
      final resp = await _dio.get('/api/bible/current-reading');
      final data = resp.data;
      if (data == null || data is! Map<String, dynamic>) return null;
      return CurrentReadingResponse.fromJson(data);
    } on DioException {
      return null;
    }
  }
}
