# Doc Capture — инструкция по установке

Документ описывает установку трёх частей системы по отдельности:
сервер на Windows, сервер на Linux, мобильное приложение на Android,
мобильное приложение на iOS. Админ-панель отдельно не устанавливается —
она встроена в сервер и открывается в браузере по адресу сервера.

Перед началом: понадобится IP-адрес или доменное имя машины, на которой
будет работать сервер — он нужен и для настройки мобильного приложения,
и для доступа с других компьютеров.

---

## 1. Сервер на Windows

### 1.1 Предварительные требования

1. **Node.js (LTS)** — скачать с https://nodejs.org, кнопка "LTS".
   Запустить установщик, везде "Next" со значениями по умолчанию, "Finish".
   Проверка: открыть "Командная строка" (cmd) и выполнить:
   ```
   node -v
   npm -v
   ```
   Должны вывестись номера версий, а не ошибка "не является внутренней
   или внешней командой".

2. **PostgreSQL** — скачать установщик для Windows с
   https://www.postgresql.org/download/windows/. При установке:
   - Задать пароль для пользователя `postgres` — **запомнить его**,
     он понадобится на шаге 1.4.
   - Порт оставить по умолчанию — `5432`.
   - Stack Builder в конце можно пропустить (Cancel).

### 1.2 Создание базы данных

1. Открыть из меню "Пуск" → "SQL Shell (psql)".
2. На все вопросы (Server, Database, Port, Username) нажимать Enter,
   принимая значения по умолчанию, пока не попросит пароль — ввести
   пароль пользователя `postgres`, заданный на шаге 1.1.
3. В появившемся приглашении `postgres=#` выполнить:
   ```sql
   CREATE DATABASE doc_capture;
   ```

### 1.3 Установка сервера и админ-панели (Setup.exe)

1. Запустить `installer/Setup.exe` из переданного архива.
2. Указать папку установки (по умолчанию
   `C:\Program Files\DocCapture`) и нажать "Install".
3. После завершения — "Close".

### 1.4 Первый запуск и настройка

1. Меню "Пуск" → "Doc Capture" → **"Start Doc Capture Server"**.
   Откроется окно консоли. При первом запуске рядом автоматически
   создаётся файл `app\.env` из шаблона.
2. Закрыть окно консоли (он попробует стартовать с настройками-плейсхолдерами).
3. Открыть `C:\Program Files\DocCapture\app\.env` в Блокноте и проверить/
   поправить:
   - `DB_PASSWORD` — должен совпадать с паролем пользователя `postgres`
     из шага 1.1 (по умолчанию в файле стоит `postgres` — если задавали
     другой пароль, поменять здесь).
   - `JWT_SECRET` — можно оставить `change_me`: при первом запуске сервер
     сам сгенерирует случайный секрет и сохранит его обратно в этот файл.
     Менять руками нужно только если хочется задать свой конкретный
     секрет.
   - `PORT` — оставить `3000`, если порт не занят другой программой.
4. Сохранить файл, снова запустить "Start Doc Capture Server". В консоли
   должна появиться строка `Server listening on port 3000` без ошибок
   выше неё. Это окно нужно держать открытым, пока сервер должен работать
   (про автозапуск без открытого окна — см. 1.6).

### 1.5 Создание первого администратора

1. Меню "Пуск" → "Doc Capture" → **"Create Admin User"** — откроется
   окно командной строки, уже находящееся в нужной папке.
2. Ввести команду (заменив имя пользователя, пароль и язык на свои;
   язык — `he`, `en` или `ru`) и нажать Enter:
   ```
   create-admin.bat admin МойНадёжныйПароль1 he
   ```
3. Должна появиться строка `Admin user "admin" is ready.`
4. Меню "Пуск" → "Doc Capture" → **"Open Admin Panel"** (или открыть
   http://localhost:3000 в браузере) и войти под только что созданными
   данными.

### 1.6 Доступ с других устройств в сети (нужно для мобильного приложения)

1. Узнать локальный IP-адрес этого компьютера: в cmd выполнить
   `ipconfig`, найти строку "IPv4-адрес" (например, `192.168.1.50`).
2. Открыть порт в брандмауэре: "Брандмауэр Защитника Windows" → "Доп.
   параметры" → "Правила для входящих подключений" → "Создать правило" →
   тип "Порт" → TCP → "Определённые локальные порты" → `3000` →
   "Разрешить подключение" → дать правилу имя, например "Doc Capture".
3. С телефона или другого ПК в той же сети адрес сервера будет
   `http://192.168.1.50:3000` (со своим IP вместо примера).

### 1.7 (Необязательно) Автозапуск без открытого окна консоли

Из коробки сервер запускается через окно консоли, которое нужно держать
открытым. Для постоянной работы как фоновая служба Windows можно
обернуть его через сторонний инструмент NSSM (https://nssm.cc, не
входит в поставку):
```
nssm install DocCaptureServer "C:\Program Files\nodejs\node.exe" "C:\Program Files\DocCapture\app\dist\main.js"
```
и в настройках NSSM указать Startup directory =
`C:\Program Files\DocCapture\app`.

---

## 2. Сервер на Linux (Ubuntu/Debian)

### 2.1 Установка Node.js

Рекомендуется через nvm (надёжнее, чем системные репозитории, которые
иногда блокируются сетевыми политиками):
```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v
```

### 2.2 Установка и настройка PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'choose_a_password';"
sudo -u postgres createdb doc_capture
```
Запомнить пароль, заданный в `ALTER USER` — понадобится в `.env`.

### 2.3 Развёртывание файлов сервера

```bash
sudo mkdir -p /opt/doc-capture/app
sudo useradd -r -s /usr/sbin/nologin doccapture   # сервисный пользователь, без логина

# Распаковать переданный архив и скопировать содержимое server/ в /opt/doc-capture/app
unzip doc-capture-project.zip
sudo cp -r project-root/server/* /opt/doc-capture/app/
sudo chown -R doccapture:doccapture /opt/doc-capture
```

### 2.4 Установка зависимостей и сборка

```bash
cd /opt/doc-capture/app
sudo -u doccapture npm install
sudo -u doccapture npm run build
```

### 2.5 Настройка .env

```bash
sudo -u doccapture cp .env.example .env
sudo -u doccapture nano .env
```
Поправить `DB_PASSWORD` (под пароль из 2.2). `JWT_SECRET` можно не
трогать — сервер сам сгенерирует случайный секрет при первом запуске и
сохранит его в этот же файл.

### 2.6 Первый запуск (создаёт схему БД) и админ

```bash
sudo -u doccapture node dist/main.js
# Дождаться "Server listening on port 3000", затем Ctrl+C
sudo -u doccapture npm run create-admin -- admin МойНадёжныйПароль1 he
```

### 2.7 Запуск как systemd-сервис (постоянная работа)

```bash
sudo cp /opt/doc-capture/app/scripts/doc-capture.service /etc/systemd/system/doc-capture.service
sudo systemctl daemon-reload
sudo systemctl enable --now doc-capture
sudo systemctl status doc-capture     # должен быть active (running)
journalctl -u doc-capture -f          # логи в реальном времени
```

### 2.8 Сеть

```bash
sudo ufw allow 3000/tcp        # если используется ufw
ip addr                         # узнать IP-адрес сервера для мобильного приложения
```

Для production с доменом и HTTPS — поставить nginx перед сервером
(`proxy_pass http://localhost:3000;`) и сертификат через Let's Encrypt
(certbot). Это отдельная стандартная настройка, не входящая в поставку.

---

## 3. Мобильное приложение — Android

### 3.1 Предварительные требования

На машине, где будет собираться приложение (Windows/Mac/Linux):
- **Flutter SDK** — https://docs.flutter.dev/get-started/install
- **Android Studio** с установленным Android SDK (Flutter использует
  его для сборки и подписи APK)
- Телефон на Android с включённым режимом разработчика и USB-отладкой,
  либо эмулятор Android Studio

### 3.2 Сборка

```bash
cd mobile-client
flutter create . --platforms=android
flutter pub get
```
`flutter create .` нужен один раз — в репозитории есть только Dart-код
(`lib/`, `pubspec.yaml`), а папки `android/` (нативный проект) сознательно
не закоммичены. Команда добезопасно достроит `android/` рядом с
существующим кодом, не трогая `lib/`. `flutter pub get` также генерирует
файлы локализации из `lib/l10n/app_*.arb` — это нужно сделать перед
первой сборкой.

После `flutter create .` один раз вручную добавить разрешение на камеру
в `android/app/src/main/AndroidManifest.xml` (внутри тега `<manifest>`,
до `<application>`), если его там ещё нет:
```xml
<uses-permission android:name="android.permission.CAMERA" />
```
И разрешение на геолокацию (кнопка "получить геоданные" при создании
вызова — без него просто покажет ошибку, само приложение не упадёт):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

Указать адрес сервера: открыть `lib/services/api_service.dart`,
найти строку
```dart
ApiService({String baseUrl = 'http://localhost:3000/api'})
```
и заменить `localhost` на реальный IP/домен сервера, определённый в
разделе 1.6 или 2.8, например:
```dart
ApiService({String baseUrl = 'http://192.168.1.50:3000/api'})
```

Собрать релизный APK:
```bash
flutter build apk --release
```
Готовый файл: `mobile-client/build/app/outputs/flutter-apk/app-release.apk`.

### 3.3 Установка на телефон

Вариант A — через кабель и adb:
```bash
flutter install
```
Вариант B — вручную: скопировать `app-release.apk` на телефон (через
кабель, облако или мессенджер), на телефоне разрешить "Установка из
неизвестных источников" для использованного приложения-файлового
менеджера, открыть файл, "Установить".

### 3.4 Первый запуск

Приложение по умолчанию полностью на иврите (можно сразу переключить
язык на экране входа). Войти под данными, созданными в разделе 1.5/2.6.

---

## 4. Мобильное приложение — iOS

### 4.1 Предварительные требования

- **Mac** с установленным **Xcode**
- **Flutter SDK**
- Apple ID — бесплатного достаточно для установки на собственное
  устройство через Xcode (профиль действует 7 дней, потом
  переустановить через тот же Xcode). Для TestFlight/распространения
  на несколько устройств без переустановки каждую неделю нужен платный
  Apple Developer Program ($99/год).

### 4.2 Сборка

```bash
cd mobile-client
flutter create . --platforms=ios
flutter pub get
```
Как и для Android (см. 3.2) — `android/`/`ios/` не закоммичены в
репозиторий, только Dart-код, поэтому `flutter create .` нужен один раз
перед первой сборкой на каждой платформе.

Добавить разрешение на камеру в `ios/Runner/Info.plist` (внутри
основного `<dict>`), если его там ещё нет:
```xml
<key>NSCameraUsageDescription</key>
<string>Camera access is needed to capture documents and photos.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location is used to attach the call's location when you tap "get location".</string>
```

Указать адрес сервера — тот же шаг, что и для Android (раздел 3.2,
файл `lib/services/api_service.dart`).

### 4.3 Установка через Xcode (без платного аккаунта)

1. Открыть `ios/Runner.xcworkspace` в Xcode.
2. Target "Runner" → вкладка "Signing & Capabilities" → выбрать свой
   Apple ID в поле "Team" (Xcode сам создаст профиль подписи).
3. Подключить iPhone кабелем, на телефоне подтвердить "Доверять этому
   компьютеру".
4. В верхней панели Xcode выбрать подключённый телефон как цель сборки,
   нажать ▶ (Run).
5. На телефоне: Настройки → Основные → VPN и управление устройством →
   довериться профилю разработчика — иначе приложение не откроется.

### 4.4 Сборка .ipa для распространения

```bash
flutter build ipa --no-codesign
```
Создаёт неподписанный архив. Подписать и установить можно через
Xcode Organizer (Window → Organizer → Distribute App) при наличии
профиля распространения, либо — если платного аккаунта разработчика
нет — через сторонний resign-сервис (например, Signulous), тот же путь,
которым уже пользовались для других iOS-сборок.

### 4.5 Первый запуск

Как и Android — приложение стартует на иврите, язык можно сменить на
экране входа. Войти под данными администратора/пользователя.

---

## 5. Удалённый доступ через интернет (Cloudflare Tunnel)

По умолчанию сервер доступен только в локальной сети (раздел 1.6/2.8).
Чтобы сотрудники могли подключаться с мобильным приложением или открывать
админ-панель из любого места — не открывая порты на роутере и не покупая
статический IP — используется Cloudflare Tunnel: бесплатный, шифрованный
туннель от Cloudflare до этого сервера.

**Важно: я не проверял этот раздел реальным запуском** — `cloudflared`
скачивается с GitHub Releases через домен, к которому у меня в этой
среде нет доступа (`release-assets.githubusercontent.com` не в списке
разрешённых). Скрипты (`server/scripts/start-tunnel.sh`,
`installer/start-tunnel.bat`) и шаги ниже основаны на официальной
документации Cloudflare, но проверить их вживую можно только на вашей
машине.

### 5.1 Быстрый туннель (без аккаунта, для разового доступа)

1. Скачать `cloudflared`:
   - Windows: https://github.com/cloudflare/cloudflared/releases →
     `cloudflared-windows-amd64.exe`, переименовать в `cloudflared.exe`,
     положить в `PATH` (например, в папку с установкой).
   - Linux: `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/`
2. Запустить сервер как обычно, затем в отдельном окне:
   - Windows: `start-tunnel.bat`
   - Linux: `./server/scripts/start-tunnel.sh`
3. В выводе появится случайный адрес вида
   `https://random-words-1234.trycloudflare.com` — это и есть публичный
   адрес сервера. Указать его в мобильном приложении вместо локального
   IP (раздел 3.4/4.5, экран настроек сервера).

Минус: адрес меняется при каждом перезапуске туннеля — неудобно для
постоянного использования, но не требует вообще никакой настройки и
ничего не стоит.

### 5.2 Стабильный адрес + доступ по email (Cloudflare Access)

Для постоянного адреса и привязки доступа к конкретным email нужен
бесплатный аккаунт Cloudflare (и любой домен, добавленный в Cloudflare —
подойдёт домен за пару долларов с любого регистратора).

1. Зарегистрироваться на https://dash.cloudflare.com (бесплатно),
   добавить домен.
2. В разделе **Zero Trust → Networks → Tunnels** создать туннель,
   указать публичный хостнейм (например `doccapture.вашдомен.com`) →
   `http://localhost:3000`. Cloudflare выдаст токен — записать его в
   переменную `TUNNEL_TOKEN` перед запуском `start-tunnel.sh`/`.bat`.
3. В разделе **Zero Trust → Access → Applications** создать Application
   на тот же хостнейм, политику **Allow → Include → Emails** —
   перечислить email сотрудников, кому разрешён доступ. При заходе на
   адрес сначала откроется страница Cloudflare с просьбой ввести email —
   на него придёт одноразовый код, без пароля. Это и есть "привязка по
   email": доступ к серверу не откроется без подтверждённого email из
   списка, ещё до того как запрос дойдёт до самого приложения. Бесплатно
   для до 50 пользователей.

**Важный нюанс**: страница входа Cloudflare — это HTML-страница для
браузера, она прозрачно работает для админ-панели, но мобильное
приложение делает обычные API-запросы и не открывает браузер — для него
интерактивный email-вход не подходит. Два варианта:
- Не накладывать Cloudflare Access на путь `/api/*` (только на саму
  страницу админки) — мобильное приложение тогда защищено уже имеющейся
  в проекте авторизацией (JWT), а email-доступ Cloudflare дополнительно
  защищает только веб-интерфейс.
- Либо выдать мобильному приложению **Service Token** (Zero Trust →
  Access → Service Auth) — пара статических ключей
  (`CF-Access-Client-Id`/`CF-Access-Client-Secret`) в заголовках запросов
  приложения. Это не привязка к конкретному человеку по email, а скорее
  пропуск для конкретного приложения — техническая альтернатива, если
  нужно закрыть Access и на API.

---

## Частые проблемы

- **Сервер не стартует / ошибка подключения к БД** — проверить
  `DB_PASSWORD`/`DB_HOST`/`DB_DATABASE` в `.env`, что PostgreSQL запущен.
- **Мобильное приложение не подключается** — проверить, что в
  `api_service.dart` указан правильный IP/порт сервера, что телефон и
  сервер в одной сети (или порт проброшен наружу), и что порт открыт в
  брандмауэре/файрволе.
- **"No storage connection configured" при загрузке файла** — для
  этого пользователя не настроена привязка хранилища; см. отдельную
  инструкцию по эксплуатации админ-панели, раздел "Привязка хранилища
  к пользователю".
