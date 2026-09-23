"""Export runtime FastAPI schema without touching the demo database."""
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app.bootstrap import create_app

with TemporaryDirectory() as directory:
    path=Path(directory)
    app=create_app(database_path=path/'db.sqlite3',kit_dir=Path('data/synthetic'),secret_path=path/'secret')
    output=Path('contracts/openapi.json')
    output.write_text(json.dumps(app.openapi(),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Exported {len(app.openapi()["paths"])} paths to {output}')
