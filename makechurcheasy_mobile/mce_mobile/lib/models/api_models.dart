import 'package:flutter/material.dart';

class APIScene {
  final String id;
  final String name;
  final String? status; // 'preview', 'live', null

  const APIScene({required this.id, required this.name, this.status});

  factory APIScene.fromJson(Map<String, dynamic> json) {
    return APIScene(
      id: json['id'] as String,
      name: json['name'] as String,
      status: json['status'] as String?,
    );
  }
}

class APIBibleVerse {
  final String reference;
  final String text;
  final String? book;
  final int? chapter;
  final int? verse;

  const APIBibleVerse({
    required this.reference,
    required this.text,
    this.book,
    this.chapter,
    this.verse,
  });

  factory APIBibleVerse.fromJson(Map<String, dynamic> json) {
    return APIBibleVerse(
      reference: json['reference'] as String,
      text: json['text'] as String,
      book: json['book'] as String?,
      chapter: json['chapter'] as int?,
      verse: json['verse'] as int?,
    );
  }
}

class APISong {
  final String id;
  final String title;
  final String? artist;
  final int? slideCount;
  final String? currentSlide;

  const APISong({
    required this.id,
    required this.title,
    this.artist,
    this.slideCount,
    this.currentSlide,
  });

  factory APISong.fromJson(Map<String, dynamic> json) {
    return APISong(
      id: json['id'] as String,
      title: json['title'] as String,
      artist: json['artist'] as String?,
      slideCount: json['slideCount'] as int?,
      currentSlide: json['currentSlide'] as String?,
    );
  }
}

class APISongSlide {
  final int number;
  final String text;

  const APISongSlide({required this.number, required this.text});

  factory APISongSlide.fromJson(Map<String, dynamic> json) {
    return APISongSlide(
      number: json['number'] as int,
      text: json['text'] as String,
    );
  }
}

class APIMediaItem {
  final String id;
  final String name;
  final String type; // 'image', 'video', 'animation'
  final String? thumbnailUrl;
  final String? fileUrl;

  const APIMediaItem({
    required this.id,
    required this.name,
    required this.type,
    this.thumbnailUrl,
    this.fileUrl,
  });

  factory APIMediaItem.fromJson(Map<String, dynamic> json) {
    return APIMediaItem(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      fileUrl: json['fileUrl'] as String?,
    );
  }
}

class APILowerThird {
  final String id;
  final String title;
  final String? subtitle;
  final bool active;

  const APILowerThird({
    required this.id,
    required this.title,
    this.subtitle,
    this.active = false,
  });

  factory APILowerThird.fromJson(Map<String, dynamic> json) {
    return APILowerThird(
      id: json['id'] as String,
      title: json['title'] as String,
      subtitle: json['subtitle'] as String?,
      active: json['active'] as bool? ?? false,
    );
  }
}

class APITickerItem {
  final String id;
  final String text;
  final bool active;

  const APITickerItem({
    required this.id,
    required this.text,
    this.active = false,
  });

  factory APITickerItem.fromJson(Map<String, dynamic> json) {
    return APITickerItem(
      id: json['id'] as String,
      text: json['text'] as String,
      active: json['active'] as bool? ?? false,
    );
  }
}

class APIMacro {
  final String id;
  final String name;
  final String? icon;

  const APIMacro({required this.id, required this.name, this.icon});

  factory APIMacro.fromJson(Map<String, dynamic> json) {
    return APIMacro(
      id: json['id'] as String,
      name: json['name'] as String,
      icon: json['icon'] as String?,
    );
  }
}

// --- Automation Trigger Types ---

enum AutomationTriggerType {
  countdownFinished,
  sceneChanged,
  obsDisconnected,
  obsConnected,
  streamStarted,
  streamStopped,
  recordingStarted,
  recordingStopped,
  timeReached,
  manual;

  String get label => switch (this) {
        AutomationTriggerType.countdownFinished => 'Countdown Finished',
        AutomationTriggerType.sceneChanged => 'Scene Changed',
        AutomationTriggerType.obsDisconnected => 'OBS Disconnected',
        AutomationTriggerType.obsConnected => 'OBS Connected',
        AutomationTriggerType.streamStarted => 'Stream Started',
        AutomationTriggerType.streamStopped => 'Stream Stopped',
        AutomationTriggerType.recordingStarted => 'Recording Started',
        AutomationTriggerType.recordingStopped => 'Recording Stopped',
        AutomationTriggerType.timeReached => 'Time Reached',
        AutomationTriggerType.manual => 'Manual',
      };

  IconData get icon => switch (this) {
        AutomationTriggerType.countdownFinished => Icons.timer_off_outlined,
        AutomationTriggerType.sceneChanged => Icons.dashboard_outlined,
        AutomationTriggerType.obsDisconnected => Icons.link_off,
        AutomationTriggerType.obsConnected => Icons.link,
        AutomationTriggerType.streamStarted => Icons.cell_tower,
        AutomationTriggerType.streamStopped => Icons.cell_tower_outlined,
        AutomationTriggerType.recordingStarted => Icons.fiber_manual_record,
        AutomationTriggerType.recordingStopped => Icons.stop_circle_outlined,
        AutomationTriggerType.timeReached => Icons.schedule,
        AutomationTriggerType.manual => Icons.touch_app,
      };

  String get description => switch (this) {
        AutomationTriggerType.countdownFinished =>
          'Fires when a countdown reaches zero',
        AutomationTriggerType.sceneChanged =>
          'Fires when a specific scene goes live',
        AutomationTriggerType.obsDisconnected =>
          'Fires when OBS loses connection',
        AutomationTriggerType.obsConnected => 'Fires when OBS reconnects',
        AutomationTriggerType.streamStarted => 'Fires when streaming starts',
        AutomationTriggerType.streamStopped => 'Fires when streaming stops',
        AutomationTriggerType.recordingStarted =>
          'Fires when recording starts',
        AutomationTriggerType.recordingStopped =>
          'Fires when recording stops',
        AutomationTriggerType.timeReached => 'Fires at a specific time',
        AutomationTriggerType.manual => 'Only fires when triggered manually',
      };

  factory AutomationTriggerType.fromString(String value) {
    return AutomationTriggerType.values.firstWhere(
      (e) => e.name == value,
      orElse: () => AutomationTriggerType.manual,
    );
  }
}

class AutomationTrigger {
  final AutomationTriggerType type;
  final Map<String, dynamic>? params;

  const AutomationTrigger({required this.type, this.params});

  factory AutomationTrigger.fromJson(Map<String, dynamic> json) {
    return AutomationTrigger(
      type: AutomationTriggerType.fromString(json['type'] as String? ?? ''),
      params: json['params'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type.name,
        if (params != null) 'params': params,
      };
}

// --- Automation Condition Types ---

enum AutomationConditionType {
  sceneEquals,
  sceneNotEquals,
  streaming,
  notStreaming,
  recording,
  notRecording,
  timeBetween;

  String get label => switch (this) {
        AutomationConditionType.sceneEquals => 'Current Scene =',
        AutomationConditionType.sceneNotEquals => 'Current Scene ≠',
        AutomationConditionType.streaming => 'Is Streaming',
        AutomationConditionType.notStreaming => 'Not Streaming',
        AutomationConditionType.recording => 'Is Recording',
        AutomationConditionType.notRecording => 'Not Recording',
        AutomationConditionType.timeBetween => 'Time Between',
      };

  factory AutomationConditionType.fromString(String value) {
    return AutomationConditionType.values.firstWhere(
      (e) => e.name == value,
      orElse: () => AutomationConditionType.sceneEquals,
    );
  }
}

class AutomationCondition {
  final AutomationConditionType type;
  final Map<String, dynamic>? params;

  const AutomationCondition({required this.type, this.params});

  factory AutomationCondition.fromJson(Map<String, dynamic> json) {
    return AutomationCondition(
      type: AutomationConditionType.fromString(
        json['type'] as String? ?? '',
      ),
      params: json['params'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type.name,
        if (params != null) 'params': params,
      };

  String describe() => switch (type) {
        AutomationConditionType.sceneEquals =>
          'Scene = ${params?['sceneName'] ?? '?'}',
        AutomationConditionType.sceneNotEquals =>
          'Scene ≠ ${params?['sceneName'] ?? '?'}',
        AutomationConditionType.streaming => 'Is streaming',
        AutomationConditionType.notStreaming => 'Not streaming',
        AutomationConditionType.recording => 'Is recording',
        AutomationConditionType.notRecording => 'Not recording',
        AutomationConditionType.timeBetween =>
          '${params?['start'] ?? '?'} — ${params?['end'] ?? '?'}',
      };
}

// --- Automation Action Types ---

enum AutomationActionType {
  switchScene,
  startStreaming,
  stopStreaming,
  startRecording,
  stopRecording,
  showBRB,
  hideBRB,
  showSafeMode,
  hideSafeMode,
  showLowerThird,
  hideLowerThird,
  showCountdown,
  hideCountdown,
  playMedia,
  executeMacro;

  String get label => switch (this) {
        AutomationActionType.switchScene => 'Switch Scene',
        AutomationActionType.startStreaming => 'Start Streaming',
        AutomationActionType.stopStreaming => 'Stop Streaming',
        AutomationActionType.startRecording => 'Start Recording',
        AutomationActionType.stopRecording => 'Stop Recording',
        AutomationActionType.showBRB => 'Show BRB',
        AutomationActionType.hideBRB => 'Hide BRB',
        AutomationActionType.showSafeMode => 'Show Safe Mode',
        AutomationActionType.hideSafeMode => 'Hide Safe Mode',
        AutomationActionType.showLowerThird => 'Show Lower Third',
        AutomationActionType.hideLowerThird => 'Hide Lower Third',
        AutomationActionType.showCountdown => 'Show Countdown',
        AutomationActionType.hideCountdown => 'Hide Countdown',
        AutomationActionType.playMedia => 'Play Media',
        AutomationActionType.executeMacro => 'Execute Macro',
      };

  IconData get icon => switch (this) {
        AutomationActionType.switchScene => Icons.dashboard_outlined,
        AutomationActionType.startStreaming => Icons.cell_tower,
        AutomationActionType.stopStreaming => Icons.cell_tower_outlined,
        AutomationActionType.startRecording => Icons.fiber_manual_record,
        AutomationActionType.stopRecording => Icons.stop_circle_outlined,
        AutomationActionType.showBRB => Icons.pause_circle_outlined,
        AutomationActionType.hideBRB => Icons.play_circle_outlined,
        AutomationActionType.showSafeMode => Icons.shield_outlined,
        AutomationActionType.hideSafeMode => Icons.shield,
        AutomationActionType.showLowerThird => Icons.short_text,
        AutomationActionType.hideLowerThird => Icons.short_text_outlined,
        AutomationActionType.showCountdown => Icons.timer,
        AutomationActionType.hideCountdown => Icons.timer_outlined,
        AutomationActionType.playMedia => Icons.play_arrow_outlined,
        AutomationActionType.executeMacro => Icons.bolt,
      };

  bool get needsParam => switch (this) {
        AutomationActionType.switchScene ||
        AutomationActionType.showLowerThird ||
        AutomationActionType.hideLowerThird ||
        AutomationActionType.playMedia ||
        AutomationActionType.executeMacro =>
          true,
        _ => false,
      };

  factory AutomationActionType.fromString(String value) {
    return AutomationActionType.values.firstWhere(
      (e) => e.name == value,
      orElse: () => AutomationActionType.switchScene,
    );
  }
}

class AutomationAction {
  final AutomationActionType type;
  final Map<String, dynamic>? params;

  const AutomationAction({required this.type, this.params});

  factory AutomationAction.fromJson(Map<String, dynamic> json) {
    return AutomationAction(
      type: AutomationActionType.fromString(
        json['type'] as String? ?? '',
      ),
      params: json['params'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type.name,
        if (params != null) 'params': params,
      };

  String describe() => switch (type) {
        AutomationActionType.switchScene =>
          'Switch → ${params?['sceneName'] ?? params?['sceneId'] ?? '?'}',
        AutomationActionType.showLowerThird =>
          'Show "${params?['title'] ?? '?'}"',
        AutomationActionType.hideLowerThird =>
          'Hide "${params?['title'] ?? '?'}"',
        AutomationActionType.playMedia =>
          'Play ${params?['mediaName'] ?? params?['mediaId'] ?? '?'}',
        AutomationActionType.executeMacro =>
          'Run "${params?['macroName'] ?? params?['macroId'] ?? '?'}"',
        _ => type.label,
      };
}

// --- Full Automation Rule ---

class AutomationRule {
  final String id;
  final String name;
  final bool enabled;
  final AutomationTrigger trigger;
  final List<AutomationCondition> conditions;
  final List<AutomationAction> actions;
  final DateTime? createdAt;
  final DateTime? lastExecuted;

  const AutomationRule({
    required this.id,
    required this.name,
    this.enabled = true,
    required this.trigger,
    this.conditions = const [],
    this.actions = const [],
    this.createdAt,
    this.lastExecuted,
  });

  factory AutomationRule.fromJson(Map<String, dynamic> json) {
    return AutomationRule(
      id: json['id'] as String,
      name: json['name'] as String,
      enabled: json['enabled'] as bool? ?? true,
      trigger: AutomationTrigger.fromJson(
        json['trigger'] as Map<String, dynamic>? ?? {},
      ),
      conditions: (json['conditions'] as List<dynamic>?)
              ?.map((e) =>
                  AutomationCondition.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      actions: (json['actions'] as List<dynamic>?)
              ?.map((e) =>
                  AutomationAction.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'] as String)
          : null,
      lastExecuted: json['lastExecuted'] != null
          ? DateTime.parse(json['lastExecuted'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'enabled': enabled,
        'trigger': trigger.toJson(),
        'conditions': conditions.map((c) => c.toJson()).toList(),
        'actions': actions.map((a) => a.toJson()).toList(),
      };

  AutomationRule copyWith({
    String? id,
    String? name,
    bool? enabled,
    AutomationTrigger? trigger,
    List<AutomationCondition>? conditions,
    List<AutomationAction>? actions,
  }) {
    return AutomationRule(
      id: id ?? this.id,
      name: name ?? this.name,
      enabled: enabled ?? this.enabled,
      trigger: trigger ?? this.trigger,
      conditions: conditions ?? this.conditions,
      actions: actions ?? this.actions,
      createdAt: createdAt,
      lastExecuted: lastExecuted,
    );
  }
}

// --- Automation Schedule ---

class AutomationSchedule {
  final String id;
  final String name;
  final bool enabled;
  final String day; // 'Sunday', 'Monday', etc. or 'Everyday'
  final String time; // '08:55'
  final AutomationAction action;
  final DateTime? lastExecuted;

  const AutomationSchedule({
    required this.id,
    required this.name,
    this.enabled = true,
    required this.day,
    required this.time,
    required this.action,
    this.lastExecuted,
  });

  factory AutomationSchedule.fromJson(Map<String, dynamic> json) {
    return AutomationSchedule(
      id: json['id'] as String,
      name: json['name'] as String,
      enabled: json['enabled'] as bool? ?? true,
      day: json['day'] as String,
      time: json['time'] as String,
      action: AutomationAction.fromJson(
        json['action'] as Map<String, dynamic>? ?? {},
      ),
      lastExecuted: json['lastExecuted'] != null
          ? DateTime.parse(json['lastExecuted'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'enabled': enabled,
        'day': day,
        'time': time,
        'action': action.toJson(),
      };
}

// --- Automation Log ---

enum AutomationLogLevel {
  success,
  error,
  skipped;

  factory AutomationLogLevel.fromString(String value) {
    return AutomationLogLevel.values.firstWhere(
      (e) => e.name == value,
      orElse: () => AutomationLogLevel.success,
    );
  }
}

class AutomationLogEntry {
  final String id;
  final String ruleId;
  final String ruleName;
  final AutomationLogLevel level;
  final String message;
  final DateTime timestamp;

  const AutomationLogEntry({
    required this.id,
    required this.ruleId,
    required this.ruleName,
    required this.level,
    required this.message,
    required this.timestamp,
  });

  factory AutomationLogEntry.fromJson(Map<String, dynamic> json) {
    return AutomationLogEntry(
      id: json['id'] as String,
      ruleId: json['ruleId'] as String,
      ruleName: json['ruleName'] as String,
      level: AutomationLogLevel.fromString(json['level'] as String? ?? ''),
      message: json['message'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
    );
  }
}

class APIAutomationRule {
  final String id;
  final String title;
  final String description;
  final bool enabled;

  const APIAutomationRule({
    required this.id,
    required this.title,
    required this.description,
    this.enabled = true,
  });

  factory APIAutomationRule.fromJson(Map<String, dynamic> json) {
    return APIAutomationRule(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String,
      enabled: json['enabled'] as bool? ?? true,
    );
  }
}

class OBSStatus {
  final bool connected;
  final String? version;
  final String? sceneName;
  final bool streaming;
  final bool recording;
  final bool micActive;

  const OBSStatus({
    required this.connected,
    this.version,
    this.sceneName,
    this.streaming = false,
    this.recording = false,
    this.micActive = false,
  });

  factory OBSStatus.fromJson(Map<String, dynamic> json) {
    return OBSStatus(
      connected: json['connected'] as bool? ?? false,
      version: json['version'] as String?,
      sceneName: json['sceneName'] as String?,
      streaming: json['streaming'] as bool? ?? false,
      recording: json['recording'] as bool? ?? false,
      micActive: json['micActive'] as bool? ?? false,
    );
  }
}

class DesktopAppState {
  final OBSStatus obs;
  final APIScene? currentScene;
  final List<APIScene> scenes;

  const DesktopAppState({
    required this.obs,
    this.currentScene,
    this.scenes = const [],
  });

  factory DesktopAppState.fromJson(Map<String, dynamic> json) {
    return DesktopAppState(
      obs: OBSStatus.fromJson(json['obs'] as Map<String, dynamic>? ?? {}),
      currentScene: json['currentScene'] != null
          ? APIScene.fromJson(json['currentScene'] as Map<String, dynamic>)
          : null,
      scenes: (json['scenes'] as List<dynamic>?)
              ?.map((e) => APIScene.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
