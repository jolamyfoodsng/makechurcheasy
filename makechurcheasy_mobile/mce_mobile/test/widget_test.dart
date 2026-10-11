import 'package:flutter_test/flutter_test.dart';

import 'package:mce_mobile/main.dart';

void main() {
  testWidgets('App renders MakeChurchEazy splash branding', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MCEApp());
    expect(find.text('MakeChurchEazy'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
  });
}
