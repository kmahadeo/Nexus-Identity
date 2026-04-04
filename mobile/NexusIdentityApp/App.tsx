/**
 * Nexus Identity — Mobile App
 *
 * Native screens for Login, Dashboard, Vault, Voice.
 * WebView fallback for everything else (Admin, Settings, Team, etc.)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, StatusBar, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/theme/colors';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import VaultScreen from './src/screens/VaultScreen';
import VoiceScreen from './src/screens/VoiceScreen';
import WebViewScreen from './src/screens/WebViewScreen';
import BottomTabs, { type TabName } from './src/components/BottomTabs';

const SESSION_KEY = '@nexus_session';

interface Session {
  email: string;
  name: string;
  role: string;
  principalId: string;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
  const [webViewPath, setWebViewPath] = useState<string | null>(null);
  const [webViewTitle, setWebViewTitle] = useState('');

  // Restore session on mount
  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY).then(stored => {
      if (stored) {
        try {
          setSession(JSON.parse(stored));
        } catch {
          // Corrupted session
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleLogin = useCallback(async (email: string, name: string, role: string) => {
    const newSession: Session = {
      email,
      name,
      role,
      principalId: email, // Use email as principal_id fallback
    };
    setSession(newSession);
    setActiveTab('Dashboard');
    setWebViewPath(null);
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    } catch {
      // Storage failure — continue anyway
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setSession(null);
    setActiveTab('Dashboard');
    setWebViewPath(null);
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const handleNavigate = useCallback((screen: string) => {
    if (screen === 'Dashboard' || screen === 'Vault' || screen === 'Voice') {
      setActiveTab(screen as TabName);
      setWebViewPath(null);
    } else if (screen === 'Settings') {
      setWebViewPath('/settings');
      setWebViewTitle('Settings');
      setActiveTab('More');
    } else if (screen === 'Threats') {
      setWebViewPath('/threats');
      setWebViewTitle('Threats');
      setActiveTab('More');
    } else if (screen === 'Passkeys') {
      setWebViewPath('/settings');
      setWebViewTitle('Settings');
      setActiveTab('More');
    } else {
      setWebViewPath('/' + screen.toLowerCase());
      setWebViewTitle(screen);
      setActiveTab('More');
    }
  }, []);

  const handleTabPress = useCallback((tab: TabName) => {
    setActiveTab(tab);
    if (tab !== 'More') {
      setWebViewPath(null);
    }
  }, []);

  const handleMoreItem = useCallback((path: string, title: string) => {
    setWebViewPath(path);
    setWebViewTitle(title);
    setActiveTab('More');
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      </View>
    );
  }

  // Not logged in
  if (!session) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} translucent={false} />
        <LoginScreen onLogin={handleLogin} />
      </SafeAreaProvider>
    );
  }

  // Logged in — render active screen with tab bar
  const renderScreen = () => {
    // WebView paths take priority when set
    if (webViewPath) {
      return (
        <WebViewScreen
          path={webViewPath}
          title={webViewTitle}
          onBack={() => {
            setWebViewPath(null);
            setActiveTab('Dashboard');
          }}
        />
      );
    }

    switch (activeTab) {
      case 'Dashboard':
        return (
          <DashboardScreen
            email={session.email}
            name={session.name}
            role={session.role}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        );
      case 'Vault':
        return (
          <VaultScreen
            principalId={session.principalId}
            email={session.email}
          />
        );
      case 'Voice':
        return (
          <VoiceScreen
            email={session.email}
            name={session.name}
            onNavigate={handleNavigate}
          />
        );
      case 'More':
        // Default to admin if no specific path
        return (
          <WebViewScreen
            path="/admin"
            title="Admin"
            onBack={() => {
              setActiveTab('Dashboard');
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} translucent={false} />
      <View style={styles.container}>
        <View style={styles.screenArea}>
          {renderScreen()}
        </View>
        <BottomTabs
          activeTab={activeTab}
          onTabPress={handleTabPress}
          onMoreItem={handleMoreItem}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenArea: {
    flex: 1,
  },
});

export default App;
