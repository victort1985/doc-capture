# Doc Capture — монорепо

Захват, обработка и хранение документов/фото: сервер + веб-админка + мобильный клиент.

```
project-root/
  server/          NestJS API: auth, users, storage connections, naming templates,
                   file upload+processing, вызовы (calls), real-time уведомления (WS)
  admin-panel/     React + Vite: CRUD для users/storage/templates, просмотр file log
  mobile-client/   Flutter: вход, Переучет (захват/история/настройки) + Вызов
                   (קריאת שירות), локализация he/en/ru
  installer/       Windows-инсталлятор (Setup.exe) — см. ниже
  .github/         GitHub Actions — см. раздел "CI/CD" ниже
  docs/
    api-spec/      OpenAPI 3.0 для реализованных эндпоинтов
    requirements/  Исходная и сжатая спецификация проекта
```

## Windows-инсталлятор (Setup.exe)

`installer/Setup.exe` — готовый инсталлятор сервера + admin-panel в один процесс
(NestJS отдаёт API на `/api/*` и статику админки на `/`). Собран через NSIS,
это настоящий PE32 Windows-инсталлятор (проверено `file Setup.exe`), создаёт
ярлыки в "Пуск" (запуск сервера, открыть админку в браузере, README, удаление),
пишет запись в "Программы и компоненты".

Что НЕ бандлится (нет доступа к нужным доменам из текущей среды сборки):
сам **Node.js** и **PostgreSQL** — их нужно поставить на целевой Windows-машине
отдельно (ссылки — в `installer/README-FIRST.txt`, который ставится рядом
с приложением). Нативный бинарник `sharp` для Windows x64 **уже зашит**
правильно (собирался через `npm install --os=win32 --cpu=x64`, не Linux-сборкой).

Пересобрать инсталлятор после правок в коде:
```bash
cd server && bash scripts/package-windows.sh   # пересобирает server+admin-panel в payload-windows/
cd ../installer && makensis installer.nsi        # требует пакет nsis (apt install nsis)
```

Подробности запуска и список TODO — в README каждой папки (`server/README.md`,
`admin-panel/README.md`, `mobile-client/README.md`).

## CI/CD (GitHub Actions)

- **`.github/workflows/server-ci.yml`** — на каждый push/PR собирает
  `server` и `admin-panel` (`npm install` + сборка), быстрая проверка, что
  ничего не сломано.
- **`.github/workflows/mobile-build.yml`** — реальная сборка мобильного
  клиента на настоящих раннерах (то, что нельзя сделать в песочнице без
  Flutter SDK): Android APK на `ubuntu-latest`, iOS IPA (неподписанный) на
  `macos-latest`. `android/`/`ios/` не закоммичены — workflow сам делает
  `flutter create .` и патчит разрешения камеры/геолокации перед сборкой
  (см. `.github/scripts/`). Запускается вручную из вкладки Actions
  ("Run workflow", можно указать адрес сервера, который зашьётся в
  билд) либо автоматически при push тега `v*` — тогда собранные файлы
  также прикрепляются к GitHub Release.

## Статус

Сервер и admin-panel собраны и проверены (`npm run build` проходит без ошибок
в обоих), плюс полный набор фиксов безопасности (см.
`docs/security-data-protection-audit.md`) и модуль "Вызовы" — всё
протестировано живыми прогонами на пересобранном сервере.
Mobile-client написан без доступа к Flutter SDK в этой среде — не
прогонялся через `flutter analyze`/`pub get` локально, но теперь есть
CI (`mobile-build.yml`), который соберёт его на настоящих раннерах после
первого push в GitHub.

## Сквозной флоу (happy path)

1. Админ логинится в admin-panel → создаёт storage connection (local/FTP/
   Synology) → создаёт naming template → привязывает storage к пользователю
   через `PATCH /api/storage/client-settings/:userId`.
2. Пользователь логинится в мобильном приложении (дефолт — иврит) →
   выбирает место и тип (документ/фото) → камера или файлы → "Загрузить".
3. Сервер обрабатывает (документ → PDF с нормализацией контраста; фото →
   JPG ≤1MB), генерирует имя по шаблону, пишет в выбранное хранилище,
   логирует запись — она тут же видна в File log админки.

## Главное из TODO (детали — в README подпроектов)

- Реальный edge-detection для обрезки документов по границам (сейчас —
  только нормализация контраста, без перспективной коррекции). Касается
  и старой загрузки документов, и вложений в "Вызовах" — общий пайплайн.
- Веб-страница управления "Вызовами" в admin-panel (API готов, сейчас
  вызовы доступны только из мобильного клиента — спека просила вкладку
  именно там; см. `docs/calls-feature.md`).
- Настоящий push от ОС для уведомлений (сейчас — WebSocket, работает
  только пока приложение открыто; для закрытого приложения нужен
  отдельный Firebase-проект заказчика).
- `cloudflared`/удалённый доступ — скрипты и инструкция написаны
  (`docs/installation-guide.md`, раздел 5), но не прогонялись живым
  запуском (среда разработки не может скачать бинарник с GitHub
  Releases — см. примечание в том же разделе).
