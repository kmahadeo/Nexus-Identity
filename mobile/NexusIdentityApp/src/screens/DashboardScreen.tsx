import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, SafeAreaView,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';
import { supabase } from '../lib/supabase';

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
}

export default function DashboardScreen({ email, name, role, onNavigate, onLogout }: DashboardScreenProps) {
  const [data, setData] = useState<DashboardData>({ vaultCount: 0, passkeysCount: 0, securityScore: 0, threatCount: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const { data: profile } = await supabase.from('profiles')
        .select('vault_count, passkeys_count')
        .eq('email', email)
        .maybeSingle();

      const vaultCount = profile?.vault_count || 0;
      const passkeysCount = profile?.passkeys_count || 0;
      const securityScore = Math.max(20, 100 - (vaultCount === 0 ? 15 : 0) - (passkeysCount === 0 ? 25 : 0));

      setData({ vaultCount, passkeysCount, securityScore, threatCount: 0 });
    } catch {}
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const firstName = name.split(' ')[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        <TouchableOpacity style={styles.avatarCircle} onPress={onLogout}>
          <Text style={styles.avatarText}>{firstName[0]?.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Security Score Card */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Security Score</Text>
          <Text style={[styles.scoreValue, { color: data.securityScore >= 80 ? colors.success : data.securityScore >= 60 ? colors.warning : colors.error }]}>
            {data.securityScore}
          </Text>
          <Text style={styles.scoreUnit}>/100</Text>
          <View style={styles.scoreBar}>
            <View style={[styles.scoreBarFill, { width: `${data.securityScore}%`, backgroundColor: data.securityScore >= 80 ? colors.success : data.securityScore >= 60 ? colors.warning : colors.error }]} />
          </View>
        </View>

        {/* Metric Cards */}
        <View style={styles.metricsGrid}>
          <MetricCard label="Vault" value={data.vaultCount} icon="🔐" onPress={() => onNavigate('Vault')} />
          <MetricCard label="Passkeys" value={data.passkeysCount} icon="🔑" onPress={() => onNavigate('Passkeys')} />
          <MetricCard label="Threats" value={data.threatCount} icon="⚡" color={data.threatCount > 0 ? colors.error : colors.success} onPress={() => onNavigate('Dashboard')} />
          <MetricCard label="Role" value={role} icon="👤" isText onPress={() => onNavigate('Settings')} />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionButton label="Add to Vault" icon="+" onPress={() => onNavigate('Vault')} color={colors.accent} />
          <ActionButton label="Threat Scan" icon="🛡" onPress={() => onNavigate('Dashboard')} color={colors.violet} />
          <ActionButton label="Voice Mode" icon="🎤" onPress={() => onNavigate('Voice')} color={colors.success} />
          <ActionButton label="Settings" icon="⚙" onPress={() => onNavigate('Settings')} color={colors.textSecondary} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ label, value, icon, color, isText, onPress }: any) {
  return (
    <TouchableOpacity style={styles.metricCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]}>
        {isText ? value : String(value)}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionButton({ label, icon, onPress, color }: any) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  greeting: { color: colors.textSecondary, fontSize: fontSize.md },
  name: { color: colors.textPrimary, fontSize: fontSize.xxl, fontWeight: '700' },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.violetDim, borderWidth: 1, borderColor: colors.violetBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.violet, fontSize: fontSize.lg, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  scoreCard: {
    backgroundColor: colors.surface2, borderRadius: radius.xl, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginTop: spacing.md,
    alignItems: 'center',
  },
  scoreLabel: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.xs },
  scoreValue: { fontSize: 56, fontWeight: '800', lineHeight: 64 },
  scoreUnit: { color: colors.textMuted, fontSize: fontSize.lg, marginTop: -8 },
  scoreBar: {
    width: '100%', height: 6, backgroundColor: colors.surface3,
    borderRadius: 3, marginTop: spacing.md, overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg,
  },
  metricCard: {
    width: '48%', backgroundColor: colors.surface2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    alignItems: 'center',
  },
  metricIcon: { fontSize: 24, marginBottom: spacing.xs },
  metricValue: { color: colors.textPrimary, fontSize: fontSize.xxl, fontWeight: '700' },
  metricLabel: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  sectionTitle: {
    color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '600',
    marginTop: spacing.xl, marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  actionButton: {
    width: '48%', backgroundColor: colors.surface2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    alignItems: 'center',
  },
  actionIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  actionLabel: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
});
