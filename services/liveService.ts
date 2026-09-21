import { GoogleGenAI, LiveServerMessage } from "@google/genai";
import { MODEL_NAME, LIVE_CONFIG } from "../constants";
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from "../utils/audioUtils";

interface LiveServiceCallbacks {
  onOpen: () => void;
  onClose: (event: CloseEvent) => void;
  onError: (error: ErrorEvent) => void;
  onAudioData: (audioBuffer: AudioBuffer) => void;
  onInterrupted: () => void;
  onVolumeChange: (volume: number) => void;
}

export class LiveService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private session: any = null; // The Gemini Live session object
  private analyser: AnalyserNode | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public async connect(callbacks: LiveServiceCallbacks): Promise<void> {
    // 1. Setup Audio Contexts
    // Input context for microphone (16kHz requirement for Gemini)
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000,
    });

    // Output context for playback (24kHz requirement from Gemini)
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });

    // 2. Setup Audio Visualizer (Analyser) attached to Input temporarily (or we could mix output)
    // For this demo, let's visualize the microphone input to show "listening"
    this.analyser = this.inputAudioContext.createAnalyser();
    this.analyser.fftSize = 256;

    // 3. Get Microphone Stream
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }

    // 4. Connect to Gemini Live API
    const sessionPromise = this.ai.live.connect({
      model: MODEL_NAME,
      config: LIVE_CONFIG,
      callbacks: {
        onopen: () => {
          console.log("Gemini Live Connection Opened");
          callbacks.onOpen();
          this.startAudioStreaming(sessionPromise);
        },
        onmessage: async (message: LiveServerMessage) => {
          // Handle Audio Output from Model
          const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

          if (base64Audio && this.outputAudioContext) {
            const audioData = base64ToUint8Array(base64Audio);
            const audioBuffer = await decodeAudioData(audioData, this.outputAudioContext);
            callbacks.onAudioData(audioBuffer);
          }

          // Handle Interruption
          if (message.serverContent?.interrupted) {
            callbacks.onInterrupted();
          }
        },
        onclose: (e) => {
          console.log("Gemini Live Connection Closed", e);
          callbacks.onClose(e);
        },
        onerror: (e) => {
          console.error("Gemini Live Error", e);
          callbacks.onError(e);
        }
      }
    });

    // We store the session promise to ensure we wait for it before sending
    this.session = sessionPromise;
  }

  private startAudioStreaming(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.stream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);

    // Connect source to analyser for visualization
    if (this.analyser) {
      this.source.connect(this.analyser);
    }

    // Use ScriptProcessor for raw PCM data extraction
    // bufferSize 4096 provides a good balance between latency and performance
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Create PCM Blob using the utility function
      const pcmBlob = createPcmBlob(inputData);

      // Send to Gemini
      sessionPromise.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  public async disconnect() {
    // 1. Close Session (if possible, currently we rely on closing socket or context)
    // The SDK session.close() might not be fully exposed in all versions, 
    // but stopping the tracks and context effectively kills the stream.
    if (this.session) {
      try {
        const s = await this.session;
        // Best effort close
        // @ts-ignore
        if (s.close) s.close();
      } catch (e) {
        console.warn("Error closing session", e);
      }
    }

    // 2. Stop Microphone Stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // 3. Disconnect Audio Nodes
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    // 4. Close Audio Contexts
    if (this.inputAudioContext) {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      await this.outputAudioContext.close();
      this.outputAudioContext = null;
    }

    this.session = null;
    this.analyser = null;
  }
}
