import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Linking, StatusBar, Dimensions,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DISPOSABLE_DOMAINS = [
  'test.com', 'example.com', 'fake.com', 'mailinator.com', 'yopmail.com',
  'guerrillamail.com', 'tempmail.com', 'throwaway.email', 'dispostable.com',
  'sharklasers.com', 'trashmail.com', 'temp-mail.org',
];

interface LoginScreenProps {
  onLogin: (email: string, name: string, role: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleGoogleSSO = () => {
    Linking.openURL('https://nexus-identity.pages.dev/auth/google');
  };

  const handleAppleSSO = () => {
    Linking.openURL('https://nexus-identity.pages.dev/auth/apple');
  };

  const handleDemo = () => {
    onLogin('demo@nexus.id', 'Demo User', 'individual');
  };

  const handleContinue = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    const domain = trimmed.split('@')[1];
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      setError('Disposable email addresses are not allowed');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await supabase.from('profiles')
        .select('principal_id, name, role, tier')
        .eq('email', trimmed)
        .maybeSingle();

      if (data) {
        onLogin(trimmed, data.name, data.role);
      } else {
        onLogin(trimmed, trimmed.split('@')[0], 'individual');
      }
    } catch {
      onLogin(trimmed, trimmed.split('@')[0], 'individual');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Logo */}
          <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
            <View style={styles.logoSquare}>
              <Text style={styles.logoText}>N</Text>
            </View>
            <Text style={styles.title}>Nexus Identity</Text>
            <Text style={styles.subtitle}>PASSWORDLESS IDENTITY PLATFORM</Text>
          </Animated.View>

          {/* SSO Buttons */}
          <View style={styles.ssoSection}>
            <TouchableOpacity
              style={styles.ssoButton}
              onPress={handleGoogleSSO}
              activeOpacity={0.7}
            >
              <Text style={styles.ssoIcon}>G</Text>
              <Text style={styles.ssoText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ssoButton}
              onPress={handleAppleSSO}
              activeOpacity={0.7}
            >
              <Text style={styles.ssoIconApple}>{'\uF8FF'}</Text>
              <Text style={styles.ssoText}>Continue with Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="you@company.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleContinue}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.continueButton, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.buttonText} size="small" />
              ) : (
                <Text style={styles.continueButtonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Demo Mode */}
          <TouchableOpacity
            style={styles.demoButton}
            onPress={handleDemo}
            activeOpacity={0.7}
          >
            <Text style={styles.demoButtonText}>Try Demo Mode</Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text style={styles.footer}>
            END-TO-END ENCRYPTED {'\u00B7'} FIDO2 {'\u00B7'} ZERO TRUST
          </Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoSquare: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  logoText: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 2,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  ssoSection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  ssoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  ssoIcon: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  ssoIconApple: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '500',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  ssoText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.md,
  },
  form: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  continueButton: {
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.buttonPrimary,
    ...Platform.select({
      ios: {
        shadowColor: colors.buttonPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: colors.buttonText,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  demoButton: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.xl,
  },
  demoButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  footer: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    letterSpacing: 1.5,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
});
