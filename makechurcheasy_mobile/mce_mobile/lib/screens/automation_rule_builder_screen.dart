import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/api_models.dart';
import '../services/mce_provider.dart';
import '../widgets/mce_button.dart';

class AutomationRuleBuilderScreen extends StatefulWidget {
  const AutomationRuleBuilderScreen({super.key});

  @override
  State<AutomationRuleBuilderScreen> createState() =>
      _AutomationRuleBuilderScreenState();
}

class _AutomationRuleBuilderScreenState
    extends State<AutomationRuleBuilderScreen> {
  int _step = 0; // 0=Trigger, 1=Condition, 2=Action, 3=Save
  bool _isSaving = false;

  AutomationTriggerType? _selectedTrigger;
  Map<String, dynamic> _triggerParams = {};
  final List<AutomationCondition> _conditions = [];
  final List<AutomationAction> _actions = [];
  final _nameController = TextEditingController();

  static const _stepLabels = ['Trigger', 'Condition', 'Action', 'Save'];

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _next() {
    if (_step < 3) {
      setState(() => _step++);
    }
  }

  void _back() {
    if (_step > 0) {
      setState(() => _step--);
    }
  }

  bool _canProceed() {
    return switch (_step) {
      0 => _selectedTrigger != null,
      1 => true, // conditions are optional
      2 => _actions.isNotEmpty,
      3 => _nameController.text.trim().isNotEmpty,
      _ => false,
    };
  }

  Future<void> _save() async {
    if (_nameController.text.trim().isEmpty) return;

    setState(() => _isSaving = true);

    try {
      final rule = AutomationRule(
        id: '',
        name: _nameController.text.trim(),
        enabled: true,
        trigger: AutomationTrigger(
          type: _selectedTrigger!,
          params: _triggerParams.isNotEmpty ? _triggerParams : null,
        ),
        conditions: _conditions,
        actions: _actions,
      );

      await context.apiService.createAutomationRule(rule);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save: $e'), backgroundColor: MCEColors.danger),
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MCEColors.background,
      body: Column(
        children: [
          // Header
          SafeArea(
            bottom: false,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: MCESpacing.lg,
                vertical: MCESpacing.md,
              ),
              decoration: const BoxDecoration(
                color: MCEColors.surface,
                border: Border(bottom: BorderSide(color: MCEColors.border)),
              ),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: _step == 0
                        ? () => Navigator.pop(context)
                        : _back,
                    child: const Icon(
                      Icons.arrow_back,
                      color: MCEColors.textSecondary,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: MCESpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'New Rule',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: MCEColors.textPrimary,
                          ),
                        ),
                        Text(
                          'Step ${_step + 1} of 4: ${_stepLabels[_step]}',
                          style: MCETypography.caption.copyWith(
                            color: MCEColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_step == 3)
                    MCEButton(
                      label: _isSaving ? 'Saving...' : 'Save',
                      onPressed: _isSaving ? null : _save,
                    )
                  else
                    MCEButton(
                      label: 'Next',
                      onPressed: _canProceed() ? _next : null,
                    ),
                ],
              ),
            ),
          ),

          // Progress bar
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: MCESpacing.lg,
              vertical: MCESpacing.md,
            ),
            child: Row(
              children: List.generate(4, (i) {
                final isActive = i == _step;
                final isDone = i < _step;
                return Expanded(
                  child: Container(
                    height: 4,
                    margin: i < 3 ? const EdgeInsets.only(right: 4) : EdgeInsets.zero,
                    decoration: BoxDecoration(
                      color: isDone || isActive
                          ? const Color(0xFF7C3AED)
                          : MCEColors.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                );
              }),
            ),
          ),

          // Step content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(MCESpacing.lg),
              child: switch (_step) {
                0 => _buildTriggerStep(),
                1 => _buildConditionStep(),
                2 => _buildActionStep(),
                3 => _buildSaveStep(),
                _ => const SizedBox.shrink(),
              },
            ),
          ),
        ],
      ),
    );
  }

  // ─── Step 1: Trigger ───

  Widget _buildTriggerStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('When should this rule fire?', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.sm),
        Text(
          'Select an event that triggers this automation',
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        const SizedBox(height: MCESpacing.xl),
        ...AutomationTriggerType.values.map((type) {
          final isSelected = _selectedTrigger == type;
          return GestureDetector(
            onTap: () => setState(() {
              _selectedTrigger = type;
              _triggerParams = {};
            }),
            child: Container(
              margin: const EdgeInsets.only(bottom: MCESpacing.sm),
              padding: const EdgeInsets.all(MCESpacing.md),
              decoration: BoxDecoration(
                color: isSelected
                    ? const Color(0xFF7C3AED).withValues(alpha: 0.15)
                    : MCEColors.elevated,
                borderRadius: BorderRadius.circular(MCERadius.md),
                border: Border.all(
                  color: isSelected
                      ? const Color(0xFF7C3AED)
                      : MCEColors.border,
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    type.icon,
                    color: isSelected
                        ? const Color(0xFF7C3AED)
                        : MCEColors.textSecondary,
                    size: 22,
                  ),
                  const SizedBox(width: MCESpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          type.label,
                          style: MCETypography.bodyBold.copyWith(
                            color: isSelected
                                ? MCEColors.textPrimary
                                : MCEColors.textSecondary,
                          ),
                        ),
                        Text(
                          type.description,
                          style: MCETypography.caption.copyWith(
                            color: MCEColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isSelected)
                    const Icon(
                      Icons.check_circle,
                      color: Color(0xFF7C3AED),
                      size: 20,
                    ),
                ],
              ),
            ),
          );
        }),
        // Scene picker for sceneChanged trigger
        if (_selectedTrigger == AutomationTriggerType.sceneChanged) ...[
          const SizedBox(height: MCESpacing.lg),
          _buildScenePicker(),
        ],
        // Time picker for timeReached trigger
        if (_selectedTrigger == AutomationTriggerType.timeReached) ...[
          const SizedBox(height: MCESpacing.lg),
          _buildTimeTriggerPicker(),
        ],
      ],
    );
  }

  Widget _buildScenePicker() {
    return FutureBuilder<List<APIScene>>(
      future: context.apiService.getScenes(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(
            child: CircularProgressIndicator(color: Color(0xFF7C3AED)),
          );
        }
        final scenes = snapshot.data!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Select Scene', style: MCETypography.bodyBold),
            const SizedBox(height: MCESpacing.sm),
            ...scenes.map((scene) {
              final isSelected = _triggerParams['sceneId'] == scene.id;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Icons.dashboard_outlined,
                  color: isSelected
                      ? const Color(0xFF7C3AED)
                      : MCEColors.textSecondary,
                ),
                title: Text(scene.name),
                trailing: isSelected
                    ? const Icon(Icons.check_circle, color: Color(0xFF7C3AED))
                    : null,
                onTap: () {
                  setState(() {
                    _triggerParams = {
                      'sceneId': scene.id,
                      'sceneName': scene.name,
                    };
                  });
                },
              );
            }),
          ],
        );
      },
    );
  }

  Widget _buildTimeTriggerPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Select Time', style: MCETypography.bodyBold),
        const SizedBox(height: MCESpacing.sm),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.schedule, color: MCEColors.textSecondary),
          title: Text(
            _triggerParams['time'] as String? ?? 'Tap to pick time',
            style: MCETypography.body,
          ),
          trailing: const Icon(Icons.chevron_right, color: MCEColors.textSecondary),
          onTap: () async {
            final time = await showTimePicker(
              context: context,
              initialTime: TimeOfDay.now(),
            );
            if (time != null) {
              setState(() {
                _triggerParams = {
                  'time':
                      '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
                };
              });
            }
          },
        ),
      ],
    );
  }

  // ─── Step 2: Conditions ───

  Widget _buildConditionStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Any conditions?', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.sm),
        Text(
          'Add optional conditions that must be true for the rule to execute',
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        const SizedBox(height: MCESpacing.xl),

        // Existing conditions
        for (int i = 0; i < _conditions.length; i++)
          Container(
            margin: const EdgeInsets.only(bottom: MCESpacing.sm),
            padding: const EdgeInsets.all(MCESpacing.md),
            decoration: BoxDecoration(
              color: MCEColors.elevated,
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(color: MCEColors.border),
            ),
            child: Row(
              children: [
                const Icon(Icons.filter_alt, color: MCEColors.warning, size: 18),
                const SizedBox(width: MCESpacing.sm),
                Expanded(child: Text(_conditions[i].describe(), style: MCETypography.body)),
                GestureDetector(
                  onTap: () => setState(() => _conditions.removeAt(i)),
                  child: const Icon(Icons.close, color: MCEColors.danger, size: 18),
                ),
              ],
            ),
          ),

        // Add condition button
        GestureDetector(
          onTap: _showAddConditionSheet,
          child: Container(
            margin: const EdgeInsets.only(bottom: MCESpacing.sm),
            padding: const EdgeInsets.all(MCESpacing.md),
            decoration: BoxDecoration(
              color: MCEColors.elevated.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(
                color: MCEColors.border,
                style: BorderStyle.solid,
              ),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.add, color: MCEColors.textSecondary, size: 18),
                SizedBox(width: MCESpacing.sm),
                Text(
                  'Add Condition',
                  style: TextStyle(color: MCEColors.textSecondary),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: MCESpacing.lg),
        Text(
          'Tip: Skip this step if you want the rule to fire unconditionally',
          style: MCETypography.caption.copyWith(
            color: MCEColors.textSecondary,
            fontStyle: FontStyle.italic,
          ),
        ),
      ],
    );
  }

  void _showAddConditionSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: MCEColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (_) => _ConditionPicker(
        onSelected: (condition) {
          setState(() => _conditions.add(condition));
        },
      ),
    );
  }

  // ─── Step 3: Actions ───

  Widget _buildActionStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('What should happen?', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.sm),
        Text(
          'Add one or more actions to execute',
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        const SizedBox(height: MCESpacing.xl),

        // Existing actions
        for (int i = 0; i < _actions.length; i++)
          Container(
            margin: const EdgeInsets.only(bottom: MCESpacing.sm),
            padding: const EdgeInsets.all(MCESpacing.md),
            decoration: BoxDecoration(
              color: MCEColors.elevated,
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(
                color: const Color(0xFF7C3AED).withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                Icon(_actions[i].type.icon, color: const Color(0xFF7C3AED), size: 18),
                const SizedBox(width: MCESpacing.sm),
                Expanded(child: Text(_actions[i].describe(), style: MCETypography.body)),
                GestureDetector(
                  onTap: () => setState(() => _actions.removeAt(i)),
                  child: const Icon(Icons.close, color: MCEColors.danger, size: 18),
                ),
              ],
            ),
          ),

        // Add action button
        GestureDetector(
          onTap: _showAddActionSheet,
          child: Container(
            margin: const EdgeInsets.only(bottom: MCESpacing.sm),
            padding: const EdgeInsets.all(MCESpacing.md),
            decoration: BoxDecoration(
              color: MCEColors.elevated.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(color: MCEColors.border),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.add, color: MCEColors.textSecondary, size: 18),
                SizedBox(width: MCESpacing.sm),
                Text(
                  'Add Action',
                  style: TextStyle(color: MCEColors.textSecondary),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _showAddActionSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: MCEColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
      ),
      builder: (_) => _ActionPicker(
        onSelected: (action) {
          setState(() => _actions.add(action));
        },
      ),
    );
  }

  // ─── Step 4: Save ───

  Widget _buildSaveStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Name your rule', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.sm),
        TextField(
          controller: _nameController,
          style: MCETypography.body,
          decoration: InputDecoration(
            hintText: 'e.g. Start Stream on Countdown',
            hintStyle: MCETypography.body.copyWith(color: MCEColors.textSecondary),
            filled: true,
            fillColor: MCEColors.elevated,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(MCERadius.md),
              borderSide: const BorderSide(color: MCEColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(MCERadius.md),
              borderSide: const BorderSide(color: MCEColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(MCERadius.md),
              borderSide: const BorderSide(color: Color(0xFF7C3AED)),
            ),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: MCESpacing.xl),

        // Summary
        Text('Summary', style: MCETypography.bodyBold),
        const SizedBox(height: MCESpacing.md),

        _buildSummaryRow(
          Icons.bolt,
          'Trigger',
          _selectedTrigger?.label ?? 'None',
        ),
        _buildSummaryRow(
          Icons.filter_alt_outlined,
          'Conditions',
          _conditions.isEmpty
              ? 'None (always runs)'
              : '${_conditions.length} condition(s)',
        ),
        _buildSummaryRow(
          Icons.play_circle_outline,
          'Actions',
          '${_actions.length} action(s)',
        ),

        const SizedBox(height: MCESpacing.xl),

        // Action list
        ..._actions.map((a) => Container(
              margin: const EdgeInsets.only(bottom: MCESpacing.sm),
              padding: const EdgeInsets.all(MCESpacing.md),
              decoration: BoxDecoration(
                color: MCEColors.elevated,
                borderRadius: BorderRadius.circular(MCERadius.sm),
              ),
              child: Row(
                children: [
                  Icon(a.type.icon, color: const Color(0xFF7C3AED), size: 16),
                  const SizedBox(width: MCESpacing.sm),
                  Expanded(
                    child: Text(a.describe(), style: MCETypography.caption),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildSummaryRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: MCESpacing.sm),
      child: Row(
        children: [
          Icon(icon, size: 16, color: const Color(0xFF7C3AED)),
          const SizedBox(width: MCESpacing.sm),
          Text('$label: ', style: MCETypography.captionBold),
          Expanded(
            child: Text(
              value,
              style: MCETypography.caption.copyWith(color: MCEColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Condition Picker ───

class _ConditionPicker extends StatelessWidget {
  final ValueChanged<AutomationCondition> onSelected;

  const _ConditionPicker({required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.xxl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Add Condition', style: MCETypography.cardTitle),
          const SizedBox(height: MCESpacing.lg),
          ...AutomationConditionType.values.map((type) {
            return ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                _iconForCondition(type),
                color: MCEColors.textSecondary,
              ),
              title: Text(type.label, style: MCETypography.body),
              trailing: const Icon(Icons.chevron_right, color: MCEColors.textSecondary),
              onTap: () {
                Navigator.pop(context);
                if (type == AutomationConditionType.sceneEquals ||
                    type == AutomationConditionType.sceneNotEquals) {
                  _pickScene(context, type);
                } else if (type == AutomationConditionType.timeBetween) {
                  _pickTimeRange(context, type);
                } else {
                  onSelected(AutomationCondition(type: type));
                }
              },
            );
          }),
          SizedBox(height: MediaQuery.of(context).viewInsets.bottom),
        ],
      ),
    );
  }

  IconData _iconForCondition(AutomationConditionType type) {
    return switch (type) {
      AutomationConditionType.sceneEquals ||
      AutomationConditionType.sceneNotEquals =>
        Icons.dashboard_outlined,
      AutomationConditionType.streaming ||
      AutomationConditionType.notStreaming =>
        Icons.cell_tower,
      AutomationConditionType.recording ||
      AutomationConditionType.notRecording =>
        Icons.fiber_manual_record,
      AutomationConditionType.timeBetween => Icons.schedule,
    };
  }

  void _pickScene(BuildContext context, AutomationConditionType type) async {
    final api = context.apiService;
    try {
      final scenes = await api.getScenes();
      if (!context.mounted) return;
      showModalBottomSheet(
        context: context,
        backgroundColor: MCEColors.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
        ),
        builder: (_) => Container(
          padding: const EdgeInsets.all(MCESpacing.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Select Scene', style: MCETypography.cardTitle),
              const SizedBox(height: MCESpacing.lg),
              ...scenes.map((scene) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.dashboard_outlined, color: MCEColors.textSecondary),
                    title: Text(scene.name),
                    onTap: () {
                      Navigator.pop(context);
                      onSelected(AutomationCondition(
                        type: type,
                        params: {'sceneId': scene.id, 'sceneName': scene.name},
                      ));
                    },
                  )),
            ],
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to load scenes: $e'), backgroundColor: MCEColors.danger),
      );
    }
  }

  void _pickTimeRange(
    BuildContext context,
    AutomationConditionType type,
  ) async {
    final start = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 9, minute: 0),
    );
    if (start == null || !context.mounted) return;

    final end = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 12, minute: 0),
    );
    if (end == null) return;

    final fmt = (TimeOfDay t) =>
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

    onSelected(AutomationCondition(
      type: type,
      params: {'start': fmt(start), 'end': fmt(end)},
    ));
  }
}

// ─── Action Picker ───

class _ActionPicker extends StatelessWidget {
  final ValueChanged<AutomationAction> onSelected;

  const _ActionPicker({required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.xxl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Add Action', style: MCETypography.cardTitle),
          const SizedBox(height: MCESpacing.lg),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: AutomationActionType.values.map((type) {
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(type.icon, color: const Color(0xFF7C3AED)),
                  title: Text(type.label, style: MCETypography.body),
                  trailing: const Icon(Icons.chevron_right, color: MCEColors.textSecondary),
                  onTap: () {
                    Navigator.pop(context);
                    if (type.needsParam) {
                      _pickParam(context, type);
                    } else {
                      onSelected(AutomationAction(type: type));
                    }
                  },
                );
              }).toList(),
            ),
          ),
          SizedBox(height: MediaQuery.of(context).viewInsets.bottom),
        ],
      ),
    );
  }

  void _pickParam(BuildContext context, AutomationActionType type) async {
    final api = context.apiService;

    if (type == AutomationActionType.switchScene) {
      try {
        final scenes = await api.getScenes();
        if (!context.mounted) return;
        showModalBottomSheet(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => Container(
            padding: const EdgeInsets.all(MCESpacing.xxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Select Scene', style: MCETypography.cardTitle),
                const SizedBox(height: MCESpacing.lg),
                ...scenes.map((scene) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.dashboard_outlined, color: MCEColors.textSecondary),
                      title: Text(scene.name),
                      onTap: () {
                        Navigator.pop(context);
                        onSelected(AutomationAction(
                          type: type,
                          params: {'sceneId': scene.id, 'sceneName': scene.name},
                        ));
                      },
                    )),
              ],
            ),
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load scenes: $e'), backgroundColor: MCEColors.danger),
        );
      }
    } else if (type == AutomationActionType.playMedia) {
      try {
        final media = await api.getMediaLibrary();
        if (!context.mounted) return;
        showModalBottomSheet(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => Container(
            padding: const EdgeInsets.all(MCESpacing.xxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Select Media', style: MCETypography.cardTitle),
                const SizedBox(height: MCESpacing.lg),
                ...media.map((item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        item.type == 'video'
                            ? Icons.videocam_outlined
                            : Icons.image_outlined,
                        color: MCEColors.textSecondary,
                      ),
                      title: Text(item.name, style: MCETypography.body),
                      onTap: () {
                        Navigator.pop(context);
                        onSelected(AutomationAction(
                          type: type,
                          params: {'mediaId': item.id, 'mediaName': item.name},
                        ));
                      },
                    )),
              ],
            ),
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load media: $e'), backgroundColor: MCEColors.danger),
        );
      }
    } else if (type == AutomationActionType.executeMacro) {
      try {
        final macros = await api.getMacros();
        if (!context.mounted) return;
        showModalBottomSheet(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => Container(
            padding: const EdgeInsets.all(MCESpacing.xxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Select Macro', style: MCETypography.cardTitle),
                const SizedBox(height: MCESpacing.lg),
                ...macros.map((macro) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.bolt, color: MCEColors.textSecondary),
                      title: Text(macro.name, style: MCETypography.body),
                      onTap: () {
                        Navigator.pop(context);
                        onSelected(AutomationAction(
                          type: type,
                          params: {'macroId': macro.id, 'macroName': macro.name},
                        ));
                      },
                    )),
              ],
            ),
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load macros: $e'), backgroundColor: MCEColors.danger),
        );
      }
    } else if (type == AutomationActionType.showLowerThird ||
        type == AutomationActionType.hideLowerThird) {
      try {
        final lowers = await api.getLowerThirds();
        if (!context.mounted) return;
        showModalBottomSheet(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => Container(
            padding: const EdgeInsets.all(MCESpacing.xxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Select Lower Third', style: MCETypography.cardTitle),
                const SizedBox(height: MCESpacing.lg),
                ...lowers.map((lt) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.short_text, color: MCEColors.textSecondary),
                      title: Text(lt.title, style: MCETypography.body),
                      subtitle: lt.subtitle != null ? Text(lt.subtitle!, style: MCETypography.caption) : null,
                      onTap: () {
                        Navigator.pop(context);
                        onSelected(AutomationAction(
                          type: type,
                          params: {'id': lt.id, 'title': lt.title},
                        ));
                      },
                    )),
              ],
            ),
          ),
        );
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load lower thirds: $e'), backgroundColor: MCEColors.danger),
        );
      }
    }
  }
}
