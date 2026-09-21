export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isListening: boolean;
}

export interface LogMessage {
  id: string;
  timestamp: Date;
  sender: 'user' | 'agent' | 'system';
  text: string;
}
