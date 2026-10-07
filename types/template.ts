export interface QuickReplyTemplate {
  id: string;
  title: string;
  content: string;
  category?: string;
  updatedAt: number;
}

export interface InsertMessageRequest {
  action: 'INSERT_REPLY';
  content: string;
  requestId?: string;
}

export interface InsertMessageResponse {
  success: boolean;
  error?: string;
}
