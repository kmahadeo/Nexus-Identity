import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';
import { supabase } from '../lib/supabase';

interface LoginScreenProps {
  onLogin: (email: string, name: string, role: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    const blocked = ['test.com', 'example.com', 'fake.com', 'mailinator.com', 'yopmail.com'];
    const domain = trimmed.split('@')[1];
    if (blocked.includes(domain)) {
      setError('Please use a real email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check Supabase for existing user
      const { data } = await supabase.from('profiles')
        .select('principal_id, name, role, tier')
        .eq('email', trimmed)
        .maybeSingle();

      if (data) {
        onLogin(trimmed, data.name, data.role);
      } else {
        // New user — default to individual
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>N</Text>
          </View>
          <Text style={styles.title}>Nexus Identity</Text>
          <Text style={styles.subtitle}>PASSWORDLESS IDENTITY PLATFORM</Text>
        </View>

        {/* Login Form */}
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
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.buttonText} size="small" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>END-TO-END ENCRYPTED · FIDO2 · ZERO TRUST</Text>
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
    paddingHorizontal: spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  form: {
    marginBottom: spacing.xxl,
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
  button: {
    backgroundColor: colors.buttonPrimary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.buttonText,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  footer: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
});
