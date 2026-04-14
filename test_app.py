"""
Простые тесты для проверки работоспособности приложения
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from api.index import app, db, User, Room, Message

def test_app_creation():
    """Тест создания приложения"""
    assert app is not None
    print("✅ Приложение создано")

def test_database_connection():
    """Тест подключения к БД"""
    with app.app_context():
        try:
            db.create_all()
            print("✅ База данных подключена")
            return True
        except Exception as e:
            print(f"❌ Ошибка подключения к БД: {e}")
            return False

def test_user_creation():
    """Тест создания пользователя"""
    with app.app_context():
        try:
            # Проверяем существующего пользователя
            test_user = User.query.filter_by(username="test_user").first()
            if test_user:
                db.session.delete(test_user)
                db.session.commit()
            
            # Создаём нового
            user = User(
                username="test_user",
                password_hash="test_hash",
                stars_balance=100
            )
            db.session.add(user)
            db.session.commit()
            
            # Проверяем
            found = User.query.filter_by(username="test_user").first()
            assert found is not None
            assert found.username == "test_user"
            
            # Удаляем
            db.session.delete(found)
            db.session.commit()
            
            print("✅ Создание пользователя работает")
            return True
        except Exception as e:
            print(f"❌ Ошибка создания пользователя: {e}")
            return False

def test_room_creation():
    """Тест создания комнаты"""
    with app.app_context():
        try:
            # Проверяем существующую комнату
            test_room = Room.query.filter_by(name="test_room").first()
            if test_room:
                db.session.delete(test_room)
                db.session.commit()
            
            # Создаём новую
            room = Room(
                name="test_room",
                display_name="Test Room",
                is_group=True,
                is_private=False
            )
            db.session.add(room)
            db.session.commit()
            
            # Проверяем
            found = Room.query.filter_by(name="test_room").first()
            assert found is not None
            assert found.display_name == "Test Room"
            
            # Удаляем
            db.session.delete(found)
            db.session.commit()
            
            print("✅ Создание комнаты работает")
            return True
        except Exception as e:
            print(f"❌ Ошибка создания комнаты: {e}")
            return False

def test_routes():
    """Тест основных маршрутов"""
    client = app.test_client()
    
    # Тест главной страницы
    response = client.get('/')
    assert response.status_code == 200
    print("✅ Главная страница доступна")
    
    # Тест поиска пользователей
    response = client.get('/search_users?q=test')
    assert response.status_code == 200
    print("✅ Поиск пользователей работает")
    
    return True

def run_all_tests():
    """Запуск всех тестов"""
    print("=" * 60)
    print("🧪 Запуск тестов GChat")
    print("=" * 60)
    print()
    
    tests = [
        ("Создание приложения", test_app_creation),
        ("Подключение к БД", test_database_connection),
        ("Создание пользователя", test_user_creation),
        ("Создание комнаты", test_room_creation),
        ("Маршруты", test_routes),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            result = test_func()
            if result or result is None:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {name}: {e}")
            failed += 1
        print()
    
    print("=" * 60)
    print(f"📊 Результаты: {passed} пройдено, {failed} провалено")
    print("=" * 60)
    
    return failed == 0

if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
