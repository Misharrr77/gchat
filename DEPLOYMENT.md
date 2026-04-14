# Инструкция по деплою на Vercel

## Шаг 1: Подготовка

1. Создайте аккаунт на [Vercel](https://vercel.com)
2. Установите Vercel CLI:
```bash
npm install -g vercel
```

## Шаг 2: Настройка базы данных (рекомендуется)

### Вариант A: Neon PostgreSQL (бесплатно)

1. Зарегистрируйтесь на [Neon](https://neon.tech)
2. Создайте новый проект
3. Скопируйте Connection String
4. Формат: `postgresql://user:password@host/database`

### Вариант B: Supabase PostgreSQL (бесплатно)

1. Зарегистрируйтесь на [Supabase](https://supabase.com)
2. Создайте новый проект
3. В Settings → Database найдите Connection String
4. Используйте URI формат

### Вариант C: Railway PostgreSQL

1. Зарегистрируйтесь на [Railway](https://railway.app)
2. Создайте PostgreSQL базу
3. Скопируйте DATABASE_URL

## Шаг 3: Деплой

### Через Vercel CLI

```bash
# Войдите в аккаунт
vercel login

# Деплой проекта
vercel

# Добавьте переменные окружения
vercel env add FLASK_SECRET_KEY
# Введите случайную строку, например: my-super-secret-key-12345

# Если используете внешнюю БД:
vercel env add DATABASE_URL
# Введите connection string из шага 2

# Продакшн деплой
vercel --prod
```

### Через Vercel Dashboard

1. Импортируйте проект с GitHub/GitLab
2. Vercel автоматически определит настройки
3. Добавьте Environment Variables:
   - `FLASK_SECRET_KEY`: случайная строка
   - `DATABASE_URL`: (опционально) connection string БД
4. Deploy!

## Шаг 4: Проверка

После деплоя откройте URL проекта и:
1. Зарегистрируйте аккаунт
2. Создайте канал
3. Отправьте сообщение
4. Проверьте работу в реальном времени

## Важные замечания

### База данных

- **SQLite** (по умолчанию): Работает, но данные НЕ сохраняются между деплоями
- **PostgreSQL** (рекомендуется): Постоянное хранение данных
- **MySQL**: Также поддерживается

### Ограничения Vercel

- Максимальное время выполнения функции: 10 секунд (Hobby), 60 секунд (Pro)
- WebSocket соединения могут быть ограничены
- Для production рекомендуется использовать внешнюю БД

### Масштабирование

Для высоконагруженных приложений рассмотрите:
- Redis для кэширования и сессий
- CDN для статических файлов
- Отдельный WebSocket сервер

## Обновление приложения

```bash
# Внесите изменения в код
git add .
git commit -m "Update"
git push

# Или через CLI
vercel --prod
```

## Откат к предыдущей версии

В Vercel Dashboard:
1. Deployments → выберите нужную версию
2. Promote to Production

## Мониторинг

Vercel предоставляет:
- Логи в реальном времени
- Метрики производительности
- Аналитику трафика

Доступ: Dashboard → ваш проект → Analytics

## Поддержка

При проблемах проверьте:
1. Логи в Vercel Dashboard
2. Правильность переменных окружения
3. Доступность базы данных
4. Версии зависимостей в requirements.txt
