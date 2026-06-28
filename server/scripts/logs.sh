#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Doc-Capture — просмотр логов сервера
#  Использование: ./logs.sh [режим] [опции]
#
#  Режимы (первый аргумент без флага):
#    all      — все логи (по умолчанию)
#    push     — push-уведомления и Firebase
#    ws       — WebSocket / реалтайм
#    calls    — вызовы (Calls)
#    errors   — только ошибки и предупреждения
#    auth     — логин / JWT
#    storage  — хранилище (FTP/SFTP/Synology)
#
#  Опции:
#    -f        следить в реальном времени (как tail -f)
#    -n N      показать последние N строк (по умолчанию 300)
#    -s NAME   имя systemd-сервиса (по умолчанию: doc-capture)
#    -h        показать эту справку
# ─────────────────────────────────────────────────────────────

SERVICE="doc-capture"
MODE="all"
FOLLOW=0
LINES=300

R='\033[0;31m'; Y='\033[1;33m'; G='\033[0;32m'; C='\033[0;36m'
B='\033[0;34m'; M='\033[0;35m'; D='\033[2m'; BO='\033[1m'; RS='\033[0m'

while [[ $# -gt 0 ]]; do
  case "$1" in
    all|push|ws|websocket|calls|errors|auth|storage) MODE="$1"; shift ;;
    -f|--follow)  FOLLOW=1; shift ;;
    -n)           LINES="$2"; shift 2 ;;
    -s)           SERVICE="$2"; shift 2 ;;
    -h|--help)    sed -n '2,20p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Неизвестный аргумент: $1  (используйте -h для справки)"; exit 1 ;;
  esac
done

case "$MODE" in
  push)    PAT='PushService|Firebase|FCM|push.token|pushToken|push send|push-token|push notification|FIREBASE_SERVICE_ACCOUNT'; LBL="PUSH / FIREBASE" ;;
  ws|websocket) PAT='NotificationsGateway|WebSocket|handleConnection|handleDisconnect|call:created|call:status|call:note|call:attachment|ws/notifications|socket\.io'; LBL="WEBSOCKET / РЕАЛТАЙМ" ;;
  calls)   PAT='CallsService|CallsController|call:created|call:status_changed|call:note_added|call:attachment_added|broadcastCall|New call:|URGENT'; LBL="ВЫЗОВЫ (CALLS)" ;;
  errors)  PAT='\[ERROR\]|\[WARN\]|Error:|error:|Exception|exception|failed|Failed|Cannot|ECONNREFUSED|ETIMEDOUT|Permission denied|Unhandled|UnhandledPromise|status: 4[0-9][0-9]|status: 5[0-9][0-9]'; LBL="ОШИБКИ И ПРЕДУПРЕЖДЕНИЯ" ;;
  auth)    PAT='AuthService|AuthController|JwtStrategy|login|logout|JWT|Unauthorized|credentials|Invalid token|expired'; LBL="АУТЕНТИФИКАЦИЯ / JWT" ;;
  storage) PAT='StorageService|FtpStorage|SftpStorage|SynologyStorage|LocalStorage|StorageAdapter|upload|download|adapter\.write|adapter\.read|adapter\.rename|SFTP|FTP|Synology'; LBL="ХРАНИЛИЩЕ (STORAGE)" ;;
  all)     PAT='.'; LBL="ВСЕ ЛОГИ" ;;
esac

colorize() {
  while IFS= read -r line; do
    if   [[ "$line" =~ \[ERROR\]|Error:|error:|Exception|ECONNREFUSED|ETIMEDOUT|"Permission denied"|Unhandled|"status: 5" ]]; then
      printf "${R}%s${RS}\n" "$line"
    elif [[ "$line" =~ \[WARN\]|WARN|"not set"|disabled|"Could not"|fallback|stale|"status: 4" ]]; then
      printf "${Y}%s${RS}\n" "$line"
    elif [[ "$line" =~ "Firebase Admin initialized"|"push notifications enabled"|"listening on port"|"Server listening"|initialized|connected ]]; then
      printf "${G}%s${RS}\n" "$line"
    elif [[ "$line" =~ "call:created"|"New call:"|broadcastCallCreated|URGENT ]]; then
      printf "${M}${BO}%s${RS}\n" "$line"
    elif [[ "$line" =~ handleConnection|handleDisconnect|WebSocket|"socket.io"|"ws/notifications" ]]; then
      printf "${C}%s${RS}\n" "$line"
    elif [[ "$line" =~ "push"|Firebase|FCM|PushService ]]; then
      printf "${B}%s${RS}\n" "$line"
    else
      printf "%s\n" "$line"
    fi
  done
}

printf "${BO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RS}\n"
printf "${BO}  Doc-Capture Logs  •  ${C}%s${RS}\n" "$LBL"
printf "${BO}  Сервис: ${RS}${D}%s${RS}   ${BO}Строк: ${RS}${D}%s${RS}\n" "$SERVICE" "$LINES"
printf "${BO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RS}\n"
[[ "$FOLLOW" == "1" ]] && printf "${D}  Следим в реальном времени — Ctrl+C для выхода${RS}\n"
printf "\n"

if ! systemctl list-units --type=service 2>/dev/null | grep -q "$SERVICE"; then
  printf "${Y}  Сервис '%s' не найден в systemd.${RS}\n" "$SERVICE"
  exit 1
fi

if [[ "$FOLLOW" == "1" ]]; then
  journalctl -u "$SERVICE" -f -n "$LINES" --no-pager -o short-iso 2>/dev/null | grep --line-buffered -E "$PAT" | colorize
else
  journalctl -u "$SERVICE" -n "$LINES" --no-pager -o short-iso 2>/dev/null | grep -E "$PAT" | colorize
fi
