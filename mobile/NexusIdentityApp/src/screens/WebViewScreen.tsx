import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Platform, BackHandler,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { colors, spacing, radius, fontSize } from '../theme/colors';

const BASE_URL = 'https://nexus-identity.pages.dev';

interface WebViewScreenProps {
  path: string;
  title?: string;
  onBack?: () => void;
}

export default function WebViewScreen({ path, title, onBack }: WebViewScreenProps) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title || '');

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [canGoBack, onBack]);

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    if (navState.title && !title) {
      setCurrentTitle(navState.title);
    }
  };

  const handleBack = () => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    } else if (onBack) {
      onBack();
    }
  };

  const injectedJS = `
    (function() {
      window.__NEXUS_NATIVE__ = true;
      document.body.classList.add('nexus-mobile-app');

      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head.appendChild(meta);
      }
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

      document.addEventListener('gesturestart', function(e) { e.preventDefault(); });

      document.documentElement.style.webkitTextSizeAdjust = '100%';
      document.documentElement.style.textSizeAdjust = '100%';

      var style = document.createElement('style');
      style.textContent = \`
        .nexus-mobile-app {
          padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        }
        .nexus-mobile-app * {
          -webkit-tap-highlight-color: transparent;
        }
      \`;
      document.head.appendChild(style);
      true;
    })();
  `;

  const url = `${BASE_URL}${path.startsWith('/') ? path : '/' + path}`;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.backText}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{currentTitle || path}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadEnd={() => setLoading(false)}
        onLoadStart={() => setLoading(true)}
        onNavigationStateChange={onNavigationStateChange}
        injectedJavaScript={injectedJS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        originWhitelist={['https://*', 'http://localhost:*']}
        mixedContentMode="compatibility"
        allowsBackForwardNavigationGestures={true}
        allowsInlineMediaPlayback={true}
        scalesPageToFit={false}
        contentMode="mobile"
        automaticallyAdjustContentInsets={false}
        bounces={true}
        pullToRefreshEnabled={true}
        overScrollMode="never"
        textZoom={100}
        setSupportMultipleWindows={false}
      />
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
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: colors.accent,
    fontSize: fontSize.xl,
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '500',
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  headerSpacer: {
    width: 36,
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface1,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
