import hashlib
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from collections import deque
from pathlib import Path
from .generator import generate

ROOT = Path(os.environ.get('BLOCKSMITH_DATA', Path(__file__).resolve().parents[1] / '.runtime'))
ROOT.mkdir(parents=True, exist_ok=True)
HIDDEN = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

class Runner:
    def __init__(self):
        self.jobs = {}
        self.lock = threading.Lock()

    def status(self, project_id):
        with self.lock:
            job = self.jobs.get(project_id)
            if not job:
                return {'status': 'stopped', 'logs': []}
            if job.get('process') and job['process'].poll() is not None and job['status'] == 'running':
                job['status'] = 'failed'
            return {k: list(v) if k == 'logs' else v for k, v in job.items() if k not in ['process', 'cancel', 'worker']}

    def start(self, project):
        files = generate(project)
        # Schema revisions have separate databases. Return to a revision to recover its data.
        model_sources = {k: v for k, v in files.items() if k.endswith('/models.py')}
        signature = hashlib.sha256(json.dumps(model_sources, sort_keys=True).encode()).hexdigest()[:12]
        with self.lock:
            current = self.jobs.get(project.id)
            if current and current['status'] in ['starting', 'running']:
                raise ValueError('Stop the current server before starting a new build.')
            if current and current.get('worker') and current['worker'].is_alive():
                raise ValueError('The previous build is stopping. Try Run again in a moment.')
            if sum(j['status'] in ['starting', 'running'] for j in self.jobs.values()) >= 4:
                raise ValueError('Four servers are active. Stop one before starting another.')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            job = {'status': 'starting', 'logs': deque(maxlen=500), 'port': port, 'url': f'http://127.0.0.1:{port}', 'revision': signature, 'cancel': threading.Event(), 'process': None, 'admin_username': 'admin', 'admin_password': None}
            self.jobs[project.id] = job
            job['worker'] = threading.Thread(target=self._build, args=(project, files, job), daemon=True)
            job['worker'].start()
        return self.status(project.id)

    def _build(self, project, files, job):
        try:
            folder = ROOT / 'builds' / project.id / job['revision']
            folder.mkdir(parents=True, exist_ok=True)
            for name, source in files.items():
                destination = folder / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(source, encoding='utf-8')
            secret = folder / '.secret'
            if not secret.exists():
                secret.write_text(secrets.token_urlsafe(48))
            credential = folder / '.admin-password'
            if not credential.exists():
                credential.write_text(secrets.token_urlsafe(18))
            job['admin_password'] = credential.read_text()
            job['logs'].append('Building Django application from your blocks…')
            job['logs'].append(f'Schema revision {job["revision"]} · SQLite database preserved per revision.')
            app = next(n.data.config.name for n in project.nodes if n.data.kind == 'app')
            env = {**os.environ, 'PYTHONUNBUFFERED': '1', 'BLOCKSMITH_ADMIN_PASSWORD': job['admin_password']}
            steps = [['check'], ['makemigrations', app, '--noinput'], ['migrate', '--noinput'], ['shell', '-c', "import os; from django.contrib.auth import get_user_model; U=get_user_model(); U.objects.filter(username='admin').exists() or U.objects.create_superuser('admin', '', os.environ['BLOCKSMITH_ADMIN_PASSWORD'])"]]
            for args in steps:
                if job['cancel'].is_set():
                    return
                job['logs'].append('$ python manage.py ' + ('create local admin' if args[0] == 'shell' else ' '.join(args)))
                with self.lock:
                    if job['cancel'].is_set():
                        return
                    proc = subprocess.Popen([sys.executable, 'manage.py', *args], cwd=folder, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, creationflags=HIDDEN)
                    job['process'] = proc
                output, _ = proc.communicate(timeout=90)
                job['logs'].extend(output.splitlines())
                if job['cancel'].is_set():
                    return
                if proc.returncode:
                    raise RuntimeError('Django validation or migration failed. See the build output above.')
            with self.lock:
                if job['cancel'].is_set():
                    return
                proc = subprocess.Popen([sys.executable, 'manage.py', 'runserver', f'127.0.0.1:{job["port"]}', '--noreload'], cwd=folder, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, creationflags=HIDDEN)
                job['process'] = proc
            def collect():
                for line in proc.stdout:
                    job['logs'].append(line.rstrip())
            threading.Thread(target=collect, daemon=True).start()
            for _ in range(100):
                if job['cancel'].is_set():
                    return
                if proc.poll() is not None:
                    raise RuntimeError('Django exited before becoming ready.')
                try:
                    with urllib.request.urlopen(job['url'] + '/admin/login/', timeout=1) as response:
                        if response.status == 200:
                            with self.lock:
                                if job['cancel'].is_set():
                                    return
                                job['status'] = 'running'
                            job['logs'].append('Ready. Your API and Django admin are live.')
                            return
                except (OSError, urllib.error.URLError):
                    time.sleep(.2)
            raise RuntimeError('Server did not become ready in time.')
        except Exception as exc:
            if not job['cancel'].is_set():
                job['logs'].append(str(exc))
                job['status'] = 'failed'
            proc = job.get('process')
            if proc and proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=10)

    def stop(self, project_id):
        with self.lock:
            job = self.jobs.get(project_id)
            if job:
                job['cancel'].set()
                proc = job.get('process')
                if proc and proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()
                job['status'] = 'stopped'
                job['logs'].append('Server stopped. Your database is preserved.')
        return self.status(project_id)

    def close(self):
        for key in list(self.jobs):
            self.stop(key)
