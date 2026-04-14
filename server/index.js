const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 10e6 });

const JWT_SECRET = process.env.JWT_SECRET || 'gchat-prod-secret-key-2024';
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../dist')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const onlineUsers = new Map();

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Auth ──

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), email.toLowerCase());
    if (existing) return res.status(400).json({ error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, username, email, password_hash, display_name) VALUES (?, ?, ?, ?, ?)')
      .run(id, username.toLowerCase(), email.toLowerCase(), hash, displayName || username);

    const token = jwt.sign({ id, username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
    const user = db.prepare('SELECT id, username, email, display_name, avatar, bio, status, created_at FROM users WHERE id = ?').get(id);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login.toLowerCase(), login.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    const { password_hash, ...safe } = user;
    res.json({ token, user: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, avatar, bio, status, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ── Users ──

app.get('/api/users/search', auth, (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ users: [] });
  const users = db.prepare(
    `SELECT id, username, display_name, avatar, bio, status, is_online, last_seen
     FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 20`
  ).all(`%${q}%`, `%${q}%`, req.user.id);
  res.json({ users });
});

app.get('/api/users/:id', auth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, display_name, avatar, bio, status, is_online, last_seen, created_at FROM users WHERE id = ?'
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

app.put('/api/users/profile', auth, (req, res) => {
  const { displayName, bio, status, avatar } = req.body;
  const sets = [];
  const vals = [];
  if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName); }
  if (bio !== undefined) { sets.push('bio = ?'); vals.push(bio); }
  if (status !== undefined) { sets.push('status = ?'); vals.push(status); }
  if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(avatar); }
  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  const user = db.prepare('SELECT id, username, email, display_name, avatar, bio, status, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// ── Upload ──

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const base64 = req.file.buffer.toString('base64');
  const dataUri = `data:${req.file.mimetype};base64,${base64}`;
  res.json({ url: dataUri });
});

// ── Conversations ──

function enrichConversation(conv, userId) {
  const members = db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar, u.is_online, u.last_seen
     FROM conversation_members cm JOIN users u ON cm.user_id = u.id WHERE cm.conversation_id = ?`
  ).all(conv.id);

  if (conv.type === 'direct') {
    const other = members.find(m => m.id !== userId);
    if (other) {
      conv.name = other.display_name || other.username;
      conv.avatar = other.avatar;
      conv.otherUser = other;
    }
  }
  conv.members = members;
  return conv;
}

app.get('/api/conversations', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_type,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender_id
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    WHERE cm.user_id = ?
    ORDER BY COALESCE(
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
      c.created_at
    ) DESC
  `).all(req.user.id);

  res.json({ conversations: rows.map(c => enrichConversation(c, req.user.id)) });
});

app.post('/api/conversations', auth, (req, res) => {
  const { userId, type = 'direct' } = req.body;
  if (type !== 'direct') return res.status(400).json({ error: 'Only direct chats supported' });
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot chat with yourself' });

  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
    WHERE c.type = 'direct'
  `).get(req.user.id, userId);

  if (existing) {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.id);
    return res.json({ conversation: enrichConversation(conv, req.user.id) });
  }

  const id = uuidv4();
  const insert = db.transaction(() => {
    db.prepare('INSERT INTO conversations (id, type) VALUES (?, ?)').run(id, 'direct');
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(id, req.user.id);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(id, userId);
  });
  insert();

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  const enriched = enrichConversation(conv, req.user.id);

  const otherSockets = onlineUsers.get(userId);
  if (otherSockets) {
    const otherView = enrichConversation({ ...conv }, userId);
    otherSockets.forEach(sid => io.to(sid).emit('conversation:new', otherView));
  }

  res.json({ conversation: enriched });
});

// ── Messages ──

app.get('/api/messages/:conversationId', auth, (req, res) => {
  const { conversationId } = req.params;
  const { limit = 50, before } = req.query;

  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const query = before
    ? `SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ? AND m.created_at < ? ORDER BY m.created_at DESC LIMIT ?`
    : `SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT ?`;

  const params = before ? [conversationId, before, +limit] : [conversationId, +limit];
  res.json({ messages: db.prepare(query).all(...params).reverse() });
});

app.post('/api/messages', auth, (req, res) => {
  const { conversationId, content, type = 'text', mediaUrl } = req.body;

  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type, media_url) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, conversationId, req.user.id, content, type, mediaUrl || null);
  db.prepare('UPDATE conversations SET updated_at = datetime("now") WHERE id = ?').run(conversationId);

  const message = db.prepare(
    `SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar
     FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`
  ).get(id);

  const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
  members.forEach(({ user_id }) => {
    const sockets = onlineUsers.get(user_id);
    if (sockets) sockets.forEach(sid => io.to(sid).emit('message:new', message));
  });

  res.json({ message });
});

// ── Socket.IO ──

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
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

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

server.listen(PORT, () => console.log(`GChat running on port ${PORT}`));
