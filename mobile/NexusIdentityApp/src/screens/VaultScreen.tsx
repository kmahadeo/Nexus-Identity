import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  SafeAreaView, TextInput, Alert, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';
import { supabase } from '../lib/supabase';

interface VaultScreenProps {
  principalId: string;
  onBack: () => void;
}

interface VaultEntry {
  id: string;
  name: string;
  username: string;
  category: string;
  url: string;
  created_at: string;
}

export default function VaultScreen({ principalId, onBack }: VaultScreenProps) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEntries = async () => {
    const { data } = await supabase.from('vault_entries')
      .select('id, name, username, category, url, created_at')
      .eq('owner_id', principalId)
      .order('created_at', { ascending: false });
    setEntries(data || []);
  };

  useEffect(() => { loadEntries(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  };

  const categoryIcon: Record<string, string> = {
    password: '🔐', 'api-key': '🔑', 'credit-card': '💳', note: '📝',
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Vault</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔐</Text>
            <Text style={styles.emptyTitle}>Vault is empty</Text>
            <Text style={styles.emptyText}>Add credentials from the web app</Text>
          </View>
        ) : (
          entries.map(entry => (
            <TouchableOpacity
              key={entry.id}
              style={styles.card}
              onPress={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              activeOpacity={0.7}
            >
              <View style={styles.cardRow}>
                <Text style={styles.cardIcon}>{categoryIcon[entry.category] || '🔐'}</Text>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{entry.name}</Text>
                  <Text style={styles.cardSub}>{entry.username || entry.category}</Text>
                </View>
                <Text style={styles.chevron}>{expandedId === entry.id ? '▼' : '▶'}</Text>
              </View>

              {expandedId === entry.id && (
                <View style={styles.cardExpanded}>
                  {entry.username ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Username</Text>
                      <Text style={styles.detailValue}>{entry.username}</Text>
                    </View>
                  ) : null}
                  {entry.url ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>URL</Text>
                      <Text style={styles.detailValue}>{entry.url}</Text>
                    </View>
                  ) : null}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Password</Text>
                    <Text style={styles.detailValue}>••••••••</Text>
                  </View>
                  <Text style={styles.detailNote}>Passkey/TOTP verification required to view secrets</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { width: 60 },
  backText: { color: colors.accent, fontSize: fontSize.md },
  title: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: '600', marginBottom: spacing.xs },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },
  card: {
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm,
  },
  cardIcon: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardName: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '600' },
  cardSub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: fontSize.sm },
  cardExpanded: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  detailLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  detailValue: { color: colors.textPrimary, fontSize: fontSize.sm, fontFamily: 'Courier New' },
  detailNote: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.sm },
});
