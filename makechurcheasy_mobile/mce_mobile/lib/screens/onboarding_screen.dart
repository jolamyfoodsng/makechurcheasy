import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import 'login_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _currentPage = 0;

  static const _pages = [
    _OnboardingPageData(
      icon: Icons.church_outlined,
      title: 'Welcome to\nMakeChurchEasy',
      subtitle: 'The remote control app for\nMakeChurchEasy Studio',
      features: [],
    ),
    _OnboardingPageData(
      icon: Icons.speed,
      title: 'Control OBS\nFrom Anywhere',
      subtitle: 'Start and stop streaming\nSwitch scenes live\nControl your broadcast in real time',
      features: [],
    ),
    _OnboardingPageData(
      icon: Icons.book,
      title: 'Bible & Worship\nBuilt In',
      subtitle: 'Search and display Bible verses\nAccess your full song library\nControl lyrics and slides live',
      features: [],
    ),
    _OnboardingPageData(
      icon: Icons.link,
      title: 'Connect To Your\nChurch Computer',
      subtitle: 'Scan the QR code on your desktop app\nOr enter the connection code manually\nYou\'ll be connected in seconds',
      features: [],
    ),
  ];

  void _next() {
    if (_currentPage < 3) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      _goToLogin();
    }
  }

  void _goToLogin() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  void _skip() => _goToLogin();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MCEColors.background,
      body: SafeArea(
        child: Column(
          children: [
            // Skip button
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(MCESpacing.lg),
                child: TextButton(
                  onPressed: _skip,
                  child: Text(
                    'Skip',
                    style: MCETypography.body.copyWith(
                      color: MCEColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),

            // Page content
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: 4,
                onPageChanged: (i) => setState(() => _currentPage = i),
                itemBuilder: (context, i) {
                  final p = _pages[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: MCESpacing.xxl),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Icon container
                        Container(
                          width: 120,
                          height: 120,
                          decoration: BoxDecoration(
                            color: MCEColors.primaryBlue.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(MCERadius.xl),
                            border: Border.all(
                              color: MCEColors.primaryBlue.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Icon(
                            p.icon,
                            size: 56,
                            color: MCEColors.primaryBlue,
                          ),
                        ),
                        const SizedBox(height: MCESpacing.xxl),

                        // Title
                        Text(
                          p.title,
                          textAlign: TextAlign.center,
                          style: MCETypography.sectionTitle.copyWith(fontSize: 28),
                        ),
                        const SizedBox(height: MCESpacing.lg),

                        // Subtitle
                        Text(
                          p.subtitle,
                          textAlign: TextAlign.center,
                          style: MCETypography.body.copyWith(
                            color: MCEColors.textSecondary,
                            height: 1.6,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

            // Dots + Button
            Padding(
              padding: const EdgeInsets.all(MCESpacing.xxl),
              child: Column(
                children: [
                  // Dots
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(4, (i) {
                      final isActive = _currentPage == i;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: isActive ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: isActive
                              ? MCEColors.primaryBlue
                              : MCEColors.border,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: MCESpacing.xxl),

                  // Button
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _next,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: MCEColors.primaryBlue,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(MCERadius.md),
                        ),
                        elevation: 0,
                      ),
                      child: Text(
                        _currentPage == 3 ? 'Connect Now' : 'Get Started',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardingPageData {
  final IconData icon;
  final String title;
  final String subtitle;
  final List<String> features;

  const _OnboardingPageData({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.features,
  });
}
