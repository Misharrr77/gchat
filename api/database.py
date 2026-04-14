"""
Утилиты для работы с базой данных
"""
from datetime import datetime, timezone
from sqlalchemy import text

def init_database(db, app):
    """Инициализация базы данных с проверкой схемы"""
    with app.app_context():
        # Создаём все таблицы
        db.create_all()
        
        # Проверяем и добавляем недостающие колонки
        ensure_columns(db)
        
        # Создаём дефолтные данные
        create_default_data(db)
        
        print("✅ База данных готова к работе")

def ensure_columns(db):
    """Проверка и добавление недостающих колонок"""
    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        
        # Проверяем таблицу user
        if 'user' in inspector.get_table_names():
            columns = {col['name'] for col in inspector.get_columns('user')}
            
            statements = []
            
            # Список необходимых колонок
            required_columns = {
                'favorite_music': "ALTER TABLE user ADD COLUMN favorite_music VARCHAR(255)",
                'stars_balance': "ALTER TABLE user ADD COLUMN stars_balance INTEGER DEFAULT 100",
                'display_name': "ALTER TABLE user ADD COLUMN display_name VARCHAR(120)",
                'bio': "ALTER TABLE user ADD COLUMN bio TEXT",
                'last_seen': "ALTER TABLE user ADD COLUMN last_seen DATETIME",
                'created_at': "ALTER TABLE user ADD COLUMN created_at DATETIME"
            }
            
            for col_name, sql in required_columns.items():
                if col_name not in columns:
                    statements.append(sql)
            
            # Выполняем миграции
            if statements:
                with db.engine.begin() as conn:
                    for stmt in statements:
                        try:
                            conn.execute(text(stmt))
                            print(f"✅ Добавлена колонка: {stmt.split('ADD COLUMN')[1].split()[0]}")
                        except Exception as e:
                            # Игнорируем ошибки если колонка уже существует
                            pass
    except Exception as e:
        print(f"⚠️  Ошибка при проверке схемы: {e}")

def create_default_data(db):
    """Создание дефолтных данных"""
    from api.index import Gift, Room
    
    # Создаём дефолтные подарки
    if Gift.query.count() == 0:
        default_gifts = [
            Gift(name="Роза", price=10, icon="🌹", color="#ff4444", rarity="common"),
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
        print(f"✅ Создано {len(default_gifts)} подарков")
    
    # Создаём дефолтный общий канал
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
        print("✅ Создан канал 'Общий'")

def cleanup_old_data(db, days=30):
    """Очистка старых данных (опционально)"""
    from datetime import timedelta
    from api.index import Message, Notification, CallLog
    
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Удаляем старые сообщения
    old_messages = Message.query.filter(Message.timestamp < cutoff_date).count()
    if old_messages > 0:
        Message.query.filter(Message.timestamp < cutoff_date).delete()
        print(f"🗑️  Удалено {old_messages} старых сообщений")
    
    # Удаляем старые уведомления
    old_notifs = Notification.query.filter(
        Notification.created_at < cutoff_date,
        Notification.is_read == True
    ).count()
    if old_notifs > 0:
        Notification.query.filter(
            Notification.created_at < cutoff_date,
            Notification.is_read == True
        ).delete()
        print(f"🗑️  Удалено {old_notifs} старых уведомлений")
    
    # Удаляем старые логи звонков
    old_calls = CallLog.query.filter(CallLog.started_at < cutoff_date).count()
    if old_calls > 0:
        CallLog.query.filter(CallLog.started_at < cutoff_date).delete()
        print(f"🗑️  Удалено {old_calls} старых логов звонков")
    
    db.session.commit()

def get_database_stats(db):
    """Получение статистики базы данных"""
    from api.index import User, Room, Message, Gift, UserGift
    
    stats = {
        'users': User.query.count(),
        'rooms': Room.query.count(),
        'messages': Message.query.count(),
        'gifts': Gift.query.count(),
        'user_gifts': UserGift.query.count(),
        'online_users': User.query.filter_by(is_online=True).count()
    }
    
    return stats
