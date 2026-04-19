export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  video_avatar: string | null;
  profile_header: string | null;
  bio: string;
  status: string;
  is_online: number;
  last_seen: string;
  created_at: string;
  role?: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'channel';
  name: string;
  avatar: string | null;
  description: string;
  creator_id: string | null;
  is_public: number;
  otherUser?: User;
  members: User[];
  member_count: number;
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_count?: number;
  created_at: string;
  updated_at: string;
}

export interface MessageReaction {
  emoji: string;
  user_id: string;
}

export interface ReplyPreview {
  id: string;
  content: string | null;
  type: string;
  sender_display_name: string;
  sender_username: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: 'text' | 'image' | 'audio' | 'video';
  media_url: string | null;
  sender_username: string;
  sender_display_name: string;
  sender_avatar: string | null;
  sender_video_avatar?: string | null;
  created_at: string;
  reply_to_id?: string | null;
  reply_preview?: ReplyPreview | null;
  reactions?: MessageReaction[];
  /** Официальный пост канала (имя и аватар канала в ленте) */
  as_channel?: boolean;
  channel_name?: string | null;
  channel_avatar?: string | null;
  /** 1 канал | 0 от себя | null до явной установки */
  post_as_channel?: number | null;
  /** Сообщение в избранном (текущий пользователь) */
  is_saved?: boolean;
}

export interface SavedListItem {
  save_id: string;
  saved_at: string;
  conversation: Conversation;
  message: Message;
}

export interface Story { id: string; user_id: string; type: 'image' | 'video' | 'text'; media_url: string | null; text_content: string | null; bg_color: string; created_at: string; expires_at: string; view_count: number; viewed: number | null; }
export interface StoryGroup { user_id: string; username: string; display_name: string; avatar: string | null; video_avatar: string | null; stories: Story[]; has_unviewed: boolean; }
export interface AlbumPhoto { id: string; user_id: string; url: string; caption: string; created_at: string; }
export interface ProfileTrack { id: string; user_id: string; title: string; artist: string; url: string; created_at: string; }
