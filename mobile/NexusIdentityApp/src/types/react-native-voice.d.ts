declare module 'react-native-voice' {
  interface SpeechResultsEvent {
    value?: string[];
  }

  interface SpeechErrorEvent {
    error?: {
      code?: string;
      message?: string;
    };
  }

  interface Voice {
    onSpeechStart: ((e: any) => void) | null;
    onSpeechEnd: ((e: any) => void) | null;
    onSpeechResults: ((e: SpeechResultsEvent) => void) | null;
    onSpeechError: ((e: SpeechErrorEvent) => void) | null;
    onSpeechPartialResults: ((e: SpeechResultsEvent) => void) | null;
    onSpeechVolumeChanged: ((e: any) => void) | null;
    isAvailable: () => Promise<boolean>;
    start: (locale?: string) => Promise<void>;
    stop: () => Promise<void>;
    cancel: () => Promise<void>;
    destroy: () => Promise<void>;
    removeAllListeners: () => void;
    isRecognizing: () => Promise<boolean>;
  }

  const voice: Voice;
  export default voice;
}
