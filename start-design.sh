#!/usr/bin/env bash
# Local preview of the design mockups; does not start the production app.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Для запуска нужен Python 3 (команда python3).' >&2
  exit 1
fi

exec python3 - "$project_dir" "$@" <<'PY'
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import threading
import webbrowser

root = Path(sys.argv[1]) / 'docs/validation/ui/redesign'
parser = argparse.ArgumentParser(description='Предпросмотр дизайна ШАГРЫ')
parser.add_argument('--port', type=int, default=8090, help='Порт сервера (по умолчанию 8090)')
parser.add_argument('--no-open', action='store_true', help='Не открывать браузер автоматически')
args = parser.parse_args(sys.argv[2:])
if not 0 <= args.port <= 65535:
    parser.error('Порт должен быть от 0 до 65535.')
if not (root / 'index.html').is_file():
    parser.exit(1, f'Не найден макет: {root / "index.html"}\n')

handler = partial(SimpleHTTPRequestHandler, directory=str(root))
try:
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
except OSError as error:
    parser.exit(1, f'Не удалось запустить сервер: {error}\n'
                   'Если порт занят, запустите: ./start-design.sh --port 8091\n')

url = f'http://127.0.0.1:{server.server_port}/?view=profile'
print(f'Макет дизайна ШАГРЫ: {url}', flush=True)
print('Это предпросмотр, без подключения к рабочему API. Остановка: Ctrl+C.', flush=True)

def open_browser():
    try:
        if not webbrowser.open(url):
            print('Откройте ссылку выше в браузере вручную.', flush=True)
    except Exception:
        print('Откройте ссылку выше в браузере вручную.', flush=True)

if not args.no_open:
    threading.Thread(target=open_browser, daemon=True).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\nПредпросмотр остановлен.', flush=True)
finally:
    server.server_close()
PY
