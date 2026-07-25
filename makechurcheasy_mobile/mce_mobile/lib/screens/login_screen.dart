import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../services/mce_provider.dart';
import 'connection_wizard_screen.dart';
import 'app_shell.dart';
import 'onboarding_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  void _login() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Please enter both email and password');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    final auth = context.authService;
    final success = await auth.login(email: email, password: password);

    if (!mounted) return;

    if (success) {
      // Check if desktop is already paired
      final desktop = context.desktopService;
      final hasConnection = await desktop.restoreConnection();

      if (!mounted) return;

      if (hasConnection) {
        _goToApp();
      } else {
        _goToConnectionWizard();
      }
    } else {
      setState(() {
        _isLoading = false;
        _error = 'Invalid email or password. Please try again.';
      });
    }
  }

  void _goToConnectionWizard() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const ConnectionWizardScreen()),
    );
  }

  void _goToApp() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const AppShell()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MCEColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: MCESpacing.xxl),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.of(context).size.height -
                  MediaQuery.of(context).padding.vertical,
            ),
            child: IntrinsicHeight(
              child: Column(
                children: [
                  const Spacer(flex: 2),

                  // Logo
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: MCEColors.primaryBlue,
                      borderRadius: BorderRadius.circular(MCERadius.lg),
                    ),
                    child: const Icon(
                      Icons.play_arrow_rounded,
                      size: 40,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: MCESpacing.lg),

                  // Title
                  const Text(
                    'MakeChurchEasy',
                    style: MCETypography.sectionTitle,
                  ),
                  const SizedBox(height: MCESpacing.sm),
                  Text(
                    'Sign in to control your church broadcast',
                    style: MCETypography.body.copyWith(
                      color: MCEColors.textSecondary,
                    ),
                  ),

                  const Spacer(flex: 2),

                  // Error message
                  if (_error != null) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(MCESpacing.md),
                      decoration: BoxDecoration(
                        color: MCEColors.danger.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(MCERadius.md),
                        border: Border.all(
                          color: MCEColors.danger.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        _error!,
                        style: MCETypography.body.copyWith(
                          color: MCEColors.danger,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    const SizedBox(height: MCESpacing.lg),
                  ],

                  // Email field
                  _buildTextField(
                    controller: _emailController,
                    focusNode: _emailFocusNode,
                    label: 'Email',
                    hint: 'you@church.com',
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: Icons.email_outlined,
                    onSubmitted: (_) => _passwordFocusNode.requestFocus(),
                  ),
                  const SizedBox(height: MCESpacing.md),

                  // Password field
                  _buildTextField(
                    controller: _passwordController,
                    focusNode: _passwordFocusNode,
                    label: 'Password',
                    hint: 'Enter your password',
                    obscureText: true,
                    prefixIcon: Icons.lock_outline,
                    onSubmitted: (_) => _login(),
                  ),
                  const SizedBox(height: MCESpacing.xxl),

                  // Login button
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _login,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: MCEColors.primaryBlue,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: MCEColors.primaryBlue.withValues(alpha: 0.5),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(MCERadius.md),
                        ),
                        elevation: 0,
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Text(
                              'Sign In',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                  ),

                  const SizedBox(height: MCESpacing.lg),

                  // Onboarding link
                  TextButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const OnboardingScreen(),
                        ),
                      );
                    },
                    child: Text(
                      'View introduction',
                      style: MCETypography.body.copyWith(
                        color: MCEColors.textSecondary,
                      ),
                    ),
                  ),

                  const Spacer(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required FocusNode focusNode,
    required String label,
    required String hint,
    bool obscureText = false,
    TextInputType? keyboardType,
    IconData? prefixIcon,
    ValueChanged<String>? onSubmitted,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: MCETypography.bodyBold),
        const SizedBox(height: MCESpacing.sm),
        Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: MCESpacing.md),
          decoration: BoxDecoration(
            color: MCEColors.elevated,
            borderRadius: BorderRadius.circular(MCERadius.md),
            border: Border.all(color: MCEColors.border),
          ),
          child: Row(
            children: [
              if (prefixIcon != null) ...[
                Icon(prefixIcon, size: 18, color: MCEColors.textSecondary),
                const SizedBox(width: MCESpacing.sm),
              ],
              Expanded(
                child: TextField(
                  controller: controller,
                  focusNode: focusNode,
                  obscureText: obscureText,
                  keyboardType: keyboardType,
                  onSubmitted: onSubmitted,
                  style: MCETypography.body,
                  decoration: InputDecoration(
                    hintText: hint,
                    hintStyle: MCETypography.body.copyWith(
                      color: MCEColors.textTertiary,
                    ),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
