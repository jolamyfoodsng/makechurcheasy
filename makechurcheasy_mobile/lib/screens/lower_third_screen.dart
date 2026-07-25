import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_theme.dart';
import '../services/websocket_service.dart';

class LowerThirdScreen extends ConsumerStatefulWidget {
  const LowerThirdScreen({super.key});

  @override
  ConsumerState<LowerThirdScreen> createState() => _LowerThirdScreenState();
}

class _LowerThirdScreenState extends ConsumerState<LowerThirdScreen> {
  final _nameController = TextEditingController();
  final _titleController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _nameController.dispose();
    _titleController.dispose();
    super.dispose();
  }

  void _showLowerThird() {
    if (!_formKey.currentState!.validate()) return;
    final name = _nameController.text.trim();
    final title = _titleController.text.trim();
    ref.read(wsServiceProvider.notifier).showLowerThird(name, title);
  }

  void _clearLowerThird() {
    ref.read(wsServiceProvider.notifier).clearLowerThird();
  }

  @override
  Widget build(BuildContext context) {
    final wsState = ref.watch(wsServiceProvider);
    final desktop = wsState.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Lower Third')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Current state
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Row(
                  children: [
                    Icon(
                      Icons.subtitles,
                      size: 28,
                      color: desktop?.currentLowerThird != null
                          ? AppTheme.success
                          : AppTheme.textMuted,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('On Screen', style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: 4),
                          Text(
                            desktop?.currentLowerThird ?? 'Nothing active',
                            style: TextStyle(
                              fontSize: 14,
                              color: desktop?.currentLowerThird != null
                                  ? AppTheme.textSecondary
                                  : AppTheme.textMuted,
                              fontStyle: desktop?.currentLowerThird == null
                                  ? FontStyle.italic
                                  : FontStyle.normal,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: desktop?.currentLowerThird != null
                            ? AppTheme.success
                            : AppTheme.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Name + Title form
            Form(
              key: _formKey,
              child: Column(
                children: [
                  TextFormField(
                    controller: _nameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Name',
                      hintText: 'e.g. Pastor John',
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Please enter a name';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _titleController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Title / Role',
                      hintText: 'e.g. Senior Pastor',
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Please enter a title';
                      }
                      return null;
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Show button
            SizedBox(
              height: 56,
              child: ElevatedButton.icon(
                onPressed: _showLowerThird,
                icon: const Icon(Icons.visibility, size: 24),
                label: const Text(
                  'Show on Screen',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryBlue,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Clear button
            SizedBox(
              height: 56,
              child: ElevatedButton.icon(
                onPressed: desktop?.currentLowerThird != null ? _clearLowerThird : null,
                icon: const Icon(Icons.visibility_off, size: 24),
                label: const Text(
                  'Remove from Screen',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.error.withAlpha(25),
                  foregroundColor: AppTheme.error,
                  disabledBackgroundColor: AppTheme.error.withAlpha(10),
                  disabledForegroundColor: AppTheme.error.withAlpha(80),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: AppTheme.error.withAlpha(50)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
