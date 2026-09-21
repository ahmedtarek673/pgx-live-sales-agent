import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ConnectionState } from './types';
import { LiveService } from './services/liveService';
import AudioVisualizer from './components/AudioVisualizer';
import {
  MicrophoneIcon,
  StopIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  PhoneIcon
} from '@heroicons/react/24/solid';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for managing audio playback scheduling
  const nextStartTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveServiceRef = useRef<LiveService | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialize LiveService once
  useEffect(() => {
    liveServiceRef.current = new LiveService();
    return () => {
      handleDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = async () => {
    setConnectionState(ConnectionState.DISCONNECTED);
    setIsPlaying(false);

    // Stop all playing audio
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (liveServiceRef.current) {
      await liveServiceRef.current.disconnect();
    }

    // Close and clear the playback AudioContext
    if (audioContextRef.current) {
      try { await audioContextRef.current.close(); } catch (e) { }
      audioContextRef.current = null;
    }
  };

  const handleConnect = async () => {
    setErrorMsg(null);
    setConnectionState(ConnectionState.CONNECTING);

    try {
      // Create AudioContext on user gesture to avoid browser autoplay policy issues
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000
        });
      }

      // Resume AudioContext if suspended (browser policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (!liveServiceRef.current) return;

      await liveServiceRef.current.connect({
        onOpen: () => {
          setConnectionState(ConnectionState.CONNECTED);
          nextStartTimeRef.current = 0;
        },
        onClose: () => {
          handleDisconnect();
        },
        onError: (e) => {
          console.error(e);
          setErrorMsg("Connection error. Please try again.");
          handleDisconnect();
        },
        onAudioData: (audioBuffer) => {
          playAudioChunk(audioBuffer);
        },
        onInterrupted: () => {
          interruptPlayback();
        },
        onVolumeChange: () => { }
      });

    } catch (error: any) {
      console.error("Failed to connect:", error);
      setErrorMsg(error?.message || "Could not access microphone or connect to API.");
      setConnectionState(ConnectionState.ERROR);
    }
  };

  const playAudioChunk = (buffer: AudioBuffer) => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Connect to destination (speakers)
    source.connect(ctx.destination);

    // Schedule playback
    // Ensure we don't schedule in the past
    const currentTime = ctx.currentTime;
    const startTime = Math.max(nextStartTimeRef.current, currentTime);

    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    setIsPlaying(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsPlaying(false);
        // Reset timing if we fell behind significantly to avoid huge latency
        if (ctx.currentTime > nextStartTimeRef.current + 0.5) {
          nextStartTimeRef.current = ctx.currentTime;
        }
      }
    };
  };

  const interruptPlayback = () => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { }
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsPlaying(false);

    // Also update cursor in AudioContext if possible, or just reset nextStartTime logic
    if (audioContextRef.current) {
      nextStartTimeRef.current = audioContextRef.current.currentTime;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-pgx-primary selection:text-white overflow-hidden relative">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pgx-primary/20 rounded-full blur-[128px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pgx-accent/20 rounded-full blur-[128px] animate-pulse-slow" style={{ animationDelay: '1.5s' }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 h-screen flex flex-col items-center justify-between py-6 max-w-2xl">

        {/* Header */}
        <header className="w-full flex items-center justify-between mb-4 border-b border-slate-800/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pgx-primary to-pgx-accent flex items-center justify-center shadow-lg shadow-pgx-primary/30">
              <span className="font-bold text-xl text-white">P</span>
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">PGX Agency</h1>
              <p className="text-xs text-slate-400 font-cairo">المساعد الذكي (Smart Assistant)</p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 ${connectionState === ConnectionState.CONNECTED ? 'bg-green-500/10 text-green-400 border border-green-500/20' : connectionState === ConnectionState.CONNECTING ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-slate-800 text-slate-400'}`}>
            <div className={`w-2 h-2 rounded-full ${connectionState === ConnectionState.CONNECTED ? 'bg-green-500 animate-pulse' : connectionState === ConnectionState.CONNECTING ? 'bg-yellow-500 animate-pulse' : 'bg-slate-500'}`}></div>
            {connectionState === ConnectionState.CONNECTED ? 'Connected' : connectionState === ConnectionState.CONNECTING ? 'Connecting...' : 'Offline'}
          </div>
        </header>

        {/* Main Visualizer Area */}
        <main className="flex-1 w-full flex flex-col items-center justify-center gap-8 min-h-0">
          <div className="relative w-full aspect-square max-h-[400px] bg-slate-900/40 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
            {/* Status Overlay */}
            <div className="absolute top-4 left-0 right-0 text-center z-20">
              {connectionState === ConnectionState.CONNECTED && (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md text-sm font-medium text-slate-200 border border-white/5">
                  {isPlaying ? (
                    <><SpeakerWaveIcon className="w-4 h-4 text-pgx-accent" /> Sarah is speaking...</>
                  ) : (
                    <><MicrophoneIcon className="w-4 h-4 text-pgx-primary" /> Listening...</>
                  )}
                </span>
              )}
              {connectionState === ConnectionState.CONNECTING && (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md text-sm font-medium text-yellow-200 border border-yellow-500/10">
                  <div className="w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin"></div>
                  Connecting to Sarah...
                </span>
              )}
            </div>

            {/* The Visualizer */}
            <div className="w-full h-full p-4">
              <AudioVisualizer
                analyser={liveServiceRef.current?.getAnalyser() || null}
                isListening={connectionState === ConnectionState.CONNECTED}
              />
            </div>

            {/* Center Avatar/Logo in Visualizer */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-slate-900 border-4 border-slate-800 flex items-center justify-center shadow-xl z-10">
              <SparklesIcon className={`w-12 h-12 ${connectionState === ConnectionState.CONNECTED ? 'text-pgx-primary' : connectionState === ConnectionState.CONNECTING ? 'text-yellow-400 animate-pulse' : 'text-slate-600'}`} />
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 text-sm text-center max-w-md">
              {errorMsg}
            </div>
          )}

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold font-cairo">
              {connectionState === ConnectionState.CONNECTED
                ? "أنا سامعاك، اتفضل اتكلم"
                : connectionState === ConnectionState.CONNECTING
                  ? "جاري الاتصال..."
                  : "مستعد نتكلم؟"}
            </h2>
            <p className="text-slate-400 text-sm max-w-xs mx-auto font-cairo">
              {connectionState === ConnectionState.CONNECTED
                ? "تقدر تسألني عن خدماتنا، الأسعار، أو تحجز ميتنج."
                : connectionState === ConnectionState.CONNECTING
                  ? "استنى لحظة وسارة هتكلمك..."
                  : "اضغط على الزرار عشان تبدأ مكالمة مع سارة، وكيلة مبيعات PGX."}
            </p>
          </div>
        </main>

        {/* Controls */}
        <footer className="w-full py-6 flex justify-center">
          {connectionState !== ConnectionState.CONNECTED ? (
            <button
              onClick={handleConnect}
              disabled={connectionState === ConnectionState.CONNECTING}
              className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-pgx-primary to-pgx-accent text-white shadow-xl shadow-pgx-primary/40 transition-all hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectionState === ConnectionState.CONNECTING ? (
                <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <PhoneIcon className="w-8 h-8" />
              )}
              <span className="absolute -bottom-10 text-sm font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">Call Agent</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-red-500 text-white shadow-xl shadow-red-500/40 transition-all hover:scale-110 active:scale-95"
            >
              <StopIcon className="w-10 h-10" />
              <span className="absolute -bottom-10 text-sm font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">End Call</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default App;
