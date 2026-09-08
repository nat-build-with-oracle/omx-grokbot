export interface BridgeConfig {
  host: string;
  port: number;
  publicUrl: string;
  dataDir: string;
  ownerSecret: string;
  apiToken: string;
  grokHost: string;
  grokIdentityFile?: string;
  historyHost: string;
  embeddingModel: string;
  allowedHosts: string[];
}

export interface Agent { agentId: string; name: string }
export interface TranscriptEntry {
  rowid: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string | null;
  contentTruncated: boolean;
  isStreaming: boolean;
  requestId: string | null;
  clientNonce: string | null;
}
export interface TranscriptPage {
  agentId: string;
  name: string;
  entries: TranscriptEntry[];
  hasMore: boolean;
  nextBeforeRowid: number | null;
}
export type MessageStatus = 'prepared' | 'sending' | 'accepted' | 'delivery_uncertain' | 'reply_pending' | 'reply_recorded' | 'failed';
export interface MessageRun {
  id: string;
  agentId: string;
  agentName: string;
  prompt: string;
  marker: string;
  afterRowid: number | null;
  status: MessageStatus;
  reply: string | null;
  requestId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface SearchHit {
  id: string;
  text: string;
  project: string;
  source: string;
  lineStart: number;
  lineEnd: number;
  score: number;
  mode: 'vector' | 'keyword';
}
export interface HistoryStatus {
  documents: number;
  chunks: number;
  embeddedChunks: number;
  model: string;
  projects: string[];
}
export interface BridgeApi {
  transcript(agentId: string, beforeRowid?: number): Promise<TranscriptPage>;
  creations(): import('./creation.js').CreationRun[];
  createAgent(input: { operationId: string; name: string; description?: string }): Promise<import('./creation.js').CreationRun>;
  verifyCreation(operationId: string): Promise<import('./creation.js').CreationRun>;
  agents(): Promise<{ agents: Agent[]; health: Record<string, unknown> }>;
  send(input: { messageId: string; agentId: string; prompt: string }): Promise<MessageRun>;
  verify(messageId: string): Promise<MessageRun>;
  messages(): MessageRun[];
  search(input: { query: string; mode?: 'vector' | 'keyword'; limit?: number; project?: string }): Promise<SearchHit[]>;
  historyStatus(): Promise<HistoryStatus>;
  readHistory(id: string): Promise<SearchHit | null>;
}
