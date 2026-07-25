import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/api_models.dart';
import '../services/mce_provider.dart';
import '../widgets/mce_button.dart';
import 'automation_rule_builder_screen.dart';
import 'automation_schedule_screen.dart';

class AutomationScreen extends StatefulWidget {
  const AutomationScreen({super.key});

  @override
  State<AutomationScreen> createState() => _AutomationScreenState();
}

class _AutomationScreenState extends State<AutomationScreen> {
  int _currentTab = 0;
  static const _tabs = ['Rules', 'Schedules'];

  List<AutomationRule> _rules = [];
  List<AutomationSchedule> _schedules = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final api = context.apiService;
      final results = await Future.wait([
        api.getFullAutomationRules(),
        api.getAutomationSchedules(),
      ]);
      if (!mounted) return;
      setState(() {
        _rules = results[0] as List<AutomationRule>;
        _schedules = results[1] as List<AutomationSchedule>;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleRule(AutomationRule rule) async {
    try {
      final updated = await context.apiService.updateAutomationRule(
        rule.id,
        rule.copyWith(enabled: !rule.enabled),
      );
      if (!mounted) return;
      setState(() {
        final i = _rules.indexWhere((r) => r.id == rule.id);
        if (i >= 0) _rules[i] = updated;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to toggle: $e'), backgroundColor: MCEColors.danger),
      );
    }
  }

  Future<void> _deleteRule(AutomationRule rule) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: MCEColors.elevated,
        title: const Text('Delete Rule'),
        content: Text('Delete "${rule.name}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: MCEColors.danger)),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await context.apiService.deleteAutomationRule(rule.id);
      if (!mounted) return;
      setState(() => _rules.removeWhere((r) => r.id == rule.id));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to delete: $e'), backgroundColor: MCEColors.danger),
      );
    }
  }

  Future<void> _toggleSchedule(AutomationSchedule schedule) async {
    try {
      final updated = await context.apiService.updateAutomationSchedule(
        schedule.id,
        AutomationSchedule(
          id: schedule.id,
          name: schedule.name,
          enabled: !schedule.enabled,
          day: schedule.day,
          time: schedule.time,
          action: schedule.action,
        ),
      );
      if (!mounted) return;
      setState(() {
        final i = _schedules.indexWhere((s) => s.id == schedule.id);
        if (i >= 0) _schedules[i] = updated;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to toggle: $e'), backgroundColor: MCEColors.danger),
      );
    }
  }

  Future<void> _deleteSchedule(AutomationSchedule schedule) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: MCEColors.elevated,
        title: const Text('Delete Schedule'),
        content: Text('Delete "${schedule.name}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: MCEColors.danger)),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await context.apiService.deleteAutomationSchedule(schedule.id);
      if (!mounted) return;
      setState(() => _schedules.removeWhere((s) => s.id == schedule.id));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to delete: $e'), backgroundColor: MCEColors.danger),
      );
    }
  }

  void _createRule() async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => const AutomationRuleBuilderScreen()),
    );
    if (result == true) _loadAll();
  }

  void _createSchedule() async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => const AutomationScheduleScreen()),
    );
    if (result == true) _loadAll();
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
                  const Icon(Icons.bolt, color: Color(0xFF7C3AED), size: 24),
                  const SizedBox(width: MCESpacing.md),
                  const Expanded(
                    child: Text(
                      'Automation',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: MCEColors.textPrimary,
                      ),
                    ),
                  ),
                  MCEButton(
                    label: 'Refresh',
                    icon: Icons.refresh,
                    onPressed: _loadAll,
                  ),
                ],
              ),
            ),
          ),

          // Segmented tab bar
          Container(
            padding: const EdgeInsets.all(4),
            margin: const EdgeInsets.all(MCESpacing.lg),
            decoration: BoxDecoration(
              color: MCEColors.elevated,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: MCEColors.border),
            ),
            child: Row(
              children: List.generate(_tabs.length, (i) {
                final isActive = _currentTab == i;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _currentTab = i),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: isActive ? const Color(0xFF7C3AED) : Colors.transparent,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        _tabs[i],
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isActive ? Colors.white : MCEColors.textSecondary,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),

          // Content
          Expanded(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: Color(0xFF7C3AED)),
                  )
                : _error != null
                    ? _buildError()
                    : RefreshIndicator(
                        onRefresh: _loadAll,
                        color: const Color(0xFF7C3AED),
                        child: _currentTab == 0 ? _buildRulesTab() : _buildSchedulesTab(),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _currentTab == 0 ? _createRule : _createSchedule,
        backgroundColor: const Color(0xFF7C3AED),
        child: const Icon(Icons.add, color: Colors.white),
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
            const Icon(Icons.error_outline, color: MCEColors.danger, size: 48),
            const SizedBox(height: MCESpacing.md),
            Text(
              'Failed to load automation data',
              style: MCETypography.bodyBold.copyWith(color: MCEColors.textPrimary),
            ),
            const SizedBox(height: MCESpacing.sm),
            Text(
              _error ?? 'Unknown error',
              style: MCETypography.caption.copyWith(color: MCEColors.textSecondary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: MCESpacing.lg),
            MCEButton(label: 'Retry', onPressed: _loadAll),
          ],
        ),
      ),
    );
  }

  // ─── Rules Tab ───

  Widget _buildRulesTab() {
    if (_rules.isEmpty) {
      return _buildEmptyState(
        icon: Icons.bolt_outlined,
        title: 'No Rules Yet',
        subtitle: 'Create automation rules that fire when specific events happen',
        actionLabel: 'Create Rule',
        onAction: _createRule,
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: MCESpacing.lg),
      itemCount: _rules.length,
      itemBuilder: (context, i) {
        final rule = _rules[i];
        return _RuleCard(
          rule: rule,
          onToggle: () => _toggleRule(rule),
          onDelete: () => _deleteRule(rule),
        );
      },
    );
  }

  // ─── Schedules Tab ───

  Widget _buildSchedulesTab() {
    if (_schedules.isEmpty) {
      return _buildEmptyState(
        icon: Icons.schedule_outlined,
        title: 'No Schedules',
        subtitle: 'Schedule automations to run at specific days and times',
        actionLabel: 'Create Schedule',
        onAction: _createSchedule,
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: MCESpacing.lg),
      itemCount: _schedules.length,
      itemBuilder: (context, i) {
        final schedule = _schedules[i];
        return _ScheduleCard(
          schedule: schedule,
          onToggle: () => _toggleSchedule(schedule),
          onDelete: () => _deleteSchedule(schedule),
        );
      },
    );
  }

  // ─── Empty State ───

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String subtitle,
    required String actionLabel,
    VoidCallback? onAction,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(MCESpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED).withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: const Color(0xFF7C3AED), size: 40),
            ),
            const SizedBox(height: MCESpacing.xl),
            Text(title, style: MCETypography.cardTitle),
            const SizedBox(height: MCESpacing.sm),
            Text(
              subtitle,
              style: MCETypography.caption.copyWith(color: MCEColors.textSecondary),
              textAlign: TextAlign.center,
            ),
            if (onAction != null) ...[
              const SizedBox(height: MCESpacing.xl),
              MCEButton(label: actionLabel, onPressed: onAction),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Rule Card ───

class _RuleCard extends StatelessWidget {
  final AutomationRule rule;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  const _RuleCard({
    required this.rule,
    required this.onToggle,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key('rule_${rule.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: MCESpacing.xl),
        margin: const EdgeInsets.only(bottom: MCESpacing.md),
        decoration: BoxDecoration(
          color: MCEColors.danger.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(MCERadius.md),
        ),
        child: const Icon(Icons.delete_outline, color: MCEColors.danger),
      ),
      confirmDismiss: (_) async {
        onDelete();
        return false;
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: MCESpacing.md),
        padding: const EdgeInsets.all(MCESpacing.lg),
        decoration: BoxDecoration(
          color: MCEColors.surface.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(MCERadius.lg),
          border: Border.all(
            color: rule.enabled
                ? const Color(0xFF7C3AED).withValues(alpha: 0.3)
                : MCEColors.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF7C3AED).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(MCERadius.sm),
                  ),
                  child: Icon(
                    rule.trigger.type.icon,
                    size: 16,
                    color: const Color(0xFF7C3AED),
                  ),
                ),
                const SizedBox(width: MCESpacing.sm),
                Expanded(
                  child: Text(
                    rule.name,
                    style: MCETypography.bodyBold.copyWith(
                      color: rule.enabled
                          ? MCEColors.textPrimary
                          : MCEColors.textSecondary,
                    ),
                  ),
                ),
                Switch(
                  value: rule.enabled,
                  onChanged: (_) => onToggle(),
                  activeThumbColor: const Color(0xFF7C3AED),
                ),
              ],
            ),
            const SizedBox(height: MCESpacing.sm),
            _buildInfoRow(Icons.bolt_outlined, rule.trigger.type.label),
            if (rule.conditions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: MCESpacing.xs),
                child: _buildInfoRow(
                  Icons.filter_alt_outlined,
                  '${rule.conditions.length} condition${rule.conditions.length > 1 ? 's' : ''}',
                ),
              ),
            for (final action in rule.actions)
              Padding(
                padding: const EdgeInsets.only(top: MCESpacing.xs),
                child: _buildInfoRow(action.type.icon, action.describe()),
              ),
            if (rule.lastExecuted != null) ...[
              const SizedBox(height: MCESpacing.sm),
              Text(
                'Last run: ${_formatTime(rule.lastExecuted!)}',
                style: MCETypography.tiny.copyWith(color: MCEColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 12, color: MCEColors.textSecondary),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            text,
            style: MCETypography.caption.copyWith(color: MCEColors.textSecondary),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

// ─── Schedule Card ───

class _ScheduleCard extends StatelessWidget {
  final AutomationSchedule schedule;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  const _ScheduleCard({
    required this.schedule,
    required this.onToggle,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key('schedule_${schedule.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: MCESpacing.xl),
        margin: const EdgeInsets.only(bottom: MCESpacing.md),
        decoration: BoxDecoration(
          color: MCEColors.danger.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(MCERadius.md),
        ),
        child: const Icon(Icons.delete_outline, color: MCEColors.danger),
      ),
      confirmDismiss: (_) async {
        onDelete();
        return false;
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: MCESpacing.md),
        padding: const EdgeInsets.all(MCESpacing.lg),
        decoration: BoxDecoration(
          color: MCEColors.surface.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(MCERadius.lg),
          border: Border.all(
            color: schedule.enabled
                ? MCEColors.primaryBlue.withValues(alpha: 0.3)
                : MCEColors.border,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: MCEColors.primaryBlue.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(MCERadius.md),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    schedule.time,
                    style: MCETypography.bodyBold.copyWith(
                      color: MCEColors.primaryBlue,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    schedule.day.length > 3
                        ? schedule.day.substring(0, 3)
                        : schedule.day,
                    style: MCETypography.tiny.copyWith(color: MCEColors.primaryBlue),
                  ),
                ],
              ),
            ),
            const SizedBox(width: MCESpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    schedule.name,
                    style: MCETypography.bodyBold.copyWith(
                      color: schedule.enabled
                          ? MCEColors.textPrimary
                          : MCEColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    schedule.action.describe(),
                    style: MCETypography.caption.copyWith(
                      color: MCEColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            Switch(
              value: schedule.enabled,
              onChanged: (_) => onToggle(),
              activeThumbColor: MCEColors.primaryBlue,
            ),
          ],
        ),
      ),
    );
  }
}
