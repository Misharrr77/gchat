const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50e6,
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
});

const JWT_SECRET = process.env.JWT_SECRET || 'gchat-prod-secret-key-2024';
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const uploadsDir = path.join(__dirname, '../data/uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '../dist')));

const storage = multer.diskStorage({
  destination: (r, f, cb) => cb(null, uploadsDir),
  filename: (r, f, cb) => cb(null, uuidv4() + path.extname(f.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const onlineUsers = new Map();
const UF = 'id, username, display_name, avatar, video_avatar, profile_header, bio, status, is_online, last_seen, created_at';

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Auth ──

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
    if (username.length < 3) return res.status(400).json({ error: 'Минимум 3 символа' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Только латиница, цифры и _' });
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
    if (existing) return res.status(400).json({ error: 'Имя уже занято' });
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const email = `${username.toLowerCase()}@gchat.local`;
    try {
      db.prepare('INSERT INTO users (id, username, email, password_hash, display_name) VALUES (?, ?, ?, ?, ?)').run(id, username.toLowerCase(), email, hash, displayName || username);
    } catch {
      db.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)').run(id, username.toLowerCase(), hash, displayName || username);
    }
    const token = jwt.sign({ id, username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
    const user = db.prepare(`SELECT ${UF} FROM users WHERE id = ?`).get(id);
    res.json({ token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Введите данные' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(login.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Неверные данные' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Неверные данные' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    const safe = db.prepare(`SELECT ${UF} FROM users WHERE id = ?`).get(user.id);
    res.json({ token, user: safe });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare(`SELECT ${UF} FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user });
});

// ── Users ──

app.get('/api/users/search', auth, (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ users: [] });
  res.json({ users: db.prepare(`SELECT ${UF} FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 20`).all(`%${q}%`, `%${q}%`, req.user.id) });
});

app.get('/api/users/:id', auth, (req, res) => {
  const user = db.prepare(`SELECT ${UF} FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user });
});

app.put('/api/users/profile', auth, (req, res) => {
  const { displayName, bio, status, avatar, videoAvatar, profileHeader } = req.body;
  const sets = [], vals = [];
  if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName); }
  if (bio !== undefined) { sets.push('bio = ?'); vals.push(bio); }
  if (status !== undefined) { sets.push('status = ?'); vals.push(status); }
  if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(avatar); }
  if (videoAvatar !== undefined) { sets.push('video_avatar = ?'); vals.push(videoAvatar); }
  if (profileHeader !== undefined) { sets.push('profile_header = ?'); vals.push(profileHeader); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ user: db.prepare(`SELECT ${UF} FROM users WHERE id = ?`).get(req.user.id) });
});

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ── Conversations ──

function enrichConversation(conv, userId) {
  const members = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar, u.video_avatar, u.is_online, u.last_seen, cm.role
     FROM conversation_members cm JOIN users u ON cm.user_id = u.id WHERE cm.conversation_id = ?`
  ).all(conv.id);
  if (conv.type === 'direct') {
    const other = members.find(m => m.id !== userId);
    if (other) { conv.name = other.display_name || other.username; conv.avatar = other.avatar; conv.otherUser = other; }
  }
  conv.members = members;
  conv.member_count = members.length;
  return conv;
}

app.get('/api/conversations', auth, (req, res) => {
  const { type } = req.query;
  let tw = '';
  if (type === 'group') tw = "AND c.type = 'group'";
  else if (type === 'channel') tw = "AND c.type = 'channel'";
  else if (type === 'direct') tw = "AND c.type = 'direct'";
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_type,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender_id
    FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id
    WHERE cm.user_id = ? ${tw}
    ORDER BY COALESCE((SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1), c.created_at) DESC
  `).all(req.user.id);
  res.json({ conversations: rows.map(c => enrichConversation(c, req.user.id)) });
});

app.post('/api/conversations', auth, (req, res) => {
  const { userId } = req.body;
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot chat with yourself' });
  const existing = db.prepare(`SELECT c.id FROM conversations c JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ? JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ? WHERE c.type = 'direct'`).get(req.user.id, userId);
  if (existing) {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.id);
    return res.json({ conversation: enrichConversation(conv, req.user.id) });
  }
  const id = uuidv4();
  db.transaction(() => {
    db.prepare('INSERT INTO conversations (id, type, creator_id) VALUES (?, ?, ?)').run(id, 'direct', req.user.id);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user.id, 'member');
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(id, userId, 'member');
  })();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  const enriched = enrichConversation(conv, req.user.id);
  const otherSockets = onlineUsers.get(userId);
  if (otherSockets) {
    const ov = enrichConversation({ ...db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) }, userId);
    otherSockets.forEach(sid => io.to(sid).emit('conversation:new', ov));
  }
  res.json({ conversation: enriched });
});

app.post('/api/conversations/group', auth, (req, res) => {
  const { name, memberIds = [], avatar, description, isPublic } = req.body;
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  const id = uuidv4();
  const all = [req.user.id, ...memberIds.filter(m => m !== req.user.id)];
  db.transaction(() => {
    db.prepare('INSERT INTO conversations (id, type, name, avatar, description, creator_id, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'group', name, avatar || null, description || '', req.user.id, isPublic ? 1 : 0);
    for (const uid of all) db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(id, uid, uid === req.user.id ? 'admin' : 'member');
  })();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  const enriched = enrichConversation(conv, req.user.id);
  all.forEach(uid => {
    if (uid !== req.user.id) {
      const socks = onlineUsers.get(uid);
      if (socks) { const v = enrichConversation({ ...db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) }, uid); socks.forEach(sid => io.to(sid).emit('conversation:new', v)); }
    }
  });
  res.json({ conversation: enriched });
});

app.post('/api/conversations/channel', auth, (req, res) => {
  const { name, avatar, description, isPublic } = req.body;
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  const id = uuidv4();
  db.transaction(() => {
    db.prepare('INSERT INTO conversations (id, type, name, avatar, description, creator_id, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'channel', name, avatar || null, description || '', req.user.id, isPublic ? 1 : 0);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user.id, 'admin');
  })();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  res.json({ conversation: enrichConversation(conv, req.user.id) });
});

app.put('/api/conversations/:id', auth, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
  if (!role || role.role === 'member') return res.status(403).json({ error: 'Нет прав' });
  const { name, description, avatar, isPublic } = req.body;
  const sets = [], vals = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
  if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(avatar); }
  if (isPublic !== undefined) { sets.push('is_public = ?'); vals.push(isPublic ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing' });
  vals.push(conv.id);
  db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ conversation: enrichConversation(db.prepare('SELECT * FROM conversations WHERE id = ?').get(conv.id), req.user.id) });
});

app.put('/api/conversations/:id/members/:userId/role', auth, (req, res) => {
  const { role } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
  if (!myRole || myRole.role !== 'admin') return res.status(403).json({ error: 'Только админ' });
  db.prepare('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?').run(role, conv.id, req.params.userId);
  res.json({ ok: true });
});

app.delete('/api/conversations/:id/members/:userId', auth, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
  const isSelf = req.params.userId === req.user.id;
  if (!isSelf && (!myRole || myRole.role === 'member')) return res.status(403).json({ error: 'Нет прав' });
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(conv.id, req.params.userId);
  if (isSelf) {
    const socks = onlineUsers.get(req.user.id);
    if (socks) socks.forEach(sid => io.to(sid).emit('conversation:removed', { conversationId: conv.id }));
  }
  res.json({ ok: true });
});

app.post('/api/conversations/:id/join', auth, (req, res) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ? AND is_public = 1").get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Не найдено' });
  const exists = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
  if (!exists) db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(conv.id, req.user.id, 'member');
  res.json({ conversation: enrichConversation(db.prepare('SELECT * FROM conversations WHERE id = ?').get(conv.id), req.user.id) });
});

app.post('/api/conversations/:id/members', auth, (req, res) => {
  const { userIds } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv || conv.type === 'direct') return res.status(400).json({ error: 'Нельзя' });
  db.transaction(() => {
    for (const uid of userIds) { try { db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(conv.id, uid, 'member'); } catch {} }
  })();
  const enriched = enrichConversation(db.prepare('SELECT * FROM conversations WHERE id = ?').get(conv.id), req.user.id);
  userIds.forEach(uid => {
    const socks = onlineUsers.get(uid);
    if (socks) { const v = enrichConversation({ ...db.prepare('SELECT * FROM conversations WHERE id = ?').get(conv.id) }, uid); socks.forEach(sid => io.to(sid).emit('conversation:new', v)); }
  });
  res.json({ conversation: enriched });
});

app.get('/api/discover', auth, (req, res) => {
  const q = req.query.q || '';
  res.json({
    results: db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) as member_count
      FROM conversations c WHERE c.is_public = 1 AND c.name LIKE ?
      AND c.id NOT IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?) LIMIT 20
    `).all(`%${q}%`, req.user.id)
  });
});

// ── Messages ──

app.get('/api/messages/:conversationId', auth, (req, res) => {
  const { conversationId } = req.params;
  const { limit = 50, before } = req.query;
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const q = before
    ? `SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`
    : `SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT ?`;
  const p = before ? [conversationId, before, +limit] : [conversationId, +limit];
  res.json({ messages: db.prepare(q).all(...p).reverse() });
});

app.post('/api/messages', auth, (req, res) => {
  try {
    const { conversationId, content, type = 'text', mediaUrl } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });
    const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const conv = db.prepare('SELECT type FROM conversations WHERE id = ?').get(conversationId);
    if (conv?.type === 'channel') {
      const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
      if (role?.role !== 'admin') return res.status(403).json({ error: 'Только админы' });
    }
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type, media_url) VALUES (?, ?, ?, ?, ?, ?)').run(id, conversationId, req.user.id, content, type, mediaUrl || null);
    db.prepare('UPDATE conversations SET updated_at = datetime("now") WHERE id = ?').run(conversationId);
    const message = db.prepare(`SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`).get(id);
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
    members.forEach(({ user_id }) => {
      const sockets = onlineUsers.get(user_id);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('message:new', message));
    });
    res.json({ message });
  } catch (err) {
    console.error('[API] POST /api/messages error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Stories (only from contacts) ──

app.get('/api/stories', auth, (req, res) => {
  const stories = db.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar, u.video_avatar,
      (SELECT COUNT(*) FROM story_views sv WHERE sv.story_id = s.id) as view_count,
      (SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = ?) as viewed
    FROM stories s JOIN users u ON s.user_id = u.id
    WHERE s.expires_at > datetime('now')
      AND (s.user_id = ? OR s.user_id IN (
        SELECT DISTINCT cm2.user_id FROM conversation_members cm1
        JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
        WHERE cm1.user_id = ? AND cm2.user_id != ?
      ))
    ORDER BY s.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  const grouped = {};
  stories.forEach(s => {
    if (!grouped[s.user_id]) {
      grouped[s.user_id] = { user_id: s.user_id, username: s.username, display_name: s.display_name, avatar: s.avatar, video_avatar: s.video_avatar, stories: [], has_unviewed: false };
    }
    grouped[s.user_id].stories.push(s);
    if (!s.viewed) grouped[s.user_id].has_unviewed = true;
  });
  res.json({ stories: Object.values(grouped) });
});

app.post('/api/stories', auth, (req, res) => {
  const { type = 'image', mediaUrl, textContent, bgColor } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO stories (id, user_id, type, media_url, text_content, bg_color) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.id, type, mediaUrl || null, textContent || null, bgColor || '#3b82f6');
  io.emit('story:new', { userId: req.user.id });
  res.json({ story: db.prepare('SELECT * FROM stories WHERE id = ?').get(id) });
});

app.post('/api/stories/:id/view', auth, (req, res) => {
  try { db.prepare('INSERT OR IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id); } catch {}
  res.json({ ok: true });
});

app.delete('/api/stories/:id', auth, (req, res) => {
  db.prepare('DELETE FROM stories WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Albums ──

app.get('/api/albums/:userId', auth, (req, res) => {
  res.json({ photos: db.prepare('SELECT * FROM albums WHERE user_id = ? ORDER BY created_at DESC').all(req.params.userId) });
});

app.post('/api/albums', auth, (req, res) => {
  const { url, caption } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const id = uuidv4();
  db.prepare('INSERT INTO albums (id, user_id, url, caption) VALUES (?, ?, ?, ?)').run(id, req.user.id, url, caption || '');
  res.json({ photo: db.prepare('SELECT * FROM albums WHERE id = ?').get(id) });
});

app.delete('/api/albums/:id', auth, (req, res) => {
  db.prepare('DELETE FROM albums WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Profile Music ──

app.get('/api/music/:userId', auth, (req, res) => {
  res.json({ tracks: db.prepare('SELECT * FROM profile_music WHERE user_id = ? ORDER BY created_at DESC').all(req.params.userId) });
});

app.post('/api/music', auth, (req, res) => {
  const { title, artist, url } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'Нужны название и файл' });
  const id = uuidv4();
  db.prepare('INSERT INTO profile_music (id, user_id, title, artist, url) VALUES (?, ?, ?, ?, ?)').run(id, req.user.id, title, artist || '', url);
  res.json({ track: db.prepare('SELECT * FROM profile_music WHERE id = ?').get(id) });
});

app.delete('/api/music/:id', auth, (req, res) => {
  db.prepare('DELETE FROM profile_music WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Socket.IO ──

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Unauthorized'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  const uid = socket.user.id;
  if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
  onlineUsers.get(uid).add(socket.id);
  db.prepare('UPDATE users SET is_online = 1 WHERE id = ?').run(uid);
  io.emit('user:online', { userId: uid, online: true });

  socket.on('typing', ({ conversationId }) => {
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, uid);
    members.forEach(({ user_id }) => {
      const socks = onlineUsers.get(user_id);
      if (socks) socks.forEach(sid => io.to(sid).emit('user:typing', { conversationId, userId: uid }));
    });
  });

  socket.on('disconnect', () => {
    const set = onlineUsers.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(uid);
        db.prepare('UPDATE users SET is_online = 0, last_seen = datetime("now") WHERE id = ?').run(uid);
        io.emit('user:online', { userId: uid, online: false });
      }
    }
  });
});

app.get('/api/health', (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
    res.json({ ok: true, users: count.c, uptime: process.uptime() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/debug/test-msg', auth, (req, res) => {
  try {
    const conv = db.prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ? LIMIT 1').get(req.user.id);
    if (!conv) return res.json({ ok: false, error: 'no conversation' });
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?, ?)').run(id, conv.conversation_id, req.user.id, 'debug-test', 'text');
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    res.json({ ok: true, msg });
  } catch (err) {
    res.json({ ok: false, error: err.message, stack: err.stack });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));

app.use((err, req, res, _next) => {
  console.error('[Express] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

server.listen(PORT, () => console.log(`GChat v3.3 on port ${PORT}`));
