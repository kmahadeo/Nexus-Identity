import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, SafeAreaView, Animated, Platform, Dimensions,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;

interface DashboardScreenProps {
  email: string;
  name: string;
  role: string;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
}

interface DashboardData {
  vaultCount: number;
  passkeysCount: number;
  securityScore: number;
  threatCount: number;
  mfaEnabled: boolean;
}

export default function DashboardScreen({ email, name, role, onNavigate, onLogout }: DashboardScreenProps) {
  const [data, setData] = useState<DashboardData>({
    vaultCount: 0,
    passkeysCount: 0,
    securityScore: 0,
    threatCount: 0,
    mfaEnabled: false,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scoreAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadData = async () => {
    try {
      const { data: profile } = await supabase.from('profiles')
        .select('vault_count, passkeys_count, mfa_enabled')
        .eq('email', email)
        .maybeSingle();

      const vaultCount = profile?.vault_count || 0;
      const passkeysCount = profile?.passkeys_count || 0;
      const mfaEnabled = profile?.mfa_enabled || false;
      const score = Math.max(20,
        100
        - (vaultCount === 0 ? 15 : 0)
        - (passkeysCount === 0 ? 25 : 0)
        - (!mfaEnabled ? 20 : 0)
      );

      setData({ vaultCount, passkeysCount, securityScore: score, threatCount: 0, mfaEnabled });

      Animated.timing(scoreAnim, {
        toValue: score,
        duration: 800,
        useNativeDriver: false,
      }).start();
    } catch {
      // Fallback
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const firstName = name.split(' ')[0];

  const scoreColor = data.securityScore >= 80 ? colors.success
    : data.securityScore >= 60 ? colors.warning
    : colors.error;

  const scoreBarWidth = scoreAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{firstName}</Text>
          </View>
          <TouchableOpacity style={styles.avatarCircle} onPress={onLogout} activeOpacity={0.7}>
            <Text style={styles.avatarText}>{firstName[0]?.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Security Score Card */}
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>SECURITY SCORE</Text>
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>
                {data.securityScore}
              </Text>
              <Text style={styles.scoreUnit}>/100</Text>
            </View>
            <View style={styles.scoreBar}>
              <Animated.View
                style={[
                  styles.scoreBarFill,
                  { width: scoreBarWidth, backgroundColor: scoreColor },
                ]}
              />
            </View>
            <Text style={styles.scoreHint}>
              {data.securityScore >= 80 ? 'Excellent security posture'
                : data.securityScore >= 60 ? 'Good — room for improvement'
                : 'Needs attention — enable MFA and passkeys'}
            </Text>
          </View>

          {/* Metric Cards — 2x2 grid */}
          <View style={styles.metricsGrid}>
            <TouchableOpacity
              style={styles.metricCard}
              onPress={() => onNavigate('Vault')}
              activeOpacity={0.7}
            >
              <View style={[styles.metricIconBg, { backgroundColor: colors.accentDim }]}>
                <Text style={styles.metricIconText}>V</Text>
              </View>
              <Text style={styles.metricValue}>{data.vaultCount}</Text>
              <Text style={styles.metricLabel}>Vault Entries</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.metricCard}
              onPress={() => onNavigate('Settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.metricIconBg, { backgroundColor: colors.violetDim }]}>
                <Text style={[styles.metricIconText, { color: colors.violet }]}>P</Text>
              </View>
              <Text style={styles.metricValue}>{data.passkeysCount}</Text>
              <Text style={styles.metricLabel}>Passkeys</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.metricCard}
              onPress={() => onNavigate('Settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.metricIconBg, { backgroundColor: data.mfaEnabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)' }]}>
                <Text style={[styles.metricIconText, { color: data.mfaEnabled ? colors.success : colors.warning }]}>M</Text>
              </View>
              <Text style={[styles.metricValue, { color: data.mfaEnabled ? colors.success : colors.warning }]}>
                {data.mfaEnabled ? 'ON' : 'OFF'}
              </Text>
              <Text style={styles.metricLabel}>MFA Status</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.metricCard}
              onPress={() => onNavigate('Threats')}
              activeOpacity={0.7}
            >
              <View style={[styles.metricIconBg, { backgroundColor: data.threatCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)' }]}>
                <Text style={[styles.metricIconText, { color: data.threatCount > 0 ? colors.error : colors.success }]}>T</Text>
              </View>
              <Text style={[styles.metricValue, { color: data.threatCount > 0 ? colors.error : colors.success }]}>
                {data.threatCount}
              </Text>
              <Text style={styles.metricLabel}>Threats</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => onNavigate('Vault')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBg, { backgroundColor: colors.accentDim }]}>
                <Text style={[styles.actionIconText, { color: colors.accent }]}>V</Text>
              </View>
              <Text style={styles.actionLabel}>Vault</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => onNavigate('Threats')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBg, { backgroundColor: colors.violetDim }]}>
                <Text style={[styles.actionIconText, { color: colors.violet }]}>S</Text>
              </View>
              <Text style={styles.actionLabel}>Threat Scan</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => onNavigate('Voice')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBg, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                <Text style={[styles.actionIconText, { color: colors.success }]}>M</Text>
              </View>
              <Text style={styles.actionLabel}>Voice Mode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => onNavigate('Settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconBg, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                <Text style={[styles.actionIconText, { color: colors.textSecondary }]}>G</Text>
              </View>
              <Text style={styles.actionLabel}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Role Badge */}
          <View style={styles.roleBadge}>
            <Text style={styles.roleLabel}>ACCOUNT</Text>
            <Text style={styles.roleValue}>{role.charAt(0).toUpperCase() + role.slice(1)} Plan</Text>
          </View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.violetDim,
    borderWidth: 1.5,
    borderColor: colors.violetBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.violet,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  // Security Score Card
  scoreCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  scoreLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 72,
  },
  scoreUnit: {
    color: colors.textMuted,
    fontSize: fontSize.xl,
    marginLeft: 4,
  },
  scoreBar: {
    width: '100%',
    height: 6,
    backgroundColor: colors.surface3,
    borderRadius: 3,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreHint: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  // Metric Cards
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  metricCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  metricIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricIconText: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  // Quick Actions
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionIconText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  actionLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  // Role Badge
  roleBadge: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  roleValue: {
    color: colors.violet,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
