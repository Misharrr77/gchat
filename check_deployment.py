#!/usr/bin/env python3
"""
Проверка готовности приложения к деплою на Vercel
"""
import os
import sys
import json

def check_file_exists(filepath, required=True):
    """Проверка существования файла"""
    exists = os.path.exists(filepath)
    status = "✅" if exists else ("❌" if required else "⚠️")
    req_text = " (обязательно)" if required else " (опционально)"
    print(f"{status} {filepath}{req_text if not exists else ''}")
    return exists

def check_vercel_json():
    """Проверка vercel.json"""
    if not os.path.exists('vercel.json'):
        return False
    
    try:
        with open('vercel.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Проверяем обязательные поля
        if 'builds' not in config:
            print("  ⚠️  Отсутствует секция 'builds'")
            return False
        
        if 'routes' not in config:
            print("  ⚠️  Отсутствует секция 'routes'")
            return False
        
        print("  ✅ Конфигурация корректна")
        return True
    except json.JSONDecodeError as e:
        print(f"  ❌ Ошибка парсинга JSON: {e}")
        return False

def check_requirements():
    """Проверка requirements.txt"""
    if not os.path.exists('requirements.txt'):
        return False
    
    required_packages = ['Flask', 'Flask-SocketIO', 'Flask-SQLAlchemy']
    
    with open('requirements.txt', 'r', encoding='utf-8') as f:
        content = f.read()
    
    missing = []
    for package in required_packages:
        if package not in content:
            missing.append(package)
    
    if missing:
        print(f"  ⚠️  Отсутствуют пакеты: {', '.join(missing)}")
        return False
    
    print("  ✅ Все необходимые пакеты присутствуют")
    return True

def check_api_structure():
    """Проверка структуры api/"""
    if not os.path.exists('api'):
        print("  ❌ Папка api/ не найдена")
        return False
    
    if not os.path.exists('api/__init__.py'):
        print("  ⚠️  Отсутствует api/__init__.py")
    
    if not os.path.exists('api/index.py'):
        print("  ❌ Отсутствует api/index.py")
        return False
    
    print("  ✅ Структура корректна")
    return True

def check_env_variables():
    """Проверка переменных окружения"""
    print("\n📋 Переменные окружения:")
    
    env_vars = {
        'FLASK_SECRET_KEY': False,  # Обязательная
        'DATABASE_URL': True,  # Опциональная
    }
    
    all_ok = True
    for var, optional in env_vars.items():
        exists = os.environ.get(var) is not None
        status = "✅" if exists else ("⚠️" if optional else "❌")
        opt_text = " (опционально)" if optional else " (обязательно)"
        
        if exists:
            value = os.environ.get(var)
            masked = value[:10] + "..." if len(value) > 10 else value
            print(f"{status} {var} = {masked}")
        else:
            print(f"{status} {var} не установлена{opt_text}")
            if not optional:
                all_ok = False
    
    if not all_ok:
        print("\n💡 Установите переменные окружения:")
        print("   vercel env add FLASK_SECRET_KEY")
        print("   vercel env add DATABASE_URL  # опционально")
    
    return all_ok

def check_python_syntax():
    """Проверка синтаксиса Python файлов"""
    import py_compile
    
    python_files = []
    for root, dirs, files in os.walk('.'):
        # Пропускаем venv, __pycache__ и т.д.
        dirs[:] = [d for d in dirs if d not in ['venv', 'env', '__pycache__', '.git', 'node_modules']]
        
        for file in files:
            if file.endswith('.py'):
                python_files.append(os.path.join(root, file))
    
    errors = []
    for filepath in python_files:
        try:
            py_compile.compile(filepath, doraise=True)
        except py_compile.PyCompileError as e:
            errors.append((filepath, str(e)))
    
    if errors:
        print(f"  ❌ Найдены ошибки синтаксиса:")
        for filepath, error in errors:
            print(f"     {filepath}: {error}")
        return False
    
    print(f"  ✅ Проверено {len(python_files)} файлов")
    return True

def main():
    """Основная функция проверки"""
    print("=" * 60)
    print("🔍 Проверка готовности к деплою на Vercel")
    print("=" * 60)
    print()
    
    checks = []
    
    # Проверка файлов
    print("📁 Проверка файлов:")
    checks.append(("vercel.json", check_file_exists('vercel.json', required=True)))
    checks.append(("requirements.txt", check_file_exists('requirements.txt', required=True)))
    checks.append(("api/__init__.py", check_file_exists('api/__init__.py', required=True)))
    checks.append(("api/index.py", check_file_exists('api/index.py', required=True)))
    check_file_exists('README.md', required=False)
    check_file_exists('.gitignore', required=False)
    check_file_exists('.vercelignore', required=False)
    print()
    
    # Проверка конфигурации
    print("⚙️  Проверка конфигурации:")
    checks.append(("vercel.json", check_vercel_json()))
    checks.append(("requirements.txt", check_requirements()))
    checks.append(("api structure", check_api_structure()))
    print()
    
    # Проверка синтаксиса
    print("🐍 Проверка синтаксиса Python:")
    checks.append(("Python syntax", check_python_syntax()))
    print()
    
    # Проверка переменных окружения
    env_ok = check_env_variables()
    print()
    
    # Итоги
    print("=" * 60)
    passed = sum(1 for _, result in checks if result)
    total = len(checks)
    
    if passed == total:
        print("✅ Все проверки пройдены!")
        print()
        print("🚀 Готово к деплою:")
        print("   vercel --prod")
    else:
        print(f"⚠️  Пройдено {passed}/{total} проверок")
        print()
        print("Исправьте ошибки перед деплоем")
    
    print("=" * 60)
    
    return passed == total

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
