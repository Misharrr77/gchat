import os
import sys
import re
import json
import time
from datetime import datetime, timedelta, timezone
from enum import Enum
from functools import wraps

from flask import Flask, render_template_string, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from sqlalchemy import inspect, text

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev_secret_key_change_in_production')

# Database configuration - supports PostgreSQL, MySQL, SQLite
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    # Fix for Heroku/some providers that use postgres:// instead of postgresql://
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
else:
    # Default to SQLite in /tmp for serverless
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////tmp/gchat.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
    'pool_size': 10,
    'max_overflow': 20
}
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

db = SQLAlchemy(app)
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*", 
                   ping_timeout=60, ping_interval=25, 
                   logger=False, engineio_logger=False)

# Database Models
room_members = db.Table('room_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('room_id', db.Integer, db.ForeignKey('room.id'), primary_key=True)
)

user_friends = db.Table('user_friends',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('friend_id', db.Integer, db.ForeignKey('user.id'), primary_key=True)
)

class NotificationType(Enum):
    FRIEND_REQUEST = "friend_request"
    FRIEND_ACCEPTED = "friend_accepted"
    MESSAGE = "message"
    CALL_INCOMING = "call_incoming"
    CALL_MISSED = "call_missed"
    CALL_ENDED = "call_ended"
    ROOM_INVITE = "room_invite"
    STARS_RECEIVED = "stars_received"
    GIFT_RECEIVED = "gift_received"
    GIFT_SOLD = "gift_sold"

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128))
    avatar = db.Column(db.String(120), nullable=True, default='default.jpg')
    status = db.Column(db.String(100), nullable=True, default='В сети')
    is_online = db.Column(db.Boolean, default=True)
    display_name = db.Column(db.String(120), nullable=True)
    bio = db.Column(db.Text, nullable=True)
    favorite_music = db.Column(db.String(255), nullable=True)
    stars_balance = db.Column(db.Integer, nullable=False, default=100)
    last_seen = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    settings = db.relationship('UserSettings', backref='user', uselist=False, cascade="all, delete-orphan")
    friends = db.relationship('User', secondary=user_friends, 
                            primaryjoin=id==user_friends.c.user_id, 
                            secondaryjoin=id==user_friends.c.friend_id, 
                            backref='friend_of')
    notifications = db.relationship('Notification', backref='recipient', lazy=True, 
                                  cascade="all, delete-orphan", 
                                  foreign_keys='Notification.recipient_id')
    blocked_users = db.relationship('BlockedUser', backref='blocker', lazy=True, 
                                   cascade="all, delete-orphan", 
                                   foreign_keys='BlockedUser.blocker_id')
    music_history = db.relationship('UserMusicHistory', backref='user', lazy=True, 
                                   cascade="all, delete-orphan")

class BlockedUser(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class FriendRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(16), default='pending', index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), 
                          onupdate=lambda: datetime.now(timezone.utc))
    from_user = db.relationship('User', foreign_keys=[from_user_id])
    to_user = db.relationship('User', foreign_keys=[to_user_id])

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    notif_type = db.Column(db.String(32), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    data = db.Column(db.JSON, nullable=True)
    is_read = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    from_user = db.relationship('User', foreign_keys=[from_user_id])

class UserSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True)
    theme = db.Column(db.String(16), default='dark')
    notifications_enabled = db.Column(db.Boolean, default=True)
    sound_enabled = db.Column(db.Boolean, default=True)
    privacy_last_seen = db.Column(db.String(16), default='friends')
    compact_mode = db.Column(db.Boolean, default=False)
    message_preview = db.Column(db.Boolean, default=True)

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(120), nullable=True)
    is_group = db.Column(db.Boolean, default=True)
    is_private = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_message_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    members = db.relationship('User', secondary=room_members, lazy='subquery', 
                            backref=db.backref('private_rooms', lazy=True))

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, server_default=db.func.now(), index=True)
    attachment_path = db.Column(db.String(255), nullable=True)
    is_edited = db.Column(db.Boolean, default=False)
    is_pinned = db.Column(db.Boolean, default=False)
    reply_to_message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=True)
    replied_to = db.relationship('Message', remote_side=[id], backref='replies')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False, index=True)
    user = db.relationship('User', backref='messages')
    room = db.relationship('Room', backref='messages')

class UserMusicHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    artist = db.Column(db.String(255), nullable=True)
    url = db.Column(db.String(512), nullable=True)
    added_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class Gift(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    icon = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(20), nullable=False)
    rarity = db.Column(db.String(20), nullable=False)
    sale_start = db.Column(db.DateTime, nullable=True)
    sale_end = db.Column(db.DateTime, nullable=True)
    is_limited = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class UserGift(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    gift_id = db.Column(db.Integer, db.ForeignKey('gift.id'), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=True)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=True)
    purchase_price = db.Column(db.Integer, nullable=False)
    received_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_for_sale = db.Column(db.Boolean, default=False, index=True)
    sale_price = db.Column(db.Integer, nullable=True)
    user = db.relationship('User', foreign_keys=[user_id], backref='owned_gifts')
    gift = db.relationship('Gift', backref='instances')
    from_user = db.relationship('User', foreign_keys=[from_user_id])

class GiftTransaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_gift_id = db.Column(db.Integer, db.ForeignKey('user_gift.id'), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    transaction_type = db.Column(db.String(20), nullable=False)
    stars_amount = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    user_gift = db.relationship('UserGift', backref='transactions')
    from_user = db.relationship('User', foreign_keys=[from_user_id])
    to_user = db.relationship('User', foreign_keys=[to_user_id])

class CallLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    call_type = db.Column(db.String(16), default='audio')
    status = db.Column(db.String(16), default='pending')
    started_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = db.Column(db.DateTime, nullable=True)
    duration = db.Column(db.Integer, default=0)
    from_user = db.relationship('User', foreign_keys=[from_user_id])
    to_user = db.relationship('User', foreign_keys=[to_user_id])

# Initialize database
def init_db():
    """Инициализация базы данных"""
    with app.app_context():
        db.create_all()
        
        # Create default gifts if none exist
        if Gift.query.count() == 0:
            default_gifts = [
                Gift(name="Роза", price=10, icon="�", color=="#ff4444", rarity="common"),
                Gift(name="Букет", price=20, icon="💐", color="#ff69b4", rarity="common"),
                Gift(name="Торт", price=25, icon="🎂", color="#ff8c00", rarity="common"),
                Gift(name="Шоколад", price=15, icon="🍫", color="#8b4513", rarity="common"),
                Gift(name="Звезда", price=50, icon="⭐", color="#ffd700", rarity="uncommon"),
                Gift(name="Сердце", price=75, icon="💖", color="#ff1493", rarity="uncommon"),
                Gift(name="Корона", price=100, icon="👑", color="#ffd700", rarity="rare"),
                Gift(name="Трофей", price=150, icon="🏆", color="#ffd700", rarity="rare"),
                Gift(name="Бриллиант", price=500, icon="💎", color="#00bfff", rarity="legendary"),
                Gift(name="Единорог", price=1000, icon="🦄", color="#ff00ff", rarity="legendary"),
            ]
            db.session.add_all(default_gifts)
            db.session.commit()
        
        # Create default general room
        if Room.query.filter_by(name="general").first() is None:
            general_room = Room(
                name="general",
                display_name="Общий",
                is_group=True,
                is_private=False,
                last_message_at=datetime.now(timezone.utc)
            )
            db.session.add(general_room)
            db.session.commit()

# Initialize on first import
try:
    init_db()
except Exception as e:
    print(f"⚠️  Ошибка инициализации БД: {e}")

# HTML Template (минимизированный)
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ru" data-theme="{{ session.get('theme', 'dark') }}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GChat</title>
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
<style>
:root{--bg:#0d1117;--panel:#161b22;--muted:#8b949e;--text:#c9d1d9;--border:#30363d;--brand:#58a6ff;--green:#238636;--red:#d32f2f}
[data-theme="light"]{--bg:#f6f8fa;--panel:#fff;--muted:#57606a;--text:#24292f;--border:#d0d7de;--brand:#0969da;--green:#1a7f37}
*{box-sizing:border-box}html,body{margin:0;padding:0;height:100%;width:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);overflow:hidden}
#app{display:flex;height:100vh;width:100vw}
#sidebar{width:280px;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;gap:8px;padding:8px;overflow-y:auto}
#content{flex:1;display:flex;flex-direction:column;min-width:0}
#chat-header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--panel);border-bottom:1px solid var(--border);min-height:50px}
#current-chat-name{flex:1;text-align:center;margin:0;font-size:14px;color:var(--brand);font-weight:600}
.icon-btn{background:none;border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 8px;cursor:pointer;transition:all .2s;font-size:14px}
.icon-btn:hover{background:rgba(88,166,255,.12)}
#messages-wrap{flex:1;display:flex;flex-direction:column;min-height:0}
#messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
#composer{display:flex;gap:6px;padding:8px;background:var(--panel);border-top:1px solid var(--border);align-items:flex-end}
#message-input{flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px;resize:none;max-height:100px}
#send-button{background:var(--green);color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:14px;font-weight:600}
.message{display:flex;gap:8px}
.message .avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0}
.bubble{background:#11161d;border:1px solid var(--border);border-radius:12px;padding:8px 10px;max-width:60%;word-wrap:break-word}
[data-theme="light"] .bubble{background:#f0f3f6}
.meta{font-size:11px;color:var(--muted);margin-bottom:3px}
.msg-text{white-space:pre-wrap;word-wrap:break-word;font-size:14px;line-height:1.4}
.profile{display:flex;gap:8px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:12px;cursor:pointer}
.profile:hover{background:rgba(88,166,255,.08)}
.profile .avatar{width:48px;height:48px;border-radius:50%;object-fit:cover}
.profile-info{display:flex;flex-direction:column;min-width:0}
.profile-info strong{font-size:13px}
.status{color:var(--muted);font-size:11px}
#search-users{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:14px}
.list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px}
.item{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer;font-size:13px}
.item:hover{background:rgba(88,166,255,.08)}
.item.active{background:rgba(88,166,255,.18);border-left:3px solid var(--brand)}
.panel-title{color:var(--brand);font-weight:600;margin:6px 0;border-bottom:1px solid var(--border);padding-bottom:4px;font-size:12px}
@media(max-width:768px){#app{flex-direction:column}#sidebar{width:100%;max-height:30vh;border-right:none;border-bottom:1px solid var(--border)}#content{height:70vh}}
</style>
</head>
<body>
{% if not session.get('username') %}
<div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:16px">
<form method="POST" action="{{ url_for('login') }}" style="background:var(--panel);border:1px solid var(--border);padding:20px;border-radius:12px;width:min(420px,100%)">
<h2 style="margin-top:0;color:var(--brand);text-align:center">GChat</h2>
<input type="text" name="username" placeholder="Юзернейм" required style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);margin:6px 0;font-size:14px">
<input type="password" name="password" placeholder="Пароль" required style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);margin:6px 0;font-size:14px">
<button type="submit" style="width:100%;padding:10px;background:var(--green);border:none;color:#fff;border-radius:8px;cursor:pointer;margin-top:10px;font-weight:600;font-size:14px">Войти / Зарегистрироваться</button>
</form>
</div>
{% else %}
<div id="app">
<div id="sidebar">
<div class="profile">
<img src="https://ui-avatars.com/api/?name={{ session.get('username') }}&background=random" class="avatar" alt="avatar">
<div class="profile-info">
<strong>{{ session.get('username') }}</strong>
<div class="status">В сети</div>
</div>
<a href="{{ url_for('logout') }}" class="icon-btn" title="Выход">🚪</a>
</div>
<div>
<div class="panel-title">Поиск</div>
<input id="search-users" type="search" placeholder="@username">
<ul id="user-search-results" class="list"></ul>
</div>
<div>
<div class="panel-title">Друзья</div>
<ul id="friends" class="list"></ul>
</div>
<div>
<div class="panel-title">Каналы</div>
<form method="POST" action="{{ url_for('create_channel') }}" style="display:flex;gap:4px;margin-bottom:6px">
<input name="channel_name" placeholder="Канал..." required style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:12px">
<button class="icon-btn">＋</button>
</form>
<ul id="channels" class="list"></ul>
</div>
</div>
<div id="content">
<div id="chat-header">
<h3 id="current-chat-name">Выберите чат</h3>
</div>
<div id="messages-wrap">
<div id="messages"></div>
</div>
<div id="composer">
<textarea id="message-input" placeholder="Сообщение..." rows="1"></textarea>
<button id="send-button">Отправить</button>
</div>
</div>
</div>
<script>
const socket=io();
let currentRoom=null;
socket.on('connect',()=>{socket.emit('get_rooms');socket.emit('get_friends')});
socket.on('rooms_list',rooms=>{
const list=document.getElementById('channels');
list.innerHTML='';
rooms.forEach(r=>{
const li=document.createElement('li');
li.className='item';
li.textContent=r.display_name||r.name;
li.onclick=()=>joinRoom(r.name);
list.appendChild(li);
});
});
socket.on('friends_list',data=>{
const list=document.getElementById('friends');
list.innerHTML='';
data.friends.forEach(f=>{
const li=document.createElement('li');
li.className='item';
li.textContent=f.username;
li.onclick=()=>joinPrivateChat(f.username);
list.appendChild(li);
});
});
function joinRoom(room){
if(currentRoom)socket.emit('leave',{room:currentRoom});
currentRoom=room;
socket.emit('join',{room});
socket.emit('get_history',{room,limit:50});
document.getElementById('current-chat-name').textContent=room;
document.getElementById('messages').innerHTML='';
}
function joinPrivateChat(username){
const myUsername='{{ session.get("username") }}';
const roomName=[myUsername,username].sort().join('_');
joinRoom(roomName);
}
socket.on('message_history',data=>{
const container=document.getElementById('messages');
container.innerHTML='';
data.history.forEach(m=>displayMessage(m));
container.scrollTop=container.scrollHeight;
});
socket.on('new_message',msg=>{
if(msg.room===currentRoom){
displayMessage(msg);
document.getElementById('messages').scrollTop=document.getElementById('messages').scrollHeight;
}
});
function displayMessage(msg){
const container=document.getElementById('messages');
const div=document.createElement('div');
div.className='message';
div.innerHTML=`
<img src="https://ui-avatars.com/api/?name=${msg.username}&background=random" class="avatar">
<div class="bubble">
<div class="meta"><strong>${msg.username}</strong> • ${new Date(msg.timestamp).toLocaleTimeString()}</div>
<div class="msg-text">${escapeHtml(msg.message)}</div>
</div>
`;
container.appendChild(div);
}
function escapeHtml(text){
const div=document.createElement('div');
div.textContent=text;
return div.innerHTML;
}
document.getElementById('send-button').onclick=()=>{
const input=document.getElementById('message-input');
const msg=input.value.trim();
if(msg&&currentRoom){
socket.emit('send_message',{room:currentRoom,message:msg});
input.value='';
}
};
document.getElementById('message-input').onkeydown=e=>{
if(e.key==='Enter'&&!e.shiftKey){
e.preventDefault();
document.getElementById('send-button').click();
}
};
document.getElementById('search-users').oninput=e=>{
const query=e.target.value.trim();
if(query.length<2)return document.getElementById('user-search-results').innerHTML='';
fetch(`/search_users?q=${encodeURIComponent(query)}`)
.then(r=>r.json())
.then(data=>{
const list=document.getElementById('user-search-results');
list.innerHTML='';
data.users.forEach(u=>{
const li=document.createElement('li');
li.className='item';
li.textContent=u.username;
li.onclick=()=>sendFriendRequest(u.username);
list.appendChild(li);
});
});
};
function sendFriendRequest(username){
fetch('/send_friend_request',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({to_username:username})
}).then(r=>r.json()).then(data=>{
if(data.success)alert('Запрос отправлен');
else alert(data.error||'Ошибка');
});
}
</script>
{% endif %}
</body>
</html>
"""

# Routes
@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '')
    
    if not username or not password:
        return redirect(url_for('index'))
    
    user = User.query.filter_by(username=username).first()
    
    if user:
        if check_password_hash(user.password_hash, password):
            session['username'] = user.username
            session['avatar'] = user.avatar
            user.is_online = True
            user.last_seen = datetime.now(timezone.utc)
            db.session.commit()
            return redirect(url_for('index'))
        else:
            return redirect(url_for('index'))
    else:
        # Register new user
        new_user = User(
            username=username,
            password_hash=generate_password_hash(password),
            avatar='default.jpg',
            stars_balance=100
        )
        db.session.add(new_user)
        db.session.commit()
        
        # Create default settings
        settings = UserSettings(user_id=new_user.id)
        db.session.add(settings)
        db.session.commit()
        
        session['username'] = new_user.username
        session['avatar'] = new_user.avatar
        return redirect(url_for('index'))

@app.route('/logout')
def logout():
    username = session.get('username')
    if username:
        user = User.query.filter_by(username=username).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.now(timezone.utc)
            db.session.commit()
    session.clear()
    return redirect(url_for('index'))

@app.route('/create_channel', methods=['POST'])
def create_channel():
    username = session.get('username')
    if not username:
        return redirect(url_for('index'))
    
    channel_name = request.form.get('channel_name', '').strip()
    is_private = request.form.get('is_private') == 'true'
    
    if not channel_name:
        return redirect(url_for('index'))
    
    user = User.query.filter_by(username=username).first()
    existing = Room.query.filter_by(name=channel_name).first()
    
    if existing:
        return redirect(url_for('index'))
    
    new_room = Room(
        name=channel_name,
        display_name=channel_name,
        is_group=True,
        is_private=is_private,
        creator_id=user.id
    )
    
    if is_private:
        new_room.members.append(user)
    
    db.session.add(new_room)
    db.session.commit()
    
    return redirect(url_for('index'))

@app.route('/search_users')
def search_users():
    query = request.args.get('q', '').strip().lower()
    current_username = session.get('username')
    
    if not query or not current_username:
        return jsonify({'users': []})
    
    users = User.query.filter(
        User.username.ilike(f'%{query}%'),
        User.username != current_username
    ).limit(10).all()
    
    return jsonify({
        'users': [{'username': u.username, 'avatar': u.avatar} for u in users]
    })

@app.route('/send_friend_request', methods=['POST'])
def send_friend_request():
    from_username = session.get('username')
    if not from_username:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json(force=True)
    to_username = data.get('to_username', '').strip()
    
    from_user = User.query.filter_by(username=from_username).first()
    to_user = User.query.filter_by(username=to_username).first()
    
    if not to_user or to_user.id == from_user.id:
        return jsonify({'error': 'Пользователь не найден'}), 404
    
    if to_user in from_user.friends:
        return jsonify({'error': 'Уже в друзьях'}), 400
    
    existing = FriendRequest.query.filter_by(
        from_user_id=from_user.id,
        to_user_id=to_user.id,
        status='pending'
    ).first()
    
    if existing:
        return jsonify({'error': 'Запрос уже отправлен'}), 400
    
    friend_request = FriendRequest(
        from_user_id=from_user.id,
        to_user_id=to_user.id
    )
    db.session.add(friend_request)
    
    notif = Notification(
        recipient_id=to_user.id,
        notif_type=NotificationType.FRIEND_REQUEST.value,
        from_user_id=from_user.id,
        title='Запрос в друзья',
        message=f'@{from_user.username} хочет добавить вас в друзья'
    )
    db.session.add(notif)
    db.session.commit()
    
    return jsonify({'success': True})

# Socket.IO Events
@socketio.on('connect')
def handle_connect():
    username = session.get('username')
    if username:
        join_room(username)
        user = User.query.filter_by(username=username).first()
        if user:
            user.is_online = True
            user.last_seen = datetime.now(timezone.utc)
            db.session.commit()

@socketio.on('disconnect')
def handle_disconnect():
    username = session.get('username')
    if username:
        leave_room(username)
        user = User.query.filter_by(username=username).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.now(timezone.utc)
            db.session.commit()

@socketio.on('get_rooms')
def get_rooms():
    username = session.get('username')
    if not username:
        return
    
    user = User.query.filter_by(username=username).first()
    if not user:
        return
    
    public_rooms = Room.query.filter_by(is_group=True, is_private=False).all()
    private_rooms = user.private_rooms
    all_rooms = list({r.id: r for r in (public_rooms + private_rooms)}.values())
    
    rooms_data = [{
        'name': r.name,
        'display_name': r.display_name or r.name,
        'is_private': r.is_private,
        'is_group': r.is_group
    } for r in sorted(all_rooms, key=lambda r: r.last_message_at, reverse=True)]
    
    emit('rooms_list', rooms_data)

@socketio.on('get_friends')
def get_friends():
    username = session.get('username')
    if not username:
        return
    
    user = User.query.filter_by(username=username).first()
    if not user:
        return
    
    emit('friends_list', {
        'friends': [{'username': f.username, 'avatar': f.avatar} for f in user.friends]
    })

@socketio.on('join')
def on_join(data):
    username = session.get('username')
    room_name = data['room']
    
    user = User.query.filter_by(username=username).first()
    room = Room.query.filter_by(name=room_name).first()
    
    if not room:
        # Create private chat room
        room = Room(name=room_name, is_group=False, is_private=False)
        db.session.add(room)
        db.session.commit()
    
    if room and user:
        if room.is_private and user not in room.members:
            emit('error', {'msg': 'Нет доступа'})
            return
        join_room(room_name)

@socketio.on('leave')
def on_leave(data):
    leave_room(data['room'])

@socketio.on('get_history')
def get_history(data):
    room_name = data['room']
    limit = data.get('limit', 50)
    
    room = Room.query.filter_by(name=room_name).first()
    if not room:
        return
    
    messages = Message.query.filter_by(room_id=room.id)\
        .order_by(Message.timestamp.desc())\
        .limit(limit)\
        .all()
    messages.reverse()
    
    history = [{
        'id': m.id,
        'username': m.user.username,
        'avatar': m.user.avatar,
        'message': m.content,
        'timestamp': m.timestamp.isoformat()
    } for m in messages]
    
    emit('message_history', {'room': room_name, 'history': history})

@socketio.on('send_message')
def handle_send_message(data):
    username = session.get('username')
    user = User.query.filter_by(username=username).first()
    room_name = data['room']
    room = Room.query.filter_by(name=room_name).first()
    
    if not user or not room:
        return
    
    message_content = (data.get('message') or '').strip()
    if not message_content:
        return
    
    new_message = Message(
        content=message_content,
        user_id=user.id,
        room_id=room.id
    )
    db.session.add(new_message)
    db.session.commit()
    
    room.last_message_at = datetime.now(timezone.utc)
    db.session.commit()
    
    emit('new_message', {
        'id': new_message.id,
        'username': user.username,
        'avatar': user.avatar,
        'message': message_content,
        'room': room_name,
        'timestamp': new_message.timestamp.isoformat()
    }, room=room_name)

# Vercel handler
handler = app
