#!/bin/bash

# Параметры
KEYSTORE_NAME="my-release-key.jks"
KEYSTORE_PASSWORD="android123"
KEY_ALIAS="my-key-alias"
KEY_PASSWORD="android123"
VALIDITY_DAYS="10000"

echo "🔐 Генерирую Android Keystore..."

keytool -genkey -v \
  -keystore "$KEYSTORE_NAME" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY_DAYS" \
  -alias "$KEY_ALIAS" \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=Android Developer, OU=MyCompany, O=MyCompany, L=Moscow, ST=Moscow, C=RU"

echo ""
echo "✅ Keystore создан: $KEYSTORE_NAME"
echo "📁 Переместите файл в папку вашего проекта Android"
echo ""
echo "Параметры:"
echo "  Пароль keystore: $KEYSTORE_PASSWORD"
echo "  Alias: $KEY_ALIAS"
echo "  Пароль ключа: $KEY_PASSWORD"