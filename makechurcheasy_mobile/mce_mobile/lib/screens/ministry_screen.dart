import 'dart:async';

import 'package:flutter/material.dart';

import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import '../theme/mce_theme.dart';

/// The phone-sized version of the Dock's Ministry tab.
///
/// The desktop Dock remains the source of truth for themes, settings,
/// messages, and countdown definitions. Actions are sent back through the
/// same bridge so a mobile tap changes OBS immediately.
class MinistryScreen extends StatefulWidget {
  const MinistryScreen({super.key});

  @override
  State<MinistryScreen> createState() => _MinistryScreenState();
}

class _MinistryScreenState extends State<MinistryScreen> {
  static const _tabs = <({String label, IconData icon})>[
    (label: 'Ticker', icon: Icons.campaign_outlined),
    (label: 'Low', icon: Icons.subtitles_outlined),
    (label: 'Count', icon: Icons.timer_outlined),
  ];
  static final _fallbackLowerThirdThemes = <Map<String, dynamic>>[
    {
      'id': 'lt-232-youth-quote-pulse-sunrise-orange',
      'name': 'Quote Pulse (Orange)',
      'description':
          'Statement quote card for sermon clips and social-friendly moments.',
      'category': 'general',
      'icon': 'format_quote',
      'accentColor': '#4ADE80',
      'variables': [
        {
          'key': 'label',
          'label': 'Label',
          'type': 'text',
          'defaultValue': 'Sermon Quote',
          'placeholder': 'e.g. Key Quote',
        },
        {
          'key': 'quote',
          'label': 'Quote',
          'type': 'text',
          'defaultValue':
              'Grace does not lower truth; it gives us power to walk in it.',
          'placeholder': 'Enter quote text',
          'required': true,
        },
        {
          'key': 'reference',
          'label': 'Reference',
          'type': 'text',
          'defaultValue': 'Sunday Message',
          'placeholder': 'Speaker or source',
        },
        {
          'key': 'state',
          'label': 'Animation State',
          'type': 'select',
          'defaultValue': 'in',
          'options': [
            {'label': 'Animate In', 'value': 'in'},
            {'label': 'Animate Out', 'value': 'out'},
          ],
        },
        {
          'key': 'animMode',
          'label': 'Animation Mode',
          'type': 'select',
          'defaultValue': 'slow',
          'options': [
            {'label': 'Staggered', 'value': 'stagger'},
            {'label': 'Together Slow', 'value': 'slow'},
            {'label': 'Together', 'value': 'together'},
          ],
        },
      ],
    },
  ];

  int _currentTab = 0;
  bool _loadingTicker = true;
  bool _loadingCountdowns = true;
  bool _loadingLowerThirds = true;
  bool _tickerSending = false;
  bool _tickerPaused = false;
  bool _tickerLive = false;
  bool _lowerThirdSending = false;
  String? _tickerError;
  String? _countdownError;
  String? _activeCountdownId;
  String? _activeLowerThirdName;

  List<_TickerMessage> _messages = const [];
  List<Map<String, dynamic>> _countdowns = const [];
  List<Map<String, dynamic>> _lowerThirdThemes = const [];
  String _lowerThirdThemeId = '';
  Map<String, String> _lowerThirdValues = {};
  List<String> _lowerThirdScenes = const [];
  Map<String, dynamic> _lowerThirdRoute = const {
    'enabled': false,
    'sceneName': '',
    'targets': <Map<String, dynamic>>[],
    'syncPresentation': false,
  };
  bool _loadingLowerThirdOutput = false;
  final Map<String, TextEditingController> _lowerThirdControllers = {};

  final _tickerController = TextEditingController();
  final _tickerHeadingController = TextEditingController();
  Timer? _countdownTimer;
  final Map<String, int> _countdownRemaining = {};
  final Map<String, bool> _countdownRunning = {};
  final Map<String, String> _countdownTitles = {};
  StreamSubscription<WebSocketEvent>? _webSocketSub;
  bool _loadedAfterAuthentication = false;

  WebSocketService get _webSocket => context.webSocketService;
  bool get _canSend => _webSocket.isAuthenticated;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _webSocketSub = _webSocket.events.listen((event) {
        if (!mounted || event.type != WebSocketEventType.authenticated) return;
        _loadAfterAuthentication();
      });
      _loadAfterAuthentication();
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _tickerController.dispose();
    _tickerHeadingController.dispose();
    for (final controller in _lowerThirdControllers.values) {
      controller.dispose();
    }
    _webSocketSub?.cancel();
    super.dispose();
  }

  void _loadAfterAuthentication() {
    if (!mounted || _loadedAfterAuthentication || !_canSend) return;
    _loadedAfterAuthentication = true;
    unawaited(_loadTickerMessages());
    unawaited(_loadCountdowns());
    unawaited(_loadLowerThirdThemes());
    unawaited(_loadLowerThirdOutput());
  }

  Future<void> _loadTickerMessages() async {
    if (!mounted) return;
    setState(() {
      _loadingTicker = true;
      _tickerError = null;
    });
    if (!_canSend) {
      setState(() {
        _messages = const [];
        _loadingTicker = false;
        _tickerError = 'Connect to the desktop to load ticker messages.';
      });
      return;
    }
    try {
      final raw = await _webSocket.getTickerMessages().timeout(
        Duration(seconds: 15),
      );
      if (!mounted) return;
      setState(() {
        _messages = raw.map(_TickerMessage.fromJson).toList();
        _loadingTicker = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _messages = const [];
        _loadingTicker = false;
        _tickerError = 'Ticker messages are unavailable: $error';
      });
    }
  }

  Future<void> _loadLowerThirdThemes() async {
    if (!mounted) return;
    setState(() => _loadingLowerThirds = true);
    if (!_canSend) {
      setState(() => _loadingLowerThirds = false);
      return;
    }
    try {
      final themes = await _webSocket.getLowerThirdThemes().timeout(
        Duration(seconds: 8),
      );
      if (!mounted) return;
      final availableThemes = themes.isEmpty
          ? _fallbackLowerThirdThemes
          : themes;
      final nextId =
          availableThemes.any(
            (theme) => theme['id']?.toString() == _lowerThirdThemeId,
          )
          ? _lowerThirdThemeId
          : (availableThemes.isNotEmpty
                ? availableThemes.first['id']?.toString() ?? ''
                : '');
      setState(() {
        _lowerThirdThemes = availableThemes;
        _lowerThirdThemeId = nextId;
        _loadingLowerThirds = false;
      });
      _rebuildLowerThirdFields(_selectedLowerThirdTheme);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingLowerThirds = false;
        if (_lowerThirdThemes.isEmpty && _canSend) {
          _lowerThirdThemes = _fallbackLowerThirdThemes;
          _lowerThirdThemeId = _fallbackLowerThirdThemes.first['id'].toString();
        }
      });
      _rebuildLowerThirdFields(_selectedLowerThirdTheme);
    }
  }

  Future<void> _loadLowerThirdOutput() async {
    if (!mounted || !_canSend) return;
    setState(() => _loadingLowerThirdOutput = true);
    try {
      final responses = await Future.wait<Map<String, dynamic>>([
        _webSocket.getSceneRoute('lower-third'),
        _webSocket.getScenes(),
      ]);
      final rawRoute = responses[0];
      final rawScenes = responses[1]['payload'];
      final scenes = rawScenes is List
          ? rawScenes
                .whereType<Map>()
                .map((scene) => scene['name']?.toString().trim() ?? '')
                .where((name) => name.isNotEmpty)
                .toSet()
                .toList()
          : <String>[];
      scenes.sort();
      if (!mounted) return;
      setState(() {
        _lowerThirdRoute = _normalizeLowerThirdRoute(rawRoute);
        _lowerThirdScenes = scenes;
        _loadingLowerThirdOutput = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingLowerThirdOutput = false);
    }
  }

  Map<String, dynamic> _normalizeLowerThirdRoute(Map<String, dynamic> value) {
    final legacySceneName = value['sceneName']?.toString().trim() ?? '';
    final rawTargets = value['targets'];
    final targets = <Map<String, dynamic>>[];
    final seen = <String>{};
    if (rawTargets is List) {
      for (final rawTarget in rawTargets.whereType<Map>()) {
        final sceneName = rawTarget['sceneName']?.toString().trim() ?? '';
        if (sceneName.isEmpty || !seen.add(sceneName)) continue;
        final mode = rawTarget['mode']?.toString();
        targets.add({
          'sceneName': sceneName,
          'mode': mode == 'fullscreen' || mode == 'lower-third'
              ? mode
              : 'inherit',
        });
      }
    }
    if (targets.isEmpty && legacySceneName.isNotEmpty) {
      targets.add({'sceneName': legacySceneName, 'mode': 'inherit'});
    }
    return {
      'enabled': value['enabled'] == true && targets.isNotEmpty,
      'sceneName': targets.isNotEmpty
          ? targets.first['sceneName']
          : legacySceneName,
      'targets': targets,
      'syncPresentation': value['syncPresentation'] == true,
    };
  }

  String _lowerThirdOutputSummary() {
    final route = _normalizeLowerThirdRoute(_lowerThirdRoute);
    if (route['enabled'] == true) {
      final targets =
          (route['targets'] as List?)
              ?.whereType<Map>()
              .map((target) => target['sceneName']?.toString() ?? '')
              .where((name) => name.isNotEmpty)
              .toList() ??
          const <String>[];
      if (targets.length == 1) return 'To ${targets.first}';
      if (targets.length > 1) return 'To ${targets.length} scenes';
    }
    return 'MCE Presentation';
  }

  Future<void> _refreshLowerThirds() async {
    await Future.wait([_loadLowerThirdThemes(), _loadLowerThirdOutput()]);
  }

  void _selectMinistryTab(int index) {
    setState(() => _currentTab = index);
    if (index == 1) unawaited(_refreshLowerThirds());
  }

  Future<void> _saveLowerThirdRoute(Map<String, dynamic> route) async {
    try {
      final saved = await _webSocket.saveSceneRoute(
        'lower-third',
        _normalizeLowerThirdRoute(route),
      );
      if (!mounted) return;
      setState(() => _lowerThirdRoute = _normalizeLowerThirdRoute(saved));
    } catch (error) {
      if (mounted) {
        _showMessage('Could not save lower-third output: $error', danger: true);
      }
    }
  }

  Future<void> _showLowerThirdOutputSettings() async {
    await _loadLowerThirdOutput();
    if (!mounted) return;
    var draft = _normalizeLowerThirdRoute(_lowerThirdRoute);
    final scenes = List<String>.of(_lowerThirdScenes);

    final savedRoute = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: MCEColors.surface,
      showDragHandle: true,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.xl)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final targets =
              (draft['targets'] as List?)
                  ?.whereType<Map>()
                  .map((target) => Map<String, dynamic>.from(target))
                  .toList() ??
              <Map<String, dynamic>>[];
          final selected = targets
              .map((target) => target['sceneName']?.toString() ?? '')
              .where((name) => name.isNotEmpty)
              .toSet();
          final enabled = draft['enabled'] == true;

          void setDraft({
            bool? nextEnabled,
            List<Map<String, dynamic>>? nextTargets,
            bool? syncPresentation,
          }) {
            draft = _normalizeLowerThirdRoute({
              ...draft,
              'enabled': nextEnabled ?? enabled,
              'targets': nextTargets ?? targets,
              'syncPresentation':
                  syncPresentation ?? draft['syncPresentation'] == true,
            });
            setSheetState(() {});
          }

          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(
                MCESpacing.lg,
                0,
                MCESpacing.lg,
                MCESpacing.lg,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Lower third output', style: MCETypography.sectionTitle),
                  SizedBox(height: MCESpacing.xs),
                  Text(
                    'Match the Dock output target. Choose one or more OBS scenes, or keep the default presentation output.',
                    style: MCETypography.caption,
                  ),
                  SizedBox(height: MCESpacing.md),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: enabled,
                    activeThumbColor: MCEColors.primaryBlue,
                    title: Text('Send to selected scene(s)'),
                    subtitle: Text(
                      enabled
                          ? 'The lower third will use the selected scene list.'
                          : 'The lower third will use MCE Presentation.',
                    ),
                    onChanged: (value) {
                      var nextTargets = targets;
                      if (value && nextTargets.isEmpty && scenes.isNotEmpty) {
                        final fallback = draft['sceneName']?.toString().trim();
                        final scene =
                            fallback != null && scenes.contains(fallback)
                            ? fallback
                            : scenes.first;
                        nextTargets = [
                          {'sceneName': scene, 'mode': 'inherit'},
                        ];
                      }
                      setDraft(nextEnabled: value, nextTargets: nextTargets);
                    },
                  ),
                  Divider(color: MCEColors.border),
                  Text('Target scenes', style: MCETypography.bodyBold),
                  SizedBox(height: MCESpacing.xs),
                  if (scenes.isEmpty)
                    Text(
                      'No OBS scenes are available yet. Refresh after OBS connects.',
                      style: MCETypography.caption,
                    )
                  else
                    ...scenes.map(
                      (scene) => CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        value: selected.contains(scene),
                        activeColor: MCEColors.primaryBlue,
                        title: Text(scene),
                        onChanged: !enabled
                            ? null
                            : (checked) {
                                final nextTargets = [...targets];
                                if (checked == true) {
                                  nextTargets.add({
                                    'sceneName': scene,
                                    'mode': 'inherit',
                                  });
                                } else {
                                  nextTargets.removeWhere(
                                    (target) => target['sceneName'] == scene,
                                  );
                                }
                                setDraft(nextTargets: nextTargets);
                              },
                      ),
                    ),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: draft['syncPresentation'] == true,
                    activeThumbColor: MCEColors.primaryBlue,
                    title: Text('Also update MCE Presentation'),
                    subtitle: Text('Keep the main Dock output in sync.'),
                    onChanged: !enabled
                        ? null
                        : (value) => setDraft(syncPresentation: value),
                  ),
                  SizedBox(height: MCESpacing.md),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton(
                      onPressed: () => Navigator.of(sheetContext).pop(draft),
                      child: Text('Save output target'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (savedRoute != null && mounted) await _saveLowerThirdRoute(savedRoute);
  }

  Future<void> _loadCountdowns() async {
    if (!mounted) return;
    setState(() {
      _loadingCountdowns = true;
      _countdownError = null;
    });
    if (!_canSend) {
      setState(() {
        _countdowns = const [];
        _loadingCountdowns = false;
        _countdownError = 'Connect to the desktop to load countdowns.';
      });
      return;
    }
    try {
      final countdowns = await _webSocket.getCountdowns().timeout(
        Duration(seconds: 8),
      );
      if (!mounted) return;
      for (final countdown in countdowns) {
        final id = countdown['id']?.toString() ?? '';
        if (id.isEmpty) continue;
        _countdownRemaining.putIfAbsent(id, () => _durationSeconds(countdown));
        _countdownTitles.putIfAbsent(
          id,
          () => countdown['title']?.toString() ?? 'Countdown',
        );
        _countdownRunning.putIfAbsent(id, () => false);
      }
      setState(() {
        _countdowns = countdowns;
        _loadingCountdowns = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _countdowns = const [];
        _loadingCountdowns = false;
        _countdownError = 'Countdowns are unavailable: $error';
      });
    }
  }

  Future<void> _persistTickerMessages(List<_TickerMessage> messages) async {
    final saved = await _webSocket.saveTickerMessages(
      messages.map((message) => message.toJson()).toList(),
    );
    if (!mounted) return;
    setState(() => _messages = saved.map(_TickerMessage.fromJson).toList());
  }

  Future<void> _addTickerMessage() async {
    final text = _tickerController.text.trim();
    if (text.isEmpty) return;
    final message = _TickerMessage(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      text: text.substring(0, text.length.clamp(0, 140)),
      active: true,
    );
    _tickerController.clear();
    try {
      await _persistTickerMessages([..._messages, message]);
    } catch (error) {
      if (mounted)
        _showMessage('Could not save ticker message: $error', danger: true);
    }
  }

  Future<void> _editTickerMessage(int index) async {
    final message = _messages[index];
    final controller = TextEditingController(text: message.text);
    final nextText = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: MCEColors.surface,
        title: Text('Edit ticker message'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 140,
          style: MCETypography.body,
          decoration: InputDecoration(hintText: 'Ticker message'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (nextText == null || nextText.isEmpty || !mounted) return;
    final next = [..._messages];
    next[index] = message.copyWith(
      text: nextText.substring(0, nextText.length.clamp(0, 140)),
    );
    try {
      await _persistTickerMessages(next);
    } catch (error) {
      if (mounted)
        _showMessage('Could not save ticker message: $error', danger: true);
    }
  }

  Future<void> _toggleTickerMessage(int index) async {
    final next = [..._messages];
    next[index] = next[index].copyWith(active: !next[index].active);
    try {
      await _persistTickerMessages(next);
    } catch (error) {
      if (mounted)
        _showMessage('Could not update ticker message: $error', danger: true);
    }
  }

  Future<void> _deleteTickerMessage(int index) async {
    final next = [..._messages]..removeAt(index);
    try {
      await _persistTickerMessages(next);
    } catch (error) {
      if (mounted)
        _showMessage('Could not delete ticker message: $error', danger: true);
    }
  }

  Future<void> _saveTickerHeading() async {
    final heading = _tickerHeadingController.text.trim();
    if (heading.isEmpty) return;
    await _webSocket.saveTickerSettings({'heading': heading});
  }

  Future<void> _pushTicker({bool paused = false}) async {
    final messages = _messages
        .where((message) => message.active && message.text.trim().isNotEmpty)
        .map((message) => message.text.trim())
        .toList();
    if (messages.isEmpty) {
      _showMessage('Add or activate a ticker message first.', danger: true);
      return;
    }
    if (!_canSend) {
      _showMessage('Connect to the desktop first.', danger: true);
      return;
    }
    setState(() => _tickerSending = true);
    try {
      await _saveTickerHeading();
      await _webSocket.showTickerMessages(messages, paused: paused);
      if (!mounted) return;
      setState(() {
        _tickerLive = true;
        _tickerPaused = paused;
      });
    } catch (error) {
      if (mounted) _showMessage('Could not push ticker: $error', danger: true);
    } finally {
      if (mounted) setState(() => _tickerSending = false);
    }
  }

  Future<void> _toggleTickerPause() => _pushTicker(paused: !_tickerPaused);

  Future<void> _clearTicker() async {
    try {
      await _webSocket.clearTicker();
      if (!mounted) return;
      setState(() {
        _tickerLive = false;
        _tickerPaused = false;
      });
    } catch (error) {
      if (mounted) _showMessage('Could not clear ticker: $error', danger: true);
    }
  }

  Map<String, dynamic>? get _selectedLowerThirdTheme {
    for (final theme in _lowerThirdThemes) {
      if (theme['id']?.toString() == _lowerThirdThemeId) return theme;
    }
    return _lowerThirdThemes.isNotEmpty ? _lowerThirdThemes.first : null;
  }

  void _rebuildLowerThirdFields(Map<String, dynamic>? theme) {
    for (final controller in _lowerThirdControllers.values) {
      controller.dispose();
    }
    _lowerThirdControllers.clear();
    final nextValues = <String, String>{};
    for (final variable in _themeVariables(theme)) {
      final key = variable['key']?.toString() ?? '';
      if (key.isEmpty) continue;
      final value =
          _lowerThirdValues[key] ?? variable['defaultValue']?.toString() ?? '';
      nextValues[key] = value;
      if (variable['type']?.toString() != 'toggle')
        _lowerThirdControllers[key] = TextEditingController(text: value);
    }
    _lowerThirdValues = nextValues;
  }

  Future<void> _pushLowerThird() async {
    final theme = _selectedLowerThirdTheme;
    if (theme == null) {
      _showMessage(
        'Add a favorite lower-third theme in the Dock first.',
        danger: true,
      );
      return;
    }
    if (!_canSend) {
      _showMessage('Connect to the desktop first.', danger: true);
      return;
    }
    final values = <String, String>{
      for (final variable in _themeVariables(theme))
        if ((variable['key']?.toString() ?? '').isNotEmpty)
          variable['key'].toString(): _lowerThirdValue(
            variable['key'].toString(),
          ),
    };
    final name = _firstLowerThirdValue(values, const [
      'name',
      'speaker',
      'person',
    ]);
    final title = _firstLowerThirdValue(values, const [
      'title',
      'role',
      'subtitle',
      'description',
    ]);
    setState(() => _lowerThirdSending = true);
    try {
      await _webSocket.showLowerThird(
        name,
        title,
        themeId: _lowerThirdThemeId,
        values: values,
        size: 'sm',
      );
      if (!mounted) return;
      final preview = name.isNotEmpty
          ? name
          : title.isNotEmpty
          ? title
          : values.values.firstWhere(
              (value) => value.trim().isNotEmpty,
              orElse: () => theme['name']?.toString() ?? 'Lower third',
            );
      setState(() => _activeLowerThirdName = preview);
    } catch (error) {
      if (mounted)
        _showMessage('Could not push lower third: $error', danger: true);
    } finally {
      if (mounted) setState(() => _lowerThirdSending = false);
    }
  }

  Future<void> _blankLowerThird() async {
    try {
      await _webSocket.blankLowerThird();
      if (mounted) setState(() => _activeLowerThirdName = null);
    } catch (error) {
      if (mounted)
        _showMessage('Could not animate out lower third: $error', danger: true);
    }
  }

  Future<void> _clearLowerThird() async {
    try {
      await _webSocket.clearLowerThird();
      if (mounted) setState(() => _activeLowerThirdName = null);
    } catch (error) {
      if (mounted)
        _showMessage('Could not clear lower third: $error', danger: true);
    }
  }

  Future<void> _showCountdown(Map<String, dynamic> countdown) async {
    final id = countdown['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final seconds = _remainingFor(countdown);
    try {
      await _webSocket.showCountdown(
        _countdownConfig(countdown, seconds),
        sync: {'paused': false, 'remaining': seconds},
      );
      if (mounted) _startCountdown(id);
    } catch (error) {
      if (mounted)
        _showMessage('Could not show countdown: $error', danger: true);
    }
  }

  Future<void> _pauseCountdown(Map<String, dynamic> countdown) async {
    final id = countdown['id']?.toString() ?? '';
    final seconds = _remainingFor(countdown);
    _stopCountdownClock(id);
    try {
      await _webSocket.showCountdown(
        _countdownConfig(countdown, seconds),
        sync: {'paused': true, 'remaining': seconds},
      );
    } catch (error) {
      if (mounted)
        _showMessage('Could not pause countdown: $error', danger: true);
    }
  }

  Future<void> _resumeCountdown(Map<String, dynamic> countdown) async {
    final id = countdown['id']?.toString() ?? '';
    final seconds = _remainingFor(countdown);
    try {
      await _webSocket.showCountdown(
        _countdownConfig(countdown, seconds),
        sync: {'paused': false, 'remaining': seconds},
      );
      if (mounted) _startCountdown(id);
    } catch (error) {
      if (mounted)
        _showMessage('Could not resume countdown: $error', danger: true);
    }
  }

  Future<void> _stopAndRemoveCountdown() async {
    try {
      await _webSocket.clearCountdown();
      if (!mounted) return;
      _stopCountdownClock(_activeCountdownId);
      setState(() => _activeCountdownId = null);
    } catch (error) {
      if (mounted)
        _showMessage('Could not stop countdown: $error', danger: true);
    }
  }

  void _startCountdown(String id) {
    _countdownTimer?.cancel();
    setState(() {
      _activeCountdownId = id;
      _countdownRunning.updateAll((key, value) => key == id);
      _countdownRunning[id] = true;
    });
    _countdownTimer = Timer.periodic(Duration(seconds: 1), (_) {
      if (!mounted || _activeCountdownId != id || _countdownRunning[id] != true)
        return;
      final remaining = (_countdownRemaining[id] ?? 0) - 1;
      setState(() {
        _countdownRemaining[id] = remaining.clamp(0, 24 * 60 * 60);
        if (remaining <= 0) _countdownRunning[id] = false;
      });
      if (remaining <= 0) _countdownTimer?.cancel();
    });
  }

  void _stopCountdownClock(String? id) {
    _countdownTimer?.cancel();
    if (id != null && mounted) setState(() => _countdownRunning[id] = false);
  }

  void _adjustCountdown(Map<String, dynamic> countdown, int delta) {
    final id = countdown['id']?.toString() ?? '';
    if (id.isEmpty || _countdownRunning[id] == true) return;
    setState(
      () => _countdownRemaining[id] = (_remainingFor(countdown) + delta).clamp(
        0,
        24 * 60 * 60,
      ),
    );
  }

  void _resetCountdown(Map<String, dynamic> countdown) {
    final id = countdown['id']?.toString() ?? '';
    if (id.isEmpty || _countdownRunning[id] == true) return;
    setState(() => _countdownRemaining[id] = _durationSeconds(countdown));
  }

  Future<void> _editCountdownTitle(Map<String, dynamic> countdown) async {
    final id = countdown['id']?.toString() ?? '';
    if (id.isEmpty || _countdownRunning[id] == true) return;
    final controller = TextEditingController(text: _titleFor(countdown));
    final title = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: MCEColors.surface,
        title: Text('Edit countdown title'),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (title == null || title.isEmpty || !mounted) return;
    setState(() => _countdownTitles[id] = title);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      // AppShell owns the compact top safe area for the Scenes and Ministry
      // tabs. Keeping a second one here creates the oversized blank band.
      top: false,
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          MCESpacing.lg,
          MCESpacing.sm,
          MCESpacing.lg,
          MCESpacing.xxl,
        ),
        children: [
          _buildTabs(),
          SizedBox(height: MCESpacing.lg),
          switch (_currentTab) {
            0 => _buildTickerTab(),
            1 => _buildLowerThirdsTab(),
            _ => _buildCountdownsTab(),
          },
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: MCEColors.elevated,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(color: MCEColors.border),
      ),
      child: Row(
        children: List.generate(_tabs.length, (index) {
          final selected = index == _currentTab;
          final tab = _tabs[index];
          return Expanded(
            child: InkWell(
              onTap: () => _selectMinistryTab(index),
              borderRadius: BorderRadius.circular(MCERadius.sm),
              child: Container(
                constraints: BoxConstraints(minHeight: 44),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? MCEColors.primaryBlue : Colors.transparent,
                  borderRadius: BorderRadius.circular(MCERadius.sm),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      tab.icon,
                      size: 16,
                      color: selected ? Colors.white : MCEColors.textSecondary,
                    ),
                    SizedBox(width: MCESpacing.xs),
                    Text(
                      tab.label,
                      style: TextStyle(
                        color: selected
                            ? Colors.white
                            : MCEColors.textSecondary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildTickerTab() {
    final activeText = _messages
        .where((message) => message.active)
        .map((message) => message.text)
        .join('   •   ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader(
          'Ticker',
          'Edit the ticker text and send the saved messages to OBS.',
          onRefresh: _loadTickerMessages,
        ),
        if (!_canSend)
          _buildInfoBanner(
            'Connect to the desktop to load ticker messages and control OBS.',
          ),
        SizedBox(height: MCESpacing.md),
        _panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _fieldLabel('Text'),
              TextField(
                controller: _tickerHeadingController,
                maxLength: 20,
                decoration: InputDecoration(
                  labelText: 'Ticker heading (optional)',
                  hintText: 'LIVE',
                  counterText: '',
                ),
              ),
              SizedBox(height: MCESpacing.xs),
              Text(
                'Display styling follows the desktop Dock.',
                style: MCETypography.caption,
              ),
            ],
          ),
        ),
        SizedBox(height: MCESpacing.md),
        _panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _fieldLabel('Messages'),
              TextField(
                controller: _tickerController,
                maxLength: 140,
                minLines: 3,
                maxLines: 4,
                onSubmitted: (_) => _addTickerMessage(),
                decoration: InputDecoration(
                  hintText: 'Compose a ticker message',
                ),
              ),
              SizedBox(height: MCESpacing.sm),
              SizedBox(
                width: double.infinity,
                height: 44,
                child: OutlinedButton.icon(
                  onPressed: _canSend ? _addTickerMessage : null,
                  icon: Icon(Icons.add, size: 18),
                  label: Text('Add Message'),
                ),
              ),
              SizedBox(height: MCESpacing.md),
              if (_loadingTicker)
                Center(
                  child: Padding(
                    padding: EdgeInsets.all(MCESpacing.md),
                    child: CircularProgressIndicator(),
                  ),
                )
              else if (_messages.isEmpty)
                _buildEmptyState(
                  Icons.notes_outlined,
                  'No ticker messages',
                  'Add a message to make it available in the Dock.',
                )
              else
                ..._messages.asMap().entries.map(
                  (entry) => _buildTickerMessage(entry.key, entry.value),
                ),
            ],
          ),
        ),
        if (_tickerError != null) ...[
          SizedBox(height: MCESpacing.md),
          _buildInfoBanner(_tickerError!),
        ],
        if (_tickerLive && activeText.isNotEmpty) ...[
          SizedBox(height: MCESpacing.md),
          _buildLivePreview(
            _tickerPaused ? 'Ticker paused' : 'Ticker live',
            activeText,
          ),
        ],
        SizedBox(height: MCESpacing.md),
        Row(
          children: [
            Expanded(
              child: _actionButton(
                label: _tickerSending ? 'Sending…' : 'Send to OBS',
                icon: Icons.visibility,
                color: MCEColors.success,
                onPressed: _canSend && !_tickerSending ? _pushTicker : null,
              ),
            ),
            if (_tickerLive) ...[
              SizedBox(width: MCESpacing.sm),
              Expanded(
                child: _actionButton(
                  label: _tickerPaused ? 'Resume' : 'Pause',
                  icon: _tickerPaused ? Icons.play_arrow : Icons.pause,
                  color: MCEColors.primaryBlue,
                  onPressed: _canSend && !_tickerSending
                      ? _toggleTickerPause
                      : null,
                ),
              ),
            ],
            SizedBox(width: MCESpacing.sm),
            Expanded(
              child: _actionButton(
                label: 'Clear',
                icon: Icons.clear,
                color: MCEColors.danger,
                onPressed: _tickerLive ? _clearTicker : null,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTickerMessage(int index, _TickerMessage message) {
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.sm),
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.sm,
        vertical: MCESpacing.xs,
      ),
      decoration: BoxDecoration(
        color: message.active
            ? MCEColors.surface
            : MCEColors.surface.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(MCERadius.sm),
        border: Border.all(color: MCEColors.border),
      ),
      child: Row(
        children: [
          Checkbox(
            value: message.active,
            onChanged: _canSend ? (_) => _toggleTickerMessage(index) : null,
            activeColor: MCEColors.primaryBlue,
          ),
          Expanded(
            child: Text(
              message.text,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: MCETypography.body.copyWith(
                color: message.active
                    ? MCEColors.textPrimary
                    : MCEColors.textTertiary,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Edit message',
            onPressed: _canSend ? () => _editTickerMessage(index) : null,
            icon: Icon(Icons.edit_outlined, size: 18),
          ),
          IconButton(
            tooltip: 'Delete message',
            onPressed: _canSend ? () => _deleteTickerMessage(index) : null,
            icon: Icon(Icons.delete_outline, size: 18, color: MCEColors.danger),
          ),
        ],
      ),
    );
  }

  Widget _buildLowerThirdOutputCard() {
    final routeEnabled =
        _normalizeLowerThirdRoute(_lowerThirdRoute)['enabled'] == true;
    return _panel(
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: MCEColors.primaryBlue.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(MCERadius.sm),
            ),
            child: Icon(Icons.subtitles_outlined, color: MCEColors.primaryBlue),
          ),
          SizedBox(width: MCESpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Output', style: MCETypography.bodyBold),
                SizedBox(height: MCESpacing.xs),
                Text(
                  routeEnabled
                      ? _lowerThirdOutputSummary()
                      : 'MCE Presentation',
                  style: MCETypography.caption.copyWith(
                    color: routeEnabled
                        ? MCEColors.primaryBlue
                        : MCEColors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          OutlinedButton.icon(
            onPressed: _loadingLowerThirdOutput
                ? null
                : _showLowerThirdOutputSettings,
            icon: Icon(Icons.tune, size: 17),
            label: Text('Choose'),
          ),
        ],
      ),
    );
  }

  Widget _buildLowerThirdsTab() {
    final theme = _selectedLowerThirdTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader(
          'Lower Thirds',
          'Edit lower-third content and send it to the selected OBS output.',
          onRefresh: _refreshLowerThirds,
        ),
        SizedBox(height: MCESpacing.md),
        _buildLowerThirdOutputCard(),
        SizedBox(height: MCESpacing.md),
        if (!_canSend)
          _buildInfoBanner(
            'Connect to the desktop to load lower-third content fields and control OBS.',
          ),
        if (_loadingLowerThirds)
          Center(
            child: Padding(
              padding: EdgeInsets.all(MCESpacing.xl),
              child: CircularProgressIndicator(),
            ),
          )
        else if (theme == null)
          _buildEmptyState(
            Icons.subtitles_outlined,
            'No favorite lower thirds',
            'Add a lower-third theme to the Dock favorites first.',
          )
        else ...[
          _panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _fieldLabel('Content'),
                ..._themeVariables(theme).map(_buildLowerThirdField),
              ],
            ),
          ),
          if (_activeLowerThirdName != null) ...[
            SizedBox(height: MCESpacing.md),
            _buildLivePreview('Lower third live', _activeLowerThirdName!),
          ],
          SizedBox(height: MCESpacing.md),
          Row(
            children: [
              Expanded(
                child: _actionButton(
                  label: _lowerThirdSending ? 'Sending…' : 'Send to OBS',
                  icon: Icons.visibility,
                  color: MCEColors.success,
                  onPressed: _canSend && !_lowerThirdSending
                      ? _pushLowerThird
                      : null,
                ),
              ),
              SizedBox(width: MCESpacing.sm),
              Expanded(
                child: _actionButton(
                  label: 'Animate Out',
                  icon: Icons.animation_outlined,
                  color: MCEColors.primaryBlue,
                  onPressed: _activeLowerThirdName == null
                      ? null
                      : _blankLowerThird,
                ),
              ),
              SizedBox(width: MCESpacing.sm),
              Expanded(
                child: _actionButton(
                  label: 'Blank',
                  icon: Icons.visibility_off_outlined,
                  color: MCEColors.danger,
                  onPressed: _clearLowerThird,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildLowerThirdField(Map<String, dynamic> variable) {
    final key = variable['key']?.toString() ?? '';
    final label = variable['label']?.toString() ?? key;
    final type = variable['type']?.toString() ?? 'text';
    if (key.isEmpty) return const SizedBox.shrink();
    if (type == 'toggle') {
      return SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(label, style: MCETypography.body),
        value: _lowerThirdValue(key).toLowerCase() == 'true',
        onChanged: (value) =>
            setState(() => _lowerThirdValues[key] = value.toString()),
        activeColor: MCEColors.primaryBlue,
      );
    }
    if (type == 'select') {
      final options =
          (variable['options'] as List?)
              ?.whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList() ??
          const <Map<String, dynamic>>[];
      final current = _lowerThirdValue(key);
      return Padding(
        padding: const EdgeInsets.only(bottom: MCESpacing.md),
        child: DropdownButtonFormField<String>(
          value: options.any((item) => item['value']?.toString() == current)
              ? current
              : null,
          items: options
              .map(
                (item) => DropdownMenuItem(
                  value: item['value']?.toString() ?? '',
                  child: Text(
                    item['label']?.toString() ??
                        item['value']?.toString() ??
                        '',
                  ),
                ),
              )
              .toList(),
          onChanged: (value) =>
              setState(() => _lowerThirdValues[key] = value ?? ''),
          decoration: InputDecoration(labelText: label),
        ),
      );
    }
    final controller = _lowerThirdControllers[key] ??= TextEditingController(
      text: _lowerThirdValue(key),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: MCESpacing.md),
      child: TextField(
        controller: controller,
        maxLength: (variable['maxLength'] as num?)?.toInt(),
        maxLines: type == 'list' ? 2 : 1,
        onChanged: (value) => _lowerThirdValues[key] = value,
        decoration: InputDecoration(
          labelText: label,
          hintText:
              variable['placeholder']?.toString() ??
              (type == 'image' ? 'Image URL or asset reference' : null),
          helperText: type == 'list'
              ? 'Separate list items with commas.'
              : null,
        ),
      ),
    );
  }

  Widget _buildCountdownsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader(
          'Countdowns',
          'The same preset countdown cards and controls used by the Dock.',
          onRefresh: _loadCountdowns,
        ),
        if (_countdownError != null) ...[
          SizedBox(height: MCESpacing.md),
          _buildInfoBanner(_countdownError!),
        ],
        SizedBox(height: MCESpacing.md),
        if (_loadingCountdowns)
          Center(
            child: Padding(
              padding: EdgeInsets.all(MCESpacing.xl),
              child: CircularProgressIndicator(),
            ),
          )
        else if (_countdowns.isEmpty)
          _buildEmptyState(
            Icons.timer_outlined,
            'No countdowns',
            'The desktop Dock did not return any countdown presets.',
          )
        else
          ..._countdowns.map(_buildCountdownCard),
        SizedBox(height: MCESpacing.sm),
        _actionButton(
          label: 'Stop & Remove',
          icon: Icons.clear,
          color: MCEColors.danger,
          onPressed: _activeCountdownId == null
              ? null
              : _stopAndRemoveCountdown,
        ),
      ],
    );
  }

  Widget _buildCountdownCard(Map<String, dynamic> countdown) {
    final id = countdown['id']?.toString() ?? '';
    final active = id.isNotEmpty && id == _activeCountdownId;
    final running = _countdownRunning[id] == true;
    final seconds = _remainingFor(countdown);
    final title = _titleFor(countdown);
    final obs = countdown['obs'];
    final autoScene = obs is Map
        ? obs['autoSwitchScene']?.toString() ?? ''
        : '';
    final autoEnabled =
        obs is Map && obs['autoSwitchEnabled'] == true && autoScene.isNotEmpty;
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.sm),
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: active
            ? MCEColors.success.withValues(alpha: 0.08)
            : MCEColors.surface,
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(
          color: active
              ? MCEColors.success.withValues(alpha: 0.55)
              : MCEColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: MCETypography.bodyBold,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (active)
                _statusPill(
                  running ? 'LIVE' : 'PAUSED',
                  running ? MCEColors.success : MCEColors.warning,
                )
              else
                Text(
                  '${_durationSeconds(countdown) ~/ 60} min',
                  style: MCETypography.caption,
                ),
              PopupMenuButton<String>(
                tooltip: 'Countdown actions',
                icon: Icon(Icons.more_vert, size: 19),
                onSelected: (value) {
                  if (value == 'edit')
                    unawaited(_editCountdownTitle(countdown));
                  if (value == 'reset') _resetCountdown(countdown);
                },
                itemBuilder: (context) => [
                  PopupMenuItem(
                    value: 'edit',
                    enabled: !running,
                    child: Text('Edit title'),
                  ),
                  PopupMenuItem(value: 'reset', child: Text('Reset')),
                ],
              ),
            ],
          ),
          if (autoEnabled) ...[
            SizedBox(height: MCESpacing.xs),
            Text(
              'Switches to $autoScene automatically',
              style: MCETypography.caption.copyWith(
                color: MCEColors.primaryBlue,
              ),
            ),
          ],
          SizedBox(height: MCESpacing.md),
          Center(
            child: Text(
              _formatClock(seconds),
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                letterSpacing: 2,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
          SizedBox(height: MCESpacing.md),
          if (!running)
            Row(
              children: [
                _roundAction('-10m', () => _adjustCountdown(countdown, -600)),
                _roundAction('-1m', () => _adjustCountdown(countdown, -60)),
                Spacer(),
                _roundAction('+1m', () => _adjustCountdown(countdown, 60)),
                _roundAction('+10m', () => _adjustCountdown(countdown, 600)),
              ],
            ),
          SizedBox(height: MCESpacing.md),
          Row(
            children: [
              Expanded(
                child: _actionButton(
                  label: active
                      ? (running ? 'Pause' : 'Resume')
                      : 'Push & Start',
                  icon: active && running ? Icons.pause : Icons.play_arrow,
                  color: active ? MCEColors.warning : MCEColors.success,
                  onPressed: _canSend
                      ? () => active
                            ? (running
                                  ? _pauseCountdown(countdown)
                                  : _resumeCountdown(countdown))
                            : _showCountdown(countdown)
                      : null,
                ),
              ),
              if (active) ...[
                SizedBox(width: MCESpacing.sm),
                Expanded(
                  child: _actionButton(
                    label: 'Stop',
                    icon: Icons.stop,
                    color: MCEColors.danger,
                    onPressed: _stopAndRemoveCountdown,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _roundAction(String label, VoidCallback onPressed) => Padding(
    padding: const EdgeInsets.only(right: MCESpacing.xs),
    child: OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: Size(44, 36),
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      child: Text(label, style: TextStyle(fontSize: 10)),
    ),
  );

  Widget _sectionHeader(
    String title,
    String subtitle, {
    Future<void> Function()? onRefresh,
  }) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: MCETypography.sectionTitle),
            SizedBox(height: MCESpacing.xs),
            Text(subtitle, style: MCETypography.sectionSubtitle),
          ],
        ),
      ),
      if (onRefresh != null)
        IconButton(
          tooltip: 'Refresh',
          onPressed: onRefresh,
          icon: Icon(Icons.refresh),
          color: MCEColors.textSecondary,
        ),
    ],
  );

  Widget _panel({required Widget child}) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(MCESpacing.md),
    decoration: BoxDecoration(
      color: MCEColors.surface,
      borderRadius: BorderRadius.circular(MCERadius.md),
      border: Border.all(color: MCEColors.border),
    ),
    child: child,
  );

  Widget _fieldLabel(String label) => Text(
    label.toUpperCase(),
    style: MCETypography.tiny.copyWith(color: MCEColors.textSecondary),
  );

  Widget _buildInfoBanner(String message) => Container(
    padding: const EdgeInsets.all(MCESpacing.md),
    decoration: BoxDecoration(
      color: MCEColors.primaryBlue.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(MCERadius.md),
      border: Border.all(color: MCEColors.primaryBlue.withValues(alpha: 0.35)),
    ),
    child: Row(
      children: [
        Icon(Icons.info_outline, color: MCEColors.primaryBlue),
        SizedBox(width: MCESpacing.sm),
        Expanded(child: Text(message, style: MCETypography.caption)),
      ],
    ),
  );

  Widget _buildLivePreview(String label, String text) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(MCESpacing.md),
    decoration: BoxDecoration(
      color: MCEColors.success.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(MCERadius.md),
      border: Border.all(color: MCEColors.success.withValues(alpha: 0.35)),
    ),
    child: Row(
      children: [
        Icon(Icons.circle, size: 9, color: MCEColors.success),
        SizedBox(width: MCESpacing.sm),
        Expanded(
          child: Text(
            '$label · $text',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: MCETypography.bodyBold,
          ),
        ),
      ],
    ),
  );

  Widget _buildEmptyState(IconData icon, String title, String subtitle) =>
      Container(
        padding: const EdgeInsets.all(MCESpacing.xxl),
        decoration: BoxDecoration(
          color: MCEColors.surface,
          borderRadius: BorderRadius.circular(MCERadius.md),
          border: Border.all(color: MCEColors.border),
        ),
        child: Column(
          children: [
            Icon(icon, size: 36, color: MCEColors.textTertiary),
            SizedBox(height: MCESpacing.md),
            Text(title, style: MCETypography.bodyBold),
            SizedBox(height: MCESpacing.xs),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: MCETypography.caption,
            ),
          ],
        ),
      );

  Widget _actionButton({
    required String label,
    required IconData icon,
    required Color color,
    required VoidCallback? onPressed,
  }) => SizedBox(
    height: 46,
    child: OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 17),
      label: Text(label, overflow: TextOverflow.ellipsis),
      style: OutlinedButton.styleFrom(
        foregroundColor: onPressed == null ? MCEColors.textTertiary : color,
        side: BorderSide(
          color: onPressed == null
              ? MCEColors.border
              : color.withValues(alpha: 0.55),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
    ),
  );

  Widget _statusPill(String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.18),
      borderRadius: BorderRadius.circular(MCERadius.sm),
    ),
    child: Text(
      label,
      style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w800),
    ),
  );

  List<Map<String, dynamic>> _themeVariables(Map<String, dynamic>? theme) {
    final raw = theme?['variables'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  String _lowerThirdValue(String key) => _lowerThirdValues[key] ?? '';

  String _firstLowerThirdValue(Map<String, String> values, List<String> hints) {
    for (final entry in values.entries) {
      if (hints.any(entry.key.toLowerCase().contains) &&
          entry.value.trim().isNotEmpty)
        return entry.value.trim();
    }
    return '';
  }

  int _durationSeconds(Map<String, dynamic> countdown) {
    final timer = countdown['timer'];
    return timer is Map && timer['durationSeconds'] is num
        ? (timer['durationSeconds'] as num).round()
        : 0;
  }

  int _remainingFor(Map<String, dynamic> countdown) =>
      _countdownRemaining[countdown['id']?.toString() ?? ''] ??
      _durationSeconds(countdown);

  String _titleFor(Map<String, dynamic> countdown) =>
      _countdownTitles[countdown['id']?.toString() ?? ''] ??
      countdown['title']?.toString() ??
      'Countdown';

  Map<String, dynamic> _countdownConfig(
    Map<String, dynamic> countdown,
    int seconds,
  ) {
    final next = Map<String, dynamic>.from(countdown);
    final timer = countdown['timer'];
    next['timer'] = timer is Map
        ? {...Map<String, dynamic>.from(timer), 'durationSeconds': seconds}
        : {'durationSeconds': seconds};
    next['title'] = _titleFor(countdown);
    next['updatedAt'] = DateTime.now().toIso8601String();
    return next;
  }

  String _formatClock(int seconds) {
    final safe = seconds.clamp(0, 24 * 60 * 60);
    final hours = safe ~/ 3600;
    final minutes = (safe % 3600) ~/ 60;
    final remainder = safe % 60;
    if (hours > 0)
      return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${remainder.toString().padLeft(2, '0')}';
    return '${minutes.toString().padLeft(2, '0')}:${remainder.toString().padLeft(2, '0')}';
  }

  void _showMessage(String message, {bool danger = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: danger ? MCEColors.danger : MCEColors.elevated,
      ),
    );
  }
}

class _TickerMessage {
  final String id;
  final String text;
  final bool active;

  const _TickerMessage({
    required this.id,
    required this.text,
    required this.active,
  });

  factory _TickerMessage.fromJson(Map<String, dynamic> json) => _TickerMessage(
    id: json['id']?.toString() ?? '',
    text: json['text']?.toString() ?? '',
    active: json['active'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {'id': id, 'text': text, 'active': active};

  _TickerMessage copyWith({String? text, bool? active}) => _TickerMessage(
    id: id,
    text: text ?? this.text,
    active: active ?? this.active,
  );
}
