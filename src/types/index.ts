export interface User {
  id: string;
  username: string;
  email?: string;
  display_name: string;
  avatar: string | null;
  bio: string;
  status: string;
  is_online: number;
  last_seen: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatar: string | null;
  otherUser?: User;
  members: User[];
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: 'text' | 'image' | 'audio';
  media_url: string | null;
  sender_username: string;
  sender_display_name: string;
  sender_avatar: string | null;
  created_at: string;
}
