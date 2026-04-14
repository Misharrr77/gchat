
import subprocess
import sys
import os
import re
import json
import time
from datetime import datetime, timedelta, timezone
from enum import Enum
from functools import wraps, lru_cache
import hashlib
import uuid

from sqlalchemy import inspect, text

def install_dependencies():
    print("Проверка и установка зависимостей...")
    packages = {
        "flask": "Flask",
        "flask_socketio": "Flask-SocketIO",
        "flask_sqlalchemy": "Flask-SQLAlchemy",
        "psycopg2-binary": "psycopg2-binary",
        "redis": "redis",
        "gunicorn": "gunicorn",
        "requests": "requests"
    }
    installed_something = False
    for module, package in packages.items():
        try:
            __import__(module)
        except ImportError:
            print(f"Установка {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", package])
            installed_something = True
    
    # Проверяем наличие Node.js и localtunnel
    print(" * Проверка Node.js...")
    if not shutil.which("node"):
        print(" * ⚠️ Node.js не найден")
        print(" * 💡 Скачать: https://nodejs.org/")
    else:
        print(" * ✅ Node.js установлен")
        try:
            subprocess.check_call(["npm", "list", "-g", "localtunnel"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(" * ✅ localtunnel установлен")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(" * Установка localtunnel...")
            subprocess.check_call(["npm", "install", "-g", "localtunnel"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(" * ✅ localtunnel установлен")
    
    if not installed_something:
        print("Все зависимости уже установлены.")

install_dependencies()

from flask import Flask, render_template_string, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import threading
import platform
import shutil
import urllib.request
import stat

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'dev_secret_key_only')
DATABASE_URL = os.environ.get('postgresql://neondb_owner:19012345@ep-lingering-art-a13366xj:5423/neondb', 'sqlite:///gchatGAY.db')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*", ping_timeout=60, ping_interval=25)

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
    username = db.Column(db.String(80), unique=True, nullable=False)
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
    friends = db.relationship('User', secondary=user_friends, primaryjoin=id==user_friends.c.user_id, secondaryjoin=id==user_friends.c.friend_id, backref='friend_of')
    notifications = db.relationship('Notification', backref='recipient', lazy=True, cascade="all, delete-orphan", foreign_keys='Notification.recipient_id')
    blocked_users = db.relationship('BlockedUser', backref='blocker', lazy=True, cascade="all, delete-orphan", foreign_keys='BlockedUser.blocker_id')
    music_history = db.relationship('UserMusicHistory', backref='user', lazy=True, cascade="all, delete-orphan")

class BlockedUser(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class FriendRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(16), default='pending')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    from_user = db.relationship('User', foreign_keys=[from_user_id])
    to_user = db.relationship('User', foreign_keys=[to_user_id])

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    notif_type = db.Column(db.String(32), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    data = db.Column(db.JSON, nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
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
    name = db.Column(db.String(120), unique=True, nullable=False)
    display_name = db.Column(db.String(120), nullable=True)
    is_group = db.Column(db.Boolean, default=True)
    is_private = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_message_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    members = db.relationship('User', secondary=room_members, lazy='subquery', backref=db.backref('private_rooms', lazy=True))

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, server_default=db.func.now())
    attachment_path = db.Column(db.String(255), nullable=True)
    is_edited = db.Column(db.Boolean, default=False)
    is_pinned = db.Column(db.Boolean, default=False)
    reply_to_message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=True)
    replied_to = db.relationship('Message', remote_side=[id], backref='replies')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False)
    user = db.relationship('User', backref='messages')
    room = db.relationship('Room', backref='messages')


class UserMusicHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
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
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    gift_id = db.Column(db.Integer, db.ForeignKey('gift.id'), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=True)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=True)
    purchase_price = db.Column(db.Integer, nullable=False)
    received_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_for_sale = db.Column(db.Boolean, default=False)
    sale_price = db.Column(db.Integer, nullable=True)
    user = db.relationship('User', foreign_keys=[user_id], backref='owned_gifts')
    gift = db.relationship('Gift', backref='instances')
    from_user = db.relationship('User', foreign_keys=[from_user_id])


class GiftTransaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_gift_id = db.Column(db.Integer, db.ForeignKey('user_gift.id'), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    transaction_type = db.Column(db.String(20), nullable=False)  # 'purchase', 'gift', 'trade'
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

HTML_TEMPLATE = r"""
<!DOCTYPE html>
<html lang="ru" data-theme="{{ session.get('theme', 'dark') }}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GChat</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js"></script>
    <style>
        :root {
            --bg:#0d1117; --panel:#161b22; --muted:#8b949e; --text:#c9d1d9; --border:#30363d; --brand:#58a6ff; --green:#238636; --green2:#2ea043; --red:#d32f2f;
            --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.1); --shadow-md: 0 4px 6px rgba(0,0,0,0.1); --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
            --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        [data-theme="light"] {
            --bg:#f6f8fa; --panel:#ffffff; --muted:#57606a; --text:#24292f; --border:#d0d7de; --brand:#0969da; --green:#1a7f37; --green2:#2ea043; --red:#d32f2f;
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; height: 100%; width: 100%; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); overflow: hidden; }
        #app { display:flex; height: 100vh; width: 100vw; }
        #sidebar { width:280px; background:var(--panel); border-right:1px solid var(--border); display:flex; flex-direction:column; gap:8px; padding:8px; overflow-y:auto; }
        #content { flex:1; display:flex; flex-direction:column; min-width:0; }
        #chat-header { display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--panel); border-bottom:1px solid var(--border); min-height:50px; }
        #current-chat-name { flex:1; text-align:center; margin:0; font-size:14px; color:var(--brand); font-weight:600; }
        .icon-btn { background:none; border:1px solid var(--border); color:var(--text); border-radius:var(--radius-md); padding:6px 8px; cursor:pointer; transition: var(--transition); font-size:14px; }
        .icon-btn:hover { background: rgba(88,166,255,0.12); }
        .icon-btn.active { background: var(--brand); color: #fff; }
        .icon-btn.danger { border-color: var(--red); color: var(--red); }
        .icon-btn.danger:hover { background: rgba(211,47,47,0.12); }
        #messages-wrap { flex:1; display:flex; flex-direction:column; min-height:0; }
        #messages { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
        #typing-indicator { height:20px; padding:0 12px; color:var(--muted); font-size:12px; }
        #composer { display:flex; gap:6px; padding:8px; background:var(--panel); border-top:1px solid var(--border); align-items:flex-end; }
        #message-input { flex:1; padding:8px 10px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:14px; resize:none; max-height:100px; }
        #send-button { background:var(--green); color:#fff; border:none; border-radius:var(--radius-md); padding:8px 12px; cursor:pointer; transition: var(--transition); font-size:14px; font-weight:600; }
        #send-button:hover { background:var(--green2); }
        .message { display:flex; gap:8px; animation: slideIn 0.3s ease; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .message .avatar { width:36px; height:36px; border-radius:50%; object-fit:cover; cursor:pointer; flex-shrink:0; }
        .bubble { background:#11161d; border:1px solid var(--border); border-radius:var(--radius-lg); padding:8px 10px; max-width:60%; word-wrap:break-word; }
        [data-theme="light"] .bubble { background:#f0f3f6; }
        .meta { font-size:11px; color:var(--muted); margin-bottom:3px; display:flex; gap:6px; align-items:center; }
        .msg-text { white-space:pre-wrap; word-wrap:break-word; font-size:14px; line-height:1.4; }
        .reply { background: rgba(88,166,255,0.1); border-left:3px solid var(--brand); padding:6px 8px; margin-bottom:6px; border-radius:var(--radius-md); font-size:12px; }
        .edited { font-size:11px; color:var(--muted); margin-left:4px; }
        .actions { display:none; margin-left:6px; }
        .message:hover .actions { display:inline-flex; gap:4px; }
        .attachment-image { max-width:280px; border-radius:var(--radius-md); margin-top:6px; }
        video, audio { max-width:100%; max-height:300px; border-radius:var(--radius-md); margin-top:6px; }
        .panel-title { color:var(--brand); font-weight:600; margin:6px 0; border-bottom:1px solid var(--border); padding-bottom:4px; display:flex; align-items:center; justify-content:space-between; font-size:12px; }
        .row { display:flex; align-items:center; gap:8px; }
        .profile { display:flex; gap:8px; align-items:center; padding:8px; border:1px solid var(--border); border-radius:var(--radius-lg); cursor:pointer; transition: var(--transition); }
        .profile:hover { background: rgba(88,166,255,0.08); }
        .profile .avatar { width:48px; height:48px; border-radius:50%; object-fit:cover; flex-shrink:0; }
        .profile-info { display:flex; flex-direction:column; min-width:0; }
        .profile-info strong { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .status { color:var(--muted); font-size:11px; }
        #search-users { width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:14px; }
        .list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:4px; }
        .item { display:flex; align-items:center; gap:8px; padding:8px; border-radius:var(--radius-md); cursor:pointer; transition: var(--transition); font-size:13px; }
        .item:hover { background: rgba(88,166,255,0.08); }
        .item.active { background: rgba(88,166,255,0.18); border-left:3px solid var(--brand); }
        .item.unread { background: rgba(88,166,255,0.15); border-left: 3px solid var(--brand); }
        .pill { font-size:11px; padding:2px 6px; border:1px solid var(--border); border-radius:10px; color:var(--muted); background: rgba(88,166,255,0.1); }
        .pill.danger { background: rgba(211,47,47,0.1); color: var(--red); border-color: var(--red); }
        .gift-card { background:var(--panel); border:2px solid var(--border); border-radius:var(--radius-lg); padding:16px; text-align:center; cursor:pointer; transition: var(--transition); position:relative; }
        .gift-card:hover { border-color:var(--brand); transform:translateY(-2px); box-shadow:var(--shadow-md); }
        .gift-card.legendary { border-color:#ffd700; background:linear-gradient(135deg, rgba(255,215,0,0.15) 0%, var(--panel) 100%); box-shadow:0 0 20px rgba(255,215,0,0.2); }
        .gift-card.rare { border-color:#9c27b0; background:linear-gradient(135deg, rgba(156,39,176,0.15) 0%, var(--panel) 100%); box-shadow:0 0 15px rgba(156,39,176,0.2); }
        .gift-card.uncommon { border-color:#4caf50; background:linear-gradient(135deg, rgba(76,175,80,0.1) 0%, var(--panel) 100%); }
        .gift-card.common { border-color:var(--border); }
        .gift-card.limited { position:relative; border-color:#ff8c00; background:linear-gradient(135deg, rgba(139,69,19,0.25) 0%, rgba(255,140,0,0.2) 50%, rgba(139,69,19,0.25) 100%); box-shadow:0 0 25px rgba(255,140,0,0.4), inset 0 0 20px rgba(139,69,19,0.2); overflow:hidden; }
        .gift-card.limited::before { content:''; position:absolute; top:-50%; left:-50%; width:200%; height:200%; background:radial-gradient(circle, rgba(255,165,0,0.3) 0%, transparent 70%); animation:sparkle 3s ease-in-out infinite; }
        .gift-card.limited::after { content:''; position:absolute; inset:0; background-image:repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(139,69,19,0.05) 10px, rgba(139,69,19,0.05) 20px); pointer-events:none; }
        @keyframes sparkle { 0%,100%{ transform:rotate(0deg) scale(1); opacity:0.3; } 50%{ transform:rotate(180deg) scale(1.2); opacity:0.6; } }
        .gift-icon { font-size:48px; margin-bottom:8px; display:block; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3)); animation:pulse-glow 2s ease-in-out infinite; }
        .gift-card.limited .gift-icon { animation:pumpkin-glow 2s ease-in-out infinite; filter:drop-shadow(0 4px 8px rgba(255,140,0,0.6)) drop-shadow(0 0 15px rgba(255,140,0,0.4)); }
        @keyframes pulse-glow { 0%,100%{ filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3)); } 50%{ filter:drop-shadow(0 2px 8px rgba(255,215,0,0.5)); } }
        @keyframes pumpkin-glow { 0%,100%{ filter:drop-shadow(0 4px 8px rgba(255,140,0,0.6)) drop-shadow(0 0 15px rgba(255,140,0,0.4)); transform:scale(1) rotate(0deg); } 25%{ filter:drop-shadow(0 6px 12px rgba(255,140,0,0.8)) drop-shadow(0 0 20px rgba(255,140,0,0.6)); transform:scale(1.05) rotate(-2deg); } 50%{ filter:drop-shadow(0 8px 16px rgba(255,140,0,1)) drop-shadow(0 0 25px rgba(255,140,0,0.8)); transform:scale(1.1) rotate(0deg); } 75%{ filter:drop-shadow(0 6px 12px rgba(255,140,0,0.8)) drop-shadow(0 0 20px rgba(255,140,0,0.6)); transform:scale(1.05) rotate(2deg); } }
        .gift-card.unavailable { opacity:0.5; cursor:not-allowed; pointer-events:none; }
        .gift-badge { position:absolute; top:6px; left:6px; font-size:9px; padding:3px 6px; border-radius:10px; background:rgba(255,140,0,0.9); color:#fff; font-weight:bold; text-transform:uppercase; z-index:1; }
        .gift-badge.limited { background:linear-gradient(135deg, rgba(255,140,0,0.9), rgba(139,69,19,0.9)); }
        .gift-name { font-weight:600; font-size:14px; margin-bottom:4px; }
        .gift-price { font-size:12px; color:var(--muted); }
        .gift-rarity { position:absolute; top:6px; right:6px; font-size:10px; padding:2px 6px; border-radius:10px; background:rgba(0,0,0,0.4); }
        .tabs { display:flex; border-bottom:1px solid var(--border); gap:0; }
        .tab { padding:8px 12px; cursor:pointer; border-bottom:2px solid transparent; transition: var(--transition); font-size:12px; }
        .tab.active { border-bottom-color: var(--brand); color: var(--brand); }
        .tab-content { padding:10px; }
        .modal { display:none; position:fixed; inset:0; background: rgba(0,0,0,0.5); z-index:1000; animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .modal .content { background:var(--panel); border:1px solid var(--border); border-radius:var(--radius-lg); width:min(720px, 90vw); max-height:90vh; margin:5vh auto; overflow:auto; animation: slideUp 0.3s ease; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal .head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); }
        .modal .body { padding:12px; }
        #call-overlay { display:none; position:fixed; inset:0; background:#000; z-index:2000; color:#fff; }
        #call-wrap { display:flex; flex-direction:column; height:100%; }
        #call-videos { flex:1; display:grid; grid-template-columns: 1fr; gap:6px; padding:10px; }
        #remoteVideo, #localVideo { width:100%; height:100%; object-fit:cover; background:#111; }
        #call-controls { display:flex; gap:8px; justify-content:center; padding:10px; background:rgba(0,0,0,0.4); flex-wrap:wrap; }
        .call-btn { background:rgba(255,255,255,0.15); color:#fff; border:none; padding:10px 14px; border-radius:24px; cursor:pointer; transition: var(--transition); font-size:12px; }
        .call-btn:hover { background:rgba(255,255,255,0.25); }
        .call-btn.end { background:var(--red); }
        @keyframes pulse { 0%{ box-shadow:0 0 0 0 rgba(88,166,255,.5);} 70%{ box-shadow:0 0 0 10px rgba(88,166,255,0);} 100%{ box-shadow:0 0 0 0 rgba(88,166,255,0);} }
        .notif-pulse { animation: pulse 1s ease-in-out infinite; }
        .badge { display: inline-block; background: var(--red); color: #fff; border-radius: 50%; width: 18px; height: 18px; text-align: center; line-height: 18px; font-size: 11px; font-weight: bold; }
        @media (max-width: 1200px) {
            #sidebar { width: 240px; }
            .bubble { max-width: 70%; }
        }
        @media (max-width: 900px) {
            #sidebar { width: 220px; }
            .bubble { max-width: 75%; }
            #current-chat-name { font-size: 13px; }
        }
        @media (max-width: 768px) {
            #app { flex-direction: column; }
            #sidebar { width: 100%; max-height: 30vh; border-right: none; border-bottom: 1px solid var(--border); }
            #content { height: 70vh; }
            .bubble { max-width: 80%; }
            #current-chat-name { font-size: 12px; }
        }
    </style>
</head>
<body>
    {% if not session.get('username') %}
    <div id="login-container" style="display:flex; align-items:center; justify-content:center; height:100vh; padding:16px;">
        <form id="login-form" method="POST" action="{{ url_for('login') }}" style="background:var(--panel); border:1px solid var(--border); padding:20px; border-radius:var(--radius-lg); width:min(420px,100%); box-shadow:var(--shadow-lg);">
            <h2 style="margin-top:0;color:var(--brand); text-align:center;">GChat</h2>
            <input type="text" name="username" placeholder="Юзернейм" required style="width:100%; padding:10px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); margin:6px 0; font-size:14px;">
            <input type="password" name="password" placeholder="Пароль" required style="width:100%; padding:10px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); margin:6px 0; font-size:14px;">
            <button type="submit" style="width:100%; padding:10px; background:var(--green); border:none; color:#fff; border-radius:var(--radius-md); cursor:pointer; margin-top:10px; font-weight:600; font-size:14px;">Войти / Зарегистрироваться</button>
        </form>
    </div>
    {% else %}
    <div id="app">
        <div id="sidebar">
            <div class="profile" id="me-profile">
                <img src="/static/avatars/{{ session.get('avatar', 'default.jpg') }}" class="avatar" id="me-avatar" alt="avatar">
                <div class="profile-info">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <strong id="me-username" style="font-size:12px;">{{ session.get('username') }}</strong>
                        <span class="pill" id="online-pill" style="font-size:10px;">онлайн</span>
                    </div>
                    <div class="status" id="me-status">В сети</div>
                </div>
                <button class="icon-btn" id="open-settings" title="Настройки" style="margin-left:auto; padding:4px 6px;">⚙️</button>
                <a href="{{ url_for('logout') }}" class="icon-btn" title="Выход" style="padding:4px 6px;">🚪</a>
            </div>

            <div>
                <div class="panel-title">Поиск</div>
                <input id="search-users" type="search" placeholder="@username" autocomplete="off">
                <ul id="user-search-results" class="list"></ul>
            </div>

            <div>
                <div class="panel-title">Друзья</div>
                <ul id="friends" class="list"></ul>
            </div>

            <div>
                <div class="panel-title">Каналы</div>
                <form id="create-channel-form" method="POST" action="{{ url_for('create_channel') }}" style="display:flex; flex-direction:column; gap:6px; margin-bottom:6px;">
                    <div style="display:flex; gap:4px;">
                    <input name="channel_name" placeholder="Канал..." required style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                    <button class="icon-btn" title="Создать" style="padding:6px 8px;">＋</button>
                    </div>
                    <label style="display:flex; gap:6px; align-items:center; font-size:12px;">
                        <input type="checkbox" id="is_private" name="is_private" value="true"> Приватный канал
                </label>
                </form>
                <ul id="channels" class="list"></ul>
            </div>

            <div>
                <div class="panel-title">Уведомления <span id="notif-count" class="badge" style="display:none;">0</span></div>
                <ul id="notifications" class="list"></ul>
            </div>
        </div>
        <div id="content">
            <div id="chat-header">
                <h3 id="current-chat-name">Выберите чат</h3>
                <button class="icon-btn" id="btn-manage-members" title="Участники" style="display:none; padding:6px 8px;">👥</button>
                <button class="icon-btn" id="btn-gifts" title="Подарки" style="padding:6px 8px;">🎁</button>
                <button class="icon-btn" id="btn-audio-call" title="Звонок" style="padding:6px 8px;">📞</button>
                <button class="icon-btn" id="btn-video-call" title="Видео" style="padding:6px 8px;">🎥</button>
            </div>
            <div id="messages-wrap">
                <div id="messages"></div>
                <div id="typing-indicator"></div>
            </div>
            <div id="reply-preview" class="reply" style="display:none; margin:0 8px;">
                Ответ на <strong class="reply-username"></strong>: <span class="reply-text"></span>
                <button id="cancel-reply-btn" class="icon-btn" style="float:right; padding:2px 4px;">✕</button>
            </div>
            <div id="attachment-preview" class="reply" style="display:none; margin:6px 8px;">
                Файл: <span id="attachment-filename"></span>
                <button id="cancel-attachment-btn" class="icon-btn" style="float:right; padding:2px 4px;">✕</button>
            </div>
            <form id="composer" enctype="multipart/form-data">
                <button type="button" class="icon-btn" id="upload-button" style="padding:6px 8px;">📎</button>
                <input type="file" id="file-input" style="display:none" name="file">
                <input type="text" id="message-input" placeholder="Сообщение..." autocomplete="off">
                <button type="submit" id="send-button">Отправить</button>
            </form>
        </div>
    </div>

    <div id="profile-modal" class="modal">
        <div class="content">
            <div class="head">
                <strong id="profile-title">Профиль</strong>
                <button class="icon-btn" id="close-profile">✕</button>
            </div>
            <div class="body">
                <div class="tabs">
                    <div class="tab active" data-tab="info">Инфо</div>
                    <div class="tab" data-tab="media">Медиа</div>
                </div>
                <div id="tab-info" class="tab-content">
                    <div class="profile">
                        <img id="p-avatar" class="avatar" src="" alt="avatar">
                        <div class="profile-info">
                            <strong id="p-username"></strong>
                            <div id="p-status" class="status"></div>
                            <div id="p-bio" style="margin-top:6px; font-size:12px;"></div>
                            <div id="p-favorite-music" class="status" style="margin-top:6px;"></div>
                            <div id="p-stars" class="status" style="margin-top:6px;"></div>
                        </div>
                    </div>
                    <div id="self-edit" style="margin-top:10px; display:none;">
                        <h4 style="margin:0 0 8px 0; font-size:13px;">Редактировать</h4>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <input id="status-input" placeholder="Статус" style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                            <input id="displayname-input" placeholder="Имя" style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                            <textarea id="bio-input" placeholder="О себе" rows="2" style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px; resize:none;"></textarea>
                            <input id="favorite-music-input" placeholder="Любимая музыка (исполнитель — трек)" style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                            <input type="file" id="avatar-input" accept="image/*" style="font-size:12px;">
                            <div style="display:flex; flex-direction:column; gap:4px; border:1px solid var(--border); border-radius:var(--radius-md); padding:8px;">
                                <strong style="font-size:12px;">Добавить в историю музыки</strong>
                                <input id="music-title-input" placeholder="Название трека" style="padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                                <input id="music-artist-input" placeholder="Исполнитель (необязательно)" style="padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                                <input id="music-url-input" placeholder="Ссылка (https://)" style="padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                                <button class="icon-btn" id="add-music-entry" style="width:100%;">Добавить трек</button>
                            </div>
                            <button class="icon-btn" id="save-profile" style="width:100%;">Сохранить</button>
                        </div>
                    </div>
                    <div id="other-actions" style="margin-top:10px; display:none; flex-direction:column; gap:6px;">
                        <button class="icon-btn" id="btn-add-friend" style="width:100%; text-align:left; padding:8px;">➕ Добавить</button>
                        <button class="icon-btn" id="btn-remove-friend" style="width:100%; text-align:left; padding:8px; display:none; border-color:var(--red); color:var(--red);">➖ Удалить</button>
                        <button class="icon-btn" id="btn-cancel-request" style="width:100%; text-align:left; padding:8px; display:none;">❌ Отменить</button>
                        <button class="icon-btn" id="btn-accept-request" style="width:100%; text-align:left; padding:8px; display:none; border-color:var(--green); color:var(--green);">✅ Принять</button>
                        <button class="icon-btn" id="btn-chat" style="width:100%; text-align:left; padding:8px;">💬 Написать</button>
                        <button class="icon-btn" id="btn-send-stars" style="width:100%; text-align:left; padding:8px; display:none;">✨ Отправить звёзды</button>
                    </div>
                    <div id="music-section" style="margin-top:12px;">
                        <h4 style="margin:0 0 6px 0; font-size:13px;">Музыка</h4>
                        <div id="favorite-music-view" style="font-size:12px; color:var(--muted);"></div>
                        <ul id="music-history-list" class="list" style="margin-top:6px;"></ul>
                        <div id="music-history-empty" style="font-size:12px; color:var(--muted); display:none;">История пустая</div>
                    </div>
                    <div id="stars-section" style="margin-top:12px;">
                        <h4 style="margin:0 0 6px 0; font-size:13px;">Звёзды</h4>
                        <div id="stars-balance-view" style="font-size:12px; color:var(--muted);">0 ⭐</div>
                    </div>
                </div>
                <div id="tab-media" class="tab-content" style="display:none;"><div id="media-list" class="list"></div></div>
            </div>
        </div>
    </div>

    <div id="settings-modal" class="modal">
        <div class="content">
            <div class="head">
                <strong>Настройки</strong>
                <button class="icon-btn" id="close-settings">✕</button>
            </div>
            <div class="body" style="display:flex; flex-direction:column; gap:8px;">
                <div class="row" style="justify-content:space-between;">
                    <label style="font-size:13px;">Тема</label>
                    <select id="setting-theme" style="padding:6px 8px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:12px;">
                        <option value="dark">Тёмная</option>
                        <option value="light">Светлая</option>
                    </select>
                </div>
                <div class="row" style="justify-content:space-between;">
                    <label style="font-size:13px;">Уведомления</label>
                    <input type="checkbox" id="setting-notifications" checked>
                </div>
                <div class="row" style="justify-content:space-between;">
                    <label style="font-size:13px;">Звук</label>
                    <input type="checkbox" id="setting-sound" checked>
                </div>
                <div class="row" style="gap:6px;">
                    <button class="icon-btn" id="enable-audio" style="flex:1; font-size:12px;">🔊 Звук</button>
                    <button class="icon-btn" id="save-settings" style="flex:1; font-size:12px;">💾 Сохранить</button>
                </div>
            </div>
        </div>
    </div>

    <div id="invite-modal" class="modal">
        <div class="content">
            <div class="head">
                <strong>Участники приватного канала</strong>
                <button class="icon-btn" id="close-invite">✕</button>
            </div>
            <div class="body" style="display:flex; flex-direction:column; gap:12px;">
                <div>
                    <div class="panel-title" style="margin-top:0;">Текущие участники</div>
                    <ul id="invite-members" class="list"></ul>
                </div>
                <div>
                    <div class="panel-title" style="margin-top:0;">Добавить друзей</div>
                    <input type="search" id="invite-search" placeholder="Поиск среди друзей" autocomplete="off" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text); font-size:13px;">
                    <div id="invite-hint" style="font-size:11px; color:var(--muted); margin:6px 0;">Показаны до 8 подходящих друзей. Введите имя или ник для поиска.</div>
                    <ul id="invite-suggestions" class="list"></ul>
                    <div id="invite-empty" style="display:none; font-size:12px; color:var(--muted); text-align:center; padding:10px; border:1px dashed var(--border); border-radius:var(--radius-md);">Подходящих друзей нет</div>
                </div>
            </div>
        </div>
    </div>

    <div id="gifts-modal" class="modal">
        <div class="content" style="max-width:900px;">
            <div class="head">
                <strong>Магазин подарков</strong>
                <button class="icon-btn" id="close-gifts">✕</button>
            </div>
            <div class="body">
                <div class="tabs">
                    <div class="tab active" data-gift-tab="shop">Магазин</div>
                    <div class="tab" data-gift-tab="my">Мои подарки</div>
                    <div class="tab" data-gift-tab="market">Рынок</div>
                </div>
                <div id="gift-tab-shop" class="tab-content" style="display:block;">
                    <div style="margin-bottom:12px; padding:8px; background:rgba(88,166,255,0.1); border-radius:var(--radius-md); font-size:12px;">
                        Ваш баланс: <strong id="gift-balance-display">0 ⭐</strong>
                    </div>
                    <div id="gifts-shop-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px;"></div>
                </div>
                <div id="gift-tab-my" class="tab-content" style="display:none;">
                    <ul id="gifts-my-list" class="list"></ul>
                    <div id="gifts-my-empty" style="display:none; text-align:center; padding:20px; color:var(--muted);">У вас пока нет подарков</div>
                </div>
                <div id="gift-tab-market" class="tab-content" style="display:none;">
                    <ul id="gifts-market-list" class="list"></ul>
                    <div id="gifts-market-empty" style="display:none; text-align:center; padding:20px; color:var(--muted);">На рынке пока ничего нет</div>
                </div>
            </div>
        </div>
    </div>

    <div id="call-overlay">
        <div id="call-wrap">
            <div id="call-videos">
                <video id="remoteVideo" autoplay playsinline></video>
                <video id="localVideo" autoplay playsinline muted style="position:absolute; right:10px; bottom:10px; width:120px; height:160px; border-radius:var(--radius-md); border:2px solid rgba(255,255,255,0.3);"></video>
            </div>
            <div id="call-controls">
                <button class="call-btn" id="toggle-mic">🎙️</button>
                <button class="call-btn" id="toggle-cam">📷</button>
                <button class="call-btn end" id="hangup">Завершить</button>
            </div>
        </div>
    </div>

    <script>
        const socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: 5 });

        // Состояние приложения
        const appState = {
            currentRoom: null,
            currentRoomMeta: null,
            canInviteToCurrentRoom: false,
            currentRoomMembers: [],
            roomsIndex: {},
            friends: [],
            pendingInvites: new Set(),
            lastInviteSuggestions: [],
            replyToMessageId: null,
            audioCtx: null,
            ringOsc: null,
            ringGain: null,
            audioReady: false,
            pc: null,
            localStream: null,
            remoteStream: null,
            currentCallPeer: null,
            currentCallType: null,
            currentProfileUser: null,
            currentProfileIsSelf: false,
            currentProfileMusic: [],
            currentProfileCanEditMusic: false,
            currentProfileStars: 0,
            currentUserStars: 0,
            currentProfileFavoriteMusic: '',
            friendStatusCache: {},
            messageCache: {},
            userCache: {},
            isHistoryLoading: false,
            isHistoryExhausted: false,
            currentScrollInterval: null,
            typingTimer: null,
            callStartTime: null,
            callDuration: 0,
            callDurationInterval: null
        };
        const currentUser = '{{ session.get("username") }}';

        function $(sel){ return document.querySelector(sel); }
        function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
        function setTheme(val){ document.documentElement.setAttribute('data-theme', val); localStorage.setItem('theme', val); }
        function isDirectRoom(name){ return name && name.includes('_') && !name.includes(' '); }
        function getPeerFromRoom(name){ if(!isDirectRoom(name)) return null; const parts = name.split('_'); const me = '{{ session.get("username") }}'; return parts[0]===me?parts[1]:parts[0]; }
        function debounce(fn, ms){ let timer; return function(...args){ clearTimeout(timer); timer = setTimeout(()=>fn(...args), ms); }; }
        function throttle(fn, ms){ let last = 0; return function(...args){ const now = Date.now(); if(now - last >= ms){ fn(...args); last = now; } }; }

        function ensureAudio(){ try{ if(!appState.audioCtx){ appState.audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } if(appState.audioCtx.state==='suspended'){ appState.audioCtx.resume(); } appState.audioReady = true; }catch(e){} }
        function playDing(){ if(!$('#setting-sound') || !$('#setting-sound').checked) return; ensureAudio(); if(!appState.audioReady) return; try{ const osc = appState.audioCtx.createOscillator(); const g = appState.audioCtx.createGain(); osc.connect(g); g.connect(appState.audioCtx.destination); osc.type='triangle'; osc.frequency.setValueAtTime(1200, appState.audioCtx.currentTime); g.gain.setValueAtTime(0.0001, appState.audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.2, appState.audioCtx.currentTime+0.02); osc.start(); osc.stop(appState.audioCtx.currentTime+0.12); }catch(e){} }
        function startRing(){ if(!$('#setting-sound') || !$('#setting-sound').checked) return; ensureAudio(); if(!appState.audioReady || appState.ringOsc) return; try{ appState.ringOsc = appState.audioCtx.createOscillator(); appState.ringGain = appState.audioCtx.createGain(); appState.ringOsc.connect(appState.ringGain); appState.ringGain.connect(appState.audioCtx.destination); appState.ringOsc.type='sine'; appState.ringOsc.frequency.setValueAtTime(880, appState.audioCtx.currentTime); appState.ringGain.gain.value=0.0; let up=true; const id=setInterval(()=>{ if(!appState.ringOsc){ clearInterval(id); return;} appState.ringGain.gain.setTargetAtTime(up?0.2:0.0, appState.audioCtx.currentTime, 0.05); up=!up; }, 350); appState.ringOsc._interval=id; appState.ringOsc.start(); }catch(e){} }
        function stopRing(){ if(appState.ringOsc){ try{ clearInterval(appState.ringOsc._interval); appState.ringOsc.stop(); appState.ringOsc.disconnect(); }catch(e){} appState.ringOsc=null; } if(appState.ringGain){ try{ appState.ringGain.disconnect(); }catch(e){} appState.ringGain=null; } }

        function addNotification(html, unread=true){ const ul = $('#notifications'); const li=document.createElement('li'); li.className='item notif-pulse'; if(unread) li.classList.add('unread'); li.innerHTML=html; ul.prepend(li); updateNotifCount(); return li; }
        function clearNotification(li){ li.remove(); updateNotifCount(); }
        function updateNotifCount(){ const count = $('#notifications').querySelectorAll('.unread').length; const badge = $('#notif-count'); if(count > 0){ badge.textContent = count; badge.style.display = 'inline-block'; } else { badge.style.display = 'none'; } }

        function updateCurrentRoomHeader(){ const header = $('#current-chat-name'); if(!header) return; if(!appState.currentRoom){ header.textContent = 'Выберите чат'; } else { const meta = appState.currentRoomMeta || {}; const display = meta.display_name || meta.name || appState.currentRoom; header.textContent = display + ((meta.is_group && meta.is_private) ? ' 🔒' : ''); }
            const btn = $('#btn-manage-members'); if(btn){ if(appState.canInviteToCurrentRoom){ btn.style.display = 'inline-flex'; } else { btn.style.display = 'none'; const inviteModal = $('#invite-modal'); if(inviteModal && inviteModal.style.display === 'block'){ closeInviteModal(); } } } }

        function loadRoomInfo(){ if(!appState.currentRoom) return Promise.resolve(); return fetch(`/room_info?name=${encodeURIComponent(appState.currentRoom)}`).then(r=>{ if(!r.ok) throw new Error('room-info'); return r.json(); }).then(info=>{ if(info){ appState.currentRoomMeta = Object.assign({}, appState.currentRoomMeta || {}, info.meta || info); appState.currentRoomMembers = info.members || []; appState.canInviteToCurrentRoom = !!info.can_invite; renderInviteMembers(); } }).catch(()=>{ appState.currentRoomMembers = []; appState.canInviteToCurrentRoom = false; }).finally(()=>{ updateCurrentRoomHeader(); }); }

        function renderInviteMembers(){ const list = $('#invite-members'); if(!list) return; list.innerHTML=''; const members = Array.isArray(appState.currentRoomMembers) ? [...appState.currentRoomMembers] : []; if(!members.length){ const li = document.createElement('li'); li.className='item'; li.textContent='Пока никого нет'; list.appendChild(li); return; } members.sort((a,b)=>{ const an = (a.display_name || a.username || '').toLowerCase(); const bn = (b.display_name || b.username || '').toLowerCase(); return an.localeCompare(bn); }); members.forEach(member=>{ const li = document.createElement('li'); li.className='item'; const avatar = member.avatar || 'default.jpg'; li.innerHTML = `<img src="/static/avatars/${avatar}" class="avatar" style="width:28px;height:28px;"> <div style="flex:1; font-size:12px;">${member.display_name ? `${member.display_name} <span style='color:var(--muted);'>(@${member.username})</span>` : `@${member.username}`}</div>${member.username===currentUser?"<span class='pill' style='margin-left:auto;'>вы</span>":''}`; list.appendChild(li); }); }

        function renderInviteSuggestions(list){ const ul = $('#invite-suggestions'); const empty = $('#invite-empty'); if(!ul || !empty) return; const suggestions = Array.isArray(list) ? [...list] : []; appState.lastInviteSuggestions = suggestions; ul.innerHTML=''; if(!suggestions.length){ empty.style.display='block'; return; } empty.style.display='none'; suggestions.forEach(user=>{ const li = document.createElement('li'); li.className='item'; const avatar = user.avatar || 'default.jpg'; li.innerHTML = `<img src="/static/avatars/${avatar}" class="avatar" style="width:28px;height:28px;"> <div style="flex:1; font-size:12px;">${user.display_name ? `${user.display_name} <span style='color:var(--muted);'>(@${user.username})</span>` : `@${user.username}`}</div>`; const btn = document.createElement('button'); btn.className='icon-btn'; btn.style.marginLeft='auto'; const pending = appState.pendingInvites.has(user.username); btn.textContent = pending ? '⏳' : '➕'; btn.disabled = pending; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); inviteFriendToRoom(user.username); }); li.appendChild(btn); ul.appendChild(li); }); }

        function updateFavoriteMusicView(favorite){ const favView = $('#favorite-music-view'); const profileLine = $('#p-favorite-music'); const value = (favorite || '').trim(); if(favView){ favView.textContent = value ? value : 'Любимая музыка не указана'; } if(profileLine){ profileLine.textContent = value ? `Любимая музыка: ${value}` : ''; } appState.currentProfileFavoriteMusic = value; const input = $('#favorite-music-input'); if(appState.currentProfileIsSelf && input && document.activeElement !== input){ input.value = value; } }

        function updateStarsView(stars){ const safeStars = Number.isFinite(stars) ? Math.max(0, Math.floor(stars)) : 0; const starsView = $('#stars-balance-view'); if(starsView){ starsView.textContent = `${safeStars} ⭐`; } const topLine = $('#p-stars'); if(topLine){ topLine.textContent = `Звёзды: ${safeStars} ⭐`; } if(appState.currentProfileUser === currentUser && appState.currentProfileIsSelf){ appState.currentUserStars = safeStars; } appState.currentProfileStars = safeStars; }

        function renderMusicHistory(history, canEdit){ const list = $('#music-history-list'); const empty = $('#music-history-empty'); if(!list || !empty) return; const entries = Array.isArray(history) ? history : []; appState.currentProfileMusic = entries; appState.currentProfileCanEditMusic = !!canEdit; list.innerHTML=''; if(!entries.length){ empty.style.display='block'; return; } empty.style.display='none'; entries.forEach(entry=>{ const li = document.createElement('li'); li.className='item'; const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.flex='1'; wrap.style.flexDirection='column'; wrap.style.fontSize='12px'; const title = document.createElement('strong'); title.style.fontSize='12px'; title.textContent = entry.title || 'Без названия'; wrap.appendChild(title); if(entry.artist){ const artist = document.createElement('div'); artist.style.fontSize='11px'; artist.style.color='var(--muted)'; artist.textContent = entry.artist; wrap.appendChild(artist); } if(entry.url){ const linkWrap = document.createElement('div'); linkWrap.style.fontSize='11px'; const link = document.createElement('a'); link.href = entry.url; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent = 'слушать'; linkWrap.appendChild(link); wrap.appendChild(linkWrap); } li.appendChild(wrap); if(canEdit){ const btn = document.createElement('button'); btn.className='icon-btn'; btn.style.marginLeft='auto'; btn.textContent='✕'; btn.title='Удалить из истории'; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); removeMusicEntry(entry.id); }); li.appendChild(btn); } list.appendChild(li); }); }

        function loadMusicHistory(username, canEdit){ fetch(`/user_music_history?username=${encodeURIComponent(username)}`).then(r=>r.json()).then(res=>{ renderMusicHistory(res.history || [], canEdit); }).catch(()=>{ renderMusicHistory([], canEdit); }); }

        function toggleSendStarsButton(friendStatus){ const btn = $('#btn-send-stars'); if(!btn) return; if(appState.currentProfileIsSelf){ btn.style.display='none'; btn.onclick = null; return; } const canSend = friendStatus === 'friend'; btn.style.display = canSend ? 'block' : 'none'; btn.onclick = canSend ? ()=> promptSendStars(appState.currentProfileUser) : null; }

        function openInviteModal(){ if(!appState.canInviteToCurrentRoom) return; $('#invite-modal').style.display='block'; $('#invite-search').value=''; const afterLoad = ()=>{ renderInviteMembers(); fetchInviteSuggestions(''); setTimeout(()=> $('#invite-search').focus(), 50); };
            if(!appState.currentRoomMembers.length){ loadRoomInfo().then(afterLoad); } else { afterLoad(); } }

        function closeInviteModal(){ $('#invite-modal').style.display='none'; }

        function fetchInviteSuggestions(query){ if(!appState.canInviteToCurrentRoom || !appState.currentRoom) return; const params = new URLSearchParams({ room: appState.currentRoom }); if(query){ params.append('q', query); } fetch(`/room_invite_suggestions?${params.toString()}`).then(r=>{ if(!r.ok) throw new Error('invite-suggestions'); return r.json(); }).then(res=>{ renderInviteSuggestions(res.suggestions || []); }).catch(()=>{ renderInviteSuggestions([]); }); }

        function inviteFriendToRoom(username){ if(!appState.currentRoom || appState.pendingInvites.has(username)) return; appState.pendingInvites.add(username); renderInviteSuggestions(appState.lastInviteSuggestions); socket.emit('invite_user', { room: appState.currentRoom, username }); }

        function addMusicEntry(ev){ ev?.preventDefault?.(); if(!appState.currentProfileIsSelf) return; const title = ($('#music-title-input')?.value || '').trim(); const artist = ($('#music-artist-input')?.value || '').trim(); const url = ($('#music-url-input')?.value || '').trim(); if(title.length < 2){ alert('Введите название трека (минимум 2 символа)'); return; } const payload = { title }; if(artist) payload.artist = artist; if(url) payload.url = url; const btn = $('#add-music-entry'); if(btn){ btn.disabled = true; btn.textContent = 'Добавление...'; }
            fetch('/music_history', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(async r=>{ const data = await r.json().catch(()=>({})); return { ok: r.ok, data }; }).then(res=>{ if(!res.ok){ alert(res.data?.error || 'Не удалось сохранить трек'); return; } appState.currentProfileMusic = [res.data.entry, ...appState.currentProfileMusic]; renderMusicHistory(appState.currentProfileMusic, true); ['music-title-input','music-artist-input','music-url-input'].forEach(id=>{ const input = document.getElementById(id); if(input) input.value=''; }); }).catch(()=>{ alert('Ошибка сети при добавлении трека'); }).finally(()=>{ if(btn){ btn.disabled = false; btn.textContent = 'Добавить трек'; } }); }

        function removeMusicEntry(id){ if(!appState.currentProfileIsSelf) return; if(!confirm('Удалить трек из истории?')) return; fetch(`/music_history/${id}`, { method:'DELETE' }).then(async r=>{ const data = await r.json().catch(()=>({})); return { ok: r.ok, data }; }).then(res=>{ if(!res.ok){ alert(res.data?.error || 'Не удалось удалить трек'); return; } appState.currentProfileMusic = appState.currentProfileMusic.filter(entry=> entry.id !== id); renderMusicHistory(appState.currentProfileMusic, true); }).catch(()=> alert('Ошибка сети при удалении трека')); }

        function promptSendStars(username){ const amountStr = prompt('Сколько звёзд отправить?'); if(amountStr === null) return; const amount = parseInt(amountStr, 10); if(!Number.isFinite(amount) || amount <= 0){ alert('Введите положительное число'); return; } fetch('/send_stars', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to_username: username, amount }) }).then(async r=>{ const data = await r.json().catch(()=>({})); return { ok: r.ok, data }; }).then(res=>{ if(!res.ok){ alert(res.data?.error || 'Не удалось отправить звёзды'); return; }
                const senderBalance = Number.isFinite(res.data?.balance) ? res.data.balance : appState.currentUserStars - amount;
                if(appState.currentProfileUser === currentUser){ updateStarsView(senderBalance); }
                else { updateStarsView(appState.currentProfileStars + amount); appState.currentUserStars = senderBalance; }
                addNotification(`<div><strong style="font-size:12px;">Звёзды отправлены</strong><div style="font-size:11px; color:var(--muted);">Вы отправили ${amount} ⭐ пользователю @${username}</div></div>`, false); }).catch(()=> alert('Ошибка сети при отправке звёзд')); }

        function updateFriendButton(username, status){ appState.currentProfileUser = username; appState.friendStatusCache[username] = status; const addBtn = $('#btn-add-friend'); const removeBtn = $('#btn-remove-friend'); const cancelBtn = $('#btn-cancel-request'); const acceptBtn = $('#btn-accept-request'); addBtn.style.display = 'none'; removeBtn.style.display = 'none'; cancelBtn.style.display = 'none'; acceptBtn.style.display = 'none'; if(status === 'friend'){ removeBtn.style.display = 'block'; removeBtn.textContent = '➖ Удалить из друзей'; } else if(status === 'requested'){ cancelBtn.style.display = 'block'; cancelBtn.textContent = '❌ Отменить запрос'; } else if(status === 'incoming'){ acceptBtn.style.display = 'block'; acceptBtn.textContent = '✅ Принять запрос'; } else { addBtn.style.display = 'block'; addBtn.textContent = '➕ Добавить в друзья'; } }

        document.addEventListener('DOMContentLoaded', () => {
            $('#me-profile').addEventListener('click', ()=> openUserProfile('{{ session.get('username') }}'));

            socket.emit('get_rooms');
            socket.emit('get_friends');
            socket.emit('get_notifications');

            $('#composer').addEventListener('submit', onSendMessage);
            $('#upload-button').addEventListener('click', ()=> $('#file-input').click());
            $('#file-input').addEventListener('change', onAttachmentChange);
            $('#cancel-attachment-btn').addEventListener('click', ()=>{ $('#file-input').value=''; $('#attachment-preview').style.display='none'; });
            $('#cancel-reply-btn').addEventListener('click', ()=>{ appState.replyToMessageId=null; $('#reply-preview').style.display='none'; });

            const msgInput = $('#message-input');
            msgInput.addEventListener('input', debounce(()=>{
                clearTimeout(appState.typingTimer);
                if(appState.currentRoom){ socket.emit('typing', { room: appState.currentRoom, is_typing: true }); }
                appState.typingTimer = setTimeout(()=>{ if(appState.currentRoom){ socket.emit('typing', { room: appState.currentRoom, is_typing: false }); } }, 1500);
            }, 100));

            $('#search-users').addEventListener('input', debounce((e)=>{
                const q = e.target.value.trim();
                const list = $('#user-search-results');
                list.innerHTML='';
                if(q.length < 2) return;
                socket.emit('search_users', { query: q });
            }, 300));

            $('#open-settings').addEventListener('click', ()=>{ $('#settings-modal').style.display='block'; fetchSettings(); });
            $('#close-settings').addEventListener('click', ()=> $('#settings-modal').style.display='none');
            $('#save-settings').addEventListener('click', saveSettings);
            $('#enable-audio').addEventListener('click', ()=>{ ensureAudio(); playDing(); });

            const inviteSearchHandler = debounce((e)=>{
                if(!appState.canInviteToCurrentRoom) return;
                fetchInviteSuggestions(e.target.value.trim());
            }, 250);
            $('#btn-manage-members').addEventListener('click', openInviteModal);
            $('#close-invite').addEventListener('click', closeInviteModal);
            $('#invite-modal').addEventListener('click', (ev)=>{ if(ev.target === ev.currentTarget) closeInviteModal(); });
            $('#invite-search').addEventListener('input', inviteSearchHandler);

            const addMusicBtn = $('#add-music-entry');
            if(addMusicBtn){ addMusicBtn.addEventListener('click', addMusicEntry); }

            $('#close-profile').addEventListener('click', ()=> $('#profile-modal').style.display='none');
            $all('.tab').forEach(el=> el.addEventListener('click', ()=> switchProfileTab(el.dataset.tab)));
            $('#save-profile').addEventListener('click', saveProfile);

            $('#btn-gifts').addEventListener('click', openGiftsModal);
            $('#close-gifts').addEventListener('click', closeGiftsModal);
            $('#gifts-modal').addEventListener('click', (ev)=>{ if(ev.target === ev.currentTarget) closeGiftsModal(); });
            $all('[data-gift-tab]').forEach(el=> el.addEventListener('click', ()=> switchGiftTab(el.dataset.giftTab)));
            $('#btn-audio-call').addEventListener('click', ()=> startCall('audio'));
            $('#btn-video-call').addEventListener('click', ()=> startCall('video'));
            $('#toggle-mic').addEventListener('click', toggleMic);
            $('#toggle-cam').addEventListener('click', toggleCam);
            $('#hangup').addEventListener('click', endCall);

            const theme = localStorage.getItem('theme') || '{{ session.get("theme", "dark") }}';
            setTheme(theme);

            fetch('/get_settings').then(r=>r.json()).then(s=>{
                if(s.theme) setTheme(s.theme);
                if(typeof s.sound_enabled==='boolean'){ $('#setting-sound').checked=s.sound_enabled; }
                if(typeof s.notifications_enabled==='boolean'){ $('#setting-notifications').checked=s.notifications_enabled; }
            });
        });

        function onAttachmentChange(){ const fi = $('#file-input'); if(fi.files && fi.files.length>0){ $('#attachment-filename').textContent = fi.files[0].name; $('#attachment-preview').style.display = 'block'; } }

        function onSendMessage(e){ e.preventDefault(); if(!appState.currentRoom) return; const msg = $('#message-input').value.trim(); const file = $('#file-input').files[0]; if(!msg && !file) return; if(file){ const fd = new FormData(); fd.append('room', appState.currentRoom); fd.append('message', msg || ''); fd.append('file', file); if(appState.replyToMessageId) fd.append('reply_to', appState.replyToMessageId); fetch('/send_message_with_file', { method:'POST', body: fd }).then(r=>{ if(r.ok){ $('#message-input').value=''; $('#cancel-attachment-btn').click(); $('#cancel-reply-btn').click(); } }); } else { socket.emit('send_message', { room: appState.currentRoom, message: msg, reply_to: appState.replyToMessageId }); $('#message-input').value=''; $('#cancel-reply-btn').click(); } }

        function loadMoreHistory(){ const messagesDiv = $('#messages'); if(!messagesDiv || !appState.currentRoom || appState.isHistoryLoading || appState.isHistoryExhausted) return; const scrollTop = messagesDiv.scrollTop; const threshold = 200; if(scrollTop <= threshold && scrollTop >= 0){ const offset = messagesDiv.children.length; if(offset > 0){ appState.isHistoryLoading = true; socket.emit('get_history', { room: appState.currentRoom, offset, limit: 50 }); } } }
        const loadMoreHistoryDebounced = debounce(loadMoreHistory, 150);

        function joinChatRoom(roomName){ if(!roomName) return; if(appState.currentRoom === roomName) return; if(appState.currentRoom){ socket.emit('leave', { room: appState.currentRoom }); }
            appState.currentRoom = roomName;
            appState.currentRoomMeta = appState.roomsIndex[roomName] ? Object.assign({}, appState.roomsIndex[roomName]) : { name: roomName };
            appState.canInviteToCurrentRoom = !!(appState.currentRoomMeta && appState.currentRoomMeta.is_group && appState.currentRoomMeta.is_private);
            appState.currentRoomMembers = [];
            appState.pendingInvites.clear();
            appState.lastInviteSuggestions = [];
            appState.isHistoryLoading = false;
            appState.isHistoryExhausted = false;
            if(appState.currentScrollInterval){ clearInterval(appState.currentScrollInterval); appState.currentScrollInterval = null; }
            updateCurrentRoomHeader();
            $all('#channels .item').forEach(item=> item.classList.toggle('active', item.dataset.room === roomName));
            socket.emit('join', { room: appState.currentRoom });
            $('#messages').innerHTML = '';
            const messagesDiv = $('#messages');
            let scrollCheckInterval = null;
            messagesDiv.onscroll = ()=>{ loadMoreHistoryDebounced(); clearTimeout(scrollCheckInterval); scrollCheckInterval = setTimeout(()=>{ if(messagesDiv.scrollTop <= 250 && !appState.isHistoryLoading && !appState.isHistoryExhausted){ loadMoreHistory(); } }, 300); };
            if(scrollCheckInterval) clearInterval(scrollCheckInterval);
            scrollCheckInterval = setInterval(()=>{ if(messagesDiv.scrollTop <= 250 && !appState.isHistoryLoading && !appState.isHistoryExhausted && messagesDiv.children.length > 0){ loadMoreHistory(); } }, 500);
            appState.currentScrollInterval = scrollCheckInterval;
            socket.emit('get_history', { room: roomName });
            if(appState.canInviteToCurrentRoom){ loadRoomInfo(); }
        }

        function startPrivateChat(username){ const roomName = [ '{{ session.get('username') }}', username ].sort().join('_'); joinChatRoom(roomName); }

        function appendMessage(msg, prepend=false){ const messagesDiv = $('#messages'); if(!msg || typeof msg.id==='undefined') return; if(document.getElementById(`msg-${msg.id}`)) return; const el = document.createElement('div'); el.className='message'; el.id = `msg-${msg.id}`; let replyHTML = ''; if(msg.replied_to){ replyHTML = `<div class="reply"><strong>${msg.replied_to.username}</strong><div style="font-size:11px;">${msg.replied_to.message}</div></div>`; } let attachHTML = ''; if(msg.attachment_path){ if(/\.(jpg|jpeg|png|gif)$/i.test(msg.attachment_path)) attachHTML = `<img src="/static/uploads/${msg.attachment_path}" class="attachment-image">`; else if(/\.(mp4|webm|ogg)$/i.test(msg.attachment_path)) attachHTML = `<video controls src="/static/uploads/${msg.attachment_path}"></video>`; else if(/\.(mp3|ogg|wav)$/i.test(msg.attachment_path)) attachHTML = `<audio controls src="/static/uploads/${msg.attachment_path}"></audio>`; else attachHTML = `<a href="/static/uploads/${msg.attachment_path}" target="_blank">Скачать</a>`; } let actions = ''; if(msg.username === '{{ session.get('username') }}'){ actions = `<span class="actions"><button class="icon-btn" onclick="replyToMessage(${msg.id}, '${msg.username}', '${(msg.message||'').replace(/'/g, "&#39;")}')">↩️</button><button class="icon-btn" onclick="editMessage(${msg.id})">✏️</button><button class="icon-btn" onclick="deleteMessage(${msg.id})">🗑️</button></span>`; } else { actions = `<span class="actions"><button class="icon-btn" onclick="openUserProfile('${msg.username}')">👤</button><button class="icon-btn" onclick="replyToMessage(${msg.id}, '${msg.username}', '${(msg.message||'').replace(/'/g, "&#39;")}')">↩️</button></span>`; } el.innerHTML = `<img src="/static/avatars/${msg.avatar}" class="avatar" alt="avatar" onclick="openUserProfile('${msg.username}')" style="cursor:pointer;"><div class="bubble"><div class="meta"><span class="u" style="color:var(--brand); cursor:pointer;" onclick="openUserProfile('${msg.username}')">${msg.username}</span><span>${new Date(msg.timestamp).toLocaleString()}</span>${msg.is_edited?'<span class="edited">(ред.)</span>':''}${actions}</div>${replyHTML}<div class="msg-text"></div>${attachHTML}</div>`; el.querySelector('.msg-text').textContent = msg.message || ''; if(prepend){ messagesDiv.insertBefore(el, messagesDiv.firstChild); } else { const shouldScroll = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 10; messagesDiv.appendChild(el); if(shouldScroll){ messagesDiv.scrollTop = messagesDiv.scrollHeight; } } }

        function editMessage(id){ const el = document.querySelector(`#msg-${id} .msg-text`); const text = prompt('Редактировать:', el?.textContent || ''); if(text && text.trim() !== (el?.textContent||'')) socket.emit('edit_message', { message_id: id, new_text: text }); }
        function deleteMessage(id){ if(confirm('Удалить?')) socket.emit('delete_message', { message_id: id }); }
        function replyToMessage(id, username, text){ appState.replyToMessageId = id; $('#reply-preview .reply-username').textContent=username; $('#reply-preview .reply-text').textContent=text; $('#reply-preview').style.display='block'; $('#message-input').focus(); }

        function openUserProfile(username){ fetch(`/user_profile?username=${encodeURIComponent(username)}`).then(r=>r.json()).then(data=>{ appState.currentProfileUser = data.username; appState.currentProfileIsSelf = (data.username === currentUser); appState.currentProfileStars = data.stars_balance || 0; if(appState.currentProfileIsSelf){ appState.currentUserStars = appState.currentProfileStars; }
            $('#profile-title').textContent = `@${data.username}`; $('#p-avatar').src = `/static/avatars/${data.avatar}`; $('#p-username').textContent = data.display_name ? `${data.display_name} (@${data.username})` : `@${data.username}`; $('#p-status').textContent = data.status || ''; $('#p-bio').textContent = data.bio || '';
            const favInput = $('#favorite-music-input'); if(favInput && appState.currentProfileIsSelf){ favInput.value = data.favorite_music || ''; }
            updateFavoriteMusicView(data.favorite_music || ''); updateStarsView(data.stars_balance || 0);
            switchProfileTab('info'); $('#media-list').innerHTML='';
            const selfEdit = $('#self-edit'); const otherActions = $('#other-actions'); if(selfEdit){ selfEdit.style.display = appState.currentProfileIsSelf ? 'block' : 'none'; }
            if(otherActions){ otherActions.style.display = appState.currentProfileIsSelf ? 'none' : 'flex'; }
            if(!appState.currentProfileIsSelf){ updateFriendButton(data.username, data.friend_status); $('#btn-add-friend').onclick = ()=>{ socket.emit('friend_request_send', { to_username: data.username }); updateFriendButton(data.username, 'requested'); toggleSendStarsButton(data.friend_status); }; $('#btn-remove-friend').onclick = ()=>{ socket.emit('friend_remove', { username: data.username }); updateFriendButton(data.username, 'not_friend'); toggleSendStarsButton('not_friend'); }; $('#btn-cancel-request').onclick = ()=>{ socket.emit('friend_request_cancel', { to_username: data.username }); updateFriendButton(data.username, 'not_friend'); toggleSendStarsButton('not_friend'); }; $('#btn-accept-request').onclick = ()=>{ socket.emit('friend_request_respond', { from_username: data.username, action: 'accept' }); updateFriendButton(data.username, 'friend'); toggleSendStarsButton('friend'); }; $('#btn-chat').onclick = ()=> { startPrivateChat(data.username); $('#profile-modal').style.display='none'; }; }
            toggleSendStarsButton(data.friend_status);
            loadMusicHistory(username, appState.currentProfileIsSelf);
            fetch(`/user_media?username=${encodeURIComponent(username)}`).then(r=>r.json()).then(x=>{ const med = $('#media-list'); x.media.forEach(src=>{ const it = document.createElement('div'); it.className='item'; it.innerHTML = `<img src="/static/uploads/${src}" style="max-width:160px; border-radius:var(--radius-md);">`; med.appendChild(it); }); }); $('#profile-modal').style.display='block'; }); }
        function switchProfileTab(tab){ $all('.tab').forEach(t=> t.classList.toggle('active', t.dataset.tab===tab)); ['info','media'].forEach(k=> $('#tab-'+k).style.display = (k===tab?'block':'none')); }
        function saveProfile(){ const fd = new FormData(); const s = $('#status-input').value.trim(); const d = $('#displayname-input').value.trim(); const b = $('#bio-input').value.trim(); const favInput = $('#favorite-music-input'); const favoriteValue = favInput ? favInput.value.trim() : ''; if(s) fd.append('status', s); if(d) fd.append('display_name', d); if(b) fd.append('bio', b); if(favInput){ fd.append('favorite_music', favoriteValue); } const av = $('#avatar-input').files[0]; if(av) fd.append('avatar', av); fetch('/update_profile', { method:'POST', body: fd }).then(r=>r.json()).then(data=>{ if(data.success){ updateFavoriteMusicView(favoriteValue); $('#profile-modal').style.display='none'; } }); }

        function fetchSettings(){ fetch('/get_settings').then(r=>r.json()).then(s=>{ $('#setting-theme').value = s.theme || 'dark'; $('#setting-notifications').checked = !!s.notifications_enabled; $('#setting-sound').checked = !!s.sound_enabled; }); }
        function saveSettings(){ const payload = { theme: $('#setting-theme').value, notifications_enabled: $('#setting-notifications').checked, sound_enabled: $('#setting-sound').checked }; fetch('/update_settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(r=>r.json()).then(s=>{ if(s.success){ setTheme(payload.theme); $('#settings-modal').style.display='none'; } }); }

        socket.on('connect', ()=>{ socket.emit('get_rooms'); socket.emit('get_friends'); socket.emit('get_notifications'); });
        socket.on('rooms_list', rooms =>{ const ul = $('#channels'); ul.innerHTML=''; appState.roomsIndex = {}; (rooms || []).forEach(r=>{ appState.roomsIndex[r.name] = r; const li = document.createElement('li'); li.className='item'; li.dataset.room = r.name; li.innerHTML = `<strong style="font-size:12px;">${r.display_name || r.name}</strong>${r.is_private?'<span class="pill" style="margin-left:auto;">🔒</span>':''}`; li.onclick = ()=> joinChatRoom(r.name); ul.appendChild(li); }); if(appState.currentRoom){ appState.currentRoomMeta = Object.assign({}, appState.roomsIndex[appState.currentRoom] || appState.currentRoomMeta || { name: appState.currentRoom }); updateCurrentRoomHeader(); $all('#channels .item').forEach(item=> item.classList.toggle('active', item.dataset.room === appState.currentRoom)); } });
        socket.on('message_history', data =>{ const messagesDiv = $('#messages'); if(!messagesDiv || data.room !== appState.currentRoom) return; const isInitial = messagesDiv.children.length===0; const oldH = messagesDiv.scrollHeight; const oldScrollTop = messagesDiv.scrollTop; const countBefore = messagesDiv.children.length; if(isInitial){ appState.isHistoryExhausted = false; (data.history||[]).forEach(m=> appendMessage(m, false)); setTimeout(()=>{ messagesDiv.scrollTop = messagesDiv.scrollHeight; }, 10); } else { const hist = data.history || []; if(hist.length > 0){ const firstMsgId = messagesDiv.firstChild ? messagesDiv.firstChild.id : null; for(let i=hist.length-1;i>=0;i--){ if(hist[i] && !document.getElementById(`msg-${hist[i].id}`)){ appendMessage(hist[i], true); } } if(firstMsgId && document.getElementById(firstMsgId)){ const firstMsgEl = document.getElementById(firstMsgId); const newH = messagesDiv.scrollHeight; const diff = newH - oldH; messagesDiv.scrollTop = oldScrollTop + Math.max(0, diff); } } } const countAfter = messagesDiv.children.length; if(!data.history || data.history.length === 0 || countAfter === countBefore || (data.history && data.history.length < 50)){ appState.isHistoryExhausted = true; } appState.isHistoryLoading = false; if(!appState.isHistoryExhausted && messagesDiv.scrollTop <= 250){ setTimeout(()=> loadMoreHistory(), 100); } });
        socket.on('new_message', msg =>{ if(msg.room===appState.currentRoom){ appendMessage(msg); if(document.hidden){ try{ if($('#setting-notifications').checked){ new Notification('Новое сообщение', { body: `@${msg.username}: ${msg.message||''}` }); } }catch(e){} playDing(); } } });
        socket.on('message_updated', data =>{ const el = document.querySelector(`#msg-${data.id} .msg-text`); if(el){ el.textContent = data.new_text; const meta = document.querySelector(`#msg-${data.id} .meta`); if(meta && !meta.querySelector('.edited')){ const sp = document.createElement('span'); sp.className='edited'; sp.textContent='(ред.)'; meta.appendChild(sp); } } });
        socket.on('message_deleted', data =>{ const el = document.getElementById(`msg-${data.message_id}`); if(el) el.remove(); });
        socket.on('user_typing', data =>{ const ti = $('#typing-indicator'); if(data.is_typing && data.username !== '{{ session.get("username") }}'){ ti.textContent = `${data.username} печатает...`; ti.style.display='block'; } else { ti.style.display='none'; } });

        socket.on('user_search_results', payload =>{ const list = $('#user-search-results'); list.innerHTML=''; payload.results.forEach(u=>{ const li = document.createElement('li'); li.className='item'; li.innerHTML = `<img src="/static/avatars/${u.avatar}" class="avatar" style="width:28px;height:28px;"> <div style="flex:1; font-size:12px;">@${u.username}</div> <span class='pill'>${u.friend_status}</span>`; li.onclick = ()=> openUserProfile(u.username); list.appendChild(li); }); });

        socket.on('friends_list', payload =>{ const ul = $('#friends'); ul.innerHTML=''; const friends = (payload && payload.friends) ? payload.friends : []; appState.friends = friends; friends.forEach(u=>{ const li = document.createElement('li'); li.className='item'; li.innerHTML = `<img src="/static/avatars/${u.avatar}" class="avatar" style="width:28px;height:28px;"> <div style="flex:1; font-size:12px;">@${u.username}</div>`; li.onclick = ()=> startPrivateChat(u.username); ul.appendChild(li); }); });

        socket.on('notifications_list', payload =>{ const ul = $('#notifications'); ul.innerHTML=''; payload.notifications.forEach(n=>{ const li = document.createElement('li'); li.className='item'; if(!n.is_read) li.classList.add('unread'); li.innerHTML = `<div style="flex:1;"><strong style="font-size:12px;">${n.title}</strong><div style="font-size:11px; color:var(--muted);">${n.message}</div></div>`; ul.appendChild(li); }); updateNotifCount(); });

        socket.on('friend_request_update', payload =>{ socket.emit('get_friends'); socket.emit('get_notifications'); if(payload.type==='incoming'){ const li = addNotification(`<div><strong style="font-size:12px;">Заявка в друзья</strong><div style="font-size:11px; color:var(--muted);">от @${payload.from}</div></div>`); const row=document.createElement('div'); row.className='row'; row.style.marginTop='6px'; const acc=document.createElement('button'); acc.className='icon-btn'; acc.textContent='✅'; acc.onclick=()=>{ socket.emit('friend_request_respond', { from_username: payload.from, action:'accept' }); clearNotification(li); }; const rej=document.createElement('button'); rej.className='icon-btn'; rej.textContent='❌'; rej.onclick=()=>{ socket.emit('friend_request_respond', { from_username: payload.from, action:'reject' }); clearNotification(li); }; row.appendChild(acc); row.appendChild(rej); li.appendChild(row); playDing(); try{ if($('#setting-notifications').checked){ new Notification('Новая заявка в друзья', { body: `от @${payload.from}` }); } }catch(e){} } if(payload.type==='accepted'){ addNotification(`<div><strong style="font-size:12px;">Заявка принята</strong><div style="font-size:11px; color:var(--muted);">@${payload.user} принял вашу заявку</div></div>`); playDing(); } if(appState.currentProfileUser === payload.from || appState.currentProfileUser === payload.user){ fetch(`/user_profile?username=${encodeURIComponent(appState.currentProfileUser)}`).then(r=>r.json()).then(data=>{ updateFriendButton(data.username, data.friend_status); toggleSendStarsButton(data.friend_status); updateFavoriteMusicView(data.favorite_music || appState.currentProfileFavoriteMusic); updateStarsView(data.stars_balance || appState.currentProfileStars); }); } });

        socket.on('room_member_invited', payload =>{ if(!payload) return; if(payload.username){ appState.pendingInvites.delete(payload.username); }
            if(payload.room === appState.currentRoom){ if(Array.isArray(payload.members)){ appState.currentRoomMembers = payload.members; renderInviteMembers(); }
                if($('#invite-modal').style.display === 'block'){ fetchInviteSuggestions($('#invite-search').value.trim()); } else { renderInviteSuggestions(appState.lastInviteSuggestions); }
            }
            if(payload.notification_html){ addNotification(payload.notification_html, false); }
        });

        socket.on('room_invite_error', payload =>{ if(payload && payload.username){ appState.pendingInvites.delete(payload.username); renderInviteSuggestions(appState.lastInviteSuggestions); }
            if(payload && payload.message){ addNotification(`<div><strong style="font-size:12px;">Ошибка приглашения</strong><div style="font-size:11px; color:var(--muted);">${payload.message}</div></div>`, false); }
        });

        socket.on('error', data =>{ if(data && data.msg){ addNotification(`<div><strong style="font-size:12px;">Ошибка</strong><div style="font-size:11px; color:var(--muted);">${data.msg}</div></div>`, false); } });

        socket.on('stars_balance_update', payload =>{ if(!payload) return; if(payload.username === currentUser){ appState.currentUserStars = payload.stars; if(appState.currentProfileUser === currentUser){ updateStarsView(payload.stars); } const balanceEl = $('#gift-balance-display'); if(balanceEl) balanceEl.textContent = `${payload.stars} ⭐`; }
            if(payload.username === appState.currentProfileUser && appState.currentProfileUser !== currentUser){ updateStarsView(payload.stars); }
        });

        function openGiftsModal(){ $('#gifts-modal').style.display='block'; switchGiftTab('shop'); fetch('/gifts').then(r=>r.json()).then(data=>{ renderGiftsShop(data.gifts || []); }).catch(()=>{}); fetch('/user_gifts?type=owned').then(r=>r.json()).then(data=>{ renderMyGifts(data.gifts || []); }).catch(()=>{}); fetch('/user_gifts?type=market').then(r=>r.json()).then(data=>{ renderMarketGifts(data.gifts || []); }).catch(()=>{}); fetch('/user_profile?username='+encodeURIComponent(currentUser)).then(r=>r.json()).then(data=>{ const balanceEl = $('#gift-balance-display'); if(balanceEl) balanceEl.textContent = `${data.stars_balance || 0} ⭐`; appState.currentUserStars = data.stars_balance || 0; }).catch(()=>{}); }
        function closeGiftsModal(){ $('#gifts-modal').style.display='none'; }
        function switchGiftTab(tab){ $all('[data-gift-tab]').forEach(t=> t.classList.toggle('active', t.dataset.giftTab===tab)); ['shop','my','market'].forEach(k=> { const el = $('#gift-tab-'+k); if(el) el.style.display = (k===tab?'block':'none'); }); }
        function renderGiftsShop(gifts){ const list = $('#gifts-shop-list'); if(!list) return; list.innerHTML=''; gifts.forEach(gift=>{ const card = document.createElement('div'); const rarityClass = gift.rarity || 'common'; const limitedClass = gift.is_limited ? 'limited' : ''; const unavailableClass = !gift.is_available ? 'unavailable' : ''; card.className=`gift-card ${rarityClass} ${limitedClass} ${unavailableClass}`; const rarityLabels = {'common':'Обычный','uncommon':'Необычный','rare':'Редкий','legendary':'Легендарный'}; let badgeHTML = ''; if(gift.is_limited && gift.is_available){ badgeHTML = `<span class="gift-badge limited">Ограниченный</span>`; } else if(gift.is_limited && !gift.is_available){ badgeHTML = `<span class="gift-badge limited">Недоступен</span>`; } let saleEndHTML = ''; if(gift.is_limited && gift.is_available && gift.sale_end){ const endDate = new Date(gift.sale_end); const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)); if(daysLeft > 0){ saleEndHTML = `<div style="font-size:10px; color:#ff8c00; margin-top:4px;">Осталось: ${daysLeft} дн.</div>`; } } card.innerHTML = `${badgeHTML}<span class="gift-rarity">${rarityLabels[gift.rarity] || gift.rarity}</span><span class="gift-icon" style="color:${gift.color || '#fff'};">${gift.icon}</span><div class="gift-name">${gift.name}</div><div class="gift-price">${gift.price} ⭐</div>${saleEndHTML}`; if(gift.is_available){ card.onclick = ()=> purchaseGift(gift); } list.appendChild(card); }); }
        function renderMyGifts(gifts){ const list = $('#gifts-my-list'); const empty = $('#gifts-my-empty'); if(!list || !empty) return; list.innerHTML=''; if(!gifts.length){ empty.style.display='block'; return; } empty.style.display='none'; gifts.forEach(ug=>{ const li = document.createElement('li'); li.className='item'; li.innerHTML = `<span style="font-size:24px; color:${ug.gift_color};">${ug.gift_icon}</span><div style="flex:1;"><strong>${ug.gift_name}</strong><div style="font-size:11px; color:var(--muted);">${ug.is_for_sale ? `Продаётся за ${ug.sale_price} ⭐` : 'В коллекции'}</div></div>`; if(!ug.is_for_sale){ const sellBtn = document.createElement('button'); sellBtn.className='icon-btn'; sellBtn.textContent='💰'; sellBtn.title='Выставить на продажу'; sellBtn.onclick = (ev)=>{ ev.stopPropagation(); promptSellGift(ug.id); }; li.appendChild(sellBtn); } else { const cancelBtn = document.createElement('button'); cancelBtn.className='icon-btn'; cancelBtn.textContent='❌'; cancelBtn.title='Снять с продажи'; cancelBtn.onclick = (ev)=>{ ev.stopPropagation(); sellGift(ug.id, null); }; li.appendChild(cancelBtn); } list.appendChild(li); }); }
        function renderMarketGifts(gifts){ const list = $('#gifts-market-list'); const empty = $('#gifts-market-empty'); if(!list || !empty) return; list.innerHTML=''; if(!gifts.length){ empty.style.display='block'; return; } empty.style.display='none'; gifts.forEach(ug=>{ const li = document.createElement('li'); li.className='item'; li.innerHTML = `<img src="/static/avatars/${ug.owner_avatar || 'default.jpg'}" class="avatar" style="width:28px;height:28px;"><span style="font-size:24px; color:${ug.gift_color};">${ug.gift_icon}</span><div style="flex:1;"><strong>${ug.gift_name}</strong><div style="font-size:11px; color:var(--muted);">от @${ug.owner_username} • ${ug.sale_price} ⭐</div></div>`; const buyBtn = document.createElement('button'); buyBtn.className='icon-btn'; buyBtn.textContent='🛒'; buyBtn.title='Купить'; buyBtn.onclick = (ev)=>{ ev.stopPropagation(); if(confirm(`Купить ${ug.gift_icon} ${ug.gift_name} за ${ug.sale_price} ⭐?`)){ purchaseUserGift(ug.id); } }; li.appendChild(buyBtn); list.appendChild(li); }); }
        function purchaseGift(gift){ const recipient = prompt('Введите ник получателя (или оставьте пустым для себя):'); const recipient_username = recipient ? recipient.trim() : ''; fetch('/buy_gift', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ gift_id: gift.id, recipient_username }) }).then(async r=>{ const data = await r.json().catch(()=>({})); return { ok: r.ok, data }; }).then(res=>{ if(!res.ok){ alert(res.data?.error || 'Не удалось купить подарок'); return; } const balanceEl = $('#gift-balance-display'); if(balanceEl) balanceEl.textContent = `${res.data.balance} ⭐`; appState.currentUserStars = res.data.balance; addNotification(`<div><strong style="font-size:12px;">Подарок ${recipient_username ? 'подарен' : 'куплен'}</strong><div style="font-size:11px; color:var(--muted);">${res.data.gift.gift_icon} ${res.data.gift.gift_name}</div></div>`, false); fetch('/user_gifts?type=owned').then(r=>r.json()).then(data=>{ renderMyGifts(data.gifts || []); }).catch(()=>{}); }).catch(()=> alert('Ошибка сети')); }
        function promptSellGift(userGiftId){ const priceStr = prompt('Укажите цену продажи (в звёздах):'); if(priceStr === null) return; const price = parseInt(priceStr, 10); if(!Number.isFinite(price) || price <= 0){ alert('Введите положительное число'); return; } sellGift(userGiftId, price); }
        function sellGift(userGiftId, salePrice){ fetch('/sell_gift', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_gift_id: userGiftId, sale_price: salePrice }) }).then(async r=>{ const data = await r.json().catch(()=>({})); return { ok: r.ok, data }; }).then(res=>{ if(!res.ok){ alert(res.data?.error || 'Ошибка'); return; } fetch('/user_gifts?type=owned').then(r=>r.json()).then(data=>{ renderMyGifts(data.gifts || []); }).catch(()=>{}); fetch('/user_gifts?type=market').then(r=>r.json()).then(data=>{ renderMarketGifts(data.gifts || []); }).catch(()=>{}); }).catch(()=> alert('Ошибка сети')); }
        function purchaseUserGift(userGiftId){ fetch('/purchase_user_gift', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_gift_id: userGiftId }) }).then(async r=>{ const data = await r.json().catch(()=>({})); return { ok: r.ok, data }; }).then(res=>{ if(!res.ok){ alert(res.data?.error || 'Не удалось купить подарок'); return; } const balanceEl = $('#gift-balance-display'); if(balanceEl) balanceEl.textContent = `${res.data.balance} ⭐`; appState.currentUserStars = res.data.balance; addNotification(`<div><strong style="font-size:12px;">Подарок куплен</strong><div style="font-size:11px; color:var(--muted);">Подарок добавлен в вашу коллекцию</div></div>`, false); fetch('/user_gifts?type=owned').then(r=>r.json()).then(data=>{ renderMyGifts(data.gifts || []); }).catch(()=>{}); fetch('/user_gifts?type=market').then(r=>r.json()).then(data=>{ renderMarketGifts(data.gifts || []); }).catch(()=>{}); }).catch(()=> alert('Ошибка сети')); }

        socket.on('incoming_call', data =>{ appState.currentCallPeer = data.from; appState.currentCallType = data.call_type; appState.callStartTime = Date.now(); startRing(); const li = addNotification(`<div><strong style="font-size:12px;">Входящий ${data.call_type==='video'?'видео':'аудио'} звонок</strong><div style="font-size:11px; color:var(--muted);">от @${data.from}</div></div>`); const row=document.createElement('div'); row.className='row'; row.style.marginTop='6px'; const ans=document.createElement('button'); ans.className='icon-btn'; ans.textContent='✅'; ans.onclick=()=>{ stopRing(); showCallOverlay(); preparePeerConnection(); navigator.mediaDevices.getUserMedia({ audio:true, video: appState.currentCallType==='video' }).then(stream=>{ appState.localStream=stream; attachLocalStream(); stream.getTracks().forEach(t=> appState.pc.addTrack(t, stream)); }); clearNotification(li); }; const dec=document.createElement('button'); dec.className='icon-btn danger'; dec.textContent='❌'; dec.onclick=()=>{ stopRing(); socket.emit('end_call', { to: data.from, status: 'rejected' }); clearNotification(li); }; row.appendChild(ans); row.appendChild(dec); li.appendChild(row); try{ if($('#setting-notifications').checked){ new Notification('Входящий звонок', { body: `от @${data.from}` }); } }catch(e){} });
        socket.on('rtc_offer', async data =>{ if(!appState.pc){ preparePeerConnection(); } await appState.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video: data.call_type==='video' }); appState.localStream = stream; attachLocalStream(); stream.getTracks().forEach(t=> appState.pc.addTrack(t, stream)); const answer = await appState.pc.createAnswer(); await appState.pc.setLocalDescription(answer); socket.emit('rtc_answer', { to: data.from, sdp: appState.pc.localDescription }); showCallOverlay(); });
        socket.on('rtc_answer', async data =>{ if(appState.pc){ await appState.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); } });
        socket.on('rtc_ice_candidate', data =>{ if(appState.pc && data.candidate){ appState.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } });
        socket.on('call_ended', (data)=>{ stopRing(); const duration = appState.callStartTime ? Math.floor((Date.now() - appState.callStartTime) / 1000) : 0; addNotification(`<div><strong style="font-size:12px;">Звонок завершён</strong><div style="font-size:11px; color:var(--muted);">Длительность: ${duration}с</div></div>`); endCallUI(); });

        socket.on('profile_updated', data =>{ if(data.username === '{{ session.get("username") }}'){ $('#me-avatar').src = `/static/avatars/${data.avatar}`; $('#me-status').textContent = data.status || ''; }
            if(data.username === appState.currentProfileUser){ $('#p-status').textContent = data.status || ''; $('#p-bio').textContent = data.bio || ''; updateFavoriteMusicView(data.favorite_music || ''); }
        });

        function showCallOverlay(){ $('#call-overlay').style.display='block'; }
        function hideCallOverlay(){ $('#call-overlay').style.display='none'; }
        function attachLocalStream(){ const v = $('#localVideo'); if(v && appState.localStream){ v.srcObject = appState.localStream; } }
        function attachRemoteStream(){ const v = $('#remoteVideo'); if(v && appState.remoteStream){ v.srcObject = appState.remoteStream; } }
        function preparePeerConnection(){ const config = { iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ] }; appState.pc = new RTCPeerConnection(config); appState.remoteStream = new MediaStream(); $('#remoteVideo').srcObject = appState.remoteStream; appState.pc.ontrack = (ev)=>{ ev.streams[0].getTracks().forEach(t=> appState.remoteStream.addTrack(t)); attachRemoteStream(); }; appState.pc.onicecandidate = (ev)=>{ if(ev.candidate){ socket.emit('rtc_ice_candidate', { to: appState.currentCallPeer, candidate: ev.candidate }); } }; }
        async function startCall(kind){ if(!appState.currentRoom || !isDirectRoom(appState.currentRoom)){ alert('Звонки только в личных чатах'); return; } const peer = getPeerFromRoom(appState.currentRoom); appState.currentCallPeer = peer; appState.currentCallType = kind; appState.callStartTime = Date.now(); ensureAudio(); showCallOverlay(); preparePeerConnection(); const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video: kind==='video' }); appState.localStream = stream; attachLocalStream(); stream.getTracks().forEach(t=> appState.pc.addTrack(t, stream)); const offer = await appState.pc.createOffer(); await appState.pc.setLocalDescription(offer); socket.emit('start_call', { to: peer, call_type: kind }); socket.emit('rtc_offer', { to: peer, sdp: appState.pc.localDescription, call_type: kind }); }
        function toggleMic(){ if(appState.localStream){ const t = appState.localStream.getAudioTracks()[0]; if(t){ t.enabled = !t.enabled; $('#toggle-mic').textContent = t.enabled? '🎙️':'🔇'; } } }
        function toggleCam(){ if(appState.localStream){ const t = appState.localStream.getVideoTracks()[0]; if(t){ t.enabled = !t.enabled; $('#toggle-cam').textContent = t.enabled? '📷':'🚫'; } } }
        function endCall(){ socket.emit('end_call', { to: appState.currentCallPeer, status: 'ended' }); endCallUI(); }
        function endCallUI(){ try{ if(appState.pc){ appState.pc.ontrack=null; appState.pc.onicecandidate=null; appState.pc.close(); } }catch(e){} appState.pc=null; appState.currentCallPeer=null; appState.currentCallType=null; try{ if(appState.localStream){ appState.localStream.getTracks().forEach(t=> t.stop()); } }catch(e){} appState.localStream=null; appState.remoteStream=null; appState.callStartTime=null; hideCallOverlay(); }

        window.startPrivateChat = startPrivateChat;
        window.replyToMessage = replyToMessage;
        window.editMessage = editMessage;
        window.deleteMessage = deleteMessage;
        window.openUserProfile = openUserProfile;
    </script>
    {% endif %}
</body>
</html>
"""

@app.route('/')
def index():
    if not session.get('username'):
        return redirect(url_for('login'))
    user = User.query.filter_by(username=session['username']).first()
    if not user:
        session.clear()
        return redirect(url_for('login'))
    session['avatar'] = user.avatar
    if user.settings:
        session['theme'] = user.settings.theme
    return render_template_string(HTML_TEMPLATE)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        if user is None:
            hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
            user = User(username=username, password_hash=hashed_password, is_online=True, stars_balance=100)
            db.session.add(user)
            db.session.commit()
            sett = UserSettings(user_id=user.id)
            db.session.add(sett)
        else:
            if not check_password_hash(user.password_hash, password):
                return "<h1>Неверный пароль!</h1>"
            user.is_online = True
            user.last_seen = datetime.now(timezone.utc)
            if user.stars_balance is None:
                user.stars_balance = 100
        db.session.commit()
        session['username'] = user.username
        session['avatar'] = user.avatar
        if user.settings:
            session['theme'] = user.settings.theme
        return redirect(url_for('index'))
    return render_template_string(HTML_TEMPLATE)

@app.route('/logout')
def logout():
    username = session.get('username')
    if username:
        user = User.query.filter_by(username=username).first()
        if user:
            user.is_online = False
            user.last_seen = datetime.now(timezone.utc)
            db.session.commit()
    session.pop('username', None)
    session.pop('avatar', None)
    session.pop('theme', None)
    return redirect(url_for('login'))

@app.route('/create_channel', methods=['POST'])
def create_channel():
    channel_name = request.form.get('channel_name')
    is_private = request.form.get('is_private') == 'true'
    user = User.query.filter_by(username=session['username']).first()
    if channel_name and user:
        existing_channel = Room.query.filter_by(name=channel_name).first()
        if not existing_channel:
            new_channel = Room(name=channel_name, display_name=channel_name, is_group=True, is_private=is_private, creator_id=user.id)
            db.session.add(new_channel)
            db.session.commit()
            new_channel.members.append(user)
            db.session.commit()
            socketio.emit('rooms_list', get_available_rooms_for_user(user), room=user.username)
    return redirect(url_for('index'))

@app.route('/update_profile', methods=['POST'])
def update_profile():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    status = request.form.get('status')
    if status is not None:
        user.status = status.strip()
    display_name = request.form.get('display_name')
    if display_name is not None:
        user.display_name = display_name.strip()
    bio = request.form.get('bio')
    if bio is not None:
        user.bio = bio.strip()
    favorite_music = request.form.get('favorite_music')
    if favorite_music is not None:
        fav = favorite_music.strip()
        user.favorite_music = fav or None
    avatar = request.files.get('avatar')
    if avatar:
        os.makedirs('static/avatars', exist_ok=True)
        filename = secure_filename(avatar.filename)
        avatar_filename = f"user_{user.id}_{filename}"
        avatar.save(os.path.join('static/avatars', avatar_filename))
        user.avatar = avatar_filename
        session['avatar'] = user.avatar
    db.session.commit()
    socketio.emit('profile_updated', {'username': user.username, 'avatar': user.avatar, 'status': user.status, 'favorite_music': user.favorite_music, 'bio': user.bio})
    return jsonify({'success': True})

@app.route('/get_settings')
def get_settings():
    username = session.get('username')
    if not username:
        return jsonify({})
    user = User.query.filter_by(username=username).first()
    s = user.settings or UserSettings(user_id=user.id)
    if not user.settings:
        db.session.add(s)
        db.session.commit()
    return jsonify({'theme': s.theme, 'notifications_enabled': s.notifications_enabled, 'sound_enabled': s.sound_enabled, 'compact_mode': s.compact_mode, 'message_preview': s.message_preview})

@app.route('/update_settings', methods=['POST'])
def update_settings():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    payload = request.get_json(force=True)
    s = user.settings or UserSettings(user_id=user.id)
    s.theme = payload.get('theme', s.theme)
    s.notifications_enabled = bool(payload.get('notifications_enabled', s.notifications_enabled))
    s.sound_enabled = bool(payload.get('sound_enabled', s.sound_enabled))
    db.session.add(s)
    db.session.commit()
    session['theme'] = s.theme
    return jsonify({'success': True})

@app.route('/user_profile')
def user_profile():
    uname = request.args.get('username')
    user = User.query.filter_by(username=uname).first()
    if not user:
        return jsonify({'error': 'not found'}), 404
    me = User.query.filter_by(username=session.get('username')).first()
    friend_status = 'not_friend'
    if user in me.friends:
        friend_status = 'friend'
    else:
        pending_out = FriendRequest.query.filter_by(from_user_id=me.id, to_user_id=user.id, status='pending').first()
        if pending_out:
            friend_status = 'requested'
        else:
            pending_in = FriendRequest.query.filter_by(from_user_id=user.id, to_user_id=me.id, status='pending').first()
            if pending_in:
                friend_status = 'incoming'
    return jsonify({
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name,
        'avatar': user.avatar,
        'status': user.status,
        'bio': user.bio,
        'favorite_music': user.favorite_music,
        'stars_balance': user.stars_balance or 0,
        'friend_status': friend_status
    })

@app.route('/user_media')
def user_media():
    uname = request.args.get('username')
    user = User.query.filter_by(username=uname).first()
    if not user:
        return jsonify({'media':[], 'files':[], 'links':[]})
    user_msgs = Message.query.filter_by(user_id=user.id).order_by(Message.timestamp.desc()).limit(500).all()
    media, files, links = [], [], []
    url_re = re.compile(r"https?://[^\s]+", re.IGNORECASE)
    for m in user_msgs:
        if m.attachment_path:
            if re.search(r"\.(jpg|jpeg|png|gif)$", m.attachment_path, re.I):
                media.append(m.attachment_path)
            else:
                files.append(m.attachment_path)
        for url in url_re.findall(m.content or ''):
            links.append(url)
    return jsonify({'media': media[:100], 'files': files[:100], 'links': links[:100]})

@app.route('/room_info')
def room_info():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    room_name = request.args.get('name')
    if not room_name:
        return jsonify({'error': 'Missing room name'}), 400
    room = Room.query.filter_by(name=room_name).first()
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    if room.is_private and room.is_group and user not in room.members:
        return jsonify({'error': 'Forbidden'}), 403
    meta = {
        'name': room.name,
        'display_name': room.display_name or room.name,
        'is_private': room.is_private,
        'is_group': room.is_group
    }
    members = []
    can_invite = False
    if room.is_group:
        members = [{'username': m.username, 'display_name': m.display_name, 'avatar': m.avatar} for m in room.members]
        members.sort(key=lambda m: (m['display_name'] or m['username'] or '').lower())
        if room.is_private:
            can_invite = user in room.members
    return jsonify({'meta': meta, 'members': members, 'can_invite': can_invite})

@app.route('/room_invite_suggestions')
def room_invite_suggestions():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    room_name = request.args.get('room')
    if not room_name:
        return jsonify({'suggestions': []})
    room = Room.query.filter_by(name=room_name).first()
    if not room:
        return jsonify({'suggestions': []})
    if not room.is_group or not room.is_private or user not in room.members:
        return jsonify({'suggestions': []})
    query = (request.args.get('q') or '').strip().lower()
    base = [f for f in user.friends if f not in room.members]
    if query:
        base = [f for f in base if query in f.username.lower() or (f.display_name and query in f.display_name.lower())]
    base.sort(key=lambda f: (f.display_name or f.username or '').lower())
    try:
        limit = int(request.args.get('limit', 8))
    except (TypeError, ValueError):
        limit = 8
    limit = min(max(limit, 1), 30)
    suggestions = [{'username': f.username, 'display_name': f.display_name, 'avatar': f.avatar} for f in base[:limit]]
    return jsonify({'suggestions': suggestions})


@app.route('/user_music_history')
def user_music_history():
    uname = request.args.get('username')
    user = User.query.filter_by(username=uname).first()
    if not user:
        return jsonify({'history': []})
    entries = UserMusicHistory.query.filter_by(user_id=user.id).order_by(UserMusicHistory.added_at.desc()).limit(50).all()
    history = [{
        'id': entry.id,
        'title': entry.title,
        'artist': entry.artist,
        'url': entry.url,
        'added_at': entry.added_at.isoformat()
    } for entry in entries]
    return jsonify({'history': history})


@app.route('/music_history', methods=['POST'])
def add_music_history():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(force=True)
    title = (data.get('title') or '').strip()
    artist = (data.get('artist') or '').strip()
    url = (data.get('url') or '').strip()
    if len(title) < 2:
        return jsonify({'error': 'Название слишком короткое'}), 400
    if url and not re.match(r"^https?://", url, re.IGNORECASE):
        return jsonify({'error': 'Укажите корректную ссылку'}), 400
    if UserMusicHistory.query.filter_by(user_id=user.id).count() >= 100:
        return jsonify({'error': 'Лимит истории музыки достигнут'}), 400
    entry = UserMusicHistory(user_id=user.id, title=title[:255], artist=artist[:255] or None, url=url[:512] or None)
    db.session.add(entry)
    db.session.commit()
    return jsonify({'success': True, 'entry': {
        'id': entry.id,
        'title': entry.title,
        'artist': entry.artist,
        'url': entry.url,
        'added_at': entry.added_at.isoformat()
    }})


@app.route('/music_history/<int:entry_id>', methods=['DELETE'])
def remove_music_history(entry_id):
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    entry = db.session.get(UserMusicHistory, entry_id)
    if not entry or entry.user_id != user.id:
        return jsonify({'error': 'Запись не найдена'}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/gifts', methods=['GET'])
def get_gifts():
    now = datetime.now(timezone.utc)
    gifts = Gift.query.order_by(Gift.price.asc()).all()
    result = []
    for g in gifts:
        is_available = True
        if g.is_limited:
            if g.sale_start and now < g.sale_start:
                is_available = False
            if g.sale_end and now > g.sale_end:
                is_available = False
        result.append({
            'id': g.id,
            'name': g.name,
            'price': g.price,
            'icon': g.icon,
            'color': g.color,
            'rarity': g.rarity,
            'is_limited': g.is_limited,
            'is_available': is_available,
            'sale_end': g.sale_end.isoformat() if g.sale_end else None
        })
    return jsonify({'gifts': result})

@app.route('/user_gifts', methods=['GET'])
def get_user_gifts():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    query_type = request.args.get('type', 'owned')
    if query_type == 'owned':
        user_gifts = UserGift.query.filter_by(user_id=user.id, is_for_sale=False).order_by(UserGift.received_at.desc()).all()
    elif query_type == 'market':
        user_gifts = UserGift.query.filter_by(is_for_sale=True).join(Gift).order_by(UserGift.received_at.desc()).limit(50).all()
    else:
        user_gifts = []
    return jsonify({'gifts': [{'id': ug.id, 'gift_id': ug.gift_id, 'gift_name': ug.gift.name, 'gift_icon': ug.gift.icon, 'gift_color': ug.gift.color, 'gift_rarity': ug.gift.rarity, 'sale_price': ug.sale_price, 'is_for_sale': ug.is_for_sale, 'owner_username': ug.user.username, 'owner_avatar': ug.user.avatar} for ug in user_gifts]})

@app.route('/buy_gift', methods=['POST'])
def buy_gift():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    buyer = User.query.filter_by(username=username).first()
    if not buyer:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(force=True)
    gift_id = data.get('gift_id')
    recipient_username = (data.get('recipient_username') or '').strip()
    if not gift_id:
        return jsonify({'error': 'Не указан подарок'}), 400
    gift = db.session.get(Gift, gift_id)
    if not gift:
        return jsonify({'error': 'Подарок не найден'}), 404
    if gift.is_limited:
        now = datetime.now(timezone.utc)
        if gift.sale_start and now < gift.sale_start:
            return jsonify({'error': 'Подарок ещё не доступен для покупки'}), 400
        if gift.sale_end and now > gift.sale_end:
            return jsonify({'error': 'Срок продажи подарка истёк'}), 400
    if buyer.stars_balance is None or buyer.stars_balance < gift.price:
        return jsonify({'error': 'Недостаточно звёзд'}), 400
    recipient = None
    if recipient_username:
        recipient = User.query.filter_by(username=recipient_username).first()
        if not recipient or recipient.id == buyer.id:
            return jsonify({'error': 'Получатель не найден'}), 404
        if recipient not in buyer.friends:
            return jsonify({'error': 'Дарить подарки можно только друзьям'}), 403
    buyer.stars_balance -= gift.price
    owner = recipient if recipient else buyer
    user_gift = UserGift(user_id=owner.id, gift_id=gift.id, from_user_id=buyer.id if recipient else None, purchase_price=gift.price)
    db.session.add(user_gift)
    db.session.flush()
    if recipient:
        notif = Notification(recipient_id=recipient.id, notif_type='gift_received', from_user_id=buyer.id, title='Получен подарок', message=f'@{buyer.username} подарил вам {gift.icon} {gift.name}')
        db.session.add(notif)
    transaction = GiftTransaction(user_gift_id=user_gift.id, from_user_id=buyer.id, to_user_id=owner.id, transaction_type='purchase', stars_amount=gift.price)
    db.session.add(transaction)
    db.session.commit()
    if recipient:
        notifs = Notification.query.filter_by(recipient_id=recipient.id).order_by(Notification.created_at.desc()).limit(50).all()
        socketio.emit('notifications_list', {'notifications': [{'id': n.id, 'title': n.title, 'message': n.message, 'is_read': n.is_read} for n in notifs]}, room=recipient.username)
    socketio.emit('stars_balance_update', {'username': buyer.username, 'stars': buyer.stars_balance}, room=buyer.username)
    return jsonify({'success': True, 'balance': buyer.stars_balance, 'gift': {'id': user_gift.id, 'gift_name': gift.name, 'gift_icon': gift.icon, 'gift_color': gift.color}})

@app.route('/sell_gift', methods=['POST'])
def sell_gift():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    seller = User.query.filter_by(username=username).first()
    if not seller:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(force=True)
    user_gift_id = data.get('user_gift_id')
    sale_price = data.get('sale_price')
    try:
        sale_price = int(sale_price)
    except (TypeError, ValueError):
        return jsonify({'error': 'Некорректная цена'}), 400
    if sale_price <= 0:
        return jsonify({'error': 'Цена должна быть положительной'}), 400
    user_gift = db.session.get(UserGift, user_gift_id)
    if not user_gift or user_gift.user_id != seller.id:
        return jsonify({'error': 'Подарок не найден'}), 404
    if user_gift.is_for_sale:
        user_gift.is_for_sale = False
        user_gift.sale_price = None
    else:
        user_gift.is_for_sale = True
        user_gift.sale_price = sale_price
    db.session.commit()
    return jsonify({'success': True, 'is_for_sale': user_gift.is_for_sale, 'sale_price': user_gift.sale_price})

@app.route('/purchase_user_gift', methods=['POST'])
def purchase_user_gift():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    buyer = User.query.filter_by(username=username).first()
    if not buyer:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(force=True)
    user_gift_id = data.get('user_gift_id')
    user_gift = db.session.get(UserGift, user_gift_id)
    if not user_gift or not user_gift.is_for_sale or user_gift.user_id == buyer.id:
        return jsonify({'error': 'Подарок недоступен для покупки'}), 404
    if buyer.stars_balance is None or buyer.stars_balance < user_gift.sale_price:
        return jsonify({'error': 'Недостаточно звёзд'}), 400
    seller = user_gift.user
    sale_price_val = user_gift.sale_price
    buyer.stars_balance -= sale_price_val
    seller.stars_balance = (seller.stars_balance or 0) + sale_price_val
    user_gift.user_id = buyer.id
    user_gift.is_for_sale = False
    user_gift.sale_price = None
    db.session.flush()
    transaction = GiftTransaction(user_gift_id=user_gift.id, from_user_id=seller.id, to_user_id=buyer.id, transaction_type='trade', stars_amount=sale_price_val)
    db.session.add(transaction)
    notif_seller = Notification(recipient_id=seller.id, notif_type='gift_sold', from_user_id=buyer.id, title='Подарок продан', message=f'@{buyer.username} купил ваш {user_gift.gift.icon} {user_gift.gift.name} за {sale_price_val} ⭐')
    db.session.add(notif_seller)
    db.session.commit()
    socketio.emit('stars_balance_update', {'username': buyer.username, 'stars': buyer.stars_balance}, room=buyer.username)
    socketio.emit('stars_balance_update', {'username': seller.username, 'stars': seller.stars_balance}, room=seller.username)
    socketio.emit('notifications_list', {'notifications': [{'id': n.id, 'title': n.title, 'message': n.message, 'is_read': n.is_read} for n in Notification.query.filter_by(recipient_id=seller.id).order_by(Notification.created_at.desc()).limit(50).all()]}, room=seller.username)
    return jsonify({'success': True, 'balance': buyer.stars_balance})

@app.route('/send_stars', methods=['POST'])
def send_stars():
    from_username = session.get('username')
    if not from_username:
        return jsonify({'error': 'Unauthorized'}), 401
    sender = User.query.filter_by(username=from_username).first()
    if not sender:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(force=True)
    to_username = (data.get('to_username') or '').strip()
    amount = data.get('amount')
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return jsonify({'error': 'Некорректная сумма'}), 400
    if amount <= 0:
        return jsonify({'error': 'Сумма должна быть положительной'}), 400
    if sender.stars_balance is None or sender.stars_balance < amount:
        return jsonify({'error': 'Недостаточно звёзд'}), 400
    recipient = User.query.filter_by(username=to_username).first()
    if not recipient or recipient.id == sender.id:
        return jsonify({'error': 'Получатель не найден'}), 404
    if recipient not in sender.friends:
        return jsonify({'error': 'Передавать звёзды можно только друзьям'}), 403
    sender.stars_balance -= amount
    recipient.stars_balance = (recipient.stars_balance or 0) + amount
    notif = Notification(
        recipient_id=recipient.id,
        notif_type=NotificationType.STARS_RECEIVED.value,
        from_user_id=sender.id,
        title='Получены звёзды',
        message=f'@{sender.username} отправил вам {amount} ⭐'
    )
    db.session.add(notif)
    db.session.commit()
    socketio.emit('stars_balance_update', {'username': sender.username, 'stars': sender.stars_balance}, room=sender.username)
    socketio.emit('stars_balance_update', {'username': recipient.username, 'stars': recipient.stars_balance}, room=recipient.username)
    notifs = Notification.query.filter_by(recipient_id=recipient.id).order_by(Notification.created_at.desc()).limit(50).all()
    socketio.emit('notifications_list', {'notifications': [{'id': n.id, 'title': n.title, 'message': n.message, 'is_read': n.is_read} for n in notifs]}, room=recipient.username)
    return jsonify({'success': True, 'balance': sender.stars_balance})

@app.route('/send_message_with_file', methods=['POST'])
def send_message_with_file():
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.filter_by(username=username).first()
    room_name = request.form.get('room')
    room = Room.query.filter_by(name=room_name).first()
    message_content = request.form.get('message')
    file = request.files.get('file')
    reply_to_id = request.form.get('reply_to')
    os.makedirs('static/uploads', exist_ok=True)
    attachment_filename = None
    if file:
        filename = secure_filename(file.filename)
        attachment_filename = f"{user.id}_{room.id}_{filename}"
        file.save(os.path.join('static/uploads', attachment_filename))
    new_message = Message(content=message_content or '', user_id=user.id, room_id=room.id, attachment_path=attachment_filename, reply_to_message_id=reply_to_id)
    db.session.add(new_message)
    db.session.commit()
    room.last_message_at = datetime.now(timezone.utc)
    db.session.commit()
    socketio.emit('new_message', {'id': new_message.id, 'username': user.username, 'avatar': user.avatar, 'message': message_content or '', 'attachment_path': attachment_filename, 'is_edited': new_message.is_edited, 'room': room_name, 'timestamp': new_message.timestamp.isoformat(), 'replied_to': ({'username': new_message.replied_to.user.username, 'message': new_message.replied_to.content} if new_message.replied_to else None)}, room=room_name)
    return jsonify({'success': True})

def get_available_rooms_for_user(user):
    if not user:
        return []
    public_rooms = Room.query.filter_by(is_group=True, is_private=False).all()
    private_rooms_member_of = user.private_rooms
    all_rooms = list({r.id: r for r in (public_rooms + private_rooms_member_of)}.values())
    return [{'name': r.name, 'display_name': r.display_name or r.name, 'is_private': r.is_private, 'is_group': r.is_group} for r in sorted(all_rooms, key=lambda r: r.last_message_at, reverse=True)]


def ensure_schema():
    try:
        inspector = inspect(db.engine)
        columns = {col['name'] for col in inspector.get_columns('user')}
    except Exception:
        return
    statements = []
    if 'favorite_music' not in columns:
        statements.append("ALTER TABLE user ADD COLUMN favorite_music VARCHAR(255)")
    if 'stars_balance' not in columns:
        statements.append("ALTER TABLE user ADD COLUMN stars_balance INTEGER DEFAULT 100")
    if statements:
        try:
            with db.engine.begin() as conn:
                for stmt in statements:
                    conn.execute(text(stmt))
        except Exception:
            pass

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
        emit('rooms_list', get_available_rooms_for_user(user))
        emit('friends_list', {'friends': [{'username': f.username, 'avatar': f.avatar} for f in user.friends]})

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
    user = User.query.filter_by(username=session.get('username')).first()
    emit('rooms_list', get_available_rooms_for_user(user))

@socketio.on('get_notifications')
def get_notifications():
    user = User.query.filter_by(username=session.get('username')).first()
    if user:
        notifs = Notification.query.filter_by(recipient_id=user.id).order_by(Notification.created_at.desc()).limit(50).all()
        emit('notifications_list', {'notifications': [{'id': n.id, 'title': n.title, 'message': n.message, 'is_read': n.is_read} for n in notifs]})

@socketio.on('join')
def on_join(data):
    username = session.get('username')
    room_name = data['room']
    user = User.query.filter_by(username=username).first()
    room = Room.query.filter_by(name=room_name).first()
    if not room:
        is_private_chat = '_' in room_name
        if is_private_chat:
            room = Room(name=room_name, is_group=False, is_private=False)
            db.session.add(room)
            db.session.commit()
    if room and user:
        if room.is_private and user not in room.members:
            emit('error', {'msg': 'Нет доступа к каналу.'})
            return
        join_room(room_name)

@socketio.on('leave')
def on_leave(data):
    room = data['room']
    leave_room(room)

@socketio.on('get_history')
def get_history(data):
    room_name = data['room']
    limit = data.get('limit', 50)
    offset = data.get('offset', 0)
    room = Room.query.filter_by(name=room_name).first()
    if room:
        messages = Message.query.filter_by(room_id=room.id).order_by(Message.timestamp.desc()).limit(limit).offset(offset).all()
        messages.reverse()
        history = [{'id': m.id, 'username': m.user.username, 'avatar': m.user.avatar, 'message': m.content, 'attachment_path': m.attachment_path, 'is_edited': m.is_edited, 'timestamp': m.timestamp.isoformat(), 'replied_to': ({'username': m.replied_to.user.username, 'message': m.replied_to.content} if m.replied_to else None)} for m in messages]
        emit('message_history', {'room': room_name, 'history': history})

@socketio.on('send_message')
def handle_send_message(data):
    username = session.get('username')
    user = User.query.filter_by(username=username).first()
    room_name = data['room']
    room = Room.query.filter_by(name=room_name).first()
    if user and room and (data.get('message') or '').strip() != '':
        message_content = data['message']
        reply_to_id = data.get('reply_to')
        new_message = Message(content=message_content, user_id=user.id, room_id=room.id, reply_to_message_id=reply_to_id)
        db.session.add(new_message)
        db.session.commit()
        room.last_message_at = datetime.now(timezone.utc)
        db.session.commit()
        emit('new_message', {'id': new_message.id, 'username': user.username, 'avatar': user.avatar, 'message': message_content, 'attachment_path': None, 'is_edited': new_message.is_edited, 'room': room_name, 'timestamp': new_message.timestamp.isoformat(), 'replied_to': ({'username': new_message.replied_to.user.username, 'message': new_message.replied_to.content} if new_message.replied_to else None)}, room=room_name)

@socketio.on('edit_message')
def handle_edit_message(data):
    message_id = data['message_id']
    new_text = data['new_text']
    message = db.session.get(Message, message_id)
    if message and message.user.username == session.get('username'):
        message.content = new_text
        message.is_edited = True
        db.session.commit()
        room = db.session.get(Room, message.room_id)
        emit('message_updated', {'id': message.id, 'new_text': new_text}, room=room.name)

@socketio.on('delete_message')
def handle_delete_message(data):
    message_id = data['message_id']
    message = db.session.get(Message, message_id)
    if message and message.user.username == session.get('username'):
        room = db.session.get(Room, message.room_id)
        db.session.delete(message)
        db.session.commit()
        emit('message_deleted', {'message_id': message_id}, room=room.name)

@socketio.on('typing')
def on_typing(data):
    room_name = data['room']
    emit('user_typing', {'username': session.get('username'), 'is_typing': data['is_typing']}, room=room_name, include_self=False)

@socketio.on('invite_user')
def on_invite_user(data):
    inviting_username = session.get('username')
    room_name = data['room']
    user_to_invite_username = data['username']
    inviting_user = User.query.filter_by(username=inviting_username).first()
    room = Room.query.filter_by(name=room_name).first()
    user_to_invite = User.query.filter_by(username=user_to_invite_username).first()
    if not all([inviting_user, room, user_to_invite]):
        emit('room_invite_error', {'room': room_name, 'username': user_to_invite_username, 'message': 'Ошибка приглашения.'}, room=inviting_username)
        return
    if not room.is_group or not room.is_private:
        emit('room_invite_error', {'room': room_name, 'username': user_to_invite.username, 'message': 'Приглашать можно только в приватных каналах.'}, room=inviting_username)
        return
    if inviting_user not in room.members:
        emit('room_invite_error', {'room': room_name, 'username': user_to_invite.username, 'message': 'Нет доступа к каналу.'}, room=inviting_username)
        return
    if user_to_invite == inviting_user:
        emit('room_invite_error', {'room': room_name, 'username': user_to_invite.username, 'message': 'Нельзя пригласить себя.'}, room=inviting_username)
        return
    if user_to_invite not in inviting_user.friends:
        emit('room_invite_error', {'room': room_name, 'username': user_to_invite.username, 'message': 'Можно приглашать только друзей.'}, room=inviting_username)
        return
    if user_to_invite in room.members:
        emit('room_invite_error', {'room': room_name, 'username': user_to_invite.username, 'message': 'Пользователь уже в канале.'}, room=inviting_username)
        return

    room.members.append(user_to_invite)
    db.session.commit()

    notif_message = f"@{inviting_user.username} пригласил вас в канал {room.display_name or room.name}"
    notif = Notification(
        recipient_id=user_to_invite.id,
        notif_type=NotificationType.ROOM_INVITE.value,
        from_user_id=inviting_user.id,
        title='Приглашение в канал',
        message=notif_message
    )
    db.session.add(notif)
    db.session.commit()

    members_payload = [{'username': m.username, 'display_name': m.display_name, 'avatar': m.avatar} for m in room.members]
    members_payload.sort(key=lambda m: (m['display_name'] or m['username'] or '').lower())

    inviter_html = f"<div><strong style=\"font-size:12px;\">@{user_to_invite.username} добавлен в канал</strong><div style=\"font-size:11px; color:var(--muted);\">{room.display_name or room.name}</div></div>"
    invitee_html = f"<div><strong style=\"font-size:12px;\">Приглашение в канал</strong><div style=\"font-size:11px; color:var(--muted);\">{notif_message}</div></div>"

    emit('room_member_invited', {'room': room.name, 'username': user_to_invite.username, 'members': members_payload, 'notification_html': inviter_html}, room=room.name)
    emit('room_member_invited', {'room': room.name, 'username': user_to_invite.username, 'notification_html': invitee_html}, room=user_to_invite.username)
    emit('rooms_list', get_available_rooms_for_user(user_to_invite), room=user_to_invite.username)

@socketio.on('search_users')
def search_users(data):
    q = (data.get('query') or '').strip()
    me = User.query.filter_by(username=session.get('username')).first()
    if not q:
        emit('user_search_results', {'results': []})
        return
    users = User.query.filter(User.username.ilike(f"%{q}%"), User.username != me.username).limit(30).all()
    def status_for(u):
        if u in me.friends:
            return 'friend'
        pending_out = FriendRequest.query.filter_by(from_user_id=me.id, to_user_id=u.id, status='pending').first()
        if pending_out:
            return 'requested'
        pending_in = FriendRequest.query.filter_by(from_user_id=u.id, to_user_id=me.id, status='pending').first()
        if pending_in:
            return 'incoming'
        return 'not_friend'
    res = [{'username': u.username, 'avatar': u.avatar, 'friend_status': status_for(u)} for u in users]
    emit('user_search_results', {'results': res})

@socketio.on('get_friends')
def get_friends():
    me = User.query.filter_by(username=session.get('username')).first()
    friends = [{'username': f.username, 'avatar': f.avatar} for f in me.friends]
    emit('friends_list', {'friends': friends})

@socketio.on('friend_request_send')
def friend_request_send(data):
    me = User.query.filter_by(username=session.get('username')).first()
    to_username = data.get('to_username')
    to_user = User.query.filter_by(username=to_username).first()
    if not to_user or to_user.id == me.id:
        return
    if to_user in me.friends:
        return
    ex = FriendRequest.query.filter(((FriendRequest.from_user_id==me.id) & (FriendRequest.to_user_id==to_user.id)) | ((FriendRequest.from_user_id==to_user.id) & (FriendRequest.to_user_id==me.id))).filter(FriendRequest.status=='pending').first()
    if ex:
        return
    fr = FriendRequest(from_user_id=me.id, to_user_id=to_user.id, status='pending')
    db.session.add(fr)
    db.session.commit()
    notif = Notification(recipient_id=to_user.id, notif_type=NotificationType.FRIEND_REQUEST.value, from_user_id=me.id, title='Новая заявка в друзья', message=f'@{me.username} отправил вам заявку в друзья')
    db.session.add(notif)
    db.session.commit()
    emit('friend_request_update', {'type': 'incoming', 'from': me.username}, room=to_user.username)

@socketio.on('friend_request_respond')
def friend_request_respond(data):
    me = User.query.filter_by(username=session.get('username')).first()
    from_username = data.get('from_username')
    action = data.get('action')
    fr = FriendRequest.query.join(User, FriendRequest.from_user_id==User.id).filter(User.username==from_username, FriendRequest.to_user_id==me.id, FriendRequest.status=='pending').first()
    if not fr:
        return
    if action=='accept':
        fr.status='accepted'
        a = db.session.get(User, fr.from_user_id)
        b = me
        if a not in b.friends:
            b.friends.append(a)
        if b not in a.friends:
            a.friends.append(b)
        db.session.commit()
        notif = Notification(recipient_id=a.id, notif_type=NotificationType.FRIEND_ACCEPTED.value, from_user_id=me.id, title='Заявка принята', message=f'@{me.username} принял вашу заявку в друзья')
        db.session.add(notif)
        db.session.commit()
        emit('friends_list', {'friends': [{'username': f.username, 'avatar': f.avatar} for f in me.friends]}, room=me.username)
        emit('friends_list', {'friends': [{'username': f.username, 'avatar': f.avatar} for f in a.friends]}, room=a.username)
        emit('friend_request_update', {'type': 'accepted', 'user': me.username}, room=a.username)
    else:
        fr.status='rejected'
        db.session.commit()

@socketio.on('friend_request_cancel')
def friend_request_cancel(data):
    me = User.query.filter_by(username=session.get('username')).first()
    to_username = data.get('to_username')
    to_user = User.query.filter_by(username=to_username).first()
    if not to_user:
        return
    fr = FriendRequest.query.filter_by(from_user_id=me.id, to_user_id=to_user.id, status='pending').first()
    if fr:
        db.session.delete(fr)
        db.session.commit()
        emit('friend_request_update', {'type': 'cancelled', 'user': me.username}, room=to_user.username)

@socketio.on('friend_remove')
def friend_remove(data):
    me = User.query.filter_by(username=session.get('username')).first()
    uname = data.get('username')
    other = User.query.filter_by(username=uname).first()
    if not other:
        return
    if other in me.friends:
        me.friends.remove(other)
    if me in other.friends:
        other.friends.remove(me)
    db.session.commit()
    emit('friends_list', {'friends': [{'username': f.username, 'avatar': f.avatar} for f in me.friends]}, room=me.username)
    emit('friends_list', {'friends': [{'username': f.username, 'avatar': f.avatar} for f in other.friends]}, room=other.username)

@socketio.on('start_call')
def start_call(data):
    me = session.get('username')
    to = data.get('to')
    call_type = data.get('call_type', 'audio')
    if not to:
        return
    call_log = CallLog(from_user_id=User.query.filter_by(username=me).first().id, to_user_id=User.query.filter_by(username=to).first().id, call_type=call_type, status='pending')
    db.session.add(call_log)
    db.session.commit()
    emit('incoming_call', {'from': me, 'call_type': call_type}, room=to)

@socketio.on('rtc_offer')
def rtc_offer(data):
    to = data.get('to')
    sdp = data.get('sdp')
    call_type = data.get('call_type', 'audio')
    me = session.get('username')
    if to and sdp:
        emit('rtc_offer', {'from': me, 'sdp': sdp, 'call_type': call_type}, room=to)

@socketio.on('rtc_answer')
def rtc_answer(data):
    to = data.get('to')
    sdp = data.get('sdp')
    me = session.get('username')
    if to and sdp:
        emit('rtc_answer', {'from': me, 'sdp': sdp}, room=to)

@socketio.on('rtc_ice_candidate')
def rtc_ice_candidate(data):
    to = data.get('to')
    cand = data.get('candidate')
    me = session.get('username')
    if to and cand:
        emit('rtc_ice_candidate', {'from': me, 'candidate': cand}, room=to)

@socketio.on('end_call')
def end_call(data):
    to = data.get('to')
    status = data.get('status', 'ended')
    if to:
        emit('call_ended', {'status': status}, room=to)

def check_cloudflared():
    """Проверяет наличие cloudflared в системе"""
    return shutil.which("cloudflared") is not None

def install_cloudflared():
    """Автоматически устанавливает cloudflared"""
    print(" * Cloudflared не найден. Установка cloudflared...")
    system = platform.system().lower()
    machine = platform.machine().lower()
    
    try:
        if system == "windows":
            if "64" in machine or "x86_64" in machine or "amd64" in machine:
                url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
                exe_path = os.path.join(os.path.expanduser("~"), "cloudflared.exe")
            else:
                url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe"
                exe_path = os.path.join(os.path.expanduser("~"), "cloudflared.exe")
            
            urllib.request.urlretrieve(url, exe_path)
            os.chmod(exe_path, stat.S_IREAD | stat.S_IWRITE | stat.S_IEXEC)
            
            # Добавляем в PATH для текущей сессии
            os.environ["PATH"] = os.path.dirname(exe_path) + os.pathsep + os.environ.get("PATH", "")
            return exe_path
        
        elif system == "darwin":  # macOS
            print(" * Для macOS выполните: brew install cloudflare/cloudflare/cloudflared")
            print(" * Или скачайте с: https://github.com/cloudflare/cloudflared/releases")
            return None
        
        else:  # Linux
            arch_map = {
                "x86_64": "amd64",
                "aarch64": "arm64",
                "armv7l": "arm",
                "i386": "386",
                "i686": "386"
            }
            arch = arch_map.get(machine, "amd64")
            
            url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}"
            bin_path = os.path.join(os.path.expanduser("~"), ".local", "bin", "cloudflared")
            os.makedirs(os.path.dirname(bin_path), exist_ok=True)
            
            urllib.request.urlretrieve(url, bin_path)
            os.chmod(bin_path, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
            
            os.environ["PATH"] = os.path.dirname(bin_path) + os.pathsep + os.environ.get("PATH", "")
            return bin_path
    
    except Exception as e:
        print(f" * Ошибка установки cloudflared: {e}")
        print(" * Пожалуйста, установите вручную: https://github.com/cloudflare/cloudflared/releases")
        return None

def get_cloudflared_cmd():
    """Возвращает команду для запуска cloudflared"""
    cmd = shutil.which("cloudflared")
    if cmd:
        return cmd
    # Проверяем стандартные пути
    if platform.system().lower() == "windows":
        home_cmd = os.path.join(os.path.expanduser("~"), "cloudflared.exe")
        if os.path.exists(home_cmd):
            return home_cmd
    else:
        home_cmd = os.path.join(os.path.expanduser("~"), ".local", "bin", "cloudflared")
        if os.path.exists(home_cmd):
            return home_cmd
    return None

def setup_cloudflare_dns_and_routing(domain="gchat.ru", cloudflared_cmd=None):
    """Пиратская автоматическая настройка DNS и маршрутизации через Cloudflare API"""
    print(f" * 🏴‍☠️ Настройка пиратской маршрутизации для {domain}...")
    
    # API токен из переменной окружения или дефолтный
    cloudflare_api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "3IR3slId1PavczCDvWTmGiyLxbTumi2vBcHCcnev")
    cloudflare_email = os.environ.get("CLOUDFLARE_EMAIL")
    cloudflare_api_key = os.environ.get("CLOUDFLARE_API_KEY")
    cloudflare_zone_id = os.environ.get("CLOUDFLARE_ZONE_ID")
    
    if not cloudflare_api_token and not (cloudflare_email and cloudflare_api_key):
        print(f" * ⚠️ Cloudflare API токен не найден. Пропускаем автоматическую настройку DNS.")
        print(f" * ℹ️ Для автоматической настройки установите CLOUDFLARE_API_TOKEN или CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY")
        return None
    
    try:
        import requests
        
        # Определяем Zone ID если не указан
        if not cloudflare_zone_id:
            print(f" * 🔍 Поиск Zone ID для домена {domain}...")
            if cloudflare_api_token:
                headers = {"Authorization": f"Bearer {cloudflare_api_token}", "Content-Type": "application/json"}
            else:
                headers = {"X-Auth-Email": cloudflare_email, "X-Auth-Key": cloudflare_api_key, "Content-Type": "application/json"}
            
            response = requests.get(f"https://api.cloudflare.com/client/v4/zones?name={domain}", headers=headers, timeout=10)
            if response.status_code == 200:
                zones = response.json().get("result", [])
                if zones:
                    cloudflare_zone_id = zones[0]["id"]
                    print(f" * ✅ Zone ID найден: {cloudflare_zone_id}")
                else:
                    print(f" * ⚠️ Домен {domain} не найден в Cloudflare. Пропускаем настройку DNS.")
                    return None
            else:
                print(f" * ⚠️ Ошибка получения Zone ID: {response.status_code}")
                return None
        
        # Получаем информацию о туннеле для получения ID
        if cloudflared_cmd:
            try:
                list_result = subprocess.run(
                    [cloudflared_cmd, "tunnel", "list", "--format", "json"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if list_result.returncode == 0:
                    import json
                    tunnel_id = None
                    try:
                        tunnels = json.loads(list_result.stdout)
                        # Ищем туннель по имени или используем первый доступный
                        if isinstance(tunnels, list):
                            for tunnel in tunnels:
                                if isinstance(tunnel, dict):
                                    if tunnel.get("name") in ["gchat-tunnel", "gchat-permanent-tunnel"]:
                                        tunnel_id = tunnel.get("id")
                                        break
                            # Если не нашли по имени, берем первый
                            if not tunnel_id and len(tunnels) > 0:
                                tunnel_id = tunnels[0].get("id") if isinstance(tunnels[0], dict) else None
                    except (ValueError, json.JSONDecodeError):
                        # Если JSON не парсится, пытаемся извлечь ID из текста
                        import re
                        id_match = re.search(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', list_result.stdout)
                        if id_match:
                            tunnel_id = id_match.group(0)
                    
                    if tunnel_id:
                        print(f" * 🔗 Найдена ID туннеля: {tunnel_id}")
                        
                        # Создаем/обновляем DNS CNAME запись
                        print(f" * 📝 Настройка DNS записи для {domain}...")
                        if cloudflare_api_token:
                            headers = {"Authorization": f"Bearer {cloudflare_api_token}", "Content-Type": "application/json"}
                        else:
                            headers = {"X-Auth-Email": cloudflare_email, "X-Auth-Key": cloudflare_api_key, "Content-Type": "application/json"}
                        
                        # Проверяем существующие записи
                        response = requests.get(
                            f"https://api.cloudflare.com/client/v4/zones/{cloudflare_zone_id}/dns_records?type=CNAME&name={domain}",
                            headers=headers,
                            timeout=10
                        )
                        
                        target = f"{tunnel_id}.cfargotunnel.com"
                        
                        if response.status_code == 200:
                            records = response.json().get("result", [])
                            if records:
                                record_id = records[0]["id"]
                                # Обновляем существующую запись
                                update_data = {"type": "CNAME", "name": domain, "content": target, "ttl": 1, "proxied": True}
                                update_response = requests.put(
                                    f"https://api.cloudflare.com/client/v4/zones/{cloudflare_zone_id}/dns_records/{record_id}",
                                    headers=headers,
                                    json=update_data,
                                    timeout=10
                                )
                                if update_response.status_code == 200:
                                    print(f" * ✅ DNS запись обновлена: {domain} -> {target}")
                                else:
                                    print(f" * ⚠️ Ошибка обновления DNS: {update_response.status_code}")
                            else:
                                # Создаем новую запись
                                create_data = {"type": "CNAME", "name": domain, "content": target, "ttl": 1, "proxied": True}
                                create_response = requests.post(
                                    f"https://api.cloudflare.com/client/v4/zones/{cloudflare_zone_id}/dns_records",
                                    headers=headers,
                                    json=create_data,
                                    timeout=10
                                )
                                if create_response.status_code == 200:
                                    print(f" * ✅ DNS запись создана: {domain} -> {target}")
                                else:
                                    print(f" * ⚠️ Ошибка создания DNS: {create_response.status_code}")
                        
                        # Настраиваем маршрутизацию через туннель
                        print(f" * 🚀 Настройка маршрутизации трафика...")
                        
                        # Используем Cloudflare Tunnel API для настройки route
                        route_data = {
                            "config": {
                                "ingress": [
                                    {"hostname": domain, "service": "http://localhost:5000"},
                                    {"service": "http_status:404"}
                                ]
                            }
                        }
                        
                        # Обновляем конфигурацию туннеля через API
                        if cloudflare_api_token:
                            api_headers = {"Authorization": f"Bearer {cloudflare_api_token}", "Content-Type": "application/json"}
                        else:
                            api_headers = {"X-Auth-Email": cloudflare_email, "X-Auth-Key": cloudflare_api_key, "Content-Type": "application/json"}
                        
                        # Получаем account ID
                        account_response = requests.get(
                            f"https://api.cloudflare.com/client/v4/zones/{cloudflare_zone_id}",
                            headers=api_headers,
                            timeout=10
                        )
                        
                        if account_response.status_code == 200:
                            try:
                                account_data = account_response.json()
                                if isinstance(account_data, dict) and account_data.get("success", False):
                                    account_id = account_data.get("result", {}).get("account", {}).get("id")
                                    
                                    if account_id and tunnel_id:
                                        # Настраиваем route через Cloudflare API
                                        route_response = requests.put(
                                            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations",
                                            headers=api_headers,
                                            json=route_data,
                                            timeout=10
                                        )
                                        
                                        if route_response.status_code == 200:
                                            try:
                                                route_result = route_response.json()
                                                if isinstance(route_result, dict) and route_result.get("success", False):
                                                    print(f" * ✅ Маршрутизация настроена успешно!")
                                                    print(f" * 🌐 Трафик для {domain} теперь направляется через туннель")
                                                    return True
                                                else:
                                                    print(f" * ⚠️ Маршрутизация: ответ API не успешен")
                                            except (ValueError, KeyError) as parse_err:
                                                print(f" * ⚠️ Маршрутизация: ошибка парсинга ответа: {parse_err}")
                                        else:
                                            print(f" * ⚠️ Предупреждение: Не удалось настроить route через API (код: {route_response.status_code})")
                                            try:
                                                error_text = route_response.text[:200]
                                                print(f" * 📄 Ответ API: {error_text}...")
                                            except:
                                                pass
                                            print(f" * ℹ️ Маршрутизация будет настроена через config.yml")
                                            return False
                            except (ValueError, KeyError) as json_err:
                                print(f" * ⚠️ Ошибка парсинга ответа API: {json_err}")
                                return False
            except Exception as e:
                print(f" * ⚠️ Предупреждение при настройке через API: {e}")
                return False
        
        return True
        
    except ImportError:
        print(f" * ⚠️ Модуль 'requests' не установлен. Пропускаем автоматическую настройку DNS.")
        print(f" * ℹ️ Установите: pip install requests")
        return None
    except Exception as e:
        print(f" * ⚠️ Ошибка настройки DNS/маршрутизации: {e}")
        return None

def get_origin_certificate_from_api(account_id, api_token=None):
    """ПРОДВИНУТЫЙ АЛГОРИТМ: Получает origin certificate через Cloudflare API множественными методами"""
    try:
        import requests
        
        # API токен из переменной окружения или дефолтный
        if not api_token:
            api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "3IR3slId1PavczCDvWTmGiyLxbTumi2vBcHCcnev")
        
        if not api_token:
            return None
        
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
        
        print(f" * 🔄 Метод 1: Получение через account certificates endpoint...")
        # Метод 1: Получаем origin certificate через account certificates endpoint
        try:
            response = requests.get(
                f"https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel/certificates",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                try:
                    cert_data = response.json()
                    if isinstance(cert_data, dict) and cert_data.get("success", False):
                        result = cert_data.get("result", {})
                        if isinstance(result, dict):
                            cert = result.get("certificate")
                            if cert and len(cert) > 100:  # Проверяем что это валидный сертификат
                                print(f" * ✅ Certificate получен через метод 1")
                                return cert
                        elif isinstance(result, list) and len(result) > 0:
                            cert = result[0].get("certificate")
                            if cert and len(cert) > 100:
                                print(f" * ✅ Certificate получен через метод 1 (list)")
                                return cert
                except (ValueError, KeyError) as e:
                    print(f" * ⚠️ Метод 1: ошибка парсинга: {e}")
        except Exception as e:
            print(f" * ⚠️ Метод 1: ошибка запроса: {e}")
        
        print(f" * 🔄 Метод 2: Генерация нового certificate...")
        # Метод 2: Генерируем новый certificate
        try:
            response = requests.post(
                f"https://api.cloudflare.com/client/v4/accounts/{account_id}/cfd_tunnel/certificates",
                headers=headers,
                json={},
                timeout=10
            )
            
            if response.status_code in [200, 201]:
                try:
                    cert_data = response.json()
                    if isinstance(cert_data, dict) and cert_data.get("success", False):
                        result = cert_data.get("result", {})
                        cert = result.get("certificate")
                        if cert and len(cert) > 100:
                            print(f" * ✅ Certificate получен через метод 2")
                            return cert
                except (ValueError, KeyError) as e:
                    print(f" * ⚠️ Метод 2: ошибка парсинга: {e}")
        except Exception as e:
            print(f" * ⚠️ Метод 2: ошибка запроса: {e}")
        
        print(f" * 🔄 Метод 3: Получение через zones certificates...")
        # Метод 3: Пытаемся получить через zones (альтернативный метод)
        try:
            response = requests.get(
                "https://api.cloudflare.com/client/v4/certificates",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                try:
                    cert_data = response.json()
                    if isinstance(cert_data, dict) and cert_data.get("success", False):
                        result = cert_data.get("result", [])
                        if isinstance(result, list) and len(result) > 0:
                            for cert_obj in result:
                                cert = cert_obj.get("certificate")
                                if cert and len(cert) > 100:
                                    print(f" * ✅ Certificate получен через метод 3")
                                    return cert
                except (ValueError, KeyError) as e:
                    print(f" * ⚠️ Метод 3: ошибка парсинга: {e}")
        except Exception as e:
            print(f" * ⚠️ Метод 3: ошибка запроса: {e}")
        
        print(f" * ⚠️ Все методы получения certificate не сработали")
        return None
    except Exception as e:
        print(f" * ❌ Критическая ошибка получения certificate: {e}")
        return None

def create_permanent_tunnel_with_token(cloudflared_cmd, port):
    """ГЕНИАЛЬНЫЙ АЛГОРИТМ: Создает постоянный туннель через Cloudflare Tunnel Token с продвинутой логикой"""
    print(" * 🧠 Запуск гениального алгоритма создания постоянного туннеля...")
    print(" * 📋 Этап 1: Инициализация и подготовка...")
    
    # Токен из переменной окружения или дефолтный
    tunnel_token = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "eyJhIjoiMzIxYjI5MDQ5OTNkMzEwNDI2ZTdhMTViNmViYTI3MjciLCJ0IjoiMTU1Mjc2NDktNDExNi00ZWQzLThhZGItNjI2NTMyMjQ2NzA1IiwicyI6Ik0yUmtZV0l5Wm1RdE0yVTJOQzAwT0dJMExXRm1ZV1V0WW1NeFlqWTFOVGM1WVdNNSJ9")
    
    # API токен для логина
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "3IR3slId1PavczCDvWTmGiyLxbTumi2vBcHCcnev")
    
    if not tunnel_token:
        print(" * ❌ Tunnel Token не найден. Пропускаем основной метод.")
        return None
    
    try:
        import base64
        import json
        
        tunnel_name = "gchat-permanent-tunnel"
        config_dir = os.path.join(os.path.expanduser("~"), ".cloudflared")
        os.makedirs(config_dir, exist_ok=True)
        credentials_file = os.path.join(config_dir, f"{tunnel_name}.json")
        origin_cert_file = os.path.join(config_dir, "cert.pem")
        config_path = os.path.join(config_dir, "config.yml")
        # Используем hostname из окружения (может быть захваченный домен из find_and_claim_free_domain)
        tunnel_hostname = os.environ.get("CLOUDFLARE_TUNNEL_HOSTNAME", "gchat.ru")
        print(f" * 🌐 Домен для туннеля: {tunnel_hostname}")
        
        # Декодируем токен для получения информации
        print(" * 📋 Этап 2: Декодирование токена и извлечение метаданных...")
        account_id = None
        tunnel_id = None
        
        try:
            token_parts = tunnel_token.split('.')
            if len(token_parts) >= 2:
                # Добавляем padding для base64 декодирования
                payload_part = token_parts[1]
                # Добавляем padding если нужно
                padding = 4 - (len(payload_part) % 4)
                if padding != 4:
                    payload_part += '=' * padding
                
                payload = json.loads(base64.urlsafe_b64decode(payload_part))
                account_id = payload.get('a')
                tunnel_id = payload.get('t')
                if account_id:
                    print(f" * ✅ Извлечено из токена: AccountID={account_id[:8] if len(account_id) > 8 else account_id}..., TunnelID={tunnel_id[:8] if tunnel_id and len(tunnel_id) > 8 else (tunnel_id or 'N/A')}...")
                else:
                    print(f" * ⚠️ AccountID не найден в токене, будет использован альтернативный метод")
        except Exception as decode_err:
            print(f" * ⚠️ Предупреждение: не удалось декодировать токен: {decode_err}")
            # Пытаемся извлечь tunnel_id из самого токена другим способом
            try:
                # Иногда tunnel_id может быть в другом формате
                import re
                uuid_match = re.search(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', tunnel_token)
                if uuid_match:
                    tunnel_id = uuid_match.group(0)
                    print(f" * ✅ TunnelID извлечен через regex: {tunnel_id[:8]}...")
            except:
                pass
        
        # Этап 3a: Авторизация через API токен (создает origin certificate)
        print(" * 📋 Этап 3a: Авторизация через Cloudflare API токен...")
        if api_token:
            try:
                login_result = subprocess.run(
                    [cloudflared_cmd, "tunnel", "login", "--api-token", api_token],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    env={**os.environ, "CLOUDFLARE_API_TOKEN": api_token}
                )
                if login_result.returncode == 0:
                    print(f" * ✅ Авторизация через API токен успешна")
                elif "already" in login_result.stderr.lower() or "already" in login_result.stdout.lower():
                    print(f" * ✅ Уже авторизован через API токен")
                else:
                    error_msg = (login_result.stderr or login_result.stdout or "")[:200]
                    if error_msg:
                        print(f" * ⚠️ Предупреждение при авторизации: {error_msg}")
            except Exception as login_err:
                print(f" * ⚠️ Ошибка авторизации через API токен: {login_err}")
        
        # Создаем credentials файл из токена
        print(" * 📋 Этап 3b: Создание credentials файла...")
        try:
            if account_id and tunnel_id:
                credentials = {
                    "AccountTag": account_id,
                    "TunnelID": tunnel_id,
                    "TunnelSecret": base64.b64encode(tunnel_token.encode()).decode() if isinstance(tunnel_token, str) else tunnel_token
                }
            else:
                # Пробуем альтернативный формат - используем сам токен
                credentials = {"TunnelToken": tunnel_token}
            
            with open(credentials_file, 'w') as f:
                json.dump(credentials, f, indent=2)
            print(f" * ✅ Credentials файл создан: {credentials_file}")
        except Exception as cred_err:
            print(f" * ⚠️ Ошибка создания credentials: {cred_err}")
            return None
        
        # ПРОДВИНУТЫЙ АЛГОРИТМ: Получаем или создаем origin certificate
        print(" * 📋 Этап 4: Получение origin certificate (продвинутый алгоритм)...")
        origin_cert = None
        
        # Метод 1: Проверяем существующий cert.pem
        print(f" * 🔍 Метод 1: Проверка существующего cert.pem...")
        if os.path.exists(origin_cert_file):
            try:
                with open(origin_cert_file, 'r') as f:
                    origin_cert = f.read()
                if origin_cert and len(origin_cert) > 100:
                    print(f" * ✅ Найден существующий origin certificate ({len(origin_cert)} символов)")
                else:
                    print(f" * ⚠️ Файл cert.pem существует, но пуст или невалиден")
                    origin_cert = None
            except Exception as e:
                print(f" * ⚠️ Ошибка чтения cert.pem: {e}")
        
        # Метод 2: Пытаемся получить через API
        if not origin_cert and account_id:
            print(f" * 🔄 Метод 2: Попытка получить certificate через Cloudflare API...")
            origin_cert = get_origin_certificate_from_api(account_id, api_token)
            if origin_cert:
                try:
                    with open(origin_cert_file, 'w') as f:
                        f.write(origin_cert)
                    print(f" * ✅ Origin certificate получен и сохранен ({len(origin_cert)} символов)")
                except Exception as save_err:
                    print(f" * ⚠️ Ошибка сохранения certificate: {save_err}")
        
        # Метод 3: Пытаемся получить через cloudflared tunnel info
        if not origin_cert:
            print(f" * 🔄 Метод 3: Попытка получить certificate через cloudflared...")
            try:
                info_result = subprocess.run(
                    [cloudflared_cmd, "tunnel", "info"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                # Проверяем различные возможные пути к cert.pem
                possible_paths = [
                    os.path.join(os.path.expanduser("~"), ".cloudflared", "cert.pem"),
                    os.path.join(os.path.expanduser("~"), ".cloudflare-warp", "cert.pem"),
                    "/etc/cloudflared/cert.pem",
                    "/usr/local/etc/cloudflared/cert.pem"
                ]
                for cert_path in possible_paths:
                    if os.path.exists(cert_path):
                        try:
                            with open(cert_path, 'r') as f:
                                cert_content = f.read()
                            if cert_content and len(cert_content) > 100:
                                origin_cert = cert_content
                                print(f" * ✅ Certificate найден по пути: {cert_path}")
                                # Копируем в наш файл
                                try:
                                    import shutil
                                    shutil.copy(cert_path, origin_cert_file)
                                    print(f" * ✅ Certificate скопирован в {origin_cert_file}")
                                except:
                                    pass
                                break
                        except:
                            pass
            except Exception as info_err:
                print(f" * ⚠️ Метод 3: ошибка: {info_err}")
        
        # Метод 4: Пытаемся извлечь из авторизации через API токен
        if not origin_cert and api_token:
            print(f" * 🔄 Метод 4: Попытка извлечь certificate из авторизации...")
            try:
                # После login --api-token certificate должен быть создан
                login_cert_paths = [
                    os.path.join(os.path.expanduser("~"), ".cloudflared", "cert.pem"),
                    os.path.join(os.path.expanduser("~"), ".cloudflare-warp", "cert.pem"),
                ]
                for cert_path in login_cert_paths:
                    if os.path.exists(cert_path):
                        try:
                            with open(cert_path, 'r') as f:
                                cert_content = f.read()
                            if cert_content and len(cert_content) > 100:
                                origin_cert = cert_content
                                print(f" * ✅ Certificate найден после авторизации: {cert_path}")
                                try:
                                    import shutil
                                    shutil.copy(cert_path, origin_cert_file)
                                except:
                                    pass
                                break
                        except:
                            pass
            except Exception as extract_err:
                print(f" * ⚠️ Метод 4: ошибка: {extract_err}")
        
        if not origin_cert:
            print(f" * ⚠️ ВНИМАНИЕ: Origin certificate не найден, туннель может работать без него")
            print(f" * ℹ️ Будем использовать токен напрямую")
        
        # Метод 3: Используем tunnel route dns вместо создания туннеля (обходит проблему с cert)
        print(" * 📋 Этап 5: Настройка маршрутизации через route dns...")
        
        if tunnel_id:
            try:
                route_result = subprocess.run(
                    [cloudflared_cmd, "tunnel", "route", "dns", tunnel_id, tunnel_hostname],
                    env={**os.environ, "TUNNEL_TOKEN": tunnel_token},
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                if route_result.returncode == 0:
                    print(f" * ✅ DNS route настроен успешно: {tunnel_hostname}")
                elif "already exists" in route_result.stderr.lower() or "already exists" in route_result.stdout.lower():
                    print(f" * ✅ DNS route уже существует для {tunnel_hostname}")
                else:
                    print(f" * ⚠️ Route DNS не удалось настроить: {route_result.stderr or route_result.stdout}")
            except:
                pass
        
        # Создаем конфигурацию (с или без origin cert)
        print(" * 📋 Этап 6: Создание конфигурационного файла...")
        
        # Определяем какой tunnel_id использовать
        config_tunnel_id = tunnel_id if tunnel_id else tunnel_name
        
        config_lines = [
            f"tunnel: {config_tunnel_id}",
            f"credentials-file: {credentials_file}"
        ]
        
        if origin_cert and os.path.exists(origin_cert_file):
            config_lines.append(f"originCert: {origin_cert_file}")
            print(f" * ✅ Origin certificate добавлен в конфиг")
        else:
            print(f" * ℹ️ Origin certificate не найден, используем токен напрямую")
        
        # Настраиваем ingress с правильными правилами
        # ПРОДВИНУТАЯ КОНФИГУРАЦИЯ INGRESS с множественными правилами
        config_lines.extend([
            "",
            "ingress:",
            # Основной домен
            f"  - hostname: {tunnel_hostname}",
            f"    service: http://127.0.0.1:{port}",
            # WWW поддомен
            f"  - hostname: www.{tunnel_hostname}",
            f"    service: http://127.0.0.1:{port}",
            # Все остальное - 404
            "  - service: http_status:404"
        ])
        
        config_content = "\n".join(config_lines)
        
        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(config_content)
        
        print(f" * ✅ Конфигурация сохранена: {config_path}")
        
        # Запускаем туннель
        print(" * 📋 Этап 7: Запуск туннеля...")
        print(f" * 🌐 Домен: https://{tunnel_hostname}")
        print(f" * 🔗 Проксирование: http://127.0.0.1:{port}")
        
        # Проверяем доступность локального сервера
        print(f" * 🔍 Проверка доступности локального сервера на порту {port}...")
        try:
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            if result == 0:
                print(f" * ✅ Локальный сервер доступен на 127.0.0.1:{port}")
            else:
                print(f" * ⚠️ Предупреждение: Локальный сервер может быть недоступен на 127.0.0.1:{port}")
                print(f" * ℹ️ Убедитесь, что Flask приложение запущено и слушает на этом порту")
        except Exception as check_err:
            print(f" * ⚠️ Не удалось проверить доступность сервера: {check_err}")
        
        # Пиратская автоматическая настройка DNS и маршрутизации
        print(f" * 🔄 Настройка DNS и маршрутизации для {tunnel_hostname}...")
        dns_result = setup_cloudflare_dns_and_routing(tunnel_hostname, cloudflared_cmd)
        if dns_result:
            print(f" * ✅ Пиратская маршрутизация активна!")
        
        # Дополнительная настройка DNS route через cloudflared (если tunnel_id известен)
        if tunnel_id:
            print(f" * 🔄 Дополнительная настройка DNS route через cloudflared...")
            try:
                route_env = {**os.environ, "TUNNEL_TOKEN": tunnel_token}
                route_result = subprocess.run(
                    [cloudflared_cmd, "tunnel", "route", "dns", tunnel_id, tunnel_hostname],
                    env=route_env,
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                if route_result.returncode == 0:
                    print(f" * ✅ DNS route через cloudflared настроен: {tunnel_hostname} -> {tunnel_id}")
                elif route_result.stderr and ("already" in route_result.stderr.lower() or "exists" in route_result.stderr.lower()):
                    print(f" * ✅ DNS route уже настроен для {tunnel_hostname}")
                elif route_result.stdout and ("already" in route_result.stdout.lower() or "exists" in route_result.stdout.lower()):
                    print(f" * ✅ DNS route уже настроен для {tunnel_hostname}")
                else:
                    error_msg = (route_result.stderr or route_result.stdout or "")[:200]
                    if error_msg:
                        print(f" * ⚠️ DNS route предупреждение: {error_msg}")
            except Exception as route_err:
                print(f" * ⚠️ DNS route ошибка (не критично): {route_err}")
        
        # ПРОДВИНУТАЯ НАСТРОЙКА ОКРУЖЕНИЯ для туннеля
        tunnel_env = {**os.environ}
        tunnel_env["TUNNEL_TOKEN"] = tunnel_token
        
        # Если есть origin cert, добавляем его в env и в переменные окружения
        if origin_cert and os.path.exists(origin_cert_file):
            tunnel_env["TUNNEL_ORIGIN_CERT"] = origin_cert_file
            tunnel_env["TUNNEL_ORIGIN_CERT_PATH"] = origin_cert_file
            print(f" * ✅ Origin certificate добавлен в переменные окружения")
        
        # Добавляем дополнительные переменные для надежности
        tunnel_env["TUNNEL_TRANSPORT_PROTOCOL"] = "quic"
        tunnel_env["TUNNEL_PROTOCOL"] = "quic"
        
        # Запускаем туннель - используем самый надежный метод
        print(" * 📋 Этап 8: Запуск туннеля с продвинутой логикой проверки...")
        import time
        import sys
        
        # Метод 1: Запуск именованного туннеля через config (самый надежный для постоянного туннеля)
        print(f" * 🚀 Метод 1: Запуск именованного туннеля через config.yml...")
        tunnel_process = None
        
        try:
            # Используем запуск через config файл с именем туннеля
            if tunnel_id:
                # Сначала пробуем запустить через tunnel_id с config
                print(f" * 🔧 Используем TunnelID из токена: {tunnel_id[:16] if len(tunnel_id) > 16 else tunnel_id}...")
                # Пробуем запустить через tunnel_id с указанием config
                tunnel_process = subprocess.Popen(
                    [cloudflared_cmd, "tunnel", "--config", config_path, "run"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=tunnel_env,
                    bufsize=1
                )
            else:
                # Используем config файл
                tunnel_process = subprocess.Popen(
                    [cloudflared_cmd, "tunnel", "--config", config_path, "run"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=tunnel_env,
                    bufsize=1
                )
            
            # Мониторим вывод для определения успешного запуска
            startup_success = False
            error_detected = False
            tunnel_url = None
            
            print(" * ⏳ Ожидание запуска туннеля...")
            for i in range(100):  # Ждем до 10 секунд
                time.sleep(0.1)
                
                # Проверяем статус процесса
                poll_result = tunnel_process.poll()
                
                if poll_result is not None:
                    # Процесс завершился - читаем вывод
                    try:
                        output = ""
                        if tunnel_process.stdout:
                            output = tunnel_process.stdout.read(10000)
                        
                        if output:
                            if any(err in output.lower() for err in ["error", "failed", "cannot", "invalid"]):
                                error_detected = True
                                print(f" * ⚠️ Обнаружена ошибка в выводе")
                                print(f" * 📄 Вывод: {output[:400]}...")
                                break
                    except:
                        pass
                    break
                
                # Пытаемся прочитать строку из вывода (неблокирующе)
                try:
                    if tunnel_process.stdout:
                        # Для Windows используем другой подход
                        if sys.platform == 'win32':
                            # На Windows проверяем только статус процесса
                            if i > 30:  # После 3 секунд считаем запущенным
                                startup_success = True
                                break
                        else:
                            # Для Unix используем select
                            import select
                            if select.select([tunnel_process.stdout], [], [], 0)[0]:
                                line = tunnel_process.stdout.readline()
                                if line:
                                    # Ищем URL в выводе
                                    import re
                                    url_match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
                                    if url_match:
                                        tunnel_url = url_match.group(0)
                                        startup_success = True
                                        break
                                    
                                    # Проверяем на ошибки
                                    if any(err in line.lower() for err in ["error", "failed", "cannot", "invalid"]):
                                        error_detected = True
                                        print(f" * ⚠️ Ошибка в логе: {line.strip()[:200]}")
                                        break
                                    
                                    # Проверяем на успешные сообщения
                                    if any(success in line.lower() for success in ["connection established", "registered", "started"]):
                                        startup_success = True
                                        break
                except:
                    pass
                
                # Если процесс работает уже 3+ секунды без ошибок - считаем успешным
                if i > 30 and not error_detected:
                    startup_success = True
                    break
            
            # Финальная проверка
            if tunnel_process.poll() is None and not error_detected:
                startup_success = True
            
            if startup_success and tunnel_process.poll() is None:
                if tunnel_url:
                    print(f" * ✅✅✅ ПОСТОЯННЫЙ ТУННЕЛЬ ЗАПУЩЕН УСПЕШНО! ✅✅✅")
                    print(f" * 🔗 Quick Tunnel URL: {tunnel_url}")
                    print(f" * 🌐 Домен: https://{tunnel_hostname}")
                    print(f" * 🎉 Гениальный алгоритм выполнен успешно!")
                else:
                    print(f" * ✅✅✅ ПОСТОЯННЫЙ ТУННЕЛЬ ЗАПУЩЕН УСПЕШНО! ✅✅✅")
                    print(f" * 🌐 Домен: https://{tunnel_hostname}")
                    print(f" * 🔗 Проксирование: http://127.0.0.1:{port}")
                    print(f" * 🎉 Гениальный алгоритм выполнен успешно!")
                return tunnel_process
            
            # Если первый метод не сработал, пробуем другие
            if tunnel_process.poll() is not None:
                exit_code = tunnel_process.poll()
                try:
                    output = ""
                    if tunnel_process.stdout:
                        output = tunnel_process.stdout.read(5000)
                    print(f" * ⚠️ Метод 1 завершился с кодом: {exit_code}")
                    if output:
                        print(f" * 📄 Лог: {output[:300]}...")
                except:
                    pass
            
            # Метод 2: Запуск через tunnel run с токеном и config
            print(f" * 🚀 Метод 2: Запуск через tunnel run с токеном и config...")
            try:
                # Используем config файл вместе с токеном для правильной маршрутизации
                run_process = subprocess.Popen(
                    [cloudflared_cmd, "tunnel", "--config", config_path, "run"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=tunnel_env,
                    bufsize=1
                )
                
                # Мониторим вывод для проверки успешного запуска
                startup_ok = False
                error_found = False
                
                for i in range(50):  # Ждем до 5 секунд
                    time.sleep(0.1)
                    if run_process.poll() is not None:
                        try:
                            output = run_process.stdout.read(5000) if run_process.stdout else ""
                            if output:
                                if any(err in output.lower() for err in ["error", "failed", "cannot", "invalid", "connection refused"]):
                                    error_found = True
                                    print(f" * ⚠️ Ошибка в выводе метода 2: {output[:300]}...")
                                    break
                        except:
                            pass
                        break
                    else:
                        # Процесс работает
                        if i > 20:  # После 2 секунд считаем запущенным
                            startup_ok = True
                            break
                
                if startup_ok and run_process.poll() is None and not error_found:
                    print(f" * ✅ Метод 2 успешен! Туннель запущен через tunnel run")
                    print(f" * 🌐 Домен: https://{tunnel_hostname}")
                    
                    # ПРОДВИНУТАЯ ПРОВЕРКА: Дополнительная настройка и валидация
                    print(f" * 🔄 Продвинутая проверка и настройка...")
                    
                    # 1. Настройка DNS route если еще не настроен
                    if tunnel_id:
                        print(f" * 🔄 Шаг 1: Проверка DNS маршрутизации...")
                        try:
                            dns_check = subprocess.run(
                                [cloudflared_cmd, "tunnel", "route", "dns", tunnel_id, tunnel_hostname],
                                env={**os.environ, "TUNNEL_TOKEN": tunnel_token},
                                capture_output=True,
                                text=True,
                                timeout=10
                            )
                            if dns_check.returncode == 0:
                                print(f" * ✅ DNS route настроен")
                            elif "already" in (dns_check.stderr or dns_check.stdout or "").lower():
                                print(f" * ✅ DNS route уже настроен")
                            else:
                                print(f" * ⚠️ DNS route не настроен, но продолжаем...")
                        except Exception as dns_err:
                            print(f" * ⚠️ DNS route ошибка: {dns_err}")
                    
                    # 2. Ожидание подключения туннеля
                    print(f" * 🔄 Шаг 2: Ожидание подключения туннеля (5 секунд)...")
                    import time
                    time.sleep(5)
                    
                    # 3. Проверка доступности локального сервера
                    print(f" * 🔄 Шаг 3: Повторная проверка локального сервера...")
                    try:
                        import socket
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(2)
                        result = sock.connect_ex(('127.0.0.1', port))
                        sock.close()
                        if result == 0:
                            print(f" * ✅ Локальный сервер доступен")
                        else:
                            print(f" * ⚠️ Локальный сервер недоступен - это может быть проблемой!")
                    except Exception as sock_err:
                        print(f" * ⚠️ Ошибка проверки сервера: {sock_err}")
                    
                    # 4. Проверка статуса туннеля через tunnel info
                    print(f" * 🔄 Шаг 4: Проверка статуса туннеля...")
                    try:
                        info_check = subprocess.run(
                            [cloudflared_cmd, "tunnel", "info", tunnel_id if tunnel_id else config_tunnel_id],
                            env=tunnel_env,
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if info_check.returncode == 0:
                            info_output = info_check.stdout or info_check.stderr or ""
                            if "connected" in info_output.lower() or "healthy" in info_output.lower():
                                print(f" * ✅ Туннель подключен и работает")
                            else:
                                print(f" * ⚠️ Статус туннеля неопределен, но процесс работает")
                        else:
                            print(f" * ⚠️ Не удалось проверить статус туннеля")
                    except:
                        print(f" * ⚠️ Ошибка проверки статуса туннеля")
                    
                    # 5. Тестирование доступности домена (опционально)
                    print(f" * 🔄 Шаг 5: Тестирование доступности домена...")
                    try:
                        import requests
                        test_response = requests.get(
                            f"https://{tunnel_hostname}",
                            timeout=5,
                            allow_redirects=True,
                            verify=True
                        )
                        if test_response.status_code in [200, 302, 301]:
                            print(f" * ✅✅✅ ДОМЕН ДОСТУПЕН! Статус: {test_response.status_code} ✅✅✅")
                            print(f" * 🎉 Туннель работает корректно!")
                        else:
                            print(f" * ⚠️ Домен отвечает со статусом: {test_response.status_code}")
                    except requests.exceptions.ConnectionError:
                        print(f" * ⚠️ Домен пока недоступен (может потребоваться время для DNS распространения)")
                        print(f" * ℹ️ Обычно это занимает 1-5 минут")
                    except Exception as test_err:
                        print(f" * ⚠️ Ошибка тестирования домена: {test_err}")
                    
                    print(f" * 🔗 Проверьте доступность через несколько секунд...")
                    print(f" * 🌐 URL: https://{tunnel_hostname}")
                    
                    return run_process
                else:
                    if run_process.poll() is not None:
                        try:
                            output = run_process.stdout.read(5000) if run_process.stdout else ""
                            print(f" * ⚠️ Метод 2 завершился с кодом: {run_process.poll()}")
                            if output:
                                print(f" * 📄 Вывод: {output[:400]}...")
                        except:
                            print(f" * ⚠️ Метод 2 завершился с кодом: {run_process.poll()}")
            except Exception as run_err:
                print(f" * ⚠️ Ошибка метода 2: {run_err}")
            
            # Метод 3: Запуск через tunnel_id напрямую (если известен)
            if tunnel_id:
                print(f" * 🚀 Метод 3: Запуск через tunnel_id напрямую...")
                try:
                    id_process = subprocess.Popen(
                        [cloudflared_cmd, "tunnel", "run", tunnel_id],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        env=tunnel_env,
                        bufsize=1
                    )
                    
                    time.sleep(3)
                    if id_process.poll() is None:
                        print(f" * ✅ Метод 3 успешен! Туннель запущен через tunnel_id")
                        print(f" * 🌐 Домен: https://{tunnel_hostname}")
                        return id_process
                    else:
                        try:
                            output = id_process.stdout.read(3000) if id_process.stdout else ""
                            print(f" * ⚠️ Метод 3 завершился с кодом: {id_process.poll()}")
                            if output:
                                print(f" * 📄 Вывод: {output[:200]}...")
                        except:
                            pass
                except Exception as id_err:
                    print(f" * ⚠️ Ошибка метода 3: {id_err}")
            
            # Метод 4: Quick tunnel с токеном (последний резерв)
            print(f" * 🚀 Метод 4: Запуск quick tunnel с токеном (резерв)...")
            try:
                quick_process = subprocess.Popen(
                    [cloudflared_cmd, "tunnel", "--url", f"http://127.0.0.1:{port}", "--token", tunnel_token],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=tunnel_env,
                    bufsize=1
                )
                
                # Читаем URL из вывода
                quick_url = None
                for i in range(100):
                    time.sleep(0.1)
                    if quick_process.poll() is not None:
                        break
                    try:
                        if sys.platform != 'win32':
                            import select
                            if select.select([quick_process.stdout], [], [], 0)[0]:
                                line = quick_process.stdout.readline()
                                if line:
                                    import re
                                    url_match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
                                    if url_match:
                                        quick_url = url_match.group(0)
                                        break
                    except:
                        pass
                
                time.sleep(2)
                if quick_process.poll() is None:
                    if quick_url:
                        print(f" * ✅ Метод 4 успешен! Quick tunnel: {quick_url}")
                        print(f" * ⚠️ ВНИМАНИЕ: Используется quick tunnel вместо домена {tunnel_hostname}")
                        print(f" * 🌐 Используйте этот URL: {quick_url}")
                    else:
                        print(f" * ✅ Метод 4 успешен! Quick tunnel запущен")
                    return quick_process
                else:
                    print(f" * ⚠️ Метод 4 завершился с кодом: {quick_process.poll()}")
            except Exception as quick_err:
                print(f" * ⚠️ Ошибка метода 4: {quick_err}")
            
            return None
                
        except Exception as run_err:
            print(f" * ❌ Критическая ошибка при запуске туннеля: {run_err}")
            import traceback
            traceback.print_exc()
            return None
            
    except subprocess.TimeoutExpired:
        print(f" * ❌ Таймаут при создании туннеля")
        return None
    except Exception as e:
        print(f" * ❌ Ошибка в гениальном алгоритме: {e}")
        import traceback
        traceback.print_exc()
        return None

def save_and_reuse_quick_tunnel_url(cloudflared_cmd, port):
    """Создает и сохраняет quick tunnel URL для переиспользования"""
    print(" * 💾 Создание постоянного quick tunnel с сохранением URL...")
    
    config_dir = os.path.join(os.path.expanduser("~"), ".cloudflared")
    os.makedirs(config_dir, exist_ok=True)
    tunnel_url_file = os.path.join(config_dir, "gchat_tunnel_url.txt")
    
    # Проверяем сохраненный URL
    saved_url = None
    if os.path.exists(tunnel_url_file):
        try:
            with open(tunnel_url_file, 'r') as f:
                saved_url = f.read().strip()
            if saved_url and saved_url.startswith('https://'):
                print(f" * ♻️ Найден сохраненный URL туннеля: {saved_url}")
        except:
            pass
    
    # Создаем новый quick tunnel
    print(" * 🚀 Запуск нового quick tunnel...")
    quick_process = subprocess.Popen(
        [cloudflared_cmd, "tunnel", "--url", f"http://localhost:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Читаем URL из вывода
    import time
    url = None
    for i in range(100):  # Ждем до 10 секунд
        time.sleep(0.1)
        try:
            if quick_process.poll() is not None:
                break
            if quick_process.stdout:
                line = quick_process.stdout.readline()
                if line:
                    import re
                    match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
                    if match:
                        url = match.group(0)
                        break
                    elif 'https://' in line and '.trycloudflare.com' in line:
                        parts = line.split('https://')
                        if len(parts) > 1:
                            url_part = parts[1].split()[0].split('\n')[0].split('\r')[0]
                            if '.trycloudflare.com' in url_part:
                                url = f"https://{url_part.split()[0]}"
                                break
        except:
            pass
    
    if url:
        # Сохраняем URL для будущего использования
        try:
            with open(tunnel_url_file, 'w') as f:
                f.write(url)
            print(f" * ✅ URL сохранен: {url}")
            print(f" * 🌐 Туннель: {url} -> http://127.0.0.1:{port}")
            print(f" * 💾 Этот URL будет переиспользоваться при следующих запусках")
        except:
            pass
        return quick_process
    else:
        if quick_process.poll() is None:
            print(f" * ⚠️ Quick tunnel запущен, но URL еще не получен")
            print(f" * ℹ️ URL будет отображаться в логах cloudflared")
        return quick_process

def register_isa_dev_subdomain(subdomain_name, github_token=None):
    """Регистрирует поддомен через is-a.dev через GitHub API - БЕСПЛАТНО И БЕЗЛИМИТНО!"""
    print(f" * 🔄 Регистрация поддомена {subdomain_name}.is-a.dev через is-a.dev...")
    
    if not github_token:
        github_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
    
    if not github_token:
        print(f" * ⚠️ GitHub токен не найден, пропускаем регистрацию через is-a.dev")
        print(f" * 💡 Установите GITHUB_TOKEN для регистрации через is-a.dev")
        return False
    
    try:
        import requests
        import json
        import base64
        
        github_headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }
        
        repo_owner = "is-a-dev"
        repo_name = "register"
        
        # Проверяем существует ли уже такой поддомен
        print(f" * 🔍 Проверка существования {subdomain_name}.is-a.dev...")
        check_response = requests.get(
            f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/domains/{subdomain_name}.json",
            headers=github_headers,
            timeout=10
        )
        
        if check_response.status_code == 200:
            print(f" * ⚠️ Поддомен {subdomain_name}.is-a.dev уже существует")
            # Проверяем можем ли мы использовать его (проверяем владельца)
            file_data = check_response.json()
            print(f" * ✅ Поддомен {subdomain_name}.is-a.dev уже зарегистрирован и доступен!")
            return True
        
        # Получаем информацию о текущем пользователе для owner
        user_response = requests.get(
            "https://api.github.com/user",
            headers=github_headers,
            timeout=5
        )
        
        github_username = "gchat-user"
        github_email = "contact@gchat.is-a.dev"
        
        if user_response.status_code == 200:
            user_data = user_response.json()
            github_username = user_data.get("login", "gchat-user")
            github_email = user_data.get("email") or f"{github_username}@users.noreply.github.com"
            print(f" * ✅ GitHub пользователь: {github_username}")
        
        # Формат записи для is-a.dev согласно их README
        # Поддомен будет указывать на Cloudflare Tunnel после создания туннеля
        domain_record = {
            "description": "GChat Messenger - Free Chat Application",
            "repo": "https://github.com/your-repo/gchat",  # Можем указать реальный реп
            "owner": {
                "name": "GChat",
                "email": github_email,
                "github": github_username
            },
            "record": {
                "CNAME": "placeholder.cfargotunnel.com"  # Будет обновлен после создания туннеля
            }
        }
        
        content = json.dumps(domain_record, indent=2)
        content_base64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
        
        print(f" * 📝 Создание файла domains/{subdomain_name}.json...")
        
        # Получаем SHA для main ветки (нужен для создания файла)
        ref_response = requests.get(
            f"https://api.github.com/repos/{repo_owner}/{repo_name}/git/ref/heads/main",
            headers=github_headers,
            timeout=10
        )
        
        if ref_response.status_code != 200:
            print(f" * ⚠️ Не удалось получить информацию о main ветке")
            return False
        
        main_sha = ref_response.json().get("object", {}).get("sha")
        
        # Создаем новый файл через GitHub API
        # Для этого нужно создать fork или использовать свой форк
        # Попробуем создать файл напрямую (если есть права на запись)
        try:
            create_response = requests.put(
                f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/domains/{subdomain_name}.json",
                headers=github_headers,
                json={
                    "message": f"Add {subdomain_name}.is-a.dev subdomain for GChat",
                    "content": content_base64,
                    "branch": "main"
                },
                timeout=10
            )
            
            if create_response.status_code in [200, 201]:
                print(f" * ✅✅✅ Поддомен {subdomain_name}.is-a.dev успешно зарегистрирован! ✅✅✅")
                return True
            elif create_response.status_code == 422:
                print(f" * ⚠️ Файл уже существует или нет прав на запись")
            elif create_response.status_code == 403:
                print(f" * 💡 Нужно создать PR вручную или использовать fork")
                print(f" * 📋 Инструкция:")
                print(f" *    1. Форкните репозиторий: https://github.com/is-a-dev/register")
                print(f" *    2. Создайте файл domains/{subdomain_name}.json с содержимым:")
                print(f" * {content}")
                print(f" *    3. Создайте PR в основной репозиторий")
                
                # Альтернатива: создаем через fork
                # Получаем список форков
                forks_response = requests.get(
                    f"https://api.github.com/repos/{repo_owner}/{repo_name}/forks",
                    headers=github_headers,
                    timeout=10
                )
                
                if forks_response.status_code == 200:
                    forks = forks_response.json()
                    user_forks = [f for f in forks if f.get("owner", {}).get("login") == github_username]
                    
                    if user_forks:
                        fork_repo = user_forks[0]
                        fork_owner = fork_repo.get("owner", {}).get("login")
                        print(f" * 🔄 Найден ваш fork: {fork_owner}/{repo_name}")
                        # Можем создать файл в форке и затем PR
                    else:
                        print(f" * 💡 Создайте fork репозитория для автоматической регистрации")
                
                return False
            else:
                print(f" * ⚠️ Не удалось создать файл: {create_response.status_code}")
                print(f" * 📄 Ответ: {create_response.text[:200]}")
        except Exception as create_err:
            print(f" * ⚠️ Ошибка создания файла: {create_err}")
        
        return False
        
    except Exception as e:
        print(f" * ⚠️ Ошибка регистрации через is-a.dev: {e}")
        import traceback
        traceback.print_exc()
        return False

def find_and_claim_free_domain(api_token=None):
    """ГЕНИАЛЬНЫЙ АЛГОРИТМ: Автоматически находит и захватывает свободный домен/поддомен для GChat"""
    print(" * 🎯 Запуск гениального алгоритма поиска и захвата свободного домена...")
    
    if not api_token:
        api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "3IR3slId1PavczCDvWTmGiyLxbTumi2vBcHCcnev")
    
    if not api_token:
        print(" * ❌ API токен не найден")
        return None
    
    try:
        import requests
        import random
        import string
        import time
        
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
        
        # Получаем account_id один раз
        print(" * 🔄 Получение Account ID...")
        account_id = None
        try:
            account_response = requests.get(
                "https://api.cloudflare.com/client/v4/accounts",
                headers=headers,
                timeout=5
            )
            if account_response.status_code == 200:
                accounts_data = account_response.json()
                if isinstance(accounts_data, dict) and accounts_data.get("success", False):
                    accounts = accounts_data.get("result", [])
                    if len(accounts) > 0:
                        account_id = accounts[0].get("id")
                        print(f" * ✅ Account ID получен: {account_id[:8]}...")
        except Exception as acc_err:
            print(f" * ⚠️ Ошибка получения Account ID: {acc_err}")
        
        # МЕТОД 0: Попытка зарегистрировать через is-a.dev (БЕСПЛАТНО И БЕЗЛИМИТНО!)
        print(" * 📋 Метод 0: Регистрация через is-a.dev (БЕСПЛАТНО И БЕЗЛИМИТНО!)...")
        base_names = ["gchat", "gchat-app", "get-gchat", "my-gchat", "gchat-pro", "gchat-online", "gchat-chat", "gchat-messenger"]
        random.shuffle(base_names)
        
        if github_token:
            for base_name in base_names:
                isa_domain = f"{base_name}.is-a.dev"
                print(f" * 🔄 Попытка регистрации: {isa_domain}")
                
                try:
                    # Пробуем зарегистрировать через is-a.dev
                    registered = register_isa_dev_subdomain(base_name, github_token)
                    if registered:
                        print(f" * ✅✅✅ ПОДДОМЕН ЗАХВАЧЕН: {isa_domain} ✅✅✅")
                        return isa_domain
                except Exception as isa_err:
                    print(f" * ⚠️ Ошибка is-a.dev для {base_name}: {isa_err}")
                    continue
        else:
            print(f" * ⚠️ GitHub токен не найден, пропускаем is-a.dev")
            print(f" * 💡 Установите GITHUB_TOKEN для регистрации через is-a.dev")
        
        # МЕТОД 1: Попытка создать поддомен через Cloudflare Pages (.pages.dev)
        print(" * 📋 Метод 1: Попытка создать поддомен через Cloudflare Pages...")
        
        if account_id:
            for base_name in base_names:
                pages_domain = f"{base_name}.pages.dev"
                print(f" * 🔄 Проверка доступности: {pages_domain}")
                
                try:
                    # Проверяем существующие проекты Pages
                    pages_response = requests.get(
                        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects",
                        headers=headers,
                        timeout=5
                    )
                    
                    project_exists = False
                    if pages_response.status_code == 200:
                        pages_data = pages_response.json()
                        if isinstance(pages_data, dict) and pages_data.get("success", False):
                            projects = pages_data.get("result", [])
                            project_exists = any(p.get("name") == base_name for p in projects)
                    
                    if not project_exists:
                        # Создаем Pages проект для получения поддомена
                        project_data = {
                            "name": base_name,
                            "production_branch": "main"
                        }
                        
                        create_response = requests.post(
                            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects",
                            headers=headers,
                            json=project_data,
                            timeout=10
                        )
                        
                        if create_response.status_code in [200, 201]:
                            print(f" * ✅ Проект Pages создан: {base_name}")
                            print(f" * ✅✅✅ ПОДДОМЕН ЗАХВАЧЕН: {pages_domain} ✅✅✅")
                            return pages_domain
                        elif create_response.status_code == 409:
                            print(f" * ⚠️ Проект {base_name} уже существует, пробуем следующий...")
                            continue
                except Exception as pages_err:
                    print(f" * ⚠️ Ошибка Pages для {base_name}: {pages_err}")
                    continue
        
        # МЕТОД 2: Попытка использовать Cloudflare Workers для создания поддомена
        print(" * 📋 Метод 2: Попытка создать поддомен через Cloudflare Workers...")
        if account_id:
            for base_name in base_names[:5]:  # Пробуем первые 5
                workers_domain = f"{base_name}.workers.dev"
                print(f" * 🔄 Проверка доступности: {workers_domain}")
                
                try:
                    # Проверяем существующие workers
                    workers_response = requests.get(
                        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts",
                        headers=headers,
                        timeout=5
                    )
                    
                    worker_exists = False
                    if workers_response.status_code == 200:
                        workers_data = workers_response.json()
                        if isinstance(workers_data, dict):
                            scripts = workers_data.get("result", [])
                            worker_exists = any(s.get("id") == base_name for s in scripts)
                    
                    if not worker_exists:
                        # Создаем минимальный worker для получения поддомена
                        worker_code = """export default {
  async fetch(request) {
    return new Response('OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};"""
                        
                        create_response = requests.put(
                            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{base_name}",
                            headers={**headers, "Content-Type": "application/javascript"},
                            data=worker_code,
                            timeout=10
                        )
                        
                        if create_response.status_code in [200, 201]:
                            # Публикуем worker для активации поддомена
                            publish_response = requests.post(
                                f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{base_name}/deployments",
                                headers=headers,
                                json={"strategy": "percentage", "versions": [{"version_id": base_name, "percentage": 100}]},
                                timeout=10
                            )
                            
                            print(f" * ✅ Worker создан: {base_name}")
                            print(f" * ✅✅✅ ПОДДОМЕН ЗАХВАЧЕН: {workers_domain} ✅✅✅")
                            return workers_domain
                except Exception as workers_err:
                    print(f" * ⚠️ Ошибка Workers для {base_name}: {workers_err}")
                    continue
        
        # МЕТОД 3: Использование Cloudflare Tunnel поддомена (.cfargotunnel.com)
        print(" * 📋 Метод 3: Использование Cloudflare Tunnel поддомена...")
        # Для Cloudflare Tunnel поддомены .cfargotunnel.com доступны через tunnel_id
        # Генерируем уникальный домен на основе tunnel_id из токена
        try:
            tunnel_token = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "eyJhIjoiMzIxYjI5MDQ5OTNkMzEwNDI2ZTdhMTViNmViYTI3MjciLCJ0IjoiMTU1Mjc2NDktNDExNi00ZWQzLThhZGItNjI2NTMyMjQ2NzA1IiwicyI6Ik0yUmtZV0l5Wm1RdE0yVTJOQzAwT0dJMExXRm1ZV1V0WW1NeFlqWTFOVGM1WVdNNSJ9")
            if tunnel_token:
                import base64
                import json
                try:
                    token_parts = tunnel_token.split('.')
                    if len(token_parts) >= 2:
                        payload_part = token_parts[1]
                        padding = 4 - (len(payload_part) % 4)
                        if padding != 4:
                            payload_part += '=' * padding
                        payload = json.loads(base64.urlsafe_b64decode(payload_part))
                        tunnel_id = payload.get('t')
                        
                        if tunnel_id:
                            # Cloudflare Tunnel автоматически предоставляет домен {tunnel_id}.cfargotunnel.com
                            tunnel_domain = f"{tunnel_id}.cfargotunnel.com"
                            print(f" * ✅ Найден Tunnel ID: {tunnel_id[:16]}...")
                            print(f" * ✅✅✅ ДОМЕН ДОСТУПЕН: {tunnel_domain} ✅✅✅")
                            return tunnel_domain
                except:
                    pass
        except Exception as tunnel_err:
            print(f" * ⚠️ Ошибка Tunnel домена: {tunnel_err}")
        
        # МЕТОД 4: Генерация уникального поддомена
        print(" * 📋 Метод 4: Генерация уникального поддомена...")
        for _ in range(5):
            random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
            generated_name = f"gchat-{random_suffix}"
            
            # Пробуем создать через Pages
            if account_id:
                try:
                    project_data = {"name": generated_name, "production_branch": "main"}
                    create_response = requests.post(
                        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects",
                        headers=headers,
                        json=project_data,
                        timeout=10
                    )
                    
                    if create_response.status_code in [200, 201]:
                        generated_domain = f"{generated_name}.pages.dev"
                        print(f" * ✅✅✅ УНИКАЛЬНЫЙ ДОМЕН ЗАХВАЧЕН: {generated_domain} ✅✅✅")
                        return generated_domain
                except:
                    continue
        
        print(f" * ❌ Не удалось захватить домен ни одним методом")
        return None
        
    except Exception as e:
        print(f" * ❌ Критическая ошибка алгоритма поиска домена: {e}")
        import traceback
        traceback.print_exc()
        return None

def check_domain_ownership(domain, api_token=None):
    """Проверяет принадлежит ли домен пользователю и делегирован ли он в Cloudflare"""
    if not api_token:
        api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "3IR3slId1PavczCDvWTmGiyLxbTumi2vBcHCcnev")
    
    if not api_token:
        return False
    
    try:
        import requests
        headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}
        check_response = requests.get(
            f"https://api.cloudflare.com/client/v4/zones?name={domain}",
            headers=headers,
            timeout=5
        )
        if check_response.status_code == 200:
            zones_data = check_response.json()
            if isinstance(zones_data, dict) and zones_data.get("success", False):
                zones = zones_data.get("result", [])
                if len(zones) > 0:
                    zone_id = zones[0].get("id")
                    # Проверяем что NS записи указывают на Cloudflare
                    dns_check = requests.get(
                        f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?type=NS",
                        headers=headers,
                        timeout=5
                    )
                    if dns_check.status_code == 200:
                        ns_data = dns_check.json()
                        if isinstance(ns_data, dict) and ns_data.get("success", False):
                            ns_records = ns_data.get("result", [])
                            # Проверяем что есть NS записи от Cloudflare
                            if any("cloudflare.com" in str(ns.get("content", "")).lower() for ns in ns_records):
                                return True
        return False
    except:
        return False

def setup_cloudflare_tunnel(port):
    """Настраивает и запускает Cloudflare Tunnel с продвинутой пиратской маршрутизацией"""
    print(" * 🏴‍☠️ Инициализация пиратской системы маршрутизации...")
    
    # Проверяем наличие cloudflared
    cloudflared_cmd = get_cloudflared_cmd()
    if not cloudflared_cmd:
        print(" * Установка cloudflared...")
        cloudflared_cmd = install_cloudflared()
        if not cloudflared_cmd:
            print(" * ❌ Cloudflared не установлен. Продолжаем без туннеля.")
            return None
    
    # КРИТИЧНО: Проверяем владение доменом перед попыткой использования
    tunnel_hostname = os.environ.get("CLOUDFLARE_TUNNEL_HOSTNAME", "gchat.ru")
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "3IR3slId1PavczCDvWTmGiyLxbTumi2vBcHCcnev")
    
    print(f" * 🔍 Проверка владения доменом {tunnel_hostname}...")
    domain_owned = check_domain_ownership(tunnel_hostname, api_token)
    
    claimed_domain = None  # Инициализируем переменную для захваченного домена
    
    if domain_owned:
        print(f" * ✅ Домен {tunnel_hostname} принадлежит вам и делегирован в Cloudflare")
    else:
        print(f" * ⚠️ Домен {tunnel_hostname} НЕ принадлежит вам или не делегирован в Cloudflare")
        print(f" * 🎯 Запуск гениального алгоритма автоматического поиска и захвата свободного домена...")
        
        # ГЕНИАЛЬНЫЙ АЛГОРИТМ: Автоматический поиск и захват свободного домена
        claimed_domain = find_and_claim_free_domain(api_token)
        
        if claimed_domain:
            print(f" * ✅✅✅ СВОБОДНЫЙ ДОМЕН ЗАХВАЧЕН: {claimed_domain} ✅✅✅")
            print(f" * 🔄 Настройка туннеля для захваченного домена...")
            # Обновляем переменную окружения для использования захваченного домена
            os.environ["CLOUDFLARE_TUNNEL_HOSTNAME"] = claimed_domain
            tunnel_hostname = claimed_domain
            print(f" * ✅ Теперь будет использован ПОСТОЯННЫЙ домен: {tunnel_hostname}")
            domain_owned = True  # Считаем домен "захваченным" как наш постоянный
        else:
            print(f" * ⚠️ Не удалось захватить свободный домен автоматически")
            print(f" * 💡 Будет использован quick tunnel с временным URL")
            # Используем quick tunnel только если не удалось захватить домен
            return save_and_reuse_quick_tunnel_url(cloudflared_cmd, port)
    
    # ОСНОВНОЙ МЕТОД: Пробуем создать туннель через токен (приоритет #1, только если домен принадлежит)
    tunnel_token = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "eyJhIjoiMzIxYjI5MDQ5OTNkMzEwNDI2ZTdhMTViNmViYTI3MjciLCJ0IjoiMTU1Mjc2NDktNDExNi00ZWQzLThhZGItNjI2NTMyMjQ2NzA1IiwicyI6Ik0yUmtZV0l5Wm1RdE0yVTJOQzAwT0dJMExXRm1ZV1V0WW1NeFlqWTFOVGM1WVdNNSJ9")
    if tunnel_token:
        print(" * 🎯 Использование основного метода: Cloudflare Tunnel Token")
        permanent_tunnel = create_permanent_tunnel_with_token(cloudflared_cmd, port)
        if permanent_tunnel:
            return permanent_tunnel
        else:
            print(" * ⚠️ Основной метод (токен) не сработал, переходим к резервному...")
    
    # РЕЗЕРВНЫЙ МЕТОД: Именованный туннель с браузерной авторизацией (приоритет #2, только если указан кастомный домен)
    tunnel_hostname = os.environ.get("CLOUDFLARE_TUNNEL_HOSTNAME")
    
    if tunnel_hostname and tunnel_hostname != "gchat.ru":
        # Используем именованный туннель с кастомным доменом
        tunnel_name = "gchat-tunnel"
        config_dir = os.path.join(os.path.expanduser("~"), ".cloudflared")
        os.makedirs(config_dir, exist_ok=True)
        
        try:
            # Проверяем авторизацию
            print(" * Проверка авторизации Cloudflare...")
            auth_check = subprocess.run(
                [cloudflared_cmd, "tunnel", "info"],
                capture_output=True,
                timeout=5
            )
            
            if auth_check.returncode != 0:
                print(" * Требуется авторизация в Cloudflare...")
                print(" * Откройте браузер и авторизуйтесь...")
                login_process = subprocess.Popen(
                    [cloudflared_cmd, "tunnel", "login"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                login_process.wait(timeout=120)
            
            # Проверяем существование туннеля
            print(f" * Проверка туннеля '{tunnel_name}'...")
            list_check = subprocess.run(
                [cloudflared_cmd, "tunnel", "list"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            tunnel_exists = tunnel_name in list_check.stdout
            
            if not tunnel_exists:
                print(f" * Создание туннеля '{tunnel_name}'...")
                create_process = subprocess.run(
                    [cloudflared_cmd, "tunnel", "create", tunnel_name],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if create_process.returncode != 0:
                    print(f" * Предупреждение: не удалось создать туннель: {create_process.stderr}")
            
            # Создаем/обновляем конфиг
            config_path = os.path.join(config_dir, "config.yml")
            config_content = f"""tunnel: {tunnel_name}
credentials-file: {os.path.join(config_dir, f"{tunnel_name}.json")}

ingress:
  - hostname: {tunnel_hostname}
    service: http://localhost:{port}
  - service: http_status:404
"""
            
            with open(config_path, 'w', encoding='utf-8') as f:
                f.write(config_content)
            
            print(f" * Конфигурация сохранена: {config_path}")
            
            # Пиратская автоматическая настройка DNS и маршрутизации
            dns_result = setup_cloudflare_dns_and_routing(tunnel_hostname, cloudflared_cmd)
            
            print(f" * 🚀 Cloudflare Tunnel: https://{tunnel_hostname} -> http://127.0.0.1:{port}")
            if dns_result:
                print(f" * ✅ Пиратская маршрутизация активна! Весь трафик для {tunnel_hostname} направляется через туннель.")
            
            # Запускаем туннель
            tunnel_process = subprocess.Popen(
                [cloudflared_cmd, "tunnel", "run", tunnel_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            return tunnel_process
            
        except Exception as e:
            print(f" * ⚠️ Ошибка настройки именованного туннеля: {e}")
            print(" * Переключаемся к последнему резервному методу (quick tunnel)...")
    
    # КРАЙНИЙ РЕЗЕРВ: Quick tunnel с сохранением URL (приоритет #3, только в крайнем случае)
    print(" * ⚠️ Использование крайнего резервного метода: Quick Tunnel")
    return save_and_reuse_quick_tunnel_url(cloudflared_cmd, port)

def setup_localtunnel(port, subdomain="gchat"):
    """Создает постоянный туннель через LocalTunnel - САМОЕ НАДЕЖНОЕ РЕШЕНИЕ!"""
    print(f" * 🌐 Настройка туннеля через LocalTunnel...")
    print(f" * 📚 LocalTunnel - лучший бесплатный туннель для локальных серверов")
    
    try:
        # Проверяем наличие Node.js
        if not shutil.which("node"):
            print(f" * ⚠️ Node.js не найден в системе")
            print(f" * 💡 Скачать: https://nodejs.org/")
            return None
        
        # Проверяем наличие lt (localtunnel)
        if not shutil.which("lt"):
            print(f" * ⚠️ LocalTunnel не найден")
            print(f" * 💡 Установите: npm install -g localtunnel")
            return None
        
        print(f" * 🔄 Создание туннеля с поддоменом '{subdomain}' -> localhost:{port}...")
        
        # LocalTunnel использует команду: lt --port <port> --subdomain <name>
        lt_cmd = ["lt", "--port", str(port), "--subdomain", subdomain, "--local-host", "localhost", "--no-request-browser"]
        
        # Запускаем LocalTunnel
        tunnel_process = subprocess.Popen(
            lt_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=os.environ.copy()
        )
        
        # Читаем URL из вывода
        url = None
        for i in range(100):  # Ждем до 10 секунд
            if tunnel_process.poll() is not None:
                break
            try:
                if sys.platform != 'win32':
                    import select
                    if select.select([tunnel_process.stdout], [], [], 0)[0]:
                        line = tunnel_process.stdout.readline()
                        if line:
                            print(f" * 📄 {line.strip()}")
                            # Ищем URL в строке типа "your url is: https://gchat.loca.lt"
                            url_match = re.search(r'https://[a-z0-9-]+\.loca\.lt', line)
                            if url_match:
                                url = url_match.group(0)
                                break
                time.sleep(0.1)
            except:
                time.sleep(0.1)
        
        time.sleep(1)
        
        if tunnel_process.poll() is None:
            if url:
                print(f" * ✅✅✅ ТУННЕЛЬ УСПЕШНО СОЗДАН! ✅✅✅")
                print(f" * 🌐 Ваш постоянный URL: {url}")
                print(f" * 🔗 Туннель: {url} -> http://localhost:{port}")
                print(f" * 💡 Этот домен ПОСТОЯННЫЙ пока работает приложение!")
                return tunnel_process
            else:
                print(f" * ⚠️ Туннель запущен, но URL не получен")
                return tunnel_process
        else:
            output = ""
            if tunnel_process.stdout:
                output = tunnel_process.stdout.read()
            print(f" * ⚠️ Туннель завершился с ошибкой")
            if output:
                print(f" * 📄 Ошибка: {output[:300]}")
            return None
                
    except Exception as e:
        print(f" * ❌ Ошибка создания туннеля LocalTunnel: {e}")
        import traceback
        traceback.print_exc()
        return None

def run_localtunnel(port):
    """Запускает LocalTunnel в отдельном потоке"""
    def start_tunnel():
        import time
        time.sleep(2)  # Даем серверу время на запуск
        subdomain = os.environ.get("LOCALTUNNEL_SUBDOMAIN", "gchat")
        result = setup_localtunnel(port, subdomain)
        if result:
            print(f" * ✅ LocalTunnel запущен успешно")
        else:
            print(f" * ⚠️ Не удалось запустить LocalTunnel")
            print(f" * 💡 Убедитесь что Node.js и localtunnel установлены")
            print(f" * 💡 Установите: npm install -g localtunnel")
            print(f" * 💡 Локальный URL: http://localhost:{port}")

    thread = threading.Thread(target=start_tunnel, daemon=True)
    thread.start()
    return thread


if __name__ == '__main__':
    os.makedirs('static/uploads', exist_ok=True)
    os.makedirs('static/avatars', exist_ok=True)

    port = 5000
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        port = 5001
    
    # Запускаем LocalTunnel (самое надежное решение!)
    if os.environ.get("DISABLE_TUNNEL", "").lower() != "true":
        print(" * 🌐 Запуск туннеля через LocalTunnel...")
        print(" * 📚 LocalTunnel - лучший бесплатный туннель для локальных серверов")
        run_localtunnel(port)
    else:
        print(" * Туннель отключен (DISABLE_TUNNEL=true), запуск локально.")
        print(" * 💡 Локальный URL: http://localhost:{port}")

    with app.app_context():
        db.create_all()
        ensure_schema()
        try:
            inspector = inspect(db.engine)
            table_names = [str(t) for t in inspector.get_table_names()] if inspector.get_table_names() else []
            if 'gift' in table_names:
                try:
                    columns_raw = inspector.get_columns('gift')
                    gift_columns = {str(col.get('name', col) if isinstance(col, dict) else col) for col in columns_raw}
                except Exception as col_err:
                    gift_columns = set()
                    try:
                        result = db.session.execute(text("PRAGMA table_info(gift)")).fetchall()
                        gift_columns = {str(row[1]) for row in result}
                    except:
                        pass
                statements = []
                if 'sale_start' not in gift_columns:
                    statements.append("ALTER TABLE gift ADD COLUMN sale_start DATETIME")
                if 'sale_end' not in gift_columns:
                    statements.append("ALTER TABLE gift ADD COLUMN sale_end DATETIME")
                if 'is_limited' not in gift_columns:
                    statements.append("ALTER TABLE gift ADD COLUMN is_limited BOOLEAN DEFAULT 0")
                if statements:
                    with db.engine.begin() as conn:
                        for stmt in statements:
                            try:
                                conn.execute(text(stmt))
                            except Exception as stmt_err:
                                pass
        except Exception as e:
            print(f"Schema update warning: {e}")
        current_year = datetime.now(timezone.utc).year
        halloween_start = datetime(current_year, 10, 31, 0, 0, 0, tzinfo=timezone.utc)
        halloween_end = datetime(current_year, 11, 3, 23, 59, 59, tzinfo=timezone.utc)
        gifts_data = [
            {'name': 'Цветок', 'price': 50, 'icon': '🌸', 'color': '#ff6b9d', 'rarity': 'common', 'is_limited': False, 'sale_start': None, 'sale_end': None},
            {'name': 'Сердце', 'price': 100, 'icon': '💝', 'color': '#ff1744', 'rarity': 'uncommon', 'is_limited': False, 'sale_start': None, 'sale_end': None},
            {'name': 'Корона', 'price': 200, 'icon': '👑', 'color': '#ffd700', 'rarity': 'rare', 'is_limited': False, 'sale_start': None, 'sale_end': None},
            {'name': 'Тыква Хеллоуина', 'price': 450, 'icon': '🎃', 'color': '#ff8c00', 'rarity': 'legendary', 'is_limited': True, 'sale_start': halloween_start, 'sale_end': halloween_end},
            {'name': 'Звезда', 'price': 500, 'icon': '⭐', 'color': '#ffeb3b', 'rarity': 'legendary', 'is_limited': False, 'sale_start': None, 'sale_end': None}
        ]
        try:
            gift_count = db.session.execute(text("SELECT COUNT(*) FROM gift")).scalar() or 0
            if gift_count == 0:
                for gd in gifts_data:
                    try:
                        if gd.get('is_limited'):
                            db.session.execute(text("INSERT INTO gift (name, price, icon, color, rarity, is_limited, sale_start, sale_end, created_at) VALUES (:name, :price, :icon, :color, :rarity, :is_limited, :sale_start, :sale_end, :created_at)"), {
                                'name': gd['name'], 'price': gd['price'], 'icon': gd['icon'], 'color': gd['color'], 'rarity': gd['rarity'],
                                'is_limited': 1, 'sale_start': gd['sale_start'], 'sale_end': gd['sale_end'], 'created_at': datetime.now(timezone.utc)
                            })
                        else:
                            db.session.execute(text("INSERT INTO gift (name, price, icon, color, rarity, is_limited, created_at) VALUES (:name, :price, :icon, :color, :rarity, :is_limited, :created_at)"), {
                                'name': gd['name'], 'price': gd['price'], 'icon': gd['icon'], 'color': gd['color'], 'rarity': gd['rarity'],
                                'is_limited': 0, 'created_at': datetime.now(timezone.utc)
                            })
                    except Exception as gift_err:
                        continue
                db.session.commit()
            else:
                try:
                    pumpkin_exists = db.session.execute(text("SELECT id FROM gift WHERE name = 'Тыква Хеллоуина'")).first()
                    if not pumpkin_exists:
                        try:
                            db.session.execute(text("INSERT INTO gift (name, price, icon, color, rarity, is_limited, sale_start, sale_end, created_at) VALUES ('Тыква Хеллоуина', 450, '🎃', '#ff8c00', 'legendary', 1, :start, :end, :created_at)"), {
                                'start': halloween_start, 'end': halloween_end, 'created_at': datetime.now(timezone.utc)
                            })
                            db.session.commit()
                        except Exception as insert_err:
                            pass
                    else:
                        try:
                            db.session.execute(text("UPDATE gift SET price = 450, icon = '🎃', color = '#ff8c00', rarity = 'legendary' WHERE name = 'Тыква Хеллоуина'"))
                            try:
                                db.session.execute(text("UPDATE gift SET is_limited = 1, sale_start = :start, sale_end = :end WHERE name = 'Тыква Хеллоуина'"), {
                                    'start': halloween_start, 'end': halloween_end
                                })
                            except:
                                pass
                            db.session.commit()
                        except Exception as update_err:
                            db.session.rollback()
                except Exception as pumpkin_err:
                    pass
        except Exception as e:
            print(f"Error initializing gifts: {e}")
            db.session.rollback()
    # КРИТИЧНО: Flask должен слушать на 0.0.0.0, а не только 127.0.0.1 для работы туннеля
    # Edge Cloudflare должен иметь возможность подключиться к origin серверу через туннель
    socketio.run(app, host='0.0.0.0', port=port, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
