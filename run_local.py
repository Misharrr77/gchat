#!/usr/bin/env python3
"""
Локальный запуск GChat для разработки
"""
import os
import sys

# Добавляем путь к api модулю
sys.path.insert(0, os.path.dirname(__file__))

from api.index import app, socketio, init_db

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 GChat - Локальный сервер разработки")
    print("=" * 60)
    print()
    print("📍 URL: http://localhost:5000")
    print("🔧 Режим: Development")
    print()
    
    # Инициализация БД
    with app.app_context():
        init_db()
        print("✅ База данных инициализирована")
    
    print()
    print("Нажмите Ctrl+C для остановки")
    print("=" * 60)
    print()
    
    # Запуск сервера
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
