#!/bin/bash

echo "🚀 Деплой GChat на Vercel"
echo "=========================="
echo ""

# Проверка установки Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI не установлен"
    echo "Установите: npm install -g vercel"
    exit 1
fi

echo "✅ Vercel CLI найден"
echo ""

# Проверка переменных окружения
echo "📋 Проверка переменных окружения..."
echo ""

# Проверяем FLASK_SECRET_KEY
if ! vercel env ls | grep -q "FLASK_SECRET_KEY"; then
    echo "⚠️  FLASK_SECRET_KEY не настроен"
    echo "Добавьте его командой:"
    echo "  vercel env add FLASK_SECRET_KEY"
    echo ""
    read -p "Добавить сейчас? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        vercel env add FLASK_SECRET_KEY
    fi
fi

echo ""
echo "🔨 Запуск деплоя..."
echo ""

# Деплой
vercel --prod

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "📊 Проверьте статус: https://vercel.com/dashboard"
echo ""
