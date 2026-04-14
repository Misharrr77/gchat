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
  created_at: string;
  updated_at: string;
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
  created_at: string;
}

export interface Story { id: string; user_id: string; type: 'image' | 'video' | 'text'; media_url: string | null; text_content: string | null; bg_color: string; created_at: string; expires_at: string; view_count: number; viewed: number | null; }
export interface StoryGroup { user_id: string; username: string; display_name: string; avatar: string | null; video_avatar: string | null; stories: Story[]; has_unviewed: boolean; }
export interface AlbumPhoto { id: string; user_id: string; url: string; caption: string; created_at: string; }
export interface ProfileTrack { id: string; user_id: string; title: string; artist: string; url: string; created_at: string; }
