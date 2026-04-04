import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  SafeAreaView, RefreshControl, Platform, Animated, Dimensions,
  Alert, Clipboard,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STAT_CARD_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;

interface VaultScreenProps {
  principalId: string;
  email: string;
}

interface VaultEntry {
  id: string;
  name: string;
  username: string;
  password?: string;
  category: string;
  url: string;
  notes: string;
  strength: 'strong' | 'medium' | 'weak' | 'unknown';
  needs_rotation: boolean;
  synced: boolean;
  created_at: string;
}

interface VaultStats {
  total: number;
  secure: number;
  needsRotation: number;
  synced: number;
}

const CATEGORY_ICONS: Record<string, { letter: string; color: string; bg: string }> = {
  password: { letter: 'P', color: colors.accent, bg: colors.accentDim },
  'api-key': { letter: 'K', color: colors.violet, bg: colors.violetDim },
  'credit-card': { letter: 'C', color: colors.warning, bg: 'rgba(245, 158, 11, 0.15)' },
  note: { letter: 'N', color: colors.info, bg: 'rgba(59, 130, 246, 0.15)' },
  identity: { letter: 'I', color: colors.success, bg: 'rgba(34, 197, 94, 0.15)' },
};

const STRENGTH_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  strong: { label: 'Strong', color: colors.success, bg: 'rgba(34, 197, 94, 0.15)' },
  medium: { label: 'Medium', color: colors.warning, bg: 'rgba(245, 158, 11, 0.15)' },
  weak: { label: 'Weak', color: colors.error, bg: 'rgba(239, 68, 68, 0.15)' },
  unknown: { label: '---', color: colors.textMuted, bg: 'rgba(100, 116, 139, 0.15)' },
};

export default function VaultScreen({ principalId, email }: VaultScreenProps) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [stats, setStats] = useState<VaultStats>({ total: 0, secure: 0, needsRotation: 0, synced: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadEntries = useCallback(async () => {
    try {
      const { data } = await supabase.from('vault_entries')
        .select('id, name, username, category, url, notes, strength, needs_rotation, synced, created_at')
        .eq('owner_id', principalId)
        .order('created_at', { ascending: false });

      const list = (data || []) as VaultEntry[];
      setEntries(list);

      setStats({
        total: list.length,
        secure: list.filter(e => e.strength === 'strong').length,
        needsRotation: list.filter(e => e.needs_rotation).length,
        synced: list.filter(e => e.synced).length,
      });
    } catch {
      // Silently fail
    }
  }, [principalId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleRevealPassword = (entryId: string) => {
    // In production, this would call react-native biometrics
    Alert.alert(
      'Biometric Verification',
      'Authenticate to reveal password',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Authenticate',
          onPress: () => {
            setRevealedPasswords(prev => {
              const next = new Set(prev);
              if (next.has(entryId)) {
                next.delete(entryId);
              } else {
                next.add(entryId);
              }
              return next;
            });
          },
        },
      ],
    );
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  const handleAddEntry = () => {
    Alert.alert('Add Entry', 'Use the web app to add new vault entries for now.');
  };

  const catInfo = (category: string) =>
    CATEGORY_ICONS[category] || { letter: 'X', color: colors.textMuted, bg: 'rgba(100, 116, 139, 0.15)' };

  const strengthInfo = (strength: string) =>
    STRENGTH_BADGE[strength] || STRENGTH_BADGE.unknown;

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.wrapper, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Enterprise Vault</Text>
            <Text style={styles.headerSubtitle}>{stats.total} entries</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddEntry}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
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
          {/* Stats Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.secure}</Text>
              <Text style={styles.statLabel}>Secure</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: stats.needsRotation > 0 ? colors.warning : colors.success }]}>
                {stats.needsRotation}
              </Text>
              <Text style={styles.statLabel}>Needs Rotation</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{stats.synced}</Text>
              <Text style={styles.statLabel}>Synced</Text>
            </View>
          </View>

          {/* Entry List */}
          {entries.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconBg}>
                <Text style={styles.emptyIconText}>L</Text>
              </View>
              <Text style={styles.emptyTitle}>Vault is empty</Text>
              <Text style={styles.emptyText}>Add your first credential to get started</Text>
            </View>
          ) : (
            entries.map(entry => {
              const cat = catInfo(entry.category);
              const str = strengthInfo(entry.strength || 'unknown');
              const isExpanded = expandedId === entry.id;
              const isRevealed = revealedPasswords.has(entry.id);

              return (
                <TouchableOpacity
                  key={entry.id}
                  style={[styles.entryCard, isExpanded && styles.entryCardExpanded]}
                  onPress={() => handleToggleExpand(entry.id)}
                  activeOpacity={0.7}
                >
                  {/* Entry Row */}
                  <View style={styles.entryRow}>
                    <View style={[styles.entryCatIcon, { backgroundColor: cat.bg }]}>
                      <Text style={[styles.entryCatLetter, { color: cat.color }]}>{cat.letter}</Text>
                    </View>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryName}>{entry.name}</Text>
                      <Text style={styles.entrySub}>{entry.username || entry.category}</Text>
                    </View>
                    <View style={[styles.strengthBadge, { backgroundColor: str.bg }]}>
                      <Text style={[styles.strengthText, { color: str.color }]}>{str.label}</Text>
                    </View>
                    <Text style={styles.chevron}>{isExpanded ? '\u25BC' : '\u25B6'}</Text>
                  </View>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <View style={styles.expandedSection}>
                      {entry.username ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Username</Text>
                          <View style={styles.detailRight}>
                            <Text style={styles.detailValue}>{entry.username}</Text>
                            <TouchableOpacity
                              style={styles.copyBtn}
                              onPress={() => copyToClipboard(entry.username, 'Username')}
                            >
                              <Text style={styles.copyBtnText}>Copy</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Password</Text>
                        <View style={styles.detailRight}>
                          <Text style={styles.detailValue}>
                            {isRevealed ? (entry.password || 'N/A') : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                          </Text>
                          <TouchableOpacity
                            style={styles.copyBtn}
                            onPress={() => handleRevealPassword(entry.id)}
                          >
                            <Text style={styles.copyBtnText}>{isRevealed ? 'Hide' : 'Reveal'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {entry.url ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>URL</Text>
                          <View style={styles.detailRight}>
                            <Text style={styles.detailValue} numberOfLines={1}>{entry.url}</Text>
                            <TouchableOpacity
                              style={styles.copyBtn}
                              onPress={() => copyToClipboard(entry.url, 'URL')}
                            >
                              <Text style={styles.copyBtnText}>Copy</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}

                      {entry.notes ? (
                        <View style={styles.notesRow}>
                          <Text style={styles.detailLabel}>Notes</Text>
                          <Text style={styles.notesText}>{entry.notes}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
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
  wrapper: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  addButtonText: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 100,
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    width: STAT_CARD_WIDTH,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Empty State
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIconText: {
    color: colors.textMuted,
    fontSize: 32,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  // Entry Card
  entryCard: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  entryCardExpanded: {
    borderColor: colors.accentBorder,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  entryCatIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCatLetter: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  entryInfo: {
    flex: 1,
  },
  entryName: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  entrySub: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  strengthBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  strengthText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
  },
  // Expanded
  expandedSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    width: 80,
  },
  detailRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    flexShrink: 1,
  },
  copyBtn: {
    backgroundColor: colors.surface3,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  copyBtnText: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  notesRow: {
    paddingVertical: spacing.sm,
  },
  notesText: {
    color: colors.textTertiary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});
