const db = require('./server/db');
const { v4: uuidv4 } = require('uuid');

console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
console.log('Messages cols:', db.pragma("table_info(messages)"));

// Simulate creating a user, conversation, and message
const userId = uuidv4();
const convId = uuidv4();

try {
  db.prepare('INSERT INTO users (id, username, email, password_hash, display_name) VALUES (?, ?, ?, ?, ?)').run(userId, 'localtest', 'localtest@gchat.local', 'hash123', 'LocalTest');
  console.log('User created OK');
} catch (err) {
  console.error('User creation failed:', err.message);
}

try {
  db.prepare('INSERT INTO conversations (id, type, name) VALUES (?, ?, ?)').run(convId, 'direct', 'Test Conv');
  console.log('Conversation created OK');
} catch (err) {
  console.error('Conversation creation failed:', err.message);
}

try {
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, userId);
  console.log('Member added OK');
} catch (err) {
  console.error('Member add failed:', err.message);
}

try {
  const msgId = uuidv4();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content, type, media_url) VALUES (?, ?, ?, ?, ?, ?)').run(msgId, convId, userId, 'Hello test', 'text', null);
  console.log('Message created OK');
  
  const msg = db.prepare('SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?').get(msgId);
  console.log('Message fetched:', msg);
} catch (err) {
  console.error('Message creation failed:', err.message);
}

// Cleanup
try {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ?').run(convId);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(convId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  console.log('Cleanup OK');
} catch (err) {
  console.error('Cleanup failed:', err.message);
}
