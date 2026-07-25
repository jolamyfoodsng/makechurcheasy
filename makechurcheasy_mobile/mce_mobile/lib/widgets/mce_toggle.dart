import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';

class MCEToggle extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;

  const MCEToggle({
    super.key,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 44,
        height: 24,
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: value ? MCEColors.primaryBlue : MCEColors.elevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: value ? MCEColors.primaryBlue : MCEColors.border,
          ),
        ),
        child: AnimatedAlign(
          duration: const Duration(milliseconds: 200),
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 18,
            height: 18,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}
