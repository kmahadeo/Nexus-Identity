# Nexus Identity — Mobile App

React Native app for iOS and Android with hands-on and hands-free modes.

## Prerequisites

1. **Node.js 18+**
2. **Xcode 15+** (for iOS) — you already have this with Apple Developer account
3. **Android Studio** (for Android) — optional for now
4. **CocoaPods** — `sudo gem install cocoapods`

## Setup

```bash
cd mobile

# Install dependencies
npm install

# Install iOS pods
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# Run on iOS simulator
npm run ios

# Run on physical iPhone (connect via USB)
npm run ios -- --device
```

## Architecture

```
mobile/
├── App.tsx                 # Root component with navigation
├── src/
│   ├── screens/           # Screen components
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── VaultScreen.tsx
│   │   ├── PasskeysScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── VoiceScreen.tsx
│   ├── components/        # Shared components
│   ├── lib/               # Shared with web (Supabase, crypto)
│   ├── hooks/             # React hooks
│   └── theme/             # AURA design tokens for mobile
├── ios/                   # Xcode project
├── android/               # Android project
└── package.json
```

## Features

### Hands-On Mode (default)
- Passkey registration via platform biometrics
- Vault access with biometric gate
- Push notifications for security events
- QR code scanning for desktop pairing

### Hands-Free Mode
- Voice activation: "Hey Nexus, ..."
- Voice commands for all security operations
- Audio responses read aloud
- Works with screen off (background audio)
