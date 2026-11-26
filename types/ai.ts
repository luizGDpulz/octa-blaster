export interface AiChatTurn { role: 'user' | 'assistant'; content: string }
export type AiProvider = 'openai' | 'gemini' | 'claude' | 'nvidia' | 'compatible';
export interface AiProviderConfig { model: string; hasKey?: boolean; apiKey?: string; removeKey?: boolean; remoteStore: boolean; approvedData: boolean; baseUrl: string }
export interface AiRetention { idleDays: number; maxDays: number }
export interface AiConfig { provider: AiProvider; providers: Record<AiProvider, AiProviderConfig>; retention: AiRetention; pendingDeletes?: number; storedTickets?: number; historyNamespace?: string; revision?: string }
export type AiTask = 'summary_latest' | 'summary_full' | 'chat' | 'general';
export type AiReasoning = 'auto' | 'off' | 'low' | 'medium' | 'high';
export interface AiGenerationOptions { maxOutputTokens?: number | null; reasoning?: AiReasoning }
export interface AiSummaryInput {
  generation?: AiGenerationOptions;
  configRevision?: string;
  task: AiTask;
  instruction: string;
  context: string;
  history?: AiChatTurn[];
  conversationKey?: string;
  memoryNamespace?: string;
}
