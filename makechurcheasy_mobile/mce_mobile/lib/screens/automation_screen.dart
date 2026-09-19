import 'dart:async';

import 'package:flutter/material.dart';

import '../services/mce_provider.dart';
import '../theme/mce_theme.dart';

/// Desktop-owned macros and automations.
///
/// The phone is a remote editor/trigger. The desktop keeps the saved data and
/// runs enabled rules even while this screen is closed or the phone is away.
class AutomationScreen extends StatefulWidget {
  final int initialTab;
  final String? initialSceneName;

  const AutomationScreen({
    super.key,
    this.initialTab = 0,
    this.initialSceneName,
  });

  @override
  State<AutomationScreen> createState() => _AutomationScreenState();
}

class _AutomationScreenState extends State<AutomationScreen> {
  late int _currentTab;
  List<Map<String, dynamic>> _macros = const [];
  List<Map<String, dynamic>> _rules = const [];
  List<Map<String, dynamic>> _logs = const [];
  bool _loading = true;
  String? _error;

  static const _tabs = ['Macros', 'Rules', 'History'];

  @override
  void initState() {
    super.initState();
    _currentTab = widget.initialTab < 0
        ? 0
        : widget.initialTab > 2
        ? 2
        : widget.initialTab;
    _loadAll();
  }

  Future<void> _loadAll() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final webSocket = context.webSocketService;
    if (!webSocket.isAuthenticated) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Connect to the desktop to manage automations.';
      });
      return;
    }

    try {
      final results = await Future.wait<List<Map<String, dynamic>>>([
        webSocket.getMacros(),
        webSocket.getAutomationRules(),
        webSocket.getAutomationLogs(),
      ]);
      if (!mounted) return;
      setState(() {
        _macros = results[0];
        _rules = results[1];
        _logs = results[2];
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Automation data is unavailable: $error';
      });
    }
  }

  Future<void> _executeMacro(Map<String, dynamic> macro) async {
    final name = macro['name']?.toString() ?? 'Macro';
    try {
      await context.webSocketService.executeMacro(macro['id'].toString());
      if (!mounted) return;
      _showMessage('$name is running on the desktop.');
      unawaited(_loadAll());
    } catch (error) {
      if (mounted) _showMessage('Could not run $name: $error', danger: true);
    }
  }

  Future<void> _toggleRule(Map<String, dynamic> rule) async {
    final id = rule['id']?.toString();
    if (id == null || id.isEmpty) return;
    try {
      await context.webSocketService.toggleAutomationRule(
        id,
        rule['enabled'] != true,
      );
      await _loadAll();
    } catch (error) {
      if (mounted)
        _showMessage('Could not update automation: $error', danger: true);
    }
  }

  Future<void> _deleteRule(Map<String, dynamic> rule) async {
    final name = rule['name']?.toString() ?? 'this automation';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: MCEColors.elevated,
        title: Text('Delete automation'),
        content: Text('Delete “$name”?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text('Delete', style: TextStyle(color: MCEColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await context.webSocketService.deleteAutomationRule(
        rule['id'].toString(),
      );
      await _loadAll();
    } catch (error) {
      if (mounted)
        _showMessage('Could not delete automation: $error', danger: true);
    }
  }

  Future<void> _showMacroBuilder() async {
    final targetScene = widget.initialSceneName?.trim();
    final nameController = TextEditingController(
      text: targetScene == null || targetScene.isEmpty
          ? ''
          : 'Show $targetScene',
    );
    final sceneController = TextEditingController(text: targetScene ?? '');
    var selectedAction = 'switch_scene';
    final steps = <Map<String, dynamic>>[
      if (targetScene != null && targetScene.isNotEmpty)
        {
          'id': 'step-${DateTime.now().microsecondsSinceEpoch}',
          'type': 'switch_scene',
          'scene_name': targetScene,
        },
    ];

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: MCEColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final needsScene =
              selectedAction == 'switch_scene' ||
              selectedAction == 'set_preview_scene';
          return Padding(
            padding: EdgeInsets.fromLTRB(
              MCESpacing.xxl,
              MCESpacing.xxl,
              MCESpacing.xxl,
              MediaQuery.of(context).viewInsets.bottom + MCESpacing.xxl,
            ),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.playlist_play, color: MCEColors.primaryBlue),
                      SizedBox(width: MCESpacing.sm),
                      Expanded(
                        child: Text(
                          'New macro',
                          style: MCETypography.sectionTitle,
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: Icon(Icons.close),
                      ),
                    ],
                  ),
                  SizedBox(height: MCESpacing.sm),
                  Text(
                    targetScene == null || targetScene.isEmpty
                        ? 'A macro is an ordered set of OBS actions. Add a short sequence, then run it from the phone or desktop.'
                        : 'This macro starts by switching to $targetScene. Add any other OBS actions, then run it from the phone or desktop.',
                    style: MCETypography.caption.copyWith(
                      color: MCEColors.textSecondary,
                    ),
                  ),
                  SizedBox(height: MCESpacing.lg),
                  _field(nameController, 'Macro name', 'e.g. Start service'),
                  SizedBox(height: MCESpacing.md),
                  DropdownButtonFormField<String>(
                    value: selectedAction,
                    dropdownColor: MCEColors.elevated,
                    decoration: _inputDecoration('Add an action'),
                    items: const [
                      DropdownMenuItem(
                        value: 'switch_scene',
                        child: Text('Switch scene'),
                      ),
                      DropdownMenuItem(
                        value: 'set_preview_scene',
                        child: Text('Set preview scene'),
                      ),
                      DropdownMenuItem(
                        value: 'start_stream',
                        child: Text('Start stream'),
                      ),
                      DropdownMenuItem(
                        value: 'stop_stream',
                        child: Text('Stop stream'),
                      ),
                      DropdownMenuItem(
                        value: 'start_recording',
                        child: Text('Start recording'),
                      ),
                      DropdownMenuItem(
                        value: 'stop_recording',
                        child: Text('Stop recording'),
                      ),
                      DropdownMenuItem(
                        value: 'toggle_mic',
                        child: Text('Toggle microphone'),
                      ),
                      DropdownMenuItem(
                        value: 'enable_studio_mode',
                        child: Text('Enable Studio Mode'),
                      ),
                      DropdownMenuItem(
                        value: 'disable_studio_mode',
                        child: Text('Disable Studio Mode'),
                      ),
                      DropdownMenuItem(
                        value: 'delay',
                        child: Text('Wait before next step'),
                      ),
                    ],
                    onChanged: (value) => setSheetState(
                      () => selectedAction = value ?? selectedAction,
                    ),
                  ),
                  if (needsScene) ...[
                    SizedBox(height: MCESpacing.md),
                    _field(
                      sceneController,
                      'Scene name',
                      'Exact OBS scene name',
                    ),
                  ],
                  if (selectedAction == 'delay') ...[
                    SizedBox(height: MCESpacing.md),
                    _field(sceneController, 'Wait in milliseconds', '1000'),
                  ],
                  SizedBox(height: MCESpacing.md),
                  FilledButton.tonalIcon(
                    onPressed: () {
                      final step = <String, dynamic>{
                        'id': 'step-${DateTime.now().microsecondsSinceEpoch}',
                        'type': selectedAction,
                      };
                      if (needsScene &&
                          sceneController.text.trim().isNotEmpty) {
                        step['scene_name'] = sceneController.text.trim();
                      }
                      if (selectedAction == 'delay') {
                        step['delay_ms'] =
                            int.tryParse(sceneController.text.trim()) ?? 1000;
                      }
                      steps.add(step);
                      sceneController.clear();
                      setSheetState(() {});
                    },
                    icon: Icon(Icons.add),
                    label: Text('Add step'),
                  ),
                  if (steps.isNotEmpty) ...[
                    SizedBox(height: MCESpacing.lg),
                    Text('Steps', style: MCETypography.bodyBold),
                    SizedBox(height: MCESpacing.sm),
                    for (var i = 0; i < steps.length; i++)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          radius: 14,
                          backgroundColor: MCEColors.primaryBlue.withValues(
                            alpha: 0.14,
                          ),
                          child: Text(
                            '${i + 1}',
                            style: MCETypography.tiny.copyWith(
                              color: MCEColors.primaryBlue,
                            ),
                          ),
                        ),
                        title: Text(
                          _stepLabel(steps[i]),
                          style: MCETypography.body,
                        ),
                        trailing: IconButton(
                          tooltip: 'Remove step',
                          onPressed: () =>
                              setSheetState(() => steps.removeAt(i)),
                          icon: Icon(Icons.close, size: 18),
                        ),
                      ),
                  ],
                  SizedBox(height: MCESpacing.xl),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton(
                      onPressed: steps.isEmpty
                          ? null
                          : () async {
                              if (nameController.text.trim().isEmpty) {
                                _showMessage(
                                  'Enter a name for the macro.',
                                  danger: true,
                                );
                                return;
                              }
                              await context.webSocketService.saveMacro({
                                'name': nameController.text.trim(),
                                'icon': 'playlist_play',
                                'color': 'blue',
                                'steps': steps,
                              });
                              if (sheetContext.mounted)
                                Navigator.pop(sheetContext);
                              if (mounted) {
                                await _loadAll();
                                _showMessage('Macro saved on the desktop.');
                              }
                            },
                      child: Text('Save macro'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    nameController.dispose();
    sceneController.dispose();
  }

  Future<void> _showAutomationBuilder() async {
    if (_macros.isEmpty) {
      _showMessage(
        'Create a macro first, then attach it to an automation.',
        danger: true,
      );
      setState(() => _currentTab = 0);
      return;
    }
    final nameController = TextEditingController();
    var trigger = 'scene_changed';
    var selectedMacro = _macros.first['id'].toString();
    final targetController = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: MCEColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            MCESpacing.xxl,
            MCESpacing.xxl,
            MCESpacing.xxl,
            MediaQuery.of(context).viewInsets.bottom + MCESpacing.xxl,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.bolt, color: MCEColors.primaryBlue),
                    SizedBox(width: MCESpacing.sm),
                    Expanded(
                      child: Text(
                        'New automation',
                        style: MCETypography.sectionTitle,
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(sheetContext),
                      icon: Icon(Icons.close),
                    ),
                  ],
                ),
                SizedBox(height: MCESpacing.sm),
                Text(
                  'When this happens on the desktop, run a saved macro automatically.',
                  style: MCETypography.caption.copyWith(
                    color: MCEColors.textSecondary,
                  ),
                ),
                SizedBox(height: MCESpacing.lg),
                _field(
                  nameController,
                  'Automation name',
                  'e.g. Start recording when service begins',
                ),
                SizedBox(height: MCESpacing.md),
                DropdownButtonFormField<String>(
                  value: trigger,
                  dropdownColor: MCEColors.elevated,
                  decoration: _inputDecoration('When'),
                  items: const [
                    DropdownMenuItem(
                      value: 'scene_changed',
                      child: Text('A scene changes'),
                    ),
                    DropdownMenuItem(
                      value: 'stream_started',
                      child: Text('Streaming starts'),
                    ),
                    DropdownMenuItem(
                      value: 'stream_stopped',
                      child: Text('Streaming stops'),
                    ),
                    DropdownMenuItem(
                      value: 'recording_started',
                      child: Text('Recording starts'),
                    ),
                    DropdownMenuItem(
                      value: 'recording_stopped',
                      child: Text('Recording stops'),
                    ),
                  ],
                  onChanged: (value) =>
                      setSheetState(() => trigger = value ?? trigger),
                ),
                if (trigger == 'scene_changed') ...[
                  SizedBox(height: MCESpacing.md),
                  _field(
                    targetController,
                    'Optional scene name',
                    'Leave empty for any scene',
                  ),
                ],
                SizedBox(height: MCESpacing.md),
                DropdownButtonFormField<String>(
                  value: selectedMacro,
                  dropdownColor: MCEColors.elevated,
                  decoration: _inputDecoration('Then run'),
                  items: _macros
                      .map(
                        (macro) => DropdownMenuItem(
                          value: macro['id'].toString(),
                          child: Text(macro['name']?.toString() ?? 'Macro'),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setSheetState(
                    () => selectedMacro = value ?? selectedMacro,
                  ),
                ),
                SizedBox(height: MCESpacing.xl),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: () async {
                      if (nameController.text.trim().isEmpty) {
                        _showMessage(
                          'Enter a name for the automation.',
                          danger: true,
                        );
                        return;
                      }
                      await context.webSocketService.saveAutomationRule({
                        'name': nameController.text.trim(),
                        'enabled': true,
                        'trigger': {
                          'type': trigger,
                          if (trigger == 'scene_changed' &&
                              targetController.text.trim().isNotEmpty)
                            'scene_name': targetController.text.trim(),
                        },
                        'actions': [
                          {
                            'id':
                                'action-${DateTime.now().microsecondsSinceEpoch}',
                            'type': 'run_macro',
                            'macro_id': selectedMacro,
                          },
                        ],
                        'cooldown_ms': 30000,
                      });
                      if (sheetContext.mounted) Navigator.pop(sheetContext);
                      if (mounted) {
                        await _loadAll();
                        _showMessage('Automation saved on the desktop.');
                      }
                    },
                    child: Text('Save automation'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    nameController.dispose();
    targetController.dispose();
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: TextStyle(color: MCEColors.textSecondary),
      filled: true,
      fillColor: MCEColors.elevated,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(MCERadius.md),
        borderSide: BorderSide(color: MCEColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(MCERadius.md),
        borderSide: BorderSide(color: MCEColors.border),
      ),
    );
  }

  Widget _field(TextEditingController controller, String label, String hint) {
    return TextField(
      controller: controller,
      style: MCETypography.body,
      decoration: _inputDecoration(label).copyWith(hintText: hint),
    );
  }

  void _showMessage(String message, {bool danger = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: danger ? MCEColors.danger : MCEColors.elevated,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MCEColors.background,
      appBar: AppBar(
        backgroundColor: MCEColors.surface,
        foregroundColor: MCEColors.textPrimary,
        titleSpacing: 0,
        title: Text('Automations & macros', style: MCETypography.bodyBold),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _loadAll,
            icon: Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              MCESpacing.lg,
              MCESpacing.lg,
              MCESpacing.lg,
              MCESpacing.sm,
            ),
            child: Text(
              'Save repeatable OBS actions on the desktop. They keep running even when the phone disconnects.',
              style: MCETypography.caption.copyWith(
                color: MCEColors.textSecondary,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: MCESpacing.lg),
            child: SegmentedButton<int>(
              segments: [
                for (var i = 0; i < _tabs.length; i++)
                  ButtonSegment(value: i, label: Text(_tabs[i])),
              ],
              selected: {_currentTab},
              onSelectionChanged: (selection) =>
                  setState(() => _currentTab = selection.first),
            ),
          ),
          SizedBox(height: MCESpacing.md),
          Expanded(
            child: _loading
                ? Center(child: CircularProgressIndicator())
                : _error != null
                ? _buildError()
                : RefreshIndicator(
                    color: MCEColors.primaryBlue,
                    onRefresh: _loadAll,
                    child: _buildContent(),
                  ),
          ),
        ],
      ),
      floatingActionButton: _error == null && !_loading
          ? FloatingActionButton.extended(
              backgroundColor: MCEColors.primaryBlue,
              foregroundColor: Colors.white,
              onPressed: _currentTab == 0
                  ? _showMacroBuilder
                  : _showAutomationBuilder,
              icon: Icon(Icons.add),
              label: Text(_currentTab == 0 ? 'Macro' : 'Automation'),
            )
          : null,
    );
  }

  Widget _buildContent() {
    return switch (_currentTab) {
      0 => _buildMacros(),
      1 => _buildRules(),
      _ => _buildHistory(),
    };
  }

  Widget _buildMacros() {
    if (_macros.isEmpty) {
      return _emptyState(
        Icons.playlist_play,
        'No macros yet',
        'Create a short ordered sequence of OBS actions.',
      );
    }
    return ListView(
      physics: AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        MCESpacing.lg,
        MCESpacing.sm,
        MCESpacing.lg,
        96,
      ),
      children: [for (final macro in _macros) _macroCard(macro)],
    );
  }

  Widget _macroCard(Map<String, dynamic> macro) {
    final steps =
        (macro['steps'] as List?)
            ?.whereType<Map>()
            .map((step) => Map<String, dynamic>.from(step))
            .toList() ??
        const [];
    return Card(
      color: MCEColors.surface,
      margin: const EdgeInsets.only(bottom: MCESpacing.md),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MCERadius.md),
        side: BorderSide(color: MCEColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(MCESpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(MCESpacing.sm),
                  decoration: BoxDecoration(
                    color: MCEColors.primaryBlue.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(MCERadius.sm),
                  ),
                  child: Icon(
                    Icons.playlist_play,
                    color: MCEColors.primaryBlue,
                  ),
                ),
                SizedBox(width: MCESpacing.md),
                Expanded(
                  child: Text(
                    macro['name']?.toString() ?? 'Macro',
                    style: MCETypography.bodyBold,
                  ),
                ),
                FilledButton.tonalIcon(
                  onPressed: () => _executeMacro(macro),
                  icon: Icon(Icons.play_arrow, size: 18),
                  label: Text('Run'),
                ),
              ],
            ),
            SizedBox(height: MCESpacing.md),
            Text(
              steps.isEmpty ? 'No steps' : steps.map(_stepLabel).join('  →  '),
              style: MCETypography.caption.copyWith(
                color: MCEColors.textSecondary,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRules() {
    return ListView(
      physics: AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        MCESpacing.lg,
        MCESpacing.sm,
        MCESpacing.lg,
        96,
      ),
      children: [
        if (_rules.isEmpty)
          _emptyState(
            Icons.bolt,
            'No automations yet',
            'When something happens on OBS, run a saved macro.',
          )
        else
          for (final rule in _rules) _ruleCard(rule),
      ],
    );
  }

  Widget _ruleCard(Map<String, dynamic> rule) {
    final trigger = rule['trigger'] is Map
        ? Map<String, dynamic>.from(rule['trigger'] as Map)
        : const <String, dynamic>{};
    final actions =
        (rule['actions'] as List?)
            ?.whereType<Map>()
            .map((action) => Map<String, dynamic>.from(action))
            .toList() ??
        const [];
    final enabled = rule['enabled'] == true;
    return Card(
      color: MCEColors.surface,
      margin: const EdgeInsets.only(bottom: MCESpacing.md),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MCERadius.md),
        side: BorderSide(
          color: enabled
              ? MCEColors.primaryBlue.withValues(alpha: 0.45)
              : MCEColors.border,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(MCESpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.bolt, color: MCEColors.primaryBlue),
                SizedBox(width: MCESpacing.sm),
                Expanded(
                  child: Text(
                    rule['name']?.toString() ?? 'Automation',
                    style: MCETypography.bodyBold,
                  ),
                ),
                Switch(
                  value: enabled,
                  onChanged: (_) => _toggleRule(rule),
                  activeThumbColor: MCEColors.primaryBlue,
                ),
              ],
            ),
            SizedBox(height: MCESpacing.sm),
            _infoLine(
              Icons.flash_on_outlined,
              'When ${_triggerLabel(trigger)}',
            ),
            for (final action in actions)
              _infoLine(Icons.arrow_forward, 'Then ${_actionLabel(action)}'),
            if (rule['lastExecutedAt'] != null)
              _infoLine(
                Icons.history,
                'Last run ${_relativeTime(rule['lastExecutedAt'].toString())}',
              ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => _deleteRule(rule),
                icon: Icon(Icons.delete_outline, size: 18),
                label: Text('Delete'),
                style: TextButton.styleFrom(foregroundColor: MCEColors.danger),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistory() {
    if (_logs.isEmpty) {
      return _emptyState(
        Icons.history,
        'No runs yet',
        'Macro and automation activity will appear here.',
      );
    }
    return ListView(
      physics: AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        MCESpacing.lg,
        MCESpacing.sm,
        MCESpacing.lg,
        MCESpacing.xl,
      ),
      children: [
        for (final log in _logs.reversed)
          ListTile(
            contentPadding: const EdgeInsets.symmetric(
              horizontal: MCESpacing.sm,
            ),
            leading: Icon(
              log['level']?.toString() == 'error'
                  ? Icons.error_outline
                  : Icons.check_circle_outline,
              color: log['level']?.toString() == 'error'
                  ? MCEColors.danger
                  : MCEColors.success,
            ),
            title: Text(
              log['message']?.toString() ?? 'Activity',
              style: MCETypography.body,
            ),
            subtitle: Text(
              _relativeTime(log['timestamp']?.toString() ?? ''),
              style: MCETypography.tiny,
            ),
          ),
      ],
    );
  }

  Widget _infoLine(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(top: MCESpacing.xs),
      child: Row(
        children: [
          Icon(icon, size: 15, color: MCEColors.textSecondary),
          SizedBox(width: MCESpacing.sm),
          Expanded(
            child: Text(
              text,
              style: MCETypography.caption.copyWith(
                color: MCEColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyState(IconData icon, String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        MCESpacing.xxl,
        MCESpacing.xxl,
        MCESpacing.xxl,
        120,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: MCEColors.primaryBlue, size: 42),
          SizedBox(height: MCESpacing.md),
          Text(title, style: MCETypography.cardTitle),
          SizedBox(height: MCESpacing.sm),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: MCETypography.caption.copyWith(
              color: MCEColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(MCESpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, color: MCEColors.danger, size: 42),
            SizedBox(height: MCESpacing.md),
            Text(
              _error ?? 'Could not load automation data',
              textAlign: TextAlign.center,
              style: MCETypography.bodyBold,
            ),
            SizedBox(height: MCESpacing.lg),
            FilledButton(onPressed: _loadAll, child: Text('Retry')),
          ],
        ),
      ),
    );
  }

  String _stepLabel(Map<String, dynamic> step) {
    final type = step['type']?.toString() ?? '';
    final scene = step['scene_name']?.toString();
    return switch (type) {
      'switch_scene' =>
        'Switch to ${scene?.isNotEmpty == true ? scene : 'scene'}',
      'set_preview_scene' =>
        'Preview ${scene?.isNotEmpty == true ? scene : 'scene'}',
      'start_stream' => 'Start stream',
      'stop_stream' => 'Stop stream',
      'start_recording' => 'Start recording',
      'stop_recording' => 'Stop recording',
      'toggle_mic' => 'Toggle mic',
      'mute_mic' => 'Mute mic',
      'unmute_mic' => 'Unmute mic',
      'enable_studio_mode' => 'Studio Mode on',
      'disable_studio_mode' => 'Studio Mode off',
      'delay' => 'Wait ${step['delay_ms'] ?? 1000}ms',
      'run_macro' => 'Run another macro',
      _ => 'OBS action',
    };
  }

  String _actionLabel(Map<String, dynamic> action) => _stepLabel(action);

  String _triggerLabel(Map<String, dynamic> trigger) {
    final type = trigger['type']?.toString() ?? 'manual';
    if (type == 'scene_changed') {
      final scene = trigger['scene_name']?.toString();
      return scene?.isNotEmpty == true
          ? 'scene changes to $scene'
          : 'any scene changes';
    }
    return switch (type) {
      'stream_started' => 'streaming starts',
      'stream_stopped' => 'streaming stops',
      'recording_started' => 'recording starts',
      'recording_stopped' => 'recording stops',
      'time_reached' => 'the scheduled time arrives',
      _ => 'you run it manually',
    };
  }

  String _relativeTime(String raw) {
    final date = DateTime.tryParse(raw)?.toLocal();
    if (date == null) return 'Recently';
    final difference = DateTime.now().difference(date);
    if (difference.inMinutes < 1) return 'Just now';
    if (difference.inHours < 1) return '${difference.inMinutes}m ago';
    if (difference.inDays < 1) return '${difference.inHours}h ago';
    return '${difference.inDays}d ago';
  }
}
