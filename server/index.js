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
const { uploadsDir } = require('./paths');
const db = require('./db');
const { lastMessagePreviewLine } = require('./lastMessageLine');

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

app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '../dist')));

const storage = multer.diskStorage({
  destination: (r, f, cb) => cb(null, uploadsDir),
  filename: (r, f, cb) => cb(null, uuidv4() + path.extname(f.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const onlineUsers = new Map();
const UF = 'id, username, display_name, avatar, video_avatar, profile_header, bio, status, is_online, last_seen, created_at, quiz_warning, restricted';

function randomInviteCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Auth ──

function validateQuizAnswers(body) {
  const affirm = !!body?.affirmQuiz;
  const q1 = String(body?.quiz?.q1 ?? '').trim().toLowerCase();
  const q2 = String(body?.quiz?.q2 ?? '').trim().toLowerCase();
  const q3 = body?.quiz?.q3;
  const ok1 = q1.includes('асфальт');
  const ok2 = q2 === 'b';
  let ok3 = false;
  if (Array.isArray(q3)) {
    const s = new Set(q3.map(x => String(x).toLowerCase()));
    ok3 = s.size === 2 && s.has('woman') && s.has('hetero');
  }
  const allOk = affirm && ok1 && ok2 && ok3;
  return { allOk, failed: !allOk };
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Введи логин и пароль' });
    if (!req.body?.affirmQuiz) return res.status(400).json({ error: 'Подтверди условие регистрации' });
    if (username.length < 3) return res.status(400).json({ error: 'Минимум 3 символа' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Только латиница, цифры и _' });
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
    if (existing) return res.status(400).json({ error: 'Имя уже занято' });
    const { allOk, failed } = validateQuizAnswers(req.body);
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const email = `${username.toLowerCase()}@gchat.local`;
    const qw = failed ? 1 : 0;
    const rest = failed ? 1 : 0;
    try {
      db.prepare(
        'INSERT INTO users (id, username, email, password_hash, display_name, quiz_warning, restricted) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, username.toLowerCase(), email, hash, displayName || username, qw, rest);
    } catch {
      db.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)').run(id, username.toLowerCase(), hash, displayName || username);
    }
    const token = jwt.sign({ id, username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
    const user = db.prepare(`SELECT ${UF} FROM users WHERE id = ?`).get(id);
    res.json({ token, user, quizOk: allOk });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Введи данные' });
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

function broadcastUserProfile(user) {
  const rows = db.prepare(`
    SELECT DISTINCT cm.user_id FROM conversation_members cm
    WHERE cm.conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?)
  `).all(user.id);
  rows.forEach(({ user_id }) => {
    const socks = onlineUsers.get(user_id);
    if (socks) socks.forEach(sid => io.to(sid).emit('user:updated', { user }));
  });
}

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
  const user = db.prepare(`SELECT ${UF} FROM users WHERE id = ?`).get(req.user.id);
  broadcastUserProfile(user);
  res.json({ user });
});

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ── Conversations ──

function enrichTopicRow(raw) {
  const row = { ...raw };
  if (row.last_message_at != null && row.last_message_at !== '') {
    row.last_message = lastMessagePreviewLine(row.last_message, row.last_message_type);
  }
  return row;
}

/** Список тем группы с превью последнего сообщения (Калининградское «сегодня» через created_at сообщения) */
function fetchTopicsEnriched(cid) {
  const rows = db.prepare(`
    SELECT gt.id, gt.conversation_id, gt.name, gt.sort_order,
      COALESCE(gt.pinned, 0) as pinned,
      gt.created_at,
      (SELECT m.content FROM messages m WHERE m.conversation_id = gt.conversation_id AND m.topic_id = gt.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
      (SELECT m.type FROM messages m WHERE m.conversation_id = gt.conversation_id AND m.topic_id = gt.id ORDER BY m.created_at DESC LIMIT 1) as last_message_type,
      (SELECT m.created_at FROM messages m WHERE m.conversation_id = gt.conversation_id AND m.topic_id = gt.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
      (SELECT m.sender_id FROM messages m WHERE m.conversation_id = gt.conversation_id AND m.topic_id = gt.id ORDER BY m.created_at DESC LIMIT 1) as last_message_sender_id
    FROM group_topics gt
    WHERE gt.conversation_id = ?
    ORDER BY COALESCE(gt.pinned, 0) DESC, gt.sort_order ASC, gt.created_at ASC
  `).all(cid);
  return rows.map(enrichTopicRow);
}

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
  if (conv.last_message_at != null && conv.last_message_at !== '') {
    conv.last_message = lastMessagePreviewLine(conv.last_message, conv.last_message_type);
  }
  return conv;
}

app.get('/api/conversations', auth, (req, res) => {
  const { type } = req.query;
  const uid = req.user.id;
  let tw = '';
  if (type === 'group') tw = "AND c.type = 'group'";
  else if (type === 'channel') tw = "AND c.type = 'channel'";
  else if (type === 'direct') tw = "AND c.type = 'direct'";
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_type,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_sender_id,
      (SELECT post_as_channel FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_post_as_channel,
      (SELECT COUNT(*) FROM messages m
        WHERE m.conversation_id = c.id
        AND m.sender_id != ?
        AND m.created_at > COALESCE(
          (SELECT last_read_at FROM conversation_reads WHERE conversation_id = c.id AND user_id = ?),
          (SELECT joined_at FROM conversation_members WHERE conversation_id = c.id AND user_id = ?),
          '1970-01-01'
        )
      ) as unread_count
    FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id
    WHERE cm.user_id = ? ${tw}
    ORDER BY COALESCE((SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1), c.created_at) DESC
  `).all(uid, uid, uid, uid);
  res.json({ conversations: rows.map(c => enrichConversation(c, req.user.id)) });
});

app.post('/api/conversations/:id/read', auth, (req, res) => {
  const cid = req.params.id;
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(cid, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const latest = db.prepare(`SELECT COALESCE(MAX(created_at), datetime('now')) as t FROM messages WHERE conversation_id = ?`).get(cid);
  db.prepare(`
    INSERT INTO conversation_reads (user_id, conversation_id, last_read_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, conversation_id) DO UPDATE SET last_read_at = excluded.last_read_at
  `).run(req.user.id, cid, latest.t);
  const conv = db.prepare('SELECT type FROM conversations WHERE id = ?').get(cid);
  if (conv?.type === 'direct') {
    const others = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(cid, req.user.id);
    others.forEach(({ user_id }) => {
      const socks = onlineUsers.get(user_id);
      if (socks) socks.forEach(sid => io.to(sid).emit('dm:peerRead', { conversationId: cid, lastReadAt: latest.t }));
    });
  }
  res.json({ ok: true });
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
  const lim = db.prepare('SELECT restricted FROM users WHERE id = ?').get(req.user.id);
  if (lim?.restricted) return res.status(403).json({ error: 'Ограниченный аккаунт не может создавать группы' });
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
  const limC = db.prepare('SELECT restricted FROM users WHERE id = ?').get(req.user.id);
  if (limC?.restricted) return res.status(403).json({ error: 'Ограниченный аккаунт не может создавать каналы' });
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
  const { name, description, avatar, isPublic, topicsEnabled } = req.body;
  const sets = [], vals = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
  if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(avatar); }
  if (isPublic !== undefined) { sets.push('is_public = ?'); vals.push(isPublic ? 1 : 0); }
  if (topicsEnabled !== undefined && conv.type === 'group') {
    sets.push('topics_enabled = ?'); vals.push(topicsEnabled ? 1 : 0);
    if (topicsEnabled) {
      const n = db.prepare('SELECT COUNT(*) as c FROM group_topics WHERE conversation_id = ?').get(conv.id).c;
      if (n === 0) {
        const tid = uuidv4();
        db.prepare('INSERT INTO group_topics (id, conversation_id, name, sort_order, pinned) VALUES (?, ?, ?, 0, 0)').run(tid, conv.id, 'Основной чат');
        db.prepare('UPDATE messages SET topic_id = ? WHERE conversation_id = ? AND topic_id IS NULL').run(tid, conv.id);
      }
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing' });
  vals.push(conv.id);
  db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ conversation: enrichConversation(db.prepare('SELECT * FROM conversations WHERE id = ?').get(conv.id), req.user.id) });
});

app.get('/api/conversations/:id/topics', auth, (req, res) => {
  const cid = req.params.id;
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(cid, req.user.id);
  if (!member) return res.status(403).json({ error: 'Нет доступа' });
  const conv = db.prepare('SELECT topics_enabled FROM conversations WHERE id = ?').get(cid);
  const topics = fetchTopicsEnriched(cid);
  res.json({ topics, topics_enabled: conv?.topics_enabled ?? 0 });
});

app.post('/api/conversations/:id/topics', auth, (req, res) => {
  const cid = req.params.id;
  const conv = db.prepare('SELECT type FROM conversations WHERE id = ?').get(cid);
  if (!conv || conv.type !== 'group') return res.status(400).json({ error: 'Только группы' });
  const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(cid, req.user.id);
  if (!role || role.role !== 'admin') return res.status(403).json({ error: 'Только админ' });
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Укажи название темы' });
  const mo = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM group_topics WHERE conversation_id = ?').get(cid).m;
  const id = uuidv4();
  db.prepare('INSERT INTO group_topics (id, conversation_id, name, sort_order, pinned) VALUES (?, ?, ?, ?, 0)').run(id, cid, name, mo + 1);
  const row = db.prepare('SELECT id, conversation_id, name, sort_order, COALESCE(pinned,0) as pinned, created_at FROM group_topics WHERE id = ?').get(id);
  const topics = fetchTopicsEnriched(cid);
  const topic = topics.find(t => t.id === id) || enrichTopicRow(row);
  res.json({ topic });
});

app.patch('/api/conversations/:id/topics/:topicId', auth, (req, res) => {
  const cid = req.params.id;
  const tid = req.params.topicId;
  const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(cid, req.user.id);
  if (!role || role.role !== 'admin') return res.status(403).json({ error: 'Только админ' });
  const bodyName = req.body?.name;
  const bodyPinned = req.body?.pinned;
  const sets = [];
  const vals = [];
  if (bodyName !== undefined) {
    const name = String(bodyName || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Имя' });
    sets.push('name = ?');
    vals.push(name);
  }
  if (bodyPinned !== undefined) {
    sets.push('pinned = ?');
    vals.push(bodyPinned ? 1 : 0);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing' });
  vals.push(tid, cid);
  const r = db.prepare(`UPDATE group_topics SET ${sets.join(', ')} WHERE id = ? AND conversation_id = ?`).run(...vals);
  if (!r.changes) return res.status(404).json({ error: 'Не найдено' });
  const topics = fetchTopicsEnriched(cid);
  const topic = topics.find(t => t.id === tid);
  res.json({ topic });
});

app.post('/api/conversations/:id/topics/:topicId/move', auth, (req, res) => {
  const cid = req.params.id;
  const tid = req.params.topicId;
  const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(cid, req.user.id);
  if (!role || role.role !== 'admin') return res.status(403).json({ error: 'Только админ' });
  const direction = String(req.body?.direction || '');
  if (direction !== 'up' && direction !== 'down') return res.status(400).json({ error: 'direction' });
  const topics = db.prepare(`
    SELECT id, sort_order, COALESCE(pinned, 0) as pinned FROM group_topics
    WHERE conversation_id = ?
    ORDER BY pinned DESC, sort_order ASC, created_at ASC
  `).all(cid);
  const idx = topics.findIndex(t => t.id === tid);
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= topics.length) return res.json({ ok: true, topics: fetchTopicsEnriched(cid) });
  const a = topics[idx];
  const b = topics[swapIdx];
  if (a.pinned !== b.pinned) return res.json({ ok: true, topics: fetchTopicsEnriched(cid) });
  const sa = a.sort_order;
  const sb = b.sort_order;
  db.prepare('UPDATE group_topics SET sort_order = ? WHERE id = ?').run(sb, a.id);
  db.prepare('UPDATE group_topics SET sort_order = ? WHERE id = ?').run(sa, b.id);
  res.json({ ok: true, topics: fetchTopicsEnriched(cid) });
});

app.delete('/api/conversations/:id/topics/:topicId', auth, (req, res) => {
  const cid = req.params.id;
  const tid = req.params.topicId;
  const conv = db.prepare('SELECT type FROM conversations WHERE id = ?').get(cid);
  if (!conv || conv.type !== 'group') return res.status(400).json({ error: 'Только группы' });
  const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(cid, req.user.id);
  if (!role || role.role !== 'admin') return res.status(403).json({ error: 'Только админ' });
  const cnt = db.prepare('SELECT COUNT(*) as c FROM group_topics WHERE conversation_id = ?').get(cid).c;
  if (cnt <= 1) return res.status(400).json({ error: 'Нельзя удалить последнюю тему' });
  const fallback = db.prepare('SELECT id FROM group_topics WHERE conversation_id = ? AND id != ? ORDER BY sort_order ASC, created_at ASC LIMIT 1').get(cid, tid);
  if (!fallback) return res.status(400).json({ error: 'Нельзя' });
  db.prepare('UPDATE messages SET topic_id = ? WHERE conversation_id = ? AND topic_id = ?').run(fallback.id, cid, tid);
  db.prepare('DELETE FROM group_topics WHERE id = ? AND conversation_id = ?').run(tid, cid);
  res.json({ ok: true });
});

app.put('/api/conversations/:id/members/:userId/role', auth, (req, res) => {
  const { role } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
  if (conv.type === 'channel') {
    if (req.user.id !== conv.creator_id) return res.status(403).json({ error: 'Только владелец' });
  } else if (!myRole || myRole.role !== 'admin') {
    return res.status(403).json({ error: 'Только админ' });
  }
  db.prepare('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?').run(role, conv.id, req.params.userId);
  res.json({ ok: true });
});

app.delete('/api/conversations/:id/members/:userId', auth, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
  const isSelf = req.params.userId === req.user.id;
  if (!isSelf) {
    if (conv.type === 'channel') {
      if (req.user.id !== conv.creator_id) return res.status(403).json({ error: 'Нет прав' });
    } else {
      const target = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.params.userId);
      if (!target) return res.status(404).json({ error: 'Not found' });
      if (req.params.userId === conv.creator_id) return res.status(403).json({ error: 'Нельзя исключить владельца' });
      if (req.user.id === conv.creator_id) {
        /* владелец может исключить любого кроме себя — уже не self */
      } else if (myRole?.role === 'admin') {
        if (target.role === 'admin') return res.status(403).json({ error: 'Можно исключать только обычных участников' });
      } else {
        return res.status(403).json({ error: 'Нет прав' });
      }
    }
  }
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

app.post('/api/conversations/:id/invite', auth, (req, res) => {
  try {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    if (conv.is_public) return res.status(400).json({ error: 'Для приватных чатов и групп' });
    const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
    if (conv.type === 'channel') {
      if (req.user.id !== conv.creator_id) return res.status(403).json({ error: 'Только владелец' });
    } else if (!myRole || myRole.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав' });
    }
    let inv = db.prepare('SELECT code FROM conversation_invites WHERE conversation_id = ?').get(conv.id);
    if (!inv) {
      const code = randomInviteCode();
      db.prepare('INSERT INTO conversation_invites (code, conversation_id, created_by) VALUES (?, ?, ?)').run(code, conv.id, req.user.id);
      inv = { code };
    }
    res.json({ code: inv.code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/invite/:code', auth, (req, res) => {
  const inv = db.prepare('SELECT * FROM conversation_invites WHERE code = ?').get(req.params.code);
  if (!inv) return res.status(404).json({ error: 'Неверная ссылка' });
  const c = db.prepare('SELECT id, name, type, avatar, is_public FROM conversations WHERE id = ?').get(inv.conversation_id);
  if (!c) return res.status(404).json({ error: 'Нет' });
  res.json({ conversation: c });
});

app.post('/api/invite/:code/join', auth, (req, res) => {
  const inv = db.prepare('SELECT * FROM conversation_invites WHERE code = ?').get(req.params.code);
  if (!inv) return res.status(404).json({ error: 'Неверная ссылка' });
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(inv.conversation_id);
  if (!c) return res.status(404).json({ error: 'Нет' });
  const ex = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(c.id, req.user.id);
  if (!ex) db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)').run(c.id, req.user.id, 'member');
  res.json({ conversation: enrichConversation(db.prepare('SELECT * FROM conversations WHERE id = ?').get(c.id), req.user.id) });
});

app.post('/api/conversations/:id/members', auth, (req, res) => {
  const { userIds } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conv || conv.type === 'direct') return res.status(400).json({ error: 'Нельзя' });
  const myRole = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conv.id, req.user.id);
  if (conv.type === 'channel') {
    if (req.user.id !== conv.creator_id) return res.status(403).json({ error: 'Только владелец' });
  } else if (!myRole || myRole.role !== 'admin') {
    return res.status(403).json({ error: 'Только админ' });
  }
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

function fetchReactionsForMessages(messageIds) {
  const map = new Map();
  if (!messageIds.length) return map;
  const ph = messageIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (${ph})`).all(...messageIds);
  rows.forEach(r => {
    if (!map.has(r.message_id)) map.set(r.message_id, []);
    map.get(r.message_id).push({ emoji: r.emoji, user_id: r.user_id });
  });
  return map;
}

const MSG_BASE = `m.id, m.conversation_id, m.sender_id, m.content, m.type, m.media_url, m.reply_to_id, m.post_as_channel, m.topic_id, m.created_at,
  u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar, u.video_avatar as sender_video_avatar,
  c.type as _conv_type, c.name as _conv_name, c.avatar as _conv_avatar,
  rm.id as _reply_id, rm.content as _reply_content, rm.type as _reply_type, rm.media_url as _reply_media_url,
  ru.display_name as _reply_sender_display, ru.username as _reply_sender_username`;

const MSG_FROM = `FROM messages m
  JOIN users u ON m.sender_id = u.id
  JOIN conversations c ON c.id = m.conversation_id
  LEFT JOIN messages rm ON m.reply_to_id = rm.id
  LEFT JOIN users ru ON rm.sender_id = ru.id`;

/** Extra column for GET /messages — ?, первый параметр = текущий user id */
const MSG_SELECT_SAVED = `, (SELECT 1 FROM saved_messages sv WHERE sv.message_id = m.id AND sv.user_id = ?) AS _is_saved`;

function shapeDbMessage(row, reactionsMap) {
  const reactions = reactionsMap.get(row.id) || [];
  const isChannelConv = row._conv_type === 'channel';
  const pac = row.post_as_channel;
  /** NULL/1 = официальный пост канала; 0 = от себя */
  const asChannel = isChannelConv && pac !== 0;
  const msg = {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    content: row.content,
    type: row.type,
    media_url: row.media_url,
    reply_to_id: row.reply_to_id || null,
    post_as_channel: isChannelConv ? (pac === 0 ? 0 : pac === 1 ? 1 : null) : null,
    topic_id: row.topic_id || null,
    created_at: row.created_at,
    sender_username: row.sender_username,
    sender_display_name: row.sender_display_name,
    sender_avatar: row.sender_avatar,
    sender_video_avatar: row.sender_video_avatar,
    as_channel: asChannel,
    channel_name: asChannel ? row._conv_name : null,
    channel_avatar: asChannel ? row._conv_avatar : null,
    reactions,
  };
  if (row._is_saved !== undefined && row._is_saved !== null) {
    msg.is_saved = !!row._is_saved;
  }
  if (row.reply_to_id && row._reply_id) {
    msg.reply_preview = {
      id: row._reply_id,
      content: row._reply_content,
      type: row._reply_type,
      sender_display_name: row._reply_sender_display,
      sender_username: row._reply_sender_username,
      media_url: row._reply_media_url || null,
    };
  }
  return msg;
}

function hydrateMessageById(messageId, forUserId) {
  const row = forUserId
    ? db.prepare(`SELECT ${MSG_BASE}${MSG_SELECT_SAVED} ${MSG_FROM} WHERE m.id = ?`).get(forUserId, messageId)
    : db.prepare(`SELECT ${MSG_BASE} ${MSG_FROM} WHERE m.id = ?`).get(messageId);
  if (!row) return null;
  const reactMap = fetchReactionsForMessages([messageId]);
  return shapeDbMessage(row, reactMap);
}

function broadcastMessageReaction(conversationId, messageId, reactions) {
  const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
  members.forEach(({ user_id }) => {
    const sockets = onlineUsers.get(user_id);
    if (sockets) sockets.forEach(sid => io.to(sid).emit('message:reaction', { conversationId, messageId, reactions }));
  });
}

function canUserPinConversation(conversationId, userId) {
  const conv = db.prepare('SELECT type FROM conversations WHERE id = ?').get(conversationId);
  if (!conv) return false;
  if (conv.type === 'direct') return !!db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
  const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
  return role?.role === 'admin';
}

function buildPinsListForUser(conversationId, userId) {
  const pins = db.prepare(
    `SELECT message_id, pinned_by, pinned_at FROM pinned_messages WHERE conversation_id = ? ORDER BY pinned_at DESC`
  ).all(conversationId);
  if (!pins.length) return [];
  const ids = pins.map(p => p.message_id);
  const ph = ids.map(() => '?').join(',');
  const msgRows = db.prepare(
    `SELECT ${MSG_BASE}${MSG_SELECT_SAVED} ${MSG_FROM} WHERE m.conversation_id = ? AND m.id IN (${ph})`
  ).all(userId, conversationId, ...ids);
  const reactMap = fetchReactionsForMessages(ids);
  const byId = new Map(msgRows.map(r => [r.id, r]));
  return pins
    .map(p => ({
      message_id: p.message_id,
      pinned_by: p.pinned_by,
      pinned_at: p.pinned_at,
      message: byId.get(p.message_id) ? shapeDbMessage(byId.get(p.message_id), reactMap) : null,
    }))
    .filter(x => x.message);
}

function broadcastPinsUpdated(conversationId) {
  const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
  members.forEach(({ user_id }) => {
    const socks = onlineUsers.get(user_id);
    if (!socks) return;
    const pins = buildPinsListForUser(conversationId, user_id);
    socks.forEach(sid => io.to(sid).emit('pins:updated', { conversationId, pins }));
  });
}

/** Фильтр по теме для групп с включёнными темами */
function resolveTopicFilter(conversationId, topicIdQuery, anchorMsgId) {
  const meta = db.prepare('SELECT type, topics_enabled FROM conversations WHERE id = ?').get(conversationId);
  if (!meta || meta.type !== 'group' || !meta.topics_enabled) return { clause: '', params: [] };
  let tid = topicIdQuery || null;
  if (anchorMsgId) {
    const row = db.prepare('SELECT topic_id FROM messages WHERE id = ? AND conversation_id = ?').get(anchorMsgId, conversationId);
    if (row?.topic_id) tid = row.topic_id;
  }
  if (!tid) return { err: 'Укажи тему (topicId) или открой из закрепа внутри темы' };
  const ok = db.prepare('SELECT 1 FROM group_topics WHERE id = ? AND conversation_id = ?').get(tid, conversationId);
  if (!ok) return { err: 'Тема не найдена' };
  return { clause: ' AND m.topic_id = ?', params: [tid] };
}

app.get('/api/messages/:conversationId', auth, (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, before, anchor } = req.query;
    const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const uid = req.user.id;
    const tf = resolveTopicFilter(conversationId, req.query.topicId, anchor || null);
    if (tf.err) return res.status(400).json({ error: tf.err });
    const TX = tf.clause || '';
    const TP = tf.params || [];
    let rows;
    if (anchor) {
      const a = db.prepare('SELECT created_at FROM messages WHERE id = ? AND conversation_id = ?').get(anchor, conversationId);
      if (!a) return res.status(404).json({ error: 'Сообщение не найдено' });
      const lim = Math.min(Math.max(+limit || 60, 30), 150);
      const half = Math.ceil(lim / 2);
      const older = db
        .prepare(`SELECT ${MSG_BASE}${MSG_SELECT_SAVED} ${MSG_FROM} WHERE m.conversation_id = ? AND m.created_at <= ?${TX} ORDER BY m.created_at DESC LIMIT ?`)
        .all(uid, conversationId, a.created_at, ...TP, half + 20);
      const newer = db
        .prepare(`SELECT ${MSG_BASE}${MSG_SELECT_SAVED} ${MSG_FROM} WHERE m.conversation_id = ? AND m.created_at > ?${TX} ORDER BY m.created_at ASC LIMIT ?`)
        .all(uid, conversationId, a.created_at, ...TP, half + 20);
      const seen = new Map();
      [...newer, ...older].forEach(r => seen.set(r.id, r));
      rows = [...seen.values()].sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
    } else if (before) {
      rows = db
        .prepare(`SELECT ${MSG_BASE}${MSG_SELECT_SAVED} ${MSG_FROM} WHERE m.conversation_id = ? AND m.created_at < ?${TX} ORDER BY m.created_at DESC LIMIT ?`)
        .all(uid, conversationId, before, ...TP, +limit)
        .reverse();
    } else {
      rows = db
        .prepare(`SELECT ${MSG_BASE}${MSG_SELECT_SAVED} ${MSG_FROM} WHERE m.conversation_id = ?${TX} ORDER BY m.created_at DESC LIMIT ?`)
        .all(uid, conversationId, ...TP, +limit)
        .reverse();
    }
    const ids = rows.map(r => r.id);
    const reactMap = fetchReactionsForMessages(ids);
    const messages = rows.map(r => shapeDbMessage(r, reactMap));
    const convMeta = db.prepare('SELECT type FROM conversations WHERE id = ?').get(conversationId);
    let dmPeerLastReadAt = null;
    if (convMeta?.type === 'direct') {
      const other = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').get(conversationId, uid);
      if (other) {
        const rr = db.prepare('SELECT last_read_at FROM conversation_reads WHERE conversation_id = ? AND user_id = ?').get(conversationId, other.user_id);
        dmPeerLastReadAt = rr?.last_read_at || null;
      }
    }
    res.json({ messages, dmPeerLastReadAt });
  } catch (err) {
    console.error('[API] GET messages', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/messages/:messageId/reactions', auth, (req, res) => {
  try {
    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji || emoji.length > 16) return res.status(400).json({ error: 'Invalid emoji' });
    const msg = db.prepare('SELECT id, conversation_id FROM messages WHERE id = ?').get(req.params.messageId);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(msg.conversation_id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const existing = db.prepare('SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(msg.id, req.user.id, emoji);
    if (existing) db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id);
    else db.prepare('INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(uuidv4(), msg.id, req.user.id, emoji);
    const reactMap = fetchReactionsForMessages([msg.id]);
    const reactions = reactMap.get(msg.id) || [];
    broadcastMessageReaction(msg.conversation_id, msg.id, reactions);
    res.json({ reactions });
  } catch (err) {
    console.error('[API] POST reactions error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/messages', auth, (req, res) => {
  try {
    const { conversationId, content, type = 'text', mediaUrl, replyToId, postAsChannel, topicId: bodyTopicId } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });
    const usrLim = db.prepare('SELECT restricted FROM users WHERE id = ?').get(req.user.id);
    if (usrLim?.restricted && String(content || '').length > 280) return res.status(400).json({ error: 'Слишком длинное сообщение для ограниченного аккаунта' });
    const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const conv = db.prepare('SELECT type, topics_enabled FROM conversations WHERE id = ?').get(conversationId);
    if (conv?.type === 'channel') {
      const role = db.prepare('SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
      if (role?.role !== 'admin') return res.status(403).json({ error: 'Только админы' });
    }
    if (replyToId) {
      const ref = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(replyToId);
      if (!ref || ref.conversation_id !== conversationId) return res.status(400).json({ error: 'Некорректный ответ' });
    }
    let topicId = bodyTopicId || null;
    if (conv?.type === 'group' && conv.topics_enabled) {
      if (!topicId) {
        const first = db.prepare('SELECT id FROM group_topics WHERE conversation_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1').get(conversationId);
        topicId = first?.id || null;
      }
      if (!topicId) return res.status(400).json({ error: 'Сначала включи темы и создай хотя бы одну' });
      const okTop = db.prepare('SELECT 1 FROM group_topics WHERE id = ? AND conversation_id = ?').get(topicId, conversationId);
      if (!okTop) return res.status(400).json({ error: 'Неверная тема' });
    } else {
      topicId = null;
    }
    const id = uuidv4();
    let channelPostFlag = null;
    if (conv?.type === 'channel') {
      channelPostFlag = postAsChannel === false || postAsChannel === 0 ? 0 : 1;
    }
    db.prepare(
      'INSERT INTO messages (id, conversation_id, sender_id, content, type, media_url, reply_to_id, post_as_channel, topic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, conversationId, req.user.id, content, type, mediaUrl || null, replyToId || null, channelPostFlag, topicId);
    db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(conversationId);
    const message = hydrateMessageById(id, req.user.id);
    const broadcastPayload = { ...message };
    delete broadcastPayload.is_saved;
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
    members.forEach(({ user_id }) => {
      const sockets = onlineUsers.get(user_id);
      if (sockets) sockets.forEach(sid => io.to(sid).emit('message:new', broadcastPayload));
    });
    res.json({ message });
  } catch (err) {
    console.error('[API] POST /api/messages error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── Saved messages (избранное) ──

app.get('/api/saved', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT s.id as save_row_id, s.created_at as saved_at,
      ${MSG_BASE},
      1 as _is_saved
      FROM saved_messages s
      JOIN messages m ON m.id = s.message_id
      JOIN users u ON m.sender_id = u.id
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN messages rm ON m.reply_to_id = rm.id
      LEFT JOIN users ru ON rm.sender_id = ru.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 300
    `).all(req.user.id);
    const ids = rows.map(r => r.id);
    const reactMap = fetchReactionsForMessages(ids);
    const items = rows.map(r => {
      const convRaw = db.prepare('SELECT * FROM conversations WHERE id = ?').get(r.conversation_id);
      const conversation = enrichConversation(convRaw, req.user.id);
      return {
        save_id: r.save_row_id,
        saved_at: r.saved_at,
        conversation,
        message: shapeDbMessage(r, reactMap),
      };
    });
    res.json({ items });
  } catch (err) {
    console.error('[API] GET /api/saved', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/saved/:messageId', auth, (req, res) => {
  const msg = db.prepare('SELECT id, conversation_id FROM messages WHERE id = ?').get(req.params.messageId);
  if (!msg) return res.status(404).json({ error: 'Not found' });
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(msg.conversation_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  try {
    db.prepare('INSERT INTO saved_messages (id, user_id, message_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.messageId);
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) return res.json({ saved: true });
    throw e;
  }
  res.json({ saved: true });
});

app.delete('/api/saved/:messageId', auth, (req, res) => {
  db.prepare('DELETE FROM saved_messages WHERE user_id = ? AND message_id = ?').run(req.user.id, req.params.messageId);
  res.json({ saved: false });
});

// ── Pinned messages ──

app.get('/api/conversations/:conversationId/pins', auth, (req, res) => {
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.conversationId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const pins = buildPinsListForUser(req.params.conversationId, req.user.id);
  res.json({ pins });
});

app.post('/api/conversations/:conversationId/pin', auth, (req, res) => {
  try {
    const { messageId } = req.body;
    if (!messageId) return res.status(400).json({ error: 'messageId required' });
    const { conversationId } = req.params;
    if (!canUserPinConversation(conversationId, req.user.id)) return res.status(403).json({ error: 'Нельзя закрепить' });
    const msg = db.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId);
    if (!msg) return res.status(404).json({ error: 'Не найдено' });
    const cnt = db.prepare('SELECT COUNT(*) as c FROM pinned_messages WHERE conversation_id = ?').get(conversationId).c;
    if (cnt >= 12) return res.status(400).json({ error: 'Слишком много закреплённых' });
    try {
      db.prepare('INSERT INTO pinned_messages (conversation_id, message_id, pinned_by) VALUES (?, ?, ?)').run(conversationId, messageId, req.user.id);
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) {
        broadcastPinsUpdated(conversationId);
        return res.json({ ok: true });
      }
      throw e;
    }
    broadcastPinsUpdated(conversationId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] pin', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/conversations/:conversationId/pin/:messageId', auth, (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    if (!canUserPinConversation(conversationId, req.user.id)) return res.status(403).json({ error: 'Нельзя' });
    db.prepare('DELETE FROM pinned_messages WHERE conversation_id = ? AND message_id = ?').run(conversationId, messageId);
    broadcastPinsUpdated(conversationId);
    res.json({ ok: true });
  } catch (err) {
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
  if (!title || !url) return res.status(400).json({ error: 'Укажи название и файл' });
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
    if (!conversationId) return;
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, uid);
    members.forEach(({ user_id }) => {
      const socks = onlineUsers.get(user_id);
      if (socks) socks.forEach(sid => io.to(sid).emit('user:typing', { conversationId, userId: uid }));
    });
  });

  socket.on('typing:stop', ({ conversationId }) => {
    if (!conversationId) return;
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, uid);
    members.forEach(({ user_id }) => {
      const socks = onlineUsers.get(user_id);
      if (socks) socks.forEach(sid => io.to(sid).emit('user:typing:stop', { conversationId, userId: uid }));
    });
  });

  socket.on('disconnect', () => {
    const set = onlineUsers.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(uid);
        db.prepare(`UPDATE users SET is_online = 0, last_seen = datetime('now') WHERE id = ?`).run(uid);
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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));

app.use((err, req, res, _next) => {
  console.error('[Express] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

server.listen(PORT, () => console.log(`GChat v3.3 on port ${PORT}`));
