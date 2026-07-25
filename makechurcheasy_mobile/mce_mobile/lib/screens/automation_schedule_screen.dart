import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/api_models.dart';
import '../services/mce_provider.dart';
import '../widgets/mce_button.dart';

class AutomationScheduleScreen extends StatefulWidget {
  const AutomationScheduleScreen({super.key});

  @override
  State<AutomationScheduleScreen> createState() =>
      _AutomationScheduleScreenState();
}

class _AutomationScheduleScreenState extends State<AutomationScheduleScreen> {
  TimeOfDay _time = TimeOfDay.now();
  final Set<int> _selectedDays = {}; // 0=Mon ... 6=Sun
  AutomationActionType? _selectedAction;
  Map<String, dynamic> _actionParams = {};
  final _nameController = TextEditingController();
  bool _enabled = true;
  bool _isSaving = false;

  static const _dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  String _formatDay(Set<int> days) {
    if (days.length == 7) return 'Everyday';
    final sorted = days.toList()..sort();
    return sorted.map((i) => _dayLabels[i]).join(', ');
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  bool _canSave() {
    return _nameController.text.trim().isNotEmpty &&
        _selectedDays.isNotEmpty &&
        _selectedAction != null;
  }

  Future<void> _save() async {
    if (!_canSave()) return;
    setState(() => _isSaving = true);

    try {
      final timeStr =
          '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}';

      final schedule = AutomationSchedule(
        id: '',
        name: _nameController.text.trim(),
        enabled: _enabled,
        time: timeStr,
        day: _formatDay(_selectedDays),
        action: AutomationAction(
          type: _selectedAction!,
          params: _actionParams.isNotEmpty ? _actionParams : null,
        ),
      );

      await context.apiService.createAutomationSchedule(schedule);
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
                    onTap: () => Navigator.pop(context),
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
                          'New Schedule',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: MCEColors.textPrimary,
                          ),
                        ),
                        Text(
                          'Automate actions on a recurring schedule',
                          style: MCETypography.caption.copyWith(
                            color: MCEColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  MCEButton(
                    label: _isSaving ? 'Saving...' : 'Save',
                    onPressed: _isSaving ? null : _save,
                  ),
                ],
              ),
            ),
          ),

          // Form
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(MCESpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Name
                  _buildSectionTitle('Schedule Name'),
                  const SizedBox(height: MCESpacing.md),
                  TextField(
                    controller: _nameController,
                    style: MCETypography.body,
                    decoration: InputDecoration(
                      hintText: 'e.g. Daily Opening Song',
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

                  // Time
                  _buildSectionTitle('Time'),
                  const SizedBox(height: MCESpacing.md),
                  GestureDetector(
                    onTap: () async {
                      final time = await showTimePicker(
                        context: context,
                        initialTime: _time,
                      );
                      if (time != null) setState(() => _time = time);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: MCESpacing.md,
                        vertical: MCESpacing.md,
                      ),
                      decoration: BoxDecoration(
                        color: MCEColors.elevated,
                        borderRadius: BorderRadius.circular(MCERadius.md),
                        border: Border.all(color: MCEColors.border),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.schedule, color: MCEColors.textSecondary),
                          const SizedBox(width: MCESpacing.md),
                          Text(
                            _time.format(context),
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              color: MCEColors.textPrimary,
                            ),
                          ),
                          const Spacer(),
                          const Icon(Icons.chevron_right, color: MCEColors.textSecondary),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: MCESpacing.xl),

                  // Days
                  _buildSectionTitle('Days'),
                  const SizedBox(height: MCESpacing.md),
                  Row(
                    children: List.generate(7, (i) {
                      final isSelected = _selectedDays.contains(i);
                      return Expanded(
                        child: GestureDetector(
                          onTap: () {
                            setState(() {
                              if (isSelected) {
                                _selectedDays.remove(i);
                              } else {
                                _selectedDays.add(i);
                              }
                            });
                          },
                          child: Container(
                            margin: EdgeInsets.only(right: i < 6 ? 4 : 0),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? const Color(0xFF7C3AED)
                                  : MCEColors.elevated,
                              borderRadius: BorderRadius.circular(MCERadius.sm),
                              border: Border.all(
                                color: isSelected
                                    ? const Color(0xFF7C3AED)
                                    : MCEColors.border,
                              ),
                            ),
                            child: Center(
                              child: Text(
                                _dayLabels[i],
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: isSelected
                                      ? Colors.white
                                      : MCEColors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: MCESpacing.xl),

                  // Action
                  _buildSectionTitle('Action'),
                  const SizedBox(height: MCESpacing.md),
                  ...AutomationActionType.values.map((type) {
                    final isSelected = _selectedAction == type;
                    return GestureDetector(
                      onTap: () async {
                        setState(() {
                          _selectedAction = type;
                          _actionParams = {};
                        });
                        if (type.needsParam) {
                          await _pickActionParam(type);
                        }
                      },
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
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              type.icon,
                              color: isSelected
                                  ? const Color(0xFF7C3AED)
                                  : MCEColors.textSecondary,
                              size: 20,
                            ),
                            const SizedBox(width: MCESpacing.md),
                            Expanded(
                              child: Text(
                                type.label,
                                style: MCETypography.body.copyWith(
                                  color: isSelected
                                      ? MCEColors.textPrimary
                                      : MCEColors.textSecondary,
                                ),
                              ),
                            ),
                            if (isSelected)
                              const Icon(Icons.check_circle, color: Color(0xFF7C3AED), size: 18),
                          ],
                        ),
                      ),
                    );
                  }),

                  const SizedBox(height: MCESpacing.xl),

                  // Enabled toggle
                  Row(
                    children: [
                      Text('Start enabled', style: MCETypography.body),
                      const Spacer(),
                      Switch(
                        value: _enabled,
                        onChanged: (v) => setState(() => _enabled = v),
                        activeThumbColor: const Color(0xFF7C3AED),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: MCETypography.bodyBold.copyWith(color: MCEColors.textSecondary),
    );
  }

  Future<void> _pickActionParam(AutomationActionType type) async {
    final api = context.apiService;

    if (type == AutomationActionType.switchScene) {
      try {
        final scenes = await api.getScenes();
        if (!mounted) return;
        final picked = await showModalBottomSheet<Map<String, dynamic>>(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => _ParamPickerSheet(
            title: 'Select Scene',
            items: scenes.map((s) => _PickerItem(id: s.id, label: s.name)).toList(),
          ),
        );
        if (picked != null) setState(() => _actionParams = picked);
      } catch (e) {
        _showError('Failed to load scenes: $e');
      }
    } else if (type == AutomationActionType.playMedia) {
      try {
        final media = await api.getMediaLibrary();
        if (!mounted) return;
        final picked = await showModalBottomSheet<Map<String, dynamic>>(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => _ParamPickerSheet(
            title: 'Select Media',
            items: media.map((m) => _PickerItem(id: m.id, label: m.name)).toList(),
          ),
        );
        if (picked != null) setState(() => _actionParams = picked);
      } catch (e) {
        _showError('Failed to load media: $e');
      }
    } else if (type == AutomationActionType.executeMacro) {
      try {
        final macros = await api.getMacros();
        if (!mounted) return;
        final picked = await showModalBottomSheet<Map<String, dynamic>>(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => _ParamPickerSheet(
            title: 'Select Macro',
            items: macros.map((m) => _PickerItem(id: m.id, label: m.name)).toList(),
          ),
        );
        if (picked != null) setState(() => _actionParams = picked);
      } catch (e) {
        _showError('Failed to load macros: $e');
      }
    } else if (type == AutomationActionType.showLowerThird ||
        type == AutomationActionType.hideLowerThird) {
      try {
        final lowers = await api.getLowerThirds();
        if (!mounted) return;
        final picked = await showModalBottomSheet<Map<String, dynamic>>(
          context: context,
          backgroundColor: MCEColors.surface,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(MCERadius.lg)),
          ),
          builder: (_) => _ParamPickerSheet(
            title: 'Select Lower Third',
            items: lowers.map((l) => _PickerItem(id: l.id, label: l.title)).toList(),
          ),
        );
        if (picked != null) setState(() => _actionParams = picked);
      } catch (e) {
        _showError('Failed to load lower thirds: $e');
      }
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: MCEColors.danger),
    );
  }
}

// ─── Reusable picker bottom sheet ───

class _PickerItem {
  final String id;
  final String label;
  const _PickerItem({required this.id, required this.label});
}

class _ParamPickerSheet extends StatelessWidget {
  final String title;
  final List<_PickerItem> items;

  const _ParamPickerSheet({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.xxl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: MCETypography.cardTitle),
          const SizedBox(height: MCESpacing.lg),
          ...items.map((item) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.circle, color: MCEColors.textSecondary, size: 8),
                title: Text(item.label, style: MCETypography.body),
                onTap: () {
                  Navigator.pop(context, {
                    '${title.toLowerCase().replaceAll('select ', '').replaceAll(' ', '')}Id': item.id,
                    '${title.toLowerCase().replaceAll('select ', '').replaceAll(' ', '')}Name': item.label,
                  });
                },
              )),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: MCESpacing.xl),
              child: Text(
                'No items available',
                style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
              ),
            ),
        ],
      ),
    );
  }
}
