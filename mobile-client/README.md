# Mobile client (Flutter)

## Запуск локально

```bash
flutter pub get     # сгенерирует lib/l10n/app_localizations.dart из ARB-файлов
flutter run
```

В этой среде нет доступа к pub.dev/Flutter SDK, поэтому `pub get` здесь не
выполнялся — структура и код написаны руками и не проверены компилятором
Dart. Первым шагом на вашей машине: `flutter pub get`, затем `flutter analyze`
и поправить то, что вылезет (имена API пакетов camera/image_picker/file_picker
меняются между минорными версиями чаще, чем хотелось бы).

## Локализация (he default, RTL)

- `lib/l10n/app_he.arb` — template-arb-file (иврит, основной).
- `lib/l10n/app_en.arb`, `app_ru.arb` — переводы.
- `pubspec.yaml`: `flutter: generate: true` + `l10n.yaml` — codegen включён.
- `SettingsService` хранит выбранный язык в `shared_preferences`,
  дефолт — `he`. При логине язык переключается на `user.language` с сервера
  (см. `AppState.login`), если ранее не было сохранённого выбора локально —
  при необходимости поправьте этот приоритет под себя.
- RTL для иврита Flutter применяет автоматически по `locale` в `MaterialApp` —
  ручной `Directionality` не нужен.

## Дизайн-система

`lib/app/theme.dart` — те же токены (цвета/палитра), что в
`admin-panel/src/index.css`: ink-blue primary, terracotta "stamp" accent,
paper-фон. Типографика — Google Fonts (`Fraunces` для заголовков/бренда,
`Inter` для остального UI) через пакет `google_fonts` — он подтягивает
шрифты при первом запуске и кэширует их, поэтому первому запуску нужен
интернет хотя бы один раз.

`lib/widgets/stamp_mark.dart` — фирменный знак (тот же мотив "штамп", что
и в админ-панели), нарисован через `CustomPainter`, без файлов-картинок.

`lib/widgets/copyright_notice.dart` — надпись в левом нижнем углу экрана
входа, всегда на английском и LTR независимо от выбранного языка
интерфейса.

## Экраны

`LoginScreen` (вход + выбор языка), `HomeScreen` (место/тип/камера/файлы/
загрузка + нижняя навигация на History/Settings), `HistoryScreen` (список
`/api/files`), `SettingsScreen` (язык, выход).

## TODO

- `FileService.captureFromCamera` принимает `CameraController`, но сам экран
  с live-превью камеры (`package:camera`) не собран — сейчас кнопка "Камера"
  временно переиспользует `image_picker` (галерея/системная камера через ОС).
  Для полноценной серийной съёмки нужен отдельный `CameraPreview`-экран.
- `flutter_image_compress` подключён в `pubspec.yaml`, но не используется —
  по спеке тяжёлая обработка на сервере, на клиенте оставлено место только
  под лёгкую предварительную проверку размера, если понадобится.
- `ApiService.baseUrl` хардкожен на `localhost:3000` — заменить на реальный
  адрес сервера / механизм discovery перед сборкой релиза.
