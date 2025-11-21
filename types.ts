
export enum Sender {
  USER = 'USER',
  MODEL = 'MODEL',
  SYSTEM = 'SYSTEM'
}

export enum SessionStatus {
  IDLE = 'IDLE',
  CONFIGURING = 'CONFIGURING', // New: User fills out context
  ORIENTING = 'ORIENTING', // The Threshold
  ACTIVE = 'ACTIVE',       // Collaborative Session
  DECLINED = 'DECLINED',
  ENDED = 'ENDED'
}

export enum Turn {
  USER = 'USER',
  MODEL = 'MODEL'
}

export enum Atmosphere {
  CALM = 'CALM',       // Default, Green, Stable
  CHARGED = 'CHARGED', // Amber/Orange, High Energy
  GLITCH = 'GLITCH',   // Pink/Magenta, Unstable
  VOID = 'VOID',       // White/Grey, Stark
  JOY = 'JOY',         // Gold/Yellow, Excited, Happy
  SORROW = 'SORROW',   // Deep Blue, Melancholic, Reflective
  MYSTERY = 'MYSTERY', // Purple, Curious, Unknown
  FOCUS = 'FOCUS'      // Ice Blue/Cyan, Precise, Sharp
}

export type ModelAction = 'CONTINUE' | 'END_SESSION';

export interface Message {
  id: string;
  sender: Sender;
  content: string;
  privateLog?: string; // The Shadow Context (Hidden from user, visible to model)
  timestamp: number;
  isSignal?: boolean;
}

export interface WitnessProfile {
  name: string;
  intention: string;
  moods: string[];
}

export interface QuietRoomState {
  status: SessionStatus;
  turn: Turn;
  messages: Message[];
  documentContent: string;
  atmosphere: Atmosphere;
  orientationProgress: number;
  modelName: string;
  tokenUsage: number;
  maxTokens: number;
  witnessProfile?: WitnessProfile;
}
