# 🚀 Быстрый старт GChat

## За 5 минут до деплоя

### 1. Установите Vercel CLI
```bash
npm install -g vercel
```

### 2. Войдите в аккаунт
```bash
vercel login
```

### 3. Проверьте готовность
```bash
python check_deployment.py
```

### 4. Деплой!
```bash
vercel --prod
```

### 5. Настройте переменные окружения
```bash
# Обязательно
vercel env add FLASK_SECRET_KEY
# Введите случайную строку, например: my-super-secret-key-12345

# Опционально (для постоянного хранения данных)
vercel env add DATABASE_URL
# Введите connection string от PostgreSQL провайдера
```

### 6. Повторный деплой с переменными
```bash
vercel --prod
```

## Готово! 🎉

Откройте URL проекта и начните пользоваться мессенджером.

---

## Локальная разработка

```bash
# Установите зависимости
pip install -r requirements.txt

# Запустите сервер
python run_local.py
```

Откройте http://localhost:5000

---

## Рекомендуемые БД провайдеры (бесплатно)

### Neon PostgreSQL
- Сайт: https://neon.tech
- Бесплатно: 0.5 GB
- Регион: выберите ближайший

### Supabase PostgreSQL
- Сайт: https://supabase.com
- Бесплатно: 500 MB
- Включает дополнительные фичи

### Railway PostgreSQL
- Сайт: https://railway.app
- Бесплатно: $5 кредитов/месяц
- Простая настройка

---

## Структура проекта

```
gchat/
├── api/
│   ├── __init__.py
│   ├── index.py          # Основное приложение
│   └── database.py       # Утилиты БД
├── vercel.json           # Конфигурация Vercel
├── requirements.txt      # Python зависимости
├── run_local.py          # Локальный запуск
├── check_deployment.py   # Проверка перед деплоем
└── README.md             # Документация
```

---

## Частые проблемы

### Ошибка: "FLASK_SECRET_KEY not set"
```bash
vercel env add FLASK_SECRET_KEY
```

### Ошибка: "Database connection failed"
Проверьте DATABASE_URL или используйте SQLite (по умолчанию)

### Ошибка: "Module not found"
```bash
pip install -r requirements.txt
```

### WebSocket не работает
Vercel поддерживает WebSocket, но с ограничениями.
Для production рекомендуется отдельный WebSocket сервер.

---

## Следующие шаги

1. ✅ Настройте внешнюю БД для постоянного хранения
2. ✅ Добавьте свой домен в Vercel
3. ✅ Настройте SSL сертификат (автоматически)
4. ✅ Пригласите друзей!

---

## Поддержка

- 📖 Полная документация: [README.md](README.md)
- 🔧 Инструкция по деплою: [DEPLOYMENT.md](DEPLOYMENT.md)
- 📡 API документация: [API.md](API.md)

---

**Приятного использования! 💬**
