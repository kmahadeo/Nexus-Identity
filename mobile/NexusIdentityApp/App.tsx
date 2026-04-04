/**
 * Nexus Identity — Mobile App
 */

import React, { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import VaultScreen from './src/screens/VaultScreen';

type Screen = 'Login' | 'Dashboard' | 'Vault' | 'Passkeys' | 'Settings' | 'Voice';

interface Session {
  email: string;
  name: string;
  role: string;
  principalId: string;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('Login');

  const handleLogin = (email: string, name: string, role: string) => {
    const principalId = `nexus-${role}-${btoa(email).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
    setSession({ email, name, role, principalId });
    setCurrentScreen('Dashboard');
  };

  const handleLogout = () => {
    setSession(null);
    setCurrentScreen('Login');
  };

  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen as Screen);
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#030407" />
      {!session ? (
        <LoginScreen onLogin={handleLogin} />
      ) : currentScreen === 'Dashboard' ? (
        <DashboardScreen
          email={session.email}
          name={session.name}
          role={session.role}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      ) : currentScreen === 'Vault' ? (
        <VaultScreen
          principalId={session.principalId}
          onBack={() => setCurrentScreen('Dashboard')}
        />
      ) : (
        <DashboardScreen
          email={session.email}
          name={session.name}
          role={session.role}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      )}
    </SafeAreaProvider>
  );
}

export default App;
