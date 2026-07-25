class MCEUser {
  final String id;
  final String email;
  final String? name;
  final String? church;
  final String? avatarUrl;

  const MCEUser({
    required this.id,
    required this.email,
    this.name,
    this.church,
    this.avatarUrl,
  });

  factory MCEUser.fromJson(Map<String, dynamic> json) {
    return MCEUser(
      id: json['id'] as String,
      email: json['email'] as String,
      name: json['name'] as String?,
      church: json['church'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        if (name != null) 'name': name,
        if (church != null) 'church': church,
        if (avatarUrl != null) 'avatarUrl': avatarUrl,
      };

  String get initials {
    if (name != null && name!.isNotEmpty) {
      final parts = name!.trim().split(RegExp(r'\s+'));
      if (parts.length >= 2) {
        return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      }
      return parts[0][0].toUpperCase();
    }
    return email.isNotEmpty ? email[0].toUpperCase() : '?';
  }
}

class AuthToken {
  final String accessToken;
  final String? refreshToken;
  final DateTime? expiresAt;

  const AuthToken({
    required this.accessToken,
    this.refreshToken,
    this.expiresAt,
  });

  factory AuthToken.fromJson(Map<String, dynamic> json) {
    return AuthToken(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String?,
      expiresAt: json['expiresAt'] != null
          ? DateTime.parse(json['expiresAt'] as String)
          : null,
    );
  }

  bool get isExpired {
    if (expiresAt == null) return false;
    return DateTime.now().isAfter(expiresAt!);
  }
}

class LoginResponse {
  final MCEUser user;
  final AuthToken token;

  const LoginResponse({required this.user, required this.token});

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      user: MCEUser.fromJson(json['user'] as Map<String, dynamic>),
      token: AuthToken.fromJson(json['token'] as Map<String, dynamic>),
    );
  }
}
