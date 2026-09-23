"""Build review-only mockup data from the real API and local font/icon packages."""
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile

DEST = Path(__file__).resolve().parent
ROOT = DEST.parents[3]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ['OPENAI_API_KEY'] = ''
os.environ['AI_PROVIDER'] = 'openai'
from fastapi.testclient import TestClient
from app.bootstrap import create_app

with tempfile.TemporaryDirectory(prefix='shagra-design-') as tmp:
    app = create_app(database_path=Path(tmp) / 'preview.sqlite3', kit_dir=ROOT / 'data/synthetic',
                     secret_path=Path(tmp) / 'secret', app_origin='http://testserver')
    with TestClient(app, base_url='http://testserver', headers={'Origin': 'http://testserver'}) as client:
        client.post('/api/v1/auth/login', json={'username': 'employee', 'password': 'demo-employee'}).raise_for_status()
        profile = client.get('/api/v1/employees/E0001').json()
        response = client.post('/api/v1/employees/E0001/recommendations', json={
            'employee_version': profile['employee_version'], 'dataset_version': profile['dataset_version'],
            'excluded_event_ids': [], 'preferred_type': None,
        })
        response.raise_for_status()
        recommendations = response.json()
        client.post('/api/v1/auth/login', json={'username': 'hr', 'password': 'demo-hr'}).raise_for_status()
        overview = client.get('/api/v1/hr/overview').json()

catalog = json.loads((ROOT / 'data/synthetic/skills.json').read_text(encoding='utf-8'))
role_names = {role['role_id']: role['name'] for role in catalog['roles']}
assets = DEST / 'assets'
(assets / 'files').mkdir(parents=True, exist_ok=True)
manifest = []
for family, weights in [('sans', [400, 500, 600]), ('mono', [400, 500])]:
    archive_path = next((ROOT / 'runtime/design-assets').glob(f'fontsource-ibm-plex-{family}-*.tgz'))
    with tarfile.open(archive_path) as archive:
        package = json.load(archive.extractfile('package/package.json'))
        manifest.append({key: package[key] for key in ['name', 'version', 'license']})
        for weight in weights:
            (assets / f'{family}-{weight}.css').write_bytes(archive.extractfile(f'package/{weight}.css').read())
        for member in archive.getmembers():
            if member.name.startswith('package/files/') and any(member.name.endswith(f'-{weight}-normal.woff2') for weight in weights):
                (assets / 'files' / Path(member.name).name).write_bytes(archive.extractfile(member).read())
        license_member = next(member for member in archive.getmembers() if Path(member.name).name.upper().startswith('LICENSE'))
        (assets / f'LICENSE-ibm-plex-{family}.txt').write_bytes(archive.extractfile(license_member).read())

names = ['layout-dashboard', 'grid-2x2', 'history', 'upload', 'log-out', 'user-round',
         'chevron-right', 'chevron-down', 'arrow-up-right', 'arrow-right', 'search',
         'check', 'x', 'circle-help', 'sliders-horizontal', 'chevron-left', 'arrow-up-down']
icons = {}
with tarfile.open(next((ROOT / 'runtime/design-assets').glob('lucide-static-*.tgz'))) as archive:
    package = json.load(archive.extractfile('package/package.json'))
    manifest.append({key: package[key] for key in ['name', 'version', 'license']})
    for name in names:
        icons[name] = archive.extractfile(f'package/icons/{name}.svg').read().decode()
    license_member = next(member for member in archive.getmembers() if Path(member.name).name.upper() == 'LICENSE')
    (assets / 'LICENSE-lucide.txt').write_bytes(archive.extractfile(license_member).read())

data = {'profile': profile, 'recommendations': recommendations, 'overview': overview,
        'role_names': role_names, 'icons': icons}
(DEST / 'data.js').write_text('window.SHAGRA_DESIGN = ' + json.dumps(data, ensure_ascii=False) + ';\n', encoding='utf-8')
(DEST / 'assets-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'employee': profile['employee']['employee_id'], 'source': recommendations['source'],
                  'recommendations': len(recommendations['items']), 'employees': overview['employees_total'],
                  'assets': manifest}, ensure_ascii=False))
