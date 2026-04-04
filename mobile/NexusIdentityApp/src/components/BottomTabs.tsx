import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Animated, Modal, Dimensions,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';

export type TabName = 'Dashboard' | 'Vault' | 'Voice' | 'More';

interface BottomTabsProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
  onMoreItem: (path: string, title: string) => void;
}

interface TabItem {
  key: TabName;
  label: string;
  letter: string;
}

const TABS: TabItem[] = [
  { key: 'Dashboard', label: 'Home', letter: 'H' },
  { key: 'Vault', label: 'Vault', letter: 'V' },
  { key: 'Voice', label: 'Voice', letter: 'M' },
  { key: 'More', label: 'More', letter: '\u2261' },
];

const MORE_ITEMS = [
  { path: '/admin', title: 'Admin' },
  { path: '/settings', title: 'Settings' },
  { path: '/team', title: 'Team' },
  { path: '/sso', title: 'SSO' },
  { path: '/threats', title: 'Threats' },
  { path: '/billing', title: 'Billing' },
];

export default function BottomTabs({ activeTab, onTabPress, onMoreItem }: BottomTabsProps) {
  const [showMore, setShowMore] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showMore) {
      Animated.spring(slideAnim, {
        toValue: 1,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [showMore]);

  const handleTabPress = (tab: TabName) => {
    if (tab === 'More') {
      setShowMore(true);
    } else {
      onTabPress(tab);
    }
  };

  const handleMoreItem = (path: string, title: string) => {
    setShowMore(false);
    onMoreItem(path, title);
  };

  const menuTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <>
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconBg, isActive && styles.tabIconBgActive]}>
                <Text
                  style={[
                    styles.tabIcon,
                    isActive && styles.tabIconActive,
                  ]}
                >
                  {tab.letter}
                </Text>
              </View>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* More Menu Modal */}
      <Modal
        visible={showMore}
        transparent
        animationType="none"
        onRequestClose={() => setShowMore(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMore(false)}
        >
          <Animated.View
            style={[
              styles.moreMenu,
              { transform: [{ translateY: menuTranslateY }] },
            ]}
          >
            <View style={styles.moreHandle} />
            <Text style={styles.moreTitle}>More</Text>
            {MORE_ITEMS.map(item => (
              <TouchableOpacity
                key={item.path}
                style={styles.moreItem}
                onPress={() => handleMoreItem(item.path, item.title)}
                activeOpacity={0.7}
              >
                <Text style={styles.moreItemText}>{item.title}</Text>
                <Text style={styles.moreChevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.select({ ios: 20, android: 8 }),
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBgActive: {
    backgroundColor: colors.accentDim,
  },
  tabIcon: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  tabIconActive: {
    color: colors.accent,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.accent,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  moreMenu: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.select({ ios: 40, android: 24 }),
    paddingTop: spacing.md,
  },
  moreHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  moreTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  moreItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moreItemText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  moreChevron: {
    color: colors.textMuted,
    fontSize: fontSize.xl,
  },
});
