export interface QuickReplyTemplate {
  id: string;
  title: string;
  content: string;
  category?: string;
  updatedAt: number;
}

export interface InsertMessageRequest {
  action: 'INSERT_REPLY' | 'AUTOMATE_LICENSE_MENTIONS' | 'CHECK_LICENSE_TICKET';
  content?: string;
  requestId?: string;
}

export interface InsertMessageResponse {
  success: boolean;
  error?: string;
  data?: any;
}
