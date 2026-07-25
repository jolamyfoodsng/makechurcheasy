import 'package:flutter_test/flutter_test.dart';

import 'package:mce_mobile/main.dart';

void main() {
  testWidgets('App renders MCE Studio header', (WidgetTester tester) async {
    await tester.pumpWidget(const MCEApp());
    expect(find.text('MCE Studio'), findsOneWidget);
  });
}
