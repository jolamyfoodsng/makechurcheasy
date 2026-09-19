import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:dio/dio.dart';
import '../models/api_models.dart';
import '../models/file_transfer_models.dart';
import 'auth_service.dart';
import 'desktop_service.dart';

class ApiService {
  final Dio _dio;
  final AuthService _authService;
  final DesktopService _desktopService;

  ApiService({
    required AuthService authService,
    required DesktopService desktopService,
  }) : _authService = authService,
       _desktopService = desktopService,
       _dio = Dio() {
    _dio.options.connectTimeout = const Duration(seconds: 5);
    _dio.options.receiveTimeout = const Duration(minutes: 2);
    _dio.options.sendTimeout = const Duration(minutes: 30);

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final authHeader = _authService.authorizationHeader;
          if (authHeader != null) {
            options.headers['Authorization'] = authHeader;
          }
          final pairingToken = _desktopService.pairingToken;
          if (pairingToken != null) {
            options.headers['X-Device-Token'] = pairingToken;
          }
          handler.next(options);
        },
        onError: (error, handler) {
          // Handle common errors
          if (error.response?.statusCode == 401) {
            // Token expired - could trigger re-auth
          }
          handler.next(error);
        },
      ),
    );
  }

  String get _baseUrl {
    final info = _desktopService.currentDesktop;
    if (info == null) return '';
    final port = info.apiPort ?? 45678;
    return 'http://${info.ip}:$port';
  }

  String get baseUrl => _baseUrl;

  bool get isConnected => _desktopService.isConnected;

  // --- Desktop Status ---

  Future<DesktopAppState> getCurrentState() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/current-state');
    return DesktopAppState.fromJson(response.data as Map<String, dynamic>);
  }

  // --- Scenes ---

  Future<List<APIScene>> getScenes() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/scenes');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APIScene.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> switchScene(String sceneId) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/scenes/switch', data: {'sceneId': sceneId});
  }

  // --- OBS Controls ---

  Future<void> toggleStreaming() async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/obs/stream');
  }

  Future<void> toggleRecording() async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/obs/record');
  }

  Future<void> toggleMic() async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/obs/mic');
  }

  Future<void> showBRB(bool show) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/obs/brb', data: {'show': show});
  }

  Future<void> showSafeMode(bool show) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/obs/safe', data: {'show': show});
  }

  // --- Bible ---

  Future<List<APIBibleVerse>> searchBible(String query) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get(
      '$baseUrl/api/bible/search',
      queryParameters: {'q': query},
    );
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APIBibleVerse.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> showBibleVerse(String reference) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/bible/show', data: {'reference': reference});
  }

  // --- Worship ---

  Future<List<APISong>> getWorshipLibrary() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/worship/library');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APISong.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<APISongSlide>> getSongSlides(String songId) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get(
      '$_baseUrl/api/worship/songs/$songId/slides',
    );
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APISongSlide.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> showSongSlide(String songId, int slideNumber) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post(
      '$_baseUrl/api/worship/show-slide',
      data: {'songId': songId, 'slideNumber': slideNumber},
    );
  }

  // --- Media ---

  Future<List<APIMediaItem>> getMediaLibrary() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/media');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APIMediaItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> showMedia(String mediaId) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/media/show', data: {'mediaId': mediaId});
  }

  // --- LocalSend-inspired file transfer ---------------------------------

  Future<LocalSendUploadBatch> prepareLocalSendUpload(
    List<PlatformFile> files, {
    required FileTransferDestination destination,
  }) async {
    if (!isConnected) throw Exception('Desktop not connected');
    if (files.isEmpty) throw Exception('Choose at least one file');

    final transferFiles = <LocalSendTransferFile>[];
    final metadata = <String, dynamic>{};
    for (var index = 0; index < files.length; index += 1) {
      final file = files[index];
      final id = 'mce-${DateTime.now().microsecondsSinceEpoch}-$index';
      final mimeType = _guessMimeType(file);
      transferFiles.add(
        LocalSendTransferFile(id: id, file: file, mimeType: mimeType),
      );
      metadata[id] = {
        'id': id,
        'fileName': file.name,
        'size': file.size,
        'fileType': mimeType,
      };
    }

    final response = await _dio.post(
      '$_baseUrl/api/localsend/v2/prepare-upload',
      data: {'destination': destination.wireValue, 'files': metadata},
    );
    final payload = Map<String, dynamic>.from(response.data as Map);
    final rawTokens = payload['files'];
    final tokens = rawTokens is Map
        ? rawTokens.map(
            (key, value) => MapEntry(key.toString(), value.toString()),
          )
        : <String, String>{};
    final sessionId = payload['sessionId']?.toString() ?? '';
    if (sessionId.isEmpty || tokens.length != transferFiles.length) {
      throw Exception('The desktop did not prepare the file transfer.');
    }

    return LocalSendUploadBatch(
      sessionId: sessionId,
      files: transferFiles,
      tokens: tokens,
    );
  }

  Future<LocalSendUploadedFile> uploadLocalSendFile(
    LocalSendUploadBatch batch,
    LocalSendTransferFile transferFile, {
    void Function(int sent, int total)? onProgress,
  }) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final token = batch.tokens[transferFile.id];
    if (token == null) {
      throw Exception('The desktop transfer token is missing.');
    }

    final data = transferFile.file.readStream ?? transferFile.file.bytes;
    if (data == null) {
      throw Exception(
        'Could not read ${transferFile.file.name} from the phone.',
      );
    }

    final response = await _dio.post(
      '$_baseUrl/api/localsend/v2/upload',
      queryParameters: {
        'sessionId': batch.sessionId,
        'fileId': transferFile.id,
        'token': token,
      },
      data: data,
      options: Options(
        contentType: transferFile.mimeType,
        headers: {
          Headers.contentLengthHeader: transferFile.file.size.toString(),
        },
        sendTimeout: const Duration(minutes: 30),
        receiveTimeout: const Duration(minutes: 2),
      ),
      onSendProgress: onProgress,
    );
    final raw = response.data is String
        ? jsonDecode(response.data as String)
        : response.data;
    return LocalSendUploadedFile.fromJson(
      Map<String, dynamic>.from(raw as Map),
      transferId: transferFile.id,
    );
  }

  Future<void> cancelLocalSendUpload(String sessionId) async {
    if (!isConnected || sessionId.isEmpty) return;
    await _dio.post(
      '$_baseUrl/api/localsend/v2/cancel',
      queryParameters: {'sessionId': sessionId},
    );
  }

  String _guessMimeType(PlatformFile file) {
    final extension = (file.extension ?? '').toLowerCase();
    const mimeTypes = <String, String>{
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'm4v': 'video/x-m4v',
      'webm': 'video/webm',
      'mkv': 'video/x-matroska',
      'avi': 'video/x-msvideo',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'm4a': 'audio/mp4',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'zip': 'application/zip',
    };
    return mimeTypes[extension] ?? 'application/octet-stream';
  }

  // --- Ministry ---

  Future<List<APILowerThird>> getLowerThirds() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/ministry/lower-thirds');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APILowerThird.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> showLowerThird(String id) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post(
      '$_baseUrl/api/ministry/lower-thirds/show',
      data: {'id': id},
    );
  }

  Future<void> hideLowerThird(String id) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post(
      '$_baseUrl/api/ministry/lower-thirds/hide',
      data: {'id': id},
    );
  }

  Future<List<APITickerItem>> getTickerItems() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/ministry/ticker');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APITickerItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> showTicker(String id) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/ministry/ticker/show', data: {'id': id});
  }

  Future<void> hideTicker(String id) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/ministry/ticker/hide', data: {'id': id});
  }

  // --- Automation ---

  Future<List<APIMacro>> getMacros() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/automation/macros');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APIMacro.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> executeMacro(String macroId) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.post('$_baseUrl/api/automation/macros/$macroId/execute');
  }

  Future<List<APIAutomationRule>> getAutomationRules() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/automation/rules');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => APIAutomationRule.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> toggleRule(String ruleId, bool enabled) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.patch(
      '$_baseUrl/api/automation/rules/$ruleId',
      data: {'enabled': enabled},
    );
  }

  // --- Automation Rules CRUD ---

  Future<List<AutomationRule>> getFullAutomationRules() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/automation/rules');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => AutomationRule.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<AutomationRule> createAutomationRule(AutomationRule rule) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.post(
      '$_baseUrl/api/automation/rules',
      data: rule.toJson(),
    );
    return AutomationRule.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AutomationRule> updateAutomationRule(
    String ruleId,
    AutomationRule rule,
  ) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.patch(
      '$_baseUrl/api/automation/rules/$ruleId',
      data: rule.toJson(),
    );
    return AutomationRule.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteAutomationRule(String ruleId) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.delete('$_baseUrl/api/automation/rules/$ruleId');
  }

  // --- Automation Schedules CRUD ---

  Future<List<AutomationSchedule>> getAutomationSchedules() async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get('$_baseUrl/api/automation/schedules');
    final data = response.data as List<dynamic>;
    return data
        .map((e) => AutomationSchedule.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<AutomationSchedule> createAutomationSchedule(
    AutomationSchedule schedule,
  ) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.post(
      '$_baseUrl/api/automation/schedules',
      data: schedule.toJson(),
    );
    return AutomationSchedule.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AutomationSchedule> updateAutomationSchedule(
    String scheduleId,
    AutomationSchedule schedule,
  ) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.patch(
      '$_baseUrl/api/automation/schedules/$scheduleId',
      data: schedule.toJson(),
    );
    return AutomationSchedule.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteAutomationSchedule(String scheduleId) async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.delete('$_baseUrl/api/automation/schedules/$scheduleId');
  }

  // --- Automation Logs ---

  Future<List<AutomationLogEntry>> getAutomationLogs({int limit = 50}) async {
    if (!isConnected) throw Exception('Desktop not connected');
    final response = await _dio.get(
      '$_baseUrl/api/automation/logs',
      queryParameters: {'limit': limit},
    );
    final data = response.data as List<dynamic>;
    return data
        .map((e) => AutomationLogEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> clearAutomationLogs() async {
    if (!isConnected) throw Exception('Desktop not connected');
    await _dio.delete('$_baseUrl/api/automation/logs');
  }
}
