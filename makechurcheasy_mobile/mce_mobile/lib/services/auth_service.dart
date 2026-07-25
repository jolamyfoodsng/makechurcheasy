import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/auth_models.dart';

class AuthService extends ChangeNotifier {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  MCEUser? _user;
  AuthToken? _token;
  bool _isLoading = false;

  MCEUser? get user => _user;
  AuthToken? get token => _token;
  bool get isAuthenticated => _token != null && !_token!.isExpired;
  bool get isLoading => _isLoading;

  static const _userKey = 'mce_user';
  static const _tokenKey = 'mce_token';

  /// Check if user has stored auth data (for splash screen)
  Future<bool> hasStoredAuth() async {
    try {
      final tokenJson = await _storage.read(key: _tokenKey);
      if (tokenJson == null) return false;

      final token = AuthToken.fromJson(jsonDecode(tokenJson));
      if (token.isExpired) {
        await clearAuth();
        return false;
      }

      final userJson = await _storage.read(key: _userKey);
      if (userJson == null) return false;

      _token = token;
      _user = MCEUser.fromJson(jsonDecode(userJson));
      notifyListeners();
      return true;
    } catch (e) {
      await clearAuth();
      return false;
    }
  }

  /// Login with email and password against MakeChurchEasy cloud API
  Future<bool> login({
    required String email,
    required String password,
  }) async {
    _isLoading = true;
    notifyListeners();

    try {
      // TODO: Replace with actual cloud API endpoint
      // For now, simulate API call
      await Future.delayed(const Duration(seconds: 2));

      // Simulate successful response
      final response = LoginResponse(
        user: MCEUser(
          id: 'user_${DateTime.now().millisecondsSinceEpoch}',
          email: email,
          name: email.split('@').first,
          church: 'Grace Community Church',
        ),
        token: AuthToken(
          accessToken: 'mock_token_${DateTime.now().millisecondsSinceEpoch}',
          expiresAt: DateTime.now().add(const Duration(hours: 24)),
        ),
      );

      _user = response.user;
      _token = response.token;

      await _saveAuth();
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  /// Save auth data to secure storage
  Future<void> _saveAuth() async {
    if (_user != null) {
      await _storage.write(key: _userKey, value: jsonEncode(_user!.toJson()));
    }
    if (_token != null) {
      await _storage.write(key: _tokenKey, value: jsonEncode({
        'accessToken': _token!.accessToken,
        'refreshToken': _token!.refreshToken,
        'expiresAt': _token!.expiresAt?.toIso8601String(),
      }));
    }
  }

  /// Clear all auth data (logout)
  Future<void> clearAuth() async {
    _user = null;
    _token = null;
    await _storage.delete(key: _userKey);
    await _storage.delete(key: _tokenKey);
    notifyListeners();
  }

  /// Get authorization header value
  String? get authorizationHeader {
    if (_token != null && !_token!.isExpired) {
      return 'Bearer ${_token!.accessToken}';
    }
    return null;
  }
}
