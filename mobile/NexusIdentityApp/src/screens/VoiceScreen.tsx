import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, Platform, Animated, Easing, Dimensions,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme/colors';
import Voice from 'react-native-voice';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type VoiceStatus = 'ready' | 'listening' | 'processing' | 'speaking';

const SUGGESTIONS = [
  "What's my security score?",
  'Show vault',
  "Who's online?",
  'Run threat scan',
  'Enable MFA',
  'Show recent activity',
];

interface VoiceScreenProps {
  email: string;
  name: string;
  onNavigate: (screen: string) => void;
}

export default function VoiceScreen({ email, name, onNavigate }: VoiceScreenProps) {
  const [status, setStatus] = useState<VoiceStatus>('ready');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);

  // Pulse animation for the mic button
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  // Pulse animation when listening
  useEffect(() => {
    if (status === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      ring.start();
      return () => {
        pulse.stop();
        ring.stop();
        pulseAnim.setValue(1);
        ringAnim.setValue(0);
      };
    } else {
      pulseAnim.setValue(1);
      ringAnim.setValue(0);
    }
  }, [status]);

  // Voice recognition handlers
  useEffect(() => {
    Voice.onSpeechStart = () => {
      setStatus('listening');
    };
    Voice.onSpeechEnd = () => {
      setStatus('processing');
    };
    Voice.onSpeechResults = (e: any) => {
      const text = e.value?.[0] || '';
      setTranscript(text);
      processCommand(text);
    };
    Voice.onSpeechError = (e: any) => {
      setStatus('ready');
      setResponse('Could not understand. Please try again.');
    };

    Voice.isAvailable().then((available: any) => {
      setIsAvailable(!!available);
    }).catch(() => {
      setIsAvailable(false);
    });

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const processCommand = (text: string) => {
    const lower = text.toLowerCase();
    let result = '';

    if (lower.includes('security score') || lower.includes('score')) {
      result = `Your current security score is being fetched. Navigate to Dashboard for details.`;
    } else if (lower.includes('vault') || lower.includes('password')) {
      result = 'Opening your vault...';
      setTimeout(() => onNavigate('Vault'), 1500);
    } else if (lower.includes('online') || lower.includes('team')) {
      result = 'Checking team status... Open Admin panel for full details.';
    } else if (lower.includes('threat') || lower.includes('scan')) {
      result = 'Initiating threat scan... Check the threats panel for results.';
    } else if (lower.includes('mfa') || lower.includes('two factor')) {
      result = 'Navigate to Settings to manage MFA configuration.';
    } else if (lower.includes('activity') || lower.includes('recent')) {
      result = 'Recent activity is available in the Admin panel.';
    } else {
      result = `Command recognized: "${text}". Processing through Nexus AI...`;
    }

    setResponse(result);
    setStatus('speaking');

    // Reset to ready after "speaking"
    setTimeout(() => setStatus('ready'), 3000);
  };

  const handleMicPress = async () => {
    if (status === 'listening') {
      try {
        await Voice.stop();
      } catch {
        setStatus('ready');
      }
      return;
    }

    setTranscript('');
    setResponse('');

    try {
      await Voice.start('en-US');
      setStatus('listening');
    } catch {
      setResponse('Voice recognition is not available on this device.');
      setStatus('ready');
    }
  };

  const handleSuggestionPress = (suggestion: string) => {
    setTranscript(suggestion);
    processCommand(suggestion);
  };

  const statusLabel: Record<VoiceStatus, string> = {
    ready: 'Tap to speak',
    listening: 'Listening...',
    processing: 'Processing...',
    speaking: 'Speaking...',
  };

  const statusColor: Record<VoiceStatus, string> = {
    ready: colors.textSecondary,
    listening: colors.accent,
    processing: colors.violet,
    speaking: colors.success,
  };

  const ringScale = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.8],
  });
  const ringOpacity = ringAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.15, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.wrapper, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Voice Mode</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor[status] }]} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Mic Button Area */}
          <View style={styles.micArea}>
            {/* Expanding ring */}
            {status === 'listening' && (
              <Animated.View
                style={[
                  styles.micRing,
                  {
                    transform: [{ scale: ringScale }],
                    opacity: ringOpacity,
                  },
                ]}
              />
            )}

            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.micButton,
                  status === 'listening' && styles.micButtonActive,
                  status === 'processing' && styles.micButtonProcessing,
                ]}
                onPress={handleMicPress}
                activeOpacity={0.8}
                disabled={status === 'processing'}
              >
                <Text style={styles.micIcon}>M</Text>
              </TouchableOpacity>
            </Animated.View>

            <Text style={[styles.statusText, { color: statusColor[status] }]}>
              {statusLabel[status]}
            </Text>
          </View>

          {/* Transcript */}
          {transcript ? (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>YOU SAID</Text>
              <Text style={styles.transcriptText}>{transcript}</Text>
            </View>
          ) : null}

          {/* Response */}
          {response ? (
            <View style={styles.responseBox}>
              <Text style={styles.responseLabel}>NEXUS</Text>
              <Text style={styles.responseText}>{response}</Text>
            </View>
          ) : null}

          {/* Suggestions */}
          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsTitle}>Try saying...</Text>
            <View style={styles.suggestionsGrid}>
              {SUGGESTIONS.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestionPress(s)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {!isAvailable && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Voice recognition is not available on this device. Use the suggestion chips above to test commands.
              </Text>
            </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  // Mic Area
  micArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  micRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  micButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  micButtonActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  micButtonProcessing: {
    backgroundColor: colors.violetDim,
    borderColor: colors.violet,
  },
  micIcon: {
    color: colors.accent,
    fontSize: 36,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
  },
  statusText: {
    fontSize: fontSize.md,
    fontWeight: '500',
    marginTop: spacing.md,
  },
  // Transcript
  transcriptBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  transcriptLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    marginBottom: spacing.xs,
  },
  transcriptText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  // Response
  responseBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  responseLabel: {
    color: colors.accent,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }),
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  responseText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  // Suggestions
  suggestionsSection: {
    marginTop: spacing.md,
  },
  suggestionsTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestionChip: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  suggestionText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  // Warning
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  warningText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
