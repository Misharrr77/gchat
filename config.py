"""
Конфигурация приложения для разных окружений
"""
import os
from datetime import timedelta

class Config:
    """Базовая конфигурация"""
    
    # Flask
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # Database
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }
    
    # Session
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Upload
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
    UPLOAD_FOLDER = '/tmp/uploads'
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'mp3', 'wav'}
    
    # SocketIO
    SOCKETIO_ASYNC_MODE = 'threading'
    SOCKETIO_CORS_ALLOWED_ORIGINS = '*'
    SOCKETIO_PING_TIMEOUT = 60
    SOCKETIO_PING_INTERVAL = 25

class DevelopmentConfig(Config):
    """Конфигурация для разработки"""
    DEBUG = True
    TESTING = False
    
    # SQLite для локальной разработки
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///gchat_dev.db'
    
    # Более подробное логирование
    SQLALCHEMY_ECHO = False
    
    # Отключаем HTTPS для локальной разработки
    SESSION_COOKIE_SECURE = False

class ProductionConfig(Config):
    """Конфигурация для production"""
    DEBUG = False
    TESTING = False
    
    # Обязательно используем внешнюю БД в production
    DATABASE_URL = os.environ.get('DATABASE_URL')
    if DATABASE_URL:
        # Fix для некоторых провайдеров
        if DATABASE_URL.startswith('postgres://'):
            DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
        SQLALCHEMY_DATABASE_URI = DATABASE_URL
    else:
        # Fallback на SQLite в /tmp (не рекомендуется для production)
        SQLALCHEMY_DATABASE_URI = 'sqlite:////tmp/gchat.db'
    
    # Production настройки БД
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_size': 10,
        'max_overflow': 20,
        'pool_timeout': 30,
    }
    
    # Безопасность
    SESSION_COOKIE_SECURE = True  # Только HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Strict'
    
    # Отключаем подробное логирование
    SQLALCHEMY_ECHO = False

class TestingConfig(Config):
    """Конфигурация для тестов"""
    DEBUG = True
    TESTING = True
    
    # In-memory SQLite для тестов
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    
    # Отключаем CSRF для тестов
    WTF_CSRF_ENABLED = False

# Словарь конфигураций
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Получить конфигурацию на основе окружения"""
    env = os.environ.get('FLASK_ENV', 'production')
    return config.get(env, config['default'])
