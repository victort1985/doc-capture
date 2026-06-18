# Server (NestJS)

## Запуск локально

```bash
cp .env.example .env   # поправить JWT_SECRET, доступ к PostgreSQL
npm install
npm run start:dev      # http://localhost:3000/api
```

Нужен PostgreSQL (см. переменные `DB_*` в `.env`). При `NODE_ENV != production`
схема БД синхронизируется автоматически (`synchronize: true`) — для прода
переключиться на миграции (`npm run migration:generate` / `migration:run`).

## Создание первого админа

```bash
npm run create-admin -- admin admin123 he
```

Скрипт `scripts/create-admin.js` пишет напрямую в БД через `pg` + `bcryptjs`
(тот же механизм хеширования, что использует сам сервер) — без ручного SQL
и без риска повредить `$`-символы bcrypt-хеша через шелл. Запускать после
первого старта сервера (чтобы TypeORM успел создать таблицы через
`synchronize`). Повторный запуск с тем же username обновит пароль/роль.

## Что реализовано

- Auth (JWT), Users CRUD, роли admin/user.
- Storage connections CRUD + client storage settings (привязка хранилища
  к типу файла document/photo + шаблон подкаталога).
- Адаптеры хранения: local (готов), FTP (готов, `basic-ftp`), Synology
  через WebDAV (готов в части API; **включите WebDAV в File Station**
  на NAS, либо замените адаптер на SMB/FTP под вашу конфигурацию).
- Naming templates CRUD + резолвер плейсхолдеров `{date} {time} {place}
  {username} {docType} {counter} {uuid}`.
- `/files/upload` — пакетная загрузка, обработка (см. ниже), сохранение
  по правильному storage connection, лог в `file_records`.

## Что оставлено как TODO (отмечено в коде)

- `processDocument()` — обрезка по границам документа сейчас не делает
  реальный edge-detection (для этого нужен CV — OpenCV-биндинг или
  внешний API). Сейчас применяется только нормализация контраста/sharpen
  и сборка в PDF.
- Шифрование паролей storage connections в БД (сейчас plaintext в колонке).
- Эндпоинт `/api/auth/logout` и refresh-токены — в спеке отмечены опционально.
