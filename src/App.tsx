import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Radio,
  Sparkles,
  Flame,
  Volume2,
  VolumeX,
  Send,
  RotateCcw,
  Square,
  Crosshair,
  ArrowRight,
  Zap,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { decodeAudioData, resampleTo16kPCM, arrayBufferToBase64 } from './utils/audioUtils.ts';
import { AudioSpectrum } from './components/AudioSpectrum.tsx';
import { RoastEntry } from './types.ts';

const SAMPLE_STARTERS = [
  'मुझे हिंदी में सबसे खतरनाक रोस्ट मारो 🔥',
  'Someone else tries talking: "Hey let me speak too!" 🗣️',
  'I spent 4 hours on YouTube shorts instead of studying 💀',
  'I tell everyone I am busy when I am just lying down 🛋️',
];

export default function App() {
  // Live session status
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('Puck');

  // Speaker focus & vocal activity
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  // Unified single-page state
  const [currentTone, setCurrentTone] = useState<string>('Listening Directly to You');
  const [confidence, setConfidence] = useState<number>(99);
  const [subtext, setSubtext] = useState<string>('Primary speaker locked. Anyone else interrupting will be shut down.');
  const [advice, setAdvice] = useState<string>('Complete Dialogue Mode ON');
  const [roasts, setRoasts] = useState<RoastEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Audio references
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  // Turn detection refs
  const speakingRef = useRef<boolean>(false);
  const isAiSpeakingRef = useRef<boolean>(false);

  // Ensure AudioContext is ready (24kHz for Gemini output)
  const getOutputAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const stopAllPlayback = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {
        // already stopped
      }
    });
    activeSourcesRef.current = [];
    if (audioCtxRef.current) {
      nextStartTimeRef.current = audioCtxRef.current.currentTime;
    }
    setIsAiSpeaking(false);
    isAiSpeakingRef.current = false;
  };

  const playScheduledChunk = async (base64Audio: string) => {
    if (!voiceVolume) return;
    try {
      const audioCtx = getOutputAudioContext();
      const audioBuffer = await decodeAudioData(audioCtx, base64Audio, 24000);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      // Gapless scheduling
      const scheduledTime = Math.max(now, nextStartTimeRef.current);
      source.start(scheduledTime);
      nextStartTimeRef.current = scheduledTime + audioBuffer.duration;

      activeSourcesRef.current.push(source);
      setIsAiSpeaking(true);
      isAiSpeakingRef.current = true;

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsAiSpeaking(false);
          isAiSpeakingRef.current = false;
        }
      };
    } catch (err) {
      console.warn('Playback error:', err);
    }
  };

  // Start continuous full-duplex live session
  const startLiveMic = async () => {
    try {
      getOutputAudioContext();
      stopAllPlayback();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const micAnalyser = inputCtx.createAnalyser();
      micAnalyser.fftSize = 128;
      micAnalyserRef.current = micAnalyser;

      const source = inputCtx.createMediaStreamSource(stream);
      source.connect(micAnalyser);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live?voice=${selectedVoice}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsMicActive(true);
        setCurrentTone('Locked on Primary Voice');
        setSubtext('Dialogue Completion active. The AI will never stop midway.');
      };

      ws.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'audio' && msg.audio) {
            await playScheduledChunk(msg.audio);
          } else if (msg.type === 'transcript' && msg.text) {
            const cleanText = msg.text.trim();
            if (cleanText) {
              setRoasts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.roast.length < 80) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, roast: (last.roast + ' ' + cleanText).trim() },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: `live-${Date.now()}`,
                    userSaid: 'Live Conversation Speech',
                    roast: cleanText,
                    detectedTone: cleanText.toLowerCase().includes('other speaker')
                      ? 'Secondary Speaker Shut Down'
                      : 'Topic-Locked Savage Roast',
                    confidenceScore: 99,
                    subtext: cleanText.toLowerCase().includes('other speaker')
                      ? 'Told secondary speaker to back off'
                      : 'Complete dialogue delivered',
                    actionAdvice: 'Full finish 100%',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                ];
              });
            }
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setIsMicActive(false);
        stopAllPlayback();
      };

      const processor = inputCtx.createScriptProcessor(1024, 1, 1);
      scriptProcessorRef.current = processor;
      source.connect(processor);
      processor.connect(inputCtx.destination);

      const actualSampleRate = inputCtx.sampleRate;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        // CRITICAL FIX: While the AI is speaking, do not send microphone acoustic frames back to the model.
        // This prevents the speaker's own voice from feeding into the mic and triggering false barge-in/cutoffs.
        if (isAiSpeakingRef.current) {
          return;
        }

        const channelData = e.inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < channelData.length; i++) {
          sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / channelData.length);

        if (rms > 0.02) {
          if (!speakingRef.current) {
            speakingRef.current = true;
            setIsUserSpeaking(true);
          }
        } else {
          if (speakingRef.current) {
            speakingRef.current = false;
            setIsUserSpeaking(false);
          }
        }

        const pcm16k = resampleTo16kPCM(channelData, actualSampleRate);
        const base64 = arrayBufferToBase64(pcm16k);
        ws.send(JSON.stringify({ type: 'audio', audio: base64 }));
      };
    } catch (err) {
      console.warn('Live mic init error:', err);
      setIsMicActive(false);
    }
  };

  const stopLiveMic = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    stopAllPlayback();
    setIsMicActive(false);
  };

  // Submit text or one-click prompt
  const handleTriggerRoast = async (textToSend?: string, isSecondary?: boolean) => {
    const text = (textToSend || inputText).trim();
    if (!text || isProcessing) return;

    setInputText('');
    setIsProcessing(true);

    try {
      const res = await fetch('/api/live-roast-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          voice: selectedVoice,
          isSecondarySpeakerDetected: Boolean(isSecondary || text.toLowerCase().includes('other speaker') || text.toLowerCase().includes('let me speak')),
        }),
      });

      const data = await res.json();

      setCurrentTone(data.detectedTone || 'Exposed');
      setConfidence(data.confidenceScore || 99);
      setSubtext(data.subtext || 'Topic signature locked');
      setAdvice(data.actionAdvice || 'Finished completely');

      const newRoast: RoastEntry = {
        id: `r-${Date.now()}`,
        userSaid: text,
        roast: data.roast,
        detectedTone: data.detectedTone || 'Target Hit',
        confidenceScore: data.confidenceScore || 99,
        subtext: data.subtext || 'Direct surgical roast',
        actionAdvice: data.actionAdvice || 'No comeback possible',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        audioBase64: data.audioBase64,
      };

      setRoasts((prev) => [...prev, newRoast]);

      if (data.audioBase64 && voiceVolume) {
        stopAllPlayback();
        playScheduledChunk(data.audioBase64);
      }
    } catch (err) {
      console.error('Roast error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-scroll on new roasts
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roasts, isProcessing]);

  useEffect(() => {
    return () => {
      stopLiveMic();
    };
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#131314] text-[#e3e3e3] font-sans overflow-hidden">
      <div className="flex-1 flex flex-col h-full max-w-4xl mx-auto w-full px-4 md:px-6">
        {/* Gemini Header */}
        <header className="flex items-center justify-between py-3.5 border-b border-[#282a2c]/70 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl font-medium tracking-tight bg-gradient-to-r from-[#ff4b4b] via-[#ff784b] to-[#ffd159] bg-clip-text text-transparent">
              Gemini
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#2a1313] text-[#ff6b6b] font-medium border border-[#522121] flex items-center gap-1.5 animate-pulse">
              <Flame className="w-3.5 h-3.5 text-red-500 fill-current" />
              <span>COMPLETE DIALOGUE · NO PREMATURE CUTOFFS</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Voice persona */}
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="bg-[#1e1f20] text-xs text-[#c4c7c5] px-2.5 py-1.5 rounded-lg border border-[#37393b] focus:outline-none cursor-pointer"
            >
              <option value="Puck">Voice: Puck (Brutal & Quick)</option>
              <option value="Fenrir">Voice: Fenrir (Deep & Crushing)</option>
              <option value="Zephyr">Voice: Zephyr (Fast & Cutting)</option>
              <option value="Kore">Voice: Kore (Decisive Sarcasm)</option>
            </select>

            {/* Voice toggle */}
            <button
              onClick={() => {
                if (voiceVolume) stopAllPlayback();
                setVoiceVolume(!voiceVolume);
              }}
              className={`p-2 rounded-lg border transition-colors ${
                voiceVolume ? 'bg-[#1e1f20] text-[#ff6b6b] border-[#37393b]' : 'bg-[#1e1f20] text-[#75777a] border-[#37393b]'
              }`}
              title={voiceVolume ? 'Voice On' : 'Voice Muted'}
            >
              {voiceVolume ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Clear button */}
            {roasts.length > 0 && (
              <button
                onClick={() => {
                  stopAllPlayback();
                  setRoasts([]);
                }}
                className="p-2 rounded-lg bg-[#1e1f20] hover:bg-[#282a2c] text-[#c4c7c5] border border-[#37393b]"
                title="Reset Feed"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Live Radar (Always visible directly) */}
        <section className="my-3 p-3.5 rounded-2xl bg-[#1e1f20] border border-[#ff4444]/30 space-y-3 shrink-0 shadow-[0_0_20px_rgba(255,68,68,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isMicActive
                    ? isAiSpeaking
                      ? 'bg-[#ff4b4b] animate-ping'
                      : isUserSpeaking
                      ? 'bg-[#e2a842] animate-bounce'
                      : 'bg-[#22c55e] animate-pulse'
                    : 'bg-stone-600'
                }`}
              />
              <span className="text-xs font-medium text-[#e3e3e3] flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-[#ff6b6b]" />
                {isAiSpeaking
                  ? 'Gemini Speaking · Delivering Full Dialogue (No Stopping In Between)'
                  : isUserSpeaking
                  ? 'Hearing Your Topic...'
                  : isMicActive
                  ? 'Locked on Primary Speaker · Secondary Speakers Will Be Shut Down'
                  : 'Mic Idle · Click "Start Live Mic" to Talk'}
              </span>
            </div>

            {/* Direct Instant Mic Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTriggerRoast('Wait, let me talk too!', true)}
                className="px-2.5 py-1.5 rounded-full text-xs font-medium bg-[#3a1515] hover:bg-[#4a1c1c] text-[#ff784b] border border-[#ff4444]/40 flex items-center gap-1.5 transition-colors"
                title="Simulate someone trying to cut in"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Simulate 2nd Speaker Interrupt</span>
              </button>

              <button
                onClick={() => (isMicActive ? stopLiveMic() : startLiveMic())}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                  isMicActive
                    ? 'bg-[#ef4444] text-white hover:bg-[#dc2626] shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                    : 'bg-gradient-to-r from-[#ff4b4b] to-[#ff784b] text-[#131314] hover:opacity-90 shadow-[0_0_15px_rgba(255,75,75,0.4)]'
                }`}
              >
                {isMicActive ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Mic</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5" />
                    <span>Start Live Mic</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Oscilloscope */}
          <AudioSpectrum
            analyser={micAnalyserRef.current}
            isActive={isMicActive}
            color={isAiSpeaking ? '#ff4b4b' : isUserSpeaking ? '#e2a842' : '#22c55e'}
            isInterrupted={false}
          />

          {/* Acoustic Tone & Subtext Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="p-2 rounded-xl bg-[#18191a] border border-[#282a2c]">
              <span className="text-[10px] text-[#ff6b6b] uppercase block font-semibold">Primary Target</span>
              <span className="text-xs font-bold text-[#e3e3e3] mt-0.5 block truncate">
                {isUserSpeaking ? 'User Speaking 🗣️' : isAiSpeaking ? 'AI Roasting 🔥' : currentTone}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-[#18191a] border border-[#282a2c]">
              <span className="text-[10px] text-[#ff6b6b] uppercase block font-semibold">Playback Mode</span>
              <span className="text-xs font-bold text-green-400 mt-0.5 block flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-green-400 shrink-0" />
                UNINTERRUPTED FINISH
              </span>
            </div>

            <div className="p-2 rounded-xl bg-[#18191a] border border-[#282a2c] col-span-2">
              <span className="text-[10px] text-[#8e918f] uppercase block font-semibold">Speech Guarantee</span>
              <span className="text-xs text-[#c4c7c5] mt-0.5 block truncate italic">"{subtext}" · {advice}</span>
            </div>
          </div>
        </section>

        {/* Unified Roast Stream */}
        <div className="flex-1 overflow-y-auto py-2 space-y-3.5 scrollbar-thin">
          {roasts.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center px-4 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#ff4b4b] to-[#ffd159] flex items-center justify-center mb-3 shadow-[0_0_24px_rgba(255,75,75,0.4)]">
                <Flame className="w-6 h-6 text-[#131314]" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#e3e3e3] mb-1">
                Topic-Locked Savage Roast AI
              </h2>
              <p className="text-xs text-[#c4c7c5] mb-6 leading-relaxed">
                I finish my entire roast sentence completely without cutting out. If a friend or bystander tries to interrupt, I will tell them: <em>"Don't talk other speaker, first I will deal with this loser!"</em>
              </p>

              {/* Instant Starters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
                {SAMPLE_STARTERS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleTriggerRoast(s)}
                    className="p-3 rounded-xl bg-[#1e1f20] hover:bg-[#282a2c] border border-[#ff4444]/20 hover:border-[#ff4444]/50 text-xs text-[#e3e3e3] transition-all flex items-center justify-between group"
                  >
                    <span className="truncate pr-1">{s}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#ff6b6b] group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            roasts.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-[#1e1f20] border border-[#ff4444]/30 space-y-2 text-xs animate-fadeIn"
              >
                {/* Header row */}
                <div className="flex items-center justify-between text-[11px] text-[#8e918f] pb-1 border-b border-[#282a2c]">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#3a1515] text-[#ff784b] font-semibold border border-[#ff4444]/40">
                      🎯 {item.detectedTone}
                    </span>
                    <span className="text-[#22c55e] font-medium">{item.confidenceScore}% Locked</span>
                  </div>
                  <span>{item.timestamp}</span>
                </div>

                {/* What target said */}
                <div className="text-xs text-[#8e918f]">
                  <span className="font-semibold text-[#c4c7c5]">Spoken: </span>
                  <span className="italic">"{item.userSaid}"</span>
                </div>

                {/* Maximum Roast Box */}
                <div className="p-3.5 rounded-xl bg-[#171212] border border-[#ff4444]/40 flex items-start gap-3">
                  <Flame className="w-4 h-4 text-red-500 fill-current shrink-0 mt-0.5 animate-bounce" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-100 leading-snug">
                      "{item.roast}"
                    </p>
                    <p className="text-[11px] text-[#8e918f] mt-1.5">
                      💀 <span className="text-[#c4c7c5]">{item.subtext}</span> · <span className="text-[#ff784b] font-medium">{item.actionAdvice}</span>
                    </p>
                  </div>
                  {item.audioBase64 && (
                    <button
                      onClick={() => {
                        stopAllPlayback();
                        playScheduledChunk(item.audioBase64!);
                      }}
                      className="p-1.5 rounded-lg bg-[#282a2c] hover:bg-[#37393b] text-[#ff784b] transition-colors"
                      title="Replay Savage Voice"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {isProcessing && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#1e1f20] border border-[#ff4444]/30 text-xs text-[#ff6b6b]">
              <Sparkles className="w-4 h-4 animate-spin text-[#ff4b4b]" />
              <span>Locking on exact topic & delivering full dialogue...</span>
            </div>
          )}

          <div ref={feedEndRef} />
        </div>

        {/* Clean Gemini Input Bar */}
        <div className="pb-4 pt-2 shrink-0">
          <div className="relative flex items-center bg-[#1e1f20] rounded-full border border-[#ff4444]/40 focus-within:border-[#ff4b4b] px-4 py-2 shadow-lg transition-colors">
            {/* Quick Mic Action */}
            <button
              onClick={() => (isMicActive ? stopLiveMic() : startLiveMic())}
              className={`p-2 rounded-full transition-all mr-2 ${
                isMicActive
                  ? isUserSpeaking
                    ? 'bg-[#e2a842] text-black animate-pulse'
                    : 'bg-[#ef4444] text-white animate-pulse'
                  : 'hover:bg-[#282a2c] text-[#ff784b]'
              }`}
              title={isMicActive ? 'Stop Live Mic' : 'Start Live Mic'}
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Input field */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleTriggerRoast();
                }
              }}
              placeholder={
                isMicActive
                  ? isUserSpeaking
                    ? 'Hearing your exact topic now...'
                    : 'Mic is live — speak your topic directly or type here...'
                  : 'Say your exact topic or complain (Hindi, English)...'
              }
              className="flex-1 bg-transparent text-[#e3e3e3] placeholder:text-[#8e918f] text-xs md:text-sm focus:outline-none px-1"
            />

            {/* Send button */}
            <button
              onClick={() => handleTriggerRoast()}
              disabled={!inputText.trim() || isProcessing}
              className="p-2 rounded-full bg-gradient-to-r from-[#ff4b4b] to-[#ff784b] text-[#131314] hover:opacity-90 disabled:opacity-30 transition-all ml-2"
              title="Instant Roast Me"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="text-center mt-2">
            <span className="text-[11px] text-[#8e918f]">
              Complete Dialogue Delivery · Audio Loopback Shield Active · No Mid-Sentence Cutoffs
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
