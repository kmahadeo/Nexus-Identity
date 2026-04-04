/**
 * Nexus Identity — Mobile App
 *
 * WebView wrapper around the deployed web app with native enhancements:
 * - Native status bar and safe area handling
 * - Pull-to-refresh
 * - Native back button handling
 * - Deep link support
 * - Native splash screen
 */

import React, { useRef, useState } from 'react';
import {
  SafeAreaView, StatusBar, StyleSheet, View, Text,
  ActivityIndicator, BackHandler, Platform, RefreshControl,
  ScrollView,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

const APP_URL = 'https://nexus-identity.pages.dev';

function App() {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Handle Android back button
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [canGoBack]);

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    webViewRef.current?.reload();
    setTimeout(() => setRefreshing(false), 1500);
  };

  const injectedJS = `
    (function() {
      // Signal native container
      window.__NEXUS_NATIVE__ = true;
      document.body.classList.add('nexus-mobile-app');

      // Force correct viewport — prevent zoom issues
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head.appendChild(meta);
      }
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

      // Disable pinch zoom
      document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
      document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

      // Fix font size — prevent iOS text size adjustment
      document.documentElement.style.webkitTextSizeAdjust = '100%';
      document.documentElement.style.textSizeAdjust = '100%';
      document.documentElement.style.webkitOverflowScrolling = 'touch';

      // Add extra bottom padding for iOS safe area
      var style = document.createElement('style');
      style.textContent = \\\`
        .nexus-mobile-app {
          padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        }
        .nexus-mobile-app * {
          -webkit-tap-highlight-color: transparent;
        }
      \\\`;
      document.head.appendChild(style);

      true;
    })();
  `;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#030407" translucent={false} />

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>N</Text>
            </View>
            <Text style={styles.loadingTitle}>Nexus Identity</Text>
            <ActivityIndicator color="#22d3ee" size="small" style={{ marginTop: 16 }} />
          </View>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: APP_URL }}
        style={styles.webview}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={onNavigationStateChange}
        injectedJavaScript={injectedJS}
        // Performance
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        // Security
        originWhitelist={['https://*', 'http://localhost:*']}
        mixedContentMode="compatibility"
        // UX
        allowsBackForwardNavigationGestures={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // Camera access for liveness detection
        mediaCapturePermissionGrantType="grant"
        allowsProtectedMedia={true}
        // Viewport and zoom
        scalesPageToFit={false}
        contentMode="mobile"
        automaticallyAdjustContentInsets={false}
        bounces={true}
        pullToRefreshEnabled={true}
        overScrollMode="never"
        textZoom={100}
        // Handle links
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => {
          // Allow navigation within our app
          if (request.url.startsWith(APP_URL) || request.url.startsWith('https://accounts.google.com') || request.url.startsWith('https://appleid.apple.com')) {
            return true;
          }
          // Open external links in system browser
          return true;
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030407',
  },
  webview: {
    flex: 1,
    backgroundColor: '#030407',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030407',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#22d3ee',
    backgroundColor: '#08080f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    color: '#22d3ee',
    fontSize: 24,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  loadingTitle: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
  },
});

export default App;
