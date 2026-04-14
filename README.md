# GChat - Мессенджер для Vercel

Современный веб-мессенджер с поддержкой реального времени, друзей, каналов и подарков.

## Возможности

- 💬 Мгновенный обмен сообщениями в реальном времени
- 👥 Система друзей и запросов в друзья
- 📢 Публичные и приватные каналы
- 🎁 Система подарков и звёзд
- 🎨 Тёмная и светлая темы
- 📱 Адаптивный дизайн

## Деплой на Vercel

### Быстрый старт

1. Установите Vercel CLI:
```bash
npm install -g vercel
```

2. Войдите в аккаунт:
```bash
vercel login
```

3. Деплой:
```bash
vercel
```

### Настройка переменных окружения

В панели Vercel добавьте переменную:
- `FLASK_SECRET_KEY` - секретный ключ для сессий (сгенерируйте случайную строку)

### Структура проекта

```
.
├── api/
│   ├── __init__.py
│   └── index.py          # Основное приложение Flask
├── vercel.json           # Конфигурация Vercel
├── requirements.txt      # Python зависимости
└── README.md
```

## База данных

Приложение использует SQLite в `/tmp/gchat.db` для serverless окружения Vercel.

**Важно:** База данных в `/tmp` временная и очищается между запусками. Для продакшена рекомендуется:
- PostgreSQL (Neon, Supabase, Railway)
- MySQL (PlanetScale)
- MongoDB Atlas

### Подключение PostgreSQL

Измените в `api/index.py`:

```python
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:////tmp/gchat.db')
```

Добавьте в `requirements.txt`:
```
psycopg2-binary==2.9.9
```

## Локальная разработка

```bash
# Установите зависимости
pip install -r requirements.txt

# Запустите приложение
python api/index.py
```

Откройте http://localhost:5000

## Технологии

- **Backend:** Flask, Flask-SocketIO, SQLAlchemy
- **Frontend:** Vanilla JavaScript, Socket.IO
- **Database:** SQLite (можно заменить на PostgreSQL)
- **Hosting:** Vercel

## Лицензия

MIT
