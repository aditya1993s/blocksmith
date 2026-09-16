import io
import json
import sqlite3
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .schema import Project, validate
from .generator import generate
from .runner import Runner, ROOT

runner = Runner()
DB = ROOT / 'projects.sqlite3'
with sqlite3.connect(DB) as db:
    db.execute('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL)')

@asynccontextmanager
async def lifespan(app):
    yield
    runner.close()

app = FastAPI(title='Blocksmith Builder API', lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])

@app.middleware('http')
async def local_origin(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin and origin not in ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:8000', 'http://localhost:8000']:
        return JSONResponse({'detail': 'Only the local builder can access this API.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.get('/api/health')
def health():
    return {'status': 'ok'}

@app.get('/api/projects')
def projects():
    with sqlite3.connect(DB) as db:
        rows = db.execute('SELECT id,name,updated FROM projects ORDER BY updated DESC').fetchall()
    return [{'id': r[0], 'name': r[1], 'updated': r[2], 'status': runner.status(r[0])['status']} for r in rows]

@app.get('/api/projects/{project_id}')
def get_project(project_id: str):
    with sqlite3.connect(DB) as db:
        row = db.execute('SELECT body FROM projects WHERE id=?', (project_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'Project not found')
    return json.loads(row[0])

@app.delete('/api/projects/{project_id}')
def delete_project(project_id: str):
    with sqlite3.connect(DB) as db:
        if not db.execute('SELECT 1 FROM projects WHERE id=?', (project_id,)).fetchone():
            raise HTTPException(404, 'Project not found')
        runner.stop(project_id)
        db.execute('DELETE FROM projects WHERE id=?', (project_id,))
    return {'deleted': True}

@app.put('/api/projects/{project_id}')
def save_project(project_id: str, project: Project):
    if project_id != project.id:
        raise HTTPException(400, 'Project IDs do not match')
    updated = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB) as db:
        db.execute('INSERT OR REPLACE INTO projects VALUES (?,?,?,?)', (project.id, project.name, project.model_dump_json(), updated))
    return {'saved': True, 'updated': updated}

@app.post('/api/validate')
def validate_project(project: Project):
    return validate(project)

@app.post('/api/generate')
def generate_project(project: Project):
    report = validate(project)
    if not report['valid']:
        raise HTTPException(422, report)
    return {'files': generate(project)}

@app.post('/api/export')
def export_project(project: Project):
    files = generate_project(project)['files']
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, source in files.items():
            archive.writestr(name, source)
        archive.writestr('blocksmith.json', project.model_dump_json(indent=2))
    buffer.seek(0)
    return StreamingResponse(buffer, media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="{project.id}.zip"'})

@app.post('/api/projects/{project_id}/run')
def run_project(project_id: str, project: Project):
    if project.id != project_id:
        raise HTTPException(400, 'Project IDs do not match')
    report = validate(project)
    if not report['valid']:
        raise HTTPException(422, report)
    save_project(project_id, project)
    try:
        return runner.start(project)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@app.get('/api/projects/{project_id}/status')
def status(project_id: str):
    return runner.status(project_id)

@app.post('/api/projects/{project_id}/stop')
def stop(project_id: str):
    return runner.stop(project_id)

from pathlib import Path
frontend = Path(__file__).resolve().parents[1] / 'dist'
if frontend.exists():
    app.mount('/', StaticFiles(directory=frontend, html=True), name='frontend')
