# Admin panel (React + Vite)

## Запуск локально

```bash
npm install
npm run dev   # http://localhost:5173, проксирует /api на http://localhost:3000
```

## Что реализовано

Пользователи (CRUD + включить/выключить), Storage connections (CRUD),
Naming templates (CRUD), File log (просмотр + фильтр по типу).

## Дизайн

Токены — `src/index.css`: палитра "paper + ink-blue" (фон `--bg`, акцент
`--primary`), пары шрифтов Inter (UI) / IBM Plex Mono (технические данные —
пути, типы соединений). Сигнатурный элемент — `stamp-badge`: статус-плашка
в виде штампа, обыгрывает тему документооборота.

## TODO

- Страница `client-settings/:userId` (привязка document/photo storage
  к конкретному пользователю) — есть API (`storage.controller.ts` на
  сервере), но своей страницы в админке пока нет; сейчас это нужно
  дёргать вручную через curl/Postman либо дописать форму на UsersPage.
- Пагинация для File log (сейчас грузится весь список).
