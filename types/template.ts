export interface QuickReplyTemplate {
  id: string;
  title: string;
  content: string;
  category?: string;
  updatedAt: number;
}

export interface MentionTarget {
  id: string;
  name: string;
  query: string;
  pattern: string;
  enabled: boolean;
}

export interface InsertMessageRequest {
  action: 'INSERT_REPLY' | 'AUTOMATE_LICENSE_MENTIONS' | 'CHECK_LICENSE_TICKET';
  content?: string;
  requestId?: string;
  force?: boolean;
  targets?: MentionTarget[];
}

export interface InsertMessageResponse {
  success: boolean;
  error?: string;
  data?: any;
}
