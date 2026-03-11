# NEXUS AI — Sistema di Intelligenza Adattiva

Un assistente personale AI avanzato per Android, costruito con Expo/React Native.

---

## Agenti disponibili

| Agente | Descrizione |
|--------|-------------|
| ◈ OSINT | Intelligence su persone, aziende ed entità |
| ◉ VERITÀ | Rilevamento incoerenze e analisi veridicità |
| ◎ NAVIGA | Navigazione predittiva e percorsi ottimali |
| ♥ SALUTE | Parametri vitali, benessere e diagnostica |
| ◆ FINANZA | Analisi finanziaria e consulenza investimenti |
| ◐ APPRENDI | Tutor adattivo e sintesi intelligente |

---

## Setup rapido

### 1. Installa le dipendenze
```bash
npm install
```

### 2. Avvia in sviluppo
```bash
npx expo start
```

### 3. Genera il keystore Android (una volta sola)
```bash
keytool -genkey -v \
  -keystore nexus-ai.keystore \
  -alias nexus-ai \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Poi aggiorna `credentials.json` con le password scelte.

### 4. Build APK locale
```bash
npm run build:apk
```

### 5. Build via EAS Cloud
```bash
# Login EAS (prima volta)
npx eas-cli login

# Crea progetto EAS e aggiorna projectId in app.json
npx eas-cli project:init

# Build
eas build -p android --profile preview
```

---

## Configurazione in-app

All'avvio, premi **⚙** in alto a destra e inserisci:

| Campo | Dove ottenerla |
|-------|----------------|
| **Groq API Key** | [console.groq.com](https://console.groq.com) — gratuita |
| **Anthropic API Key** | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI API Key** | [platform.openai.com](https://platform.openai.com) |
| **ElevenLabs Key** | [elevenlabs.io](https://elevenlabs.io) — opzionale per TTS avanzato |

---

## Struttura del progetto

```
NexusApp/
├── App.js                  # App principale (unico file sorgente)
├── app.json                # Configurazione Expo
├── eas.json                # Profili di build EAS
├── credentials.json        # Keystore Android (NON committare)
├── babel.config.js
├── package.json
├── icon.png                # Icona app (1024×1024)
├── adaptive-icon.png       # Icona adattiva Android (1024×1024)
├── splash.png              # Splash screen (1242×2436)
├── favicon.png             # Favicon web
└── nexus-ai.keystore       # Keystore generato (NON committare)
```

---

## Funzionalità

- **6 agenti AI specializzati** con prompt di sistema ottimizzati
- **Supporto multi-provider**: Groq (gratuito), Anthropic Claude, OpenAI GPT-4o
- **Modalità chiamata vocale** con speech recognition (WebView)
- **TTS**: ElevenLabs (alta qualità) o expo-speech (nativo)
- **Persistenza** della cronologia con AsyncStorage
- **UI HUD dark** con colori per agente
- **Cambio agente** al volo con pulizia cronologia

---

## Build su GitHub Actions

Aggiungi il secret `EXPO_TOKEN` nelle impostazioni del repository GitHub, poi ogni push su `main` avvia la build automatica.

---

## Note

- Il file `credentials.json` e il keystore sono esclusi da git per sicurezza
- Sostituisci `YOUR_EAS_PROJECT_ID_HERE` in `app.json` dopo `eas project:init`
- Le API key vengono salvate solo localmente sul dispositivo tramite AsyncStorage
