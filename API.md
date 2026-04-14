# GChat API Documentation

## Аутентификация

### POST /login
Вход или регистрация пользователя

**Form Data:**
- `username` (string, required) - имя пользователя
- `password` (string, required) - пароль

**Response:** Redirect to /

### GET /logout
Выход из системы

**Response:** Redirect to /

## Пользователи

### GET /search_users
Поиск пользователей

**Query Parameters:**
- `q` (string, required) - поисковый запрос

**Response:**
```json
{
  "users": [
    {
      "username": "string",
      "avatar": "string"
    }
  ]
}
```

### POST /send_friend_request
Отправка запроса в друзья

**JSON Body:**
```json
{
  "to_username": "string"
}
```

**Response:**
```json
{
  "success": true
}
```

## Каналы

### POST /create_channel
Создание нового канала

**Form Data:**
- `channel_name` (string, required) - название канала
- `is_private` (boolean, optional) - приватный канал

**Response:** Redirect to /

## WebSocket Events

### Client → Server

#### connect
Подключение к серверу

**Emits:**
- `rooms_list` - список доступных комнат
- `friends_list` - список друзей

#### get_rooms
Получить список комнат

**Response:** `rooms_list` event

#### get_friends
Получить список друзей

**Response:** `friends_list` event

#### join
Присоединиться к комнате

**Data:**
```json
{
  "room": "string"
}
```

#### leave
Покинуть комнату

**Data:**
```json
{
  "room": "string"
}
```

#### get_history
Получить историю сообщений

**Data:**
```json
{
  "room": "string",
  "limit": 50,
  "offset": 0
}
```

**Response:** `message_history` event

#### send_message
Отправить сообщение

**Data:**
```json
{
  "room": "string",
  "message": "string",
  "reply_to": "number (optional)"
}
```

**Broadcasts:** `new_message` event to room

### Server → Client

#### rooms_list
Список доступных комнат

**Data:**
```json
[
  {
    "name": "string",
    "display_name": "string",
    "is_private": boolean,
    "is_group": boolean
  }
]
```

#### friends_list
Список друзей

**Data:**
```json
{
  "friends": [
    {
      "username": "string",
      "avatar": "string"
    }
  ]
}
```

#### message_history
История сообщений комнаты

**Data:**
```json
{
  "room": "string",
  "history": [
    {
      "id": number,
      "username": "string",
      "avatar": "string",
      "message": "string",
      "timestamp": "ISO 8601 string"
    }
  ]
}
```

#### new_message
Новое сообщение в комнате

**Data:**
```json
{
  "id": number,
  "username": "string",
  "avatar": "string",
  "message": "string",
  "room": "string",
  "timestamp": "ISO 8601 string"
}
```

#### error
Ошибка

**Data:**
```json
{
  "msg": "string"
}
```

## Модели данных

### User
```python
{
  "id": int,
  "username": str,
  "avatar": str,
  "status": str,
  "is_online": bool,
  "display_name": str,
  "bio": str,
  "favorite_music": str,
  "stars_balance": int,
  "last_seen": datetime,
  "created_at": datetime
}
```

### Room
```python
{
  "id": int,
  "name": str,
  "display_name": str,
  "is_group": bool,
  "is_private": bool,
  "created_at": datetime,
  "last_message_at": datetime
}
```

### Message
```python
{
  "id": int,
  "content": str,
  "timestamp": datetime,
  "attachment_path": str,
  "is_edited": bool,
  "is_pinned": bool,
  "user_id": int,
  "room_id": int
}
```

### Gift
```python
{
  "id": int,
  "name": str,
  "price": int,
  "icon": str,
  "color": str,
  "rarity": str,  # "common", "uncommon", "rare", "legendary"
  "is_limited": bool
}
```

## Коды ошибок

- `400` - Bad Request (неверные параметры)
- `401` - Unauthorized (требуется авторизация)
- `403` - Forbidden (нет доступа)
- `404` - Not Found (ресурс не найден)
- `500` - Internal Server Error (ошибка сервера)

## Ограничения

- Максимальный размер файла: 16 MB
- Максимальная длина сообщения: без ограничений (TEXT)
- Максимальная длина имени пользователя: 80 символов
- Максимальная длина названия комнаты: 120 символов
- История музыки: до 100 записей на пользователя

## Примеры использования

### JavaScript (Socket.IO)

```javascript
// Подключение
const socket = io();

// Получение комнат
socket.on('connect', () => {
  socket.emit('get_rooms');
});

// Обработка списка комнат
socket.on('rooms_list', (rooms) => {
  console.log('Доступные комнаты:', rooms);
});

// Присоединение к комнате
socket.emit('join', { room: 'general' });

// Получение истории
socket.emit('get_history', { room: 'general', limit: 50 });

// Отправка сообщения
socket.emit('send_message', {
  room: 'general',
  message: 'Привет, мир!'
});

// Получение новых сообщений
socket.on('new_message', (msg) => {
  console.log('Новое сообщение:', msg);
});
```

### Python (requests)

```python
import requests

# Регистрация/вход
session = requests.Session()
response = session.post('https://your-app.vercel.app/login', data={
    'username': 'testuser',
    'password': 'password123'
})

# Поиск пользователей
response = session.get('https://your-app.vercel.app/search_users', params={
    'q': 'john'
})
users = response.json()['users']

# Отправка запроса в друзья
response = session.post('https://your-app.vercel.app/send_friend_request', json={
    'to_username': 'john'
})
```

## Безопасность

- Пароли хешируются с использованием Werkzeug (PBKDF2)
- Сессии защищены SECRET_KEY
- CORS настроен для Socket.IO
- SQL-инъекции предотвращены через SQLAlchemy ORM
- XSS предотвращён через экранирование в шаблонах

## Производительность

- Индексы на часто запрашиваемых полях (username, room_id, user_id)
- Connection pooling для БД
- Lazy loading для связанных объектов
- Пагинация для больших списков
