import 'package:flutter/material.dart';

class MCEBrandMark extends StatelessWidget {
  const MCEBrandMark({super.key, this.size = 28});

  static const assetPath = 'assets/branding/make_church_easy_logo.png';

  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'MakeChurchEasy',
      image: true,
      child: Image.asset(
        assetPath,
        width: size,
        height: size,
        fit: BoxFit.contain,
      ),
    );
  }
}
