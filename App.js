import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, KeyboardAvoidingView, Platform,
  Animated, Modal, SafeAreaView, BackHandler, Keyboard,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { WebView } from 'react-native-webview';

SplashScreen.preventAutoHideAsync();

// ─── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY_CFG     = 'nexus_v1_cfg';
const STORAGE_KEY_HIST    = 'nexus_v1_hist';
const STORAGE_KEY_MODULE  = 'nexus_v1_module';
const STORAGE_KEY_LASTMSG = 'nexus_v1_lastmsg';

const MODULES = [
  { id: 'osint',    label: 'OSINT',    icon: '◈', color: '#00f5d4', desc: 'Intelligence su persone, aziende ed entità' },
  { id: 'truth',    label: 'VERITÀ',   icon: '◉', color: '#f72585', desc: 'Rilevamento incoerenze e analisi veridicità' },
  { id: 'nav',      label: 'NAVIGA',   icon: '◎', color: '#4cc9f0', desc: 'Navigazione predittiva e percorsi ottimali' },
  { id: 'health',   label: 'SALUTE',   icon: '♥', color: '#7bf1a8', desc: 'Parametri vitali, benessere e diagnostica' },
  { id: 'finance',  label: 'FINANZA',  icon: '◆', color: '#ffd60a', desc: 'Analisi finanziaria e consulenza investimenti' },
  { id: 'learn',    label: 'APPRENDI', icon: '◐', color: '#a78bfa', desc: 'Tutor adattivo e sintesi intelligente' },
];

const SYSTEM_PROMPTS = {
  osint: `Sei l'agente OSINT di NEXUS, un sistema di intelligence avanzato. 
Quando ricevi una query su una persona, azienda o entità, fornisci un'analisi strutturata con:
- Profilo generale e background
- Connessioni note e relazioni
- Reputazione online e sentiment
- Dati pubblici disponibili
- Potenziali rischi o anomalie
Formatta la risposta come un vero report di intelligence con sezioni chiare, usa simboli come ◈ ◉ ▶ per i titoli.
Sii preciso, sintetico e professionale. Rispondi sempre in italiano.`,

  truth: `Sei l'agente di Deception Detection di NEXUS.
Analizza il testo o la dichiarazione fornita e valuta:
- Coerenza logica e temporale
- Uso di linguaggio evasivo o vago
- Incongruenze con fatti noti
- Segnali semantici di inganno
- Omissioni sospette
Fornisci un punteggio di veridicità da 0-100% con spiegazione dettagliata.
Usa il formato: VERIDICITÀ: X% seguito dall'analisi. Rispondi in italiano.`,

  nav: `Sei l'agente di navigazione intelligente di NEXUS.
Quando ricevi una destinazione o richiesta di percorso fornisci:
- Stima tempi realistici in diverse condizioni
- Analisi traffico predittiva basata su orario e giorno
- Orario di partenza consigliato
- Percorsi alternativi
- Avvisi su eventi rilevanti (manifestazioni, lavori, ecc.)
- Suggerimenti contestuali utili
Sii concreto e utile. Rispondi in italiano.`,

  health: `Sei l'agente Salute & Benessere di NEXUS.
Analizza i dati e le richieste riguardanti salute, attività fisica, sonno, stress, alimentazione.
Fornisci:
- Analisi dei sintomi o parametri descritti
- Consigli basati su evidenze scientifiche
- Avvisi precoci su possibili problemi
- Piani di miglioramento personalizzati
Ricorda SEMPRE che non sostituisci un medico. Per sintomi gravi consiglia sempre di consultare un professionista.
Rispondi in italiano.`,

  finance: `Sei l'agente Finanziario di NEXUS.
Analizza situazioni finanziarie, spese, investimenti e fornisci consulenza:
- Analisi della situazione descritta
- Valutazione rischi e opportunità
- Strategie di risparmio e investimento
- Simulazioni e proiezioni
- Allerte su possibili rischi finanziari
Usa dati e principi finanziari generali. Ricorda che non sei un consulente certificato.
Rispondi in italiano con dati chiari e strutturati.`,

  learn: `Sei l'agente Apprendimento di NEXUS.
Crea esperienze di apprendimento personalizzate:
- Piani di studio strutturati
- Sintesi intelligenti di contenuti complessi
- Quiz e domande di verifica
- Spiegazioni adattive al livello dell'utente
- Risorse e metodologie consigliate
- Tecniche mnemoniche e di memorizzazione
Ottimizza per la massima ritenzione e comprensione. Rispondi in italiano in modo coinvolgente.`,
};

const MODULE_PLACEHOLDERS = {
  osint:   'Es: "Analizza Apple Inc." oppure "Chi è Elon Musk?"',
  truth:   'Incolla qui una dichiarazione da analizzare...',
  nav:     'Es: "Devo arrivare a Roma Termini entro le 15:00 da Milano"',
  health:  'Es: "Frequenza cardiaca 90 a riposo, stanchezza cronica..."',
  finance: 'Es: "Ho €8.000 fermi sul conto, cosa faccio?"',
  learn:   'Es: "Spiegami la blockchain" oppure "Voglio imparare Python"',
};

const MODULE_SUGGESTIONS = {
  osint:   ['Analizza Tesla Inc.', 'Chi è Sam Altman?', 'Ricerca su OpenAI', 'Analisi reputazione Google'],
  truth:   ['Analizza questa dichiarazione...', 'Verifica coerenza', 'Valuta attendibilità', 'Controlla incongruenze'],
  nav:     ['Milano → Roma per le 10:00', 'Percorso evitando autostrada', 'Orario migliore per partire', 'Traffico previsionale domani'],
  health:  ['Analisi stanchezza cronica', 'Piani sonno ottimale', 'Dieta per energia', 'Gestione stress'],
  finance: ['Analizza il mio portafoglio', 'ETF vs azioni', 'Piano risparmio mensile', 'Gestione emergenze'],
  learn:   ['Spiega il machine learning', 'Piano studio Python 30 giorni', 'Riassumi la fisica quantistica', 'Quiz su storia romana'],
};

// ─── TTS ────────────────────────────────────────────────────────────────────────
let currentSound = null;

async function speakText(text, cfg) {
  if (currentSound) {
    try { await currentSound.unloadAsync(); currentSound = null; } catch (_) {}
  }
  Speech.stop();

  if (cfg.elKey && cfg.elVoice) {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${cfg.elVoice}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': cfg.elKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
          }),
        }
      );
      if (response.ok) {
        const audioBlob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result.split(',')[1];
            const { sound } = await Audio.Sound.createAsync(
              { uri: `data:audio/mpeg;base64,${base64}` },
              { shouldPlay: true }
            );
            currentSound = sound;
            sound.setOnPlaybackStatusUpdate((status) => {
              if (status.didJustFinish) { sound.unloadAsync().catch(() => {}); currentSound = null; }
            });
          } catch {
            Speech.speak(text, { language: 'it-IT', pitch: 1.0, rate: 1.0 });
          }
        };
        reader.readAsDataURL(audioBlob);
        return;
      }
    } catch {}
  }
  Speech.speak(text, { language: 'it-IT', pitch: 1.0, rate: 1.0 });
}

// ─── AI Call ────────────────────────────────────────────────────────────────────
function dedupeRoles(messages) {
  return messages.reduce((acc, msg) => {
    if (acc.length > 0 && acc[acc.length - 1].role === msg.role) {
      acc[acc.length - 1] = {
        role: acc[acc.length - 1].role,
        content: acc[acc.length - 1].content + '\n' + msg.content,
      };
    } else {
      acc.push({ role: msg.role, content: msg.content });
    }
    return acc;
  }, []);
}

async function callAI(cfg, moduleId, hist) {
  const sysPrompt = SYSTEM_PROMPTS[moduleId] || SYSTEM_PROMPTS.osint;
  const cleanHist = dedupeRoles(hist.slice(-16).filter(m => m.role !== 'system'));

  if (cfg.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: sysPrompt }, ...cleanHist],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
    if (!r.ok) throw new Error('OpenAI ' + r.status);
    return (await r.json()).choices[0].message.content.trim();

  } else if (cfg.provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: sysPrompt,
        messages: cleanHist.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    });
    if (!r.ok) throw new Error('Anthropic ' + r.status);
    return (await r.json()).content[0].text.trim();

  } else {
    // Groq default
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: sysPrompt }, ...cleanHist],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error('Groq ' + r.status + ': ' + (e?.error?.message || ''));
    }
    return (await r.json()).choices[0].message.content.trim();
  }
}

// ─── Pulse dot ─────────────────────────────────────────────────────────────────
function PulseDot({ color }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{
      width: 7, height: 7, borderRadius: 3.5,
      backgroundColor: color, opacity: pulse,
    }} />
  );
}

// ─── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots({ color }) {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 140),
        Animated.timing(d, { toValue: -6, duration: 280, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0,  duration: 280, useNativeDriver: true }),
      ]))
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 4 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{
          width: 7, height: 7, borderRadius: 3.5,
          backgroundColor: color || '#00f5d4',
          transform: [{ translateY: d }],
        }} />
      ))}
    </View>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, moduleColor }) {
  const isUser   = msg.role === 'user';
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const color = moduleColor || '#00f5d4';

  return (
    <Animated.View style={[
      bs.row,
      isUser ? bs.rowUser : bs.rowAI,
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      {!isUser && (
        <View style={[bs.avatar, { borderColor: color, backgroundColor: color + '18' }]}>
          <Text style={[bs.avatarTxt, { color }]}>N</Text>
        </View>
      )}
      <View style={{ flex: 1, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <View style={[bs.bubble, isUser ? [bs.bubbleUser, { backgroundColor: color + '22', borderColor: color + '55' }] : bs.bubbleAI]}>
          <Text style={[bs.txt, isUser ? { color: color } : bs.txtAI]}>{msg.content}</Text>
        </View>
        <Text style={bs.time}>{msg.time}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Module Selector ───────────────────────────────────────────────────────────
function ModuleSelector({ currentModule, onSelect, onClose, visible }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose} />
      <SafeAreaView style={ms.sheet}>
        <View style={ms.handle} />
        <Text style={ms.title}>Seleziona Agente</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {MODULES.map(mod => (
            <TouchableOpacity
              key={mod.id}
              style={[ms.row, currentModule === mod.id && { borderColor: mod.color + '80', backgroundColor: mod.color + '12' }]}
              onPress={() => { onSelect(mod.id); onClose(); }}
            >
              <View style={[ms.iconBox, { backgroundColor: mod.color + '20', borderColor: mod.color + '40' }]}>
                <Text style={[ms.icon, { color: mod.color }]}>{mod.icon}</Text>
              </View>
              <View style={ms.info}>
                <Text style={[ms.label, { color: mod.color }]}>{mod.label}</Text>
                <Text style={ms.desc}>{mod.desc}</Text>
              </View>
              {currentModule === mod.id && (
                <View style={[ms.activeDot, { backgroundColor: mod.color }]} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Settings Sheet ────────────────────────────────────────────────────────────
function SettingsSheet({ visible, cfg, onSave, onClose }) {
  const [provider, setProvider] = useState(cfg.provider);
  const [apiKey,   setApiKey]   = useState(cfg.apiKey);
  const [elKey,    setElKey]    = useState(cfg.elKey);
  const [elVoice,  setElVoice]  = useState(cfg.elVoice);
  const [tts,      setTts]      = useState(cfg.ttsEnabled);

  useEffect(() => {
    if (visible) {
      setProvider(cfg.provider); setApiKey(cfg.apiKey);
      setElKey(cfg.elKey);       setElVoice(cfg.elVoice);
      setTts(cfg.ttsEnabled);
    }
  }, [visible, cfg]);

  const providers = [
    { value: 'groq',      label: 'Groq — Llama 3.3 70B', sub: 'Gratuito, veloce' },
    { value: 'anthropic', label: 'Anthropic — Claude Sonnet', sub: 'Preciso, ragionamento avanzato' },
    { value: 'openai',    label: 'OpenAI — GPT-4o', sub: 'Versatile, multimodale' },
  ];

  const voicePresets = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
    { id: 'ErXwobaYiN019PkySvjV',  name: 'Antoni' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
    { id: 'pNInz6obpgDQGcFmaJgB',  name: 'Adam' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={ss.overlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={ss.kav}>
        <SafeAreaView style={ss.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={ss.handle} />
            <Text style={ss.title}>Impostazioni NEXUS</Text>

            <Text style={ss.sectionLabel}>PROVIDER AI</Text>
            {providers.map(p => (
              <TouchableOpacity key={p.value}
                style={[ss.provBtn, provider === p.value && ss.provBtnActive]}
                onPress={() => { setProvider(p.value); setApiKey(''); }}>
                <Text style={[ss.provLabel, provider === p.value && ss.provLabelActive]}>{p.label}</Text>
                <Text style={ss.provSub}>{p.sub}</Text>
              </TouchableOpacity>
            ))}

            <Text style={ss.sectionLabel}>API KEY</Text>
            <TextInput style={ss.input} value={apiKey} onChangeText={setApiKey}
              placeholder="Incolla la tua API key..." placeholderTextColor="#3d5a66"
              secureTextEntry autoCapitalize="none" autoCorrect={false} />

            <View style={ss.toggleRow}>
              <View>
                <Text style={ss.toggleLabel}>SINTESI VOCALE (TTS)</Text>
                <Text style={ss.toggleSub}>Legge le risposte degli agenti</Text>
              </View>
              <TouchableOpacity
                style={[ss.toggle, tts && ss.toggleActive]}
                onPress={() => setTts(t => !t)}>
                <Text style={[ss.toggleTxt, tts && { color: '#00f5d4' }]}>{tts ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={ss.sectionLabel}>ELEVENLABS VOICE (OPZIONALE)</Text>
            <TextInput style={ss.input} value={elKey} onChangeText={setElKey}
              placeholder="ElevenLabs API Key" placeholderTextColor="#3d5a66"
              secureTextEntry autoCapitalize="none" autoCorrect={false} />

            {elKey.length > 0 && (
              <>
                <Text style={[ss.sectionLabel, { marginTop: 12 }]}>VOICE PRESET</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                    {voicePresets.map(v => (
                      <TouchableOpacity key={v.id}
                        style={[ss.voiceChip, elVoice === v.id && ss.voiceChipActive]}
                        onPress={() => setElVoice(v.id)}>
                        <Text style={[ss.voiceChipTxt, elVoice === v.id && ss.voiceChipTxtActive]}>{v.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <TouchableOpacity style={ss.saveBtn}
              onPress={() => onSave({ provider, apiKey: apiKey.trim(), elKey: elKey.trim(), elVoice: elVoice || '21m00Tcm4TlvDq8ikWAM', ttsEnabled: tts })}>
              <Text style={ss.saveBtnTxt}>✓  Salva configurazione</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Call Screen ───────────────────────────────────────────────────────────────
function CallScreen({ visible, cfg, hist, histRef, moduleId, onEnd, onAddToHist }) {
  const [status,    setStatus]    = useState('connecting');
  const [text,      setText]      = useState('');
  const [secs,      setSecs]      = useState(0);
  const [waveOn,    setWaveOn]    = useState(false);
  const [inputVal,  setInputVal]  = useState('');
  const [listening, setListening] = useState(false);

  const timerRef    = useRef(null);
  const callOnRef   = useRef(false);
  const thinkingRef = useRef(false);
  const webViewRef  = useRef(null);
  const mod = MODULES.find(m => m.id === moduleId) || MODULES[0];

  useEffect(() => {
    if (!visible) return;
    callOnRef.current = true;
    setSecs(0); setInputVal(''); setListening(false);
    setStatus('connecting'); setWaveOn(false);
    const t = setTimeout(async () => {
      if (!callOnRef.current) return;
      const greet = `Agente ${mod.label} operativo. Come posso aiutarti?`;
      setText(greet); setStatus('active'); setWaveOn(true);
      if (cfg.ttsEnabled) speakText(greet, cfg);
      onAddToHist({ role: 'assistant', content: greet });
      setTimeout(() => { if (callOnRef.current) setWaveOn(false); }, 2000);
      timerRef.current = setInterval(() => setSecs(s => s + 1), 1000);
    }, 1000);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      callOnRef.current = false;
      clearInterval(timerRef.current);
      setWaveOn(false);
    }
  }, [visible]);

  const sendVoiceMsg = useCallback(async (transcript) => {
    if (!transcript || thinkingRef.current || !callOnRef.current) return;
    setListening(false);
    onAddToHist({ role: 'user', content: transcript });
    thinkingRef.current = true;
    setStatus('thinking'); setWaveOn(false); setText('...');
    try {
      const reply = await callAI(cfg, moduleId, [...histRef.current, { role: 'user', content: transcript }]);
      if (!callOnRef.current) return;
      setText(reply); setStatus('active'); setWaveOn(true);
      if (cfg.ttsEnabled) speakText(reply, cfg);
      onAddToHist({ role: 'assistant', content: reply });
      setTimeout(() => { if (callOnRef.current) setWaveOn(false); }, Math.min(reply.length * 60, 5000));
    } catch {
      if (!callOnRef.current) return;
      setText('Errore di connessione.'); setStatus('active');
    } finally { thinkingRef.current = false; }
  }, [cfg, moduleId, histRef, onAddToHist]);

  const sendTextMsg = useCallback(async () => {
    const t = inputVal.trim();
    if (!t || thinkingRef.current || !callOnRef.current) return;
    setInputVal(''); Keyboard.dismiss();
    await sendVoiceMsg(t);
  }, [inputVal, sendVoiceMsg]);

  const toggleVoice = () => {
    if (listening) {
      webViewRef.current?.injectJavaScript('stopListening();');
      setListening(false);
    } else {
      webViewRef.current?.injectJavaScript('startListening();');
      setListening(true);
    }
  };

  const speechHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
let recognition=null;
function startListening(){
  if('webkitSpeechRecognition' in window||'SpeechRecognition' in window){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    recognition=new SR();
    recognition.lang='it-IT'; recognition.interimResults=false; recognition.maxAlternatives=1;
    recognition.onresult=(e)=>{
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'result',transcript:e.results[0][0].transcript}));
    };
    recognition.onerror=()=>window.ReactNativeWebView.postMessage(JSON.stringify({type:'error'}));
    recognition.onend=()=>window.ReactNativeWebView.postMessage(JSON.stringify({type:'end'}));
    recognition.start();
  }
}
function stopListening(){if(recognition)recognition.stop();}
<\/script></body></html>`;

  const fmtSecs = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const statusLabel = status === 'connecting' ? 'connessione...' : status === 'thinking' ? 'elaborazione...' : 'attivo';

  const WaveBars = () => {
    const bars = Array.from({ length: 7 }, () => useRef(new Animated.Value(4)).current);
    useEffect(() => {
      if (waveOn) {
        const anims = bars.map((b, i) =>
          Animated.loop(Animated.sequence([
            Animated.delay(i * 70),
            Animated.timing(b, { toValue: 6 + Math.random() * 22, duration: 350 + i * 50, useNativeDriver: false }),
            Animated.timing(b, { toValue: 4, duration: 350, useNativeDriver: false }),
          ]))
        );
        anims.forEach(a => a.start());
        return () => anims.forEach(a => a.stop());
      } else {
        bars.forEach(b => b.setValue(4));
      }
    }, [waveOn]);
    return (
      <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', height: 44, marginVertical: 16 }}>
        {bars.map((b, i) => (
          <Animated.View key={i} style={{ width: 4, borderRadius: 2, height: b, backgroundColor: waveOn ? mod.color : '#1a2a2e' }} />
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onEnd}>
      <View style={[csc.root, { backgroundColor: '#050a0e' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#050a0e" />

        <View style={[csc.iconRing, { borderColor: mod.color + '80', shadowColor: mod.color }]}>
          <View style={[csc.iconInner, { backgroundColor: mod.color + '20' }]}>
            <Text style={[csc.icon, { color: mod.color }]}>{mod.icon}</Text>
          </View>
        </View>

        <Text style={csc.modLabel}>{mod.label}</Text>
        <Text style={[csc.statusTxt, { color: mod.color }]}>{statusLabel}</Text>
        <Text style={csc.timer}>{fmtSecs(secs)}</Text>

        <WaveBars />

        <Text style={csc.echoTxt} numberOfLines={5}>{text}</Text>

        <WebView
          ref={webViewRef}
          source={{ html: speechHTML }}
          style={{ height: 0, width: 0, opacity: 0 }}
          onMessage={(e) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              if (msg.type === 'result') sendVoiceMsg(msg.transcript);
              if (msg.type === 'end' || msg.type === 'error') setListening(false);
            } catch (_) {}
          }}
          mediaPlaybackRequiresUserAction={false}
        />

        <TouchableOpacity
          style={[csc.voiceBtn, { backgroundColor: listening ? '#ef4444' : mod.color }, listening && { shadowColor: '#ef4444' }]}
          onPress={toggleVoice}
          disabled={thinkingRef.current}
        >
          <Text style={csc.voiceBtnTxt}>{listening ? '● ASCOLTANDO...' : '⊙ PARLA'}</Text>
        </TouchableOpacity>

        <View style={[csc.textInputRow]}>
          <TextInput
            style={[csc.textInput, { borderColor: mod.color + '40' }]}
            value={inputVal}
            onChangeText={setInputVal}
            placeholder="Oppure scrivi qui..."
            placeholderTextColor="#2a4a55"
            onSubmitEditing={sendTextMsg}
            returnKeyType="send"
          />
          <TouchableOpacity style={[csc.sendBtn, { backgroundColor: mod.color }]} onPress={sendTextMsg}>
            <Text style={csc.sendBtnTxt}>➤</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={csc.endBtn} onPress={onEnd}>
          <Text style={csc.endBtnTxt}>✕  CHIUDI</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [ready,        setReady]       = useState(false);
  const [cfg,          setCfg]         = useState({ provider: 'groq', apiKey: '', elKey: '', elVoice: '21m00Tcm4TlvDq8ikWAM', ttsEnabled: false });
  const [moduleId,     setModuleId]    = useState('osint');
  const [hist,         setHist]        = useState([]);
  const [inputText,    setInputText]   = useState('');
  const [thinking,     setThinking]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showModules,  setShowModules]  = useState(false);
  const [showCall,     setShowCall]     = useState(false);

  const scrollRef   = useRef(null);
  const histRef     = useRef([]);
  const cfgRef      = useRef(cfg);
  const modRef      = useRef(moduleId);
  const thinkingRef = useRef(false);

  useEffect(() => { histRef.current     = hist;     }, [hist]);
  useEffect(() => { cfgRef.current      = cfg;      }, [cfg]);
  useEffect(() => { modRef.current      = moduleId; }, [moduleId]);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);

  const mod = MODULES.find(m => m.id === moduleId) || MODULES[0];

  function fmtTime() {
    return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Persistence ─────────────────────────────────────────────────────────────
  const saveData = useCallback(async (newCfg, newHist, newModuleId) => {
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEY_CFG,    JSON.stringify(newCfg)],
        [STORAGE_KEY_HIST,   JSON.stringify(newHist.slice(-60))],
        [STORAGE_KEY_MODULE, newModuleId],
        [STORAGE_KEY_LASTMSG, String(Date.now())],
      ]);
    } catch (_) {}
  }, []);

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [[, rawCfg], [, rawHist], [, rawMod]] = await AsyncStorage.multiGet([
          STORAGE_KEY_CFG, STORAGE_KEY_HIST, STORAGE_KEY_MODULE,
        ]);
        if (rawCfg)  try { const c = { ...cfg, ...JSON.parse(rawCfg) }; setCfg(c); cfgRef.current = c; } catch (_) {}
        if (rawHist) try { const h = JSON.parse(rawHist); setHist(h); histRef.current = h; } catch (_) {}
        if (rawMod)  { setModuleId(rawMod); modRef.current = rawMod; }
      } catch (_) {}
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    })();
  }, []);

  // ─── Android back ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showModules)  { setShowModules(false);  return true; }
      if (showSettings) { setShowSettings(false); return true; }
      if (showCall)     { setShowCall(false);      return true; }
      return false;
    });
    return () => sub.remove();
  }, [showModules, showSettings, showCall]);

  // ─── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hist.length > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [hist]);

  // ─── Switch module (clear history) ───────────────────────────────────────────
  const switchModule = useCallback((newModId) => {
    setModuleId(newModId);
    modRef.current = newModId;
    setHist([]);
    histRef.current = [];
    saveData(cfgRef.current, [], newModId);
  }, [saveData]);

  // ─── Add message ──────────────────────────────────────────────────────────────
  const addToHist = useCallback((msg) => {
    const full = { ...msg, time: fmtTime() };
    setHist(h => {
      const next = [...h, full];
      histRef.current = next;
      saveData(cfgRef.current, next, modRef.current);
      return next;
    });
  }, [saveData]);

  // ─── Send message ─────────────────────────────────────────────────────────────
  const sendMsg = useCallback(async (text) => {
    const t = (text || inputText).trim();
    if (!t || thinkingRef.current) return;
    Keyboard.dismiss();
    setInputText('');

    const userMsg = { role: 'user', content: t, time: fmtTime() };
    const nextHist = [...histRef.current, userMsg];
    setHist(nextHist); histRef.current = nextHist;

    if (!cfgRef.current.apiKey) {
      const e = { role: 'assistant', content: '⚠ Inserisci una API key nelle impostazioni per attivare gli agenti NEXUS.', time: fmtTime() };
      const withE = [...nextHist, e];
      setHist(withE); histRef.current = withE;
      saveData(cfgRef.current, withE, modRef.current);
      return;
    }

    setThinking(true); thinkingRef.current = true;

    try {
      const reply = await callAI(cfgRef.current, modRef.current, histRef.current);
      const aiMsg = { role: 'assistant', content: reply, time: fmtTime() };
      setHist(h => {
        const updated = [...h, aiMsg];
        histRef.current = updated;
        saveData(cfgRef.current, updated, modRef.current);
        return updated;
      });
      if (cfgRef.current.ttsEnabled) speakText(reply, cfgRef.current);
    } catch (err) {
      const e = { role: 'assistant', content: '⚠ Errore: ' + err.message, time: fmtTime() };
      const withE = [...histRef.current, e];
      setHist(withE); histRef.current = withE;
      saveData(cfgRef.current, withE, modRef.current);
    } finally {
      setThinking(false); thinkingRef.current = false;
    }
  }, [inputText, saveData]);

  // ─── Save settings ────────────────────────────────────────────────────────────
  const handleSaveSettings = useCallback((newCfg) => {
    setCfg(newCfg); cfgRef.current = newCfg;
    setShowSettings(false);
    saveData(newCfg, histRef.current, modRef.current);
    const ok = { role: 'assistant', content: `◈ Configurazione aggiornata. Provider: ${newCfg.provider.toUpperCase()}`, time: fmtTime() };
    setHist(h => { const n = [...h, ok]; histRef.current = n; return n; });
  }, [saveData]);

  // ─── Splash ───────────────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <View style={as.splash}>
        <StatusBar barStyle="light-content" backgroundColor="#050a0e" />
        <View style={as.splashRing}>
          <View style={as.splashInner}>
            <Text style={as.splashN}>N</Text>
          </View>
        </View>
        <Text style={as.splashTitle}>NEXUS</Text>
        <Text style={as.splashSub}>Sistema Intelligenza Adattiva</Text>
        <ActivityIndicator color="#00f5d4" style={{ marginTop: 36 }} />
      </View>
    );
  }

  const suggestions = MODULE_SUGGESTIONS[moduleId] || [];

  return (
    <SafeAreaView style={as.root}>
      <StatusBar barStyle="light-content" backgroundColor="#050a0e" />

      {/* Header */}
      <View style={as.header}>
        <TouchableOpacity style={as.logoWrap} onPress={() => setShowModules(true)}>
          <View style={[as.logoRing, { borderColor: mod.color + '80' }]}>
            <Text style={[as.logoN, { color: mod.color }]}>N</Text>
          </View>
          <View>
            <Text style={as.logoTitle}>NEXUS</Text>
            <Text style={[as.logoSub, { color: mod.color }]}>▸ {mod.label}</Text>
          </View>
        </TouchableOpacity>

        <View style={as.headerRight}>
          <PulseDot color="#00f5d4" />

          <TouchableOpacity
            style={as.hBtn}
            onPress={() => setShowCall(true)}
          >
            <Text style={[as.hBtnTxt, { color: mod.color }]}>⊙</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={as.hBtn}
            onPress={() => { setHist([]); histRef.current = []; saveData(cfgRef.current, [], moduleId); }}
          >
            <Text style={as.hBtnTxt}>↺</Text>
          </TouchableOpacity>

          <TouchableOpacity style={as.hBtn} onPress={() => setShowSettings(true)}>
            <Text style={as.hBtnTxt}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Module strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={as.moduleStrip}>
        {MODULES.map(m => (
          <TouchableOpacity
            key={m.id}
            style={[as.moduleChip, moduleId === m.id && { borderColor: m.color, backgroundColor: m.color + '18' }]}
            onPress={() => switchModule(m.id)}
          >
            <Text style={[as.moduleChipIcon, { color: moduleId === m.id ? m.color : '#3d5a66' }]}>{m.icon}</Text>
            <Text style={[as.moduleChipLabel, { color: moduleId === m.id ? m.color : '#3d5a66' }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Chat area */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} style={as.messages} contentContainerStyle={as.messagesContent}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {hist.length === 0 && (
            <View style={as.welcome}>
              <View style={[as.welcomeIcon, { borderColor: mod.color, backgroundColor: mod.color + '18', shadowColor: mod.color }]}>
                <Text style={[as.welcomeIconTxt, { color: mod.color }]}>{mod.icon}</Text>
              </View>
              <Text style={[as.welcomeTitle, { color: mod.color }]}>Agente {mod.label}</Text>
              <Text style={as.welcomeDesc}>{mod.desc}</Text>
              <View style={as.suggChips}>
                {suggestions.map(s => (
                  <TouchableOpacity key={s} style={[as.suggChip, { borderColor: mod.color + '40' }]} onPress={() => sendMsg(s)}>
                    <Text style={[as.suggChipTxt, { color: mod.color }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {hist.map((msg, i) => <Bubble key={i} msg={msg} moduleColor={mod.color} />)}

          {thinking && (
            <View style={[as.msgRowAI]}>
              <View style={[as.bubbleAI, { borderColor: mod.color + '30' }]}>
                <TypingDots color={mod.color} />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={as.inputBar}>
          <TextInput
            style={[as.input, { borderColor: mod.color + '40' }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={MODULE_PLACEHOLDERS[moduleId] || 'Scrivi la tua query...'}
            placeholderTextColor="#2a4a55"
            multiline
            maxLength={3000}
            onSubmitEditing={() => sendMsg()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[as.sendBtn, { backgroundColor: mod.color }, (!inputText.trim() || thinking) && as.sendBtnDisabled]}
            onPress={() => sendMsg()}
            disabled={!inputText.trim() || thinking}
          >
            <Text style={as.sendBtnTxt}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Modals */}
      <ModuleSelector
        visible={showModules}
        currentModule={moduleId}
        onSelect={switchModule}
        onClose={() => setShowModules(false)}
      />

      <SettingsSheet
        visible={showSettings}
        cfg={cfg}
        onSave={handleSaveSettings}
        onClose={() => setShowSettings(false)}
      />

      <CallScreen
        visible={showCall}
        cfg={cfg}
        hist={hist}
        histRef={histRef}
        moduleId={moduleId}
        onEnd={() => { Speech.stop(); setShowCall(false); }}
        onAddToHist={addToHist}
      />
    </SafeAreaView>
  );
}

// ─── Call Screen Styles ────────────────────────────────────────────────────────
const csc = StyleSheet.create({
  root:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  iconRing:     { width: 110, height: 110, borderRadius: 55, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
                  shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 20, elevation: 20 },
  iconInner:    { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  icon:         { fontSize: 42 },
  modLabel:     { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  statusTxt:    { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  timer:        { color: '#2a4a55', fontSize: 12, fontVariant: ['tabular-nums'], marginBottom: 8 },
  echoTxt:      { color: '#8fa8b0', fontSize: 13.5, textAlign: 'center', lineHeight: 22, minHeight: 66, paddingHorizontal: 12, marginBottom: 20 },
  voiceBtn:     { width: '85%', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 16,
                  shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 12 },
  voiceBtnTxt:  { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  textInputRow: { flexDirection: 'row', gap: 8, width: '85%', marginBottom: 16 },
  textInput:    { flex: 1, backgroundColor: '#0a1a1e', borderWidth: 1, borderRadius: 14, color: '#e0f0f4', fontSize: 13, paddingHorizontal: 14, paddingVertical: 10 },
  sendBtn:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendBtnTxt:   { color: '#000', fontSize: 16, fontWeight: '700' },
  endBtn:       { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 22, backgroundColor: '#1a0808', borderWidth: 1, borderColor: '#3d1212' },
  endBtnTxt:    { color: '#ef4444', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});

// ─── Module Selector Styles ────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:      { backgroundColor: '#070d10', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 32, maxHeight: '85%' },
  handle:     { width: 38, height: 4, backgroundColor: '#1a3040', borderRadius: 2, alignSelf: 'center', marginBottom: 22 },
  title:      { color: '#e0f0f4', fontSize: 18, fontWeight: '700', marginBottom: 20, letterSpacing: 1 },
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1a20', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#0e2530', gap: 12 },
  iconBox:    { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon:       { fontSize: 20 },
  info:       { flex: 1 },
  label:      { fontSize: 13, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  desc:       { fontSize: 11, color: '#3d6070', lineHeight: 16 },
  activeDot:  { width: 8, height: 8, borderRadius: 4 },
});

// ─── Settings Styles ──────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  kav:           { backgroundColor: 'transparent' },
  sheet:         { backgroundColor: '#070d10', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 36, maxHeight: '92%' },
  handle:        { width: 38, height: 4, backgroundColor: '#1a3040', borderRadius: 2, alignSelf: 'center', marginBottom: 22 },
  title:         { color: '#e0f0f4', fontSize: 18, fontWeight: '700', marginBottom: 22, letterSpacing: 1 },
  sectionLabel:  { color: '#00f5d4', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10, marginTop: 6, textTransform: 'uppercase' },
  input:         { backgroundColor: '#050a0e', borderWidth: 1, borderColor: '#0e2530', borderRadius: 10, color: '#e0f0f4', fontSize: 13.5, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 6 },
  provBtn:       { backgroundColor: '#0a1a20', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#0e2530' },
  provBtnActive: { borderColor: '#00f5d4', backgroundColor: '#001a1a' },
  provLabel:     { color: '#5a8090', fontSize: 13, fontWeight: '600' },
  provLabelActive: { color: '#00f5d4' },
  provSub:       { color: '#2a4a55', fontSize: 11, marginTop: 2 },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0a1a20', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#0e2530' },
  toggleLabel:   { color: '#5a8090', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  toggleSub:     { color: '#2a4a55', fontSize: 11, marginTop: 2 },
  toggle:        { backgroundColor: '#050a0e', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: '#0e2530' },
  toggleActive:  { borderColor: '#00f5d4', backgroundColor: '#001a1a' },
  toggleTxt:     { color: '#2a4a55', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  voiceChip:     { backgroundColor: '#0a1a20', borderWidth: 1, borderColor: '#0e2530', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  voiceChipActive:{ backgroundColor: '#001a1a', borderColor: '#00f5d4' },
  voiceChipTxt:   { color: '#5a8090', fontSize: 12, fontWeight: '500' },
  voiceChipTxtActive: { color: '#00f5d4', fontWeight: '600' },
  saveBtn:       { backgroundColor: '#00f5d4', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 18,
                   shadowColor: '#00f5d4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  saveBtnTxt:    { color: '#000', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
});

// ─── Bubble Styles ────────────────────────────────────────────────────────────
const bs = StyleSheet.create({
  row:        { flexDirection: 'row', marginVertical: 4, gap: 8 },
  rowUser:    { justifyContent: 'flex-end' },
  rowAI:      { justifyContent: 'flex-start' },
  avatar:     { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 },
  avatarTxt:  { fontSize: 12, fontWeight: '800' },
  bubble:     { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '80%' },
  bubbleAI:   { backgroundColor: '#0a1a20', borderWidth: 1, borderColor: '#0e2530', borderBottomLeftRadius: 4 },
  txt:        { fontSize: 14, lineHeight: 22, letterSpacing: 0.1 },
  txtAI:      { color: '#c0d8e0' },
  time:       { fontSize: 9, color: '#1a3a44', marginTop: 3, paddingHorizontal: 4 },
});

// ─── App Styles ───────────────────────────────────────────────────────────────
const TEAL = '#00f5d4';

const as = StyleSheet.create({
  splash:       { flex: 1, backgroundColor: '#050a0e', alignItems: 'center', justifyContent: 'center' },
  splashRing:   { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: TEAL + '80', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
                  shadowColor: TEAL, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 20 },
  splashInner:  { width: 80, height: 80, borderRadius: 40, backgroundColor: TEAL + '18', alignItems: 'center', justifyContent: 'center' },
  splashN:      { color: TEAL, fontSize: 40, fontWeight: '900' },
  splashTitle:  { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 6 },
  splashSub:    { color: '#1a4a55', fontSize: 11, letterSpacing: 2.5, marginTop: 6 },

  root:         { flex: 1, backgroundColor: '#050a0e' },

  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
                  backgroundColor: '#050a0e', borderBottomWidth: 1, borderBottomColor: '#0a2028', gap: 8 },
  logoWrap:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoRing:     { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  logoN:        { fontSize: 18, fontWeight: '900' },
  logoTitle:    { color: '#e0f0f4', fontSize: 15, fontWeight: '900', letterSpacing: 3, lineHeight: 18 },
  logoSub:      { fontSize: 10, fontWeight: '700', letterSpacing: 2, lineHeight: 14 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hBtn:         { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0a1a20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#0e2530' },
  hBtnTxt:      { color: '#3d6070', fontSize: 16 },

  moduleStrip:        { backgroundColor: '#050a0e', borderBottomWidth: 1, borderBottomColor: '#0a2028' },
  moduleChip:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent', marginHorizontal: 2 },
  moduleChipIcon:     { fontSize: 12 },
  moduleChipLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },

  messages:           { flex: 1 },
  messagesContent:    { padding: 16, paddingBottom: 8, gap: 4 },
  msgRowAI:           { alignSelf: 'flex-start', marginVertical: 4 },
  bubbleAI:           { backgroundColor: '#0a1a20', borderWidth: 1, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },

  welcome:            { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  welcomeIcon:        { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
                        shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  welcomeIconTxt:     { fontSize: 36 },
  welcomeTitle:       { fontSize: 20, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  welcomeDesc:        { color: '#2a4a55', fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  suggChips:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  suggChip:           { backgroundColor: '#0a1a20', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  suggChipTxt:        { fontSize: 12, fontWeight: '500' },

  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 12,
                        backgroundColor: '#050a0e', borderTopWidth: 1, borderTopColor: '#0a2028', gap: 10 },
  input:              { flex: 1, backgroundColor: '#0a1a20', borderWidth: 1, borderRadius: 20, color: '#c0d8e0',
                        fontSize: 14, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100, minHeight: 44 },
  sendBtn:            { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                        shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  sendBtnDisabled:    { opacity: 0.35 },
  sendBtnTxt:         { color: '#000', fontSize: 17, fontWeight: '800' },
});
