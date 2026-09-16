import ast
import copy
import io
import time
import uuid
import zipfile
import httpx
import pytest
import sqlite3
from fastapi.testclient import TestClient
from backend.schema import Project, validate
from backend.generator import generate
from backend.main import app, runner

@pytest.fixture(autouse=True)
def isolate_runtime(tmp_path, monkeypatch):
    import backend.main as main
    import backend.runner as runtime
    monkeypatch.setattr(runtime, 'ROOT', tmp_path)
    database = tmp_path / 'projects.sqlite3'
    monkeypatch.setattr(main, 'DB', database)
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL, updated TEXT NOT NULL)')
    yield
    runner.close()

def blueprint():
    kinds = ['project','database','app','model','serializer','viewset','router','admin','filter','docs','pagination']
    names = ['sample_project','SQLite','catalog','Product','serializer','viewset','products','admin','filter','docs','pages']
    nodes = [{'id':k,'data':{'kind':k,'label':k,'config':{'name':name}}} for k,name in zip(kinds,names)]
    nodes[3]['data']['config']['fields'] = [{'name':'name','type':'CharField','required':True,'unique':True}, {'name':'price','type':'DecimalField','required':True}]
    links = [('project','database'),('database','app'),('app','model'),('model','serializer'),('serializer','viewset'),('viewset','router'),('model','admin'),('viewset','filter'),('project','docs'),('project','pagination')]
    return Project(id='test-'+uuid.uuid4().hex,name='Test catalog',nodes=nodes,edges=[{'id':f'{s}-{t}','source':s,'target':t} for s,t in links])

def test_valid_generation():
    p=blueprint()
    assert validate(p)['valid']
    files=generate(p)
    for path,code in files.items():
        if path.endswith('.py'):
            ast.parse(code)
    assert 'ModelViewSet' in files['catalog/views.py']
    assert 'DjangoFilterBackend' in files['catalog/views.py']

def test_missing_and_invalid_connections():
    p=blueprint()
    p.nodes=[n for n in p.nodes if n.id!='serializer']
    report=validate(p)
    assert not report['valid']
    assert any(i.get('fix',{}).get('kind')=='serializer' for i in report['issues'] if i.get('fix'))
    assert any('missing' in i['message'] for i in report['issues'])

@pytest.mark.parametrize('name',['../outside','class',"a'); import os",'objects','bad__name','id'])
def test_unsafe_identifiers(name):
    p=blueprint();p.nodes[3].data.config.name=name
    assert not validate(p)['valid']
    with pytest.raises(ValueError):
        generate(p)

def test_duplicate_and_relationship_validation():
    p=blueprint();p.nodes[3].data.config.fields.append(p.nodes[3].data.config.fields[0].model_copy())
    assert not validate(p)['valid']
    p=blueprint();p.nodes[3].data.config.fields[0].type='ForeignKey';p.nodes[3].data.config.fields[0].target='Missing'
    assert not validate(p)['valid']

def test_api_save_export_and_origin():
    with TestClient(app) as client:
        p=blueprint();body=p.model_dump()
        assert client.put('/api/projects/'+p.id,json=body).status_code==200
        assert client.get('/api/projects/'+p.id).json()['name']==p.name
        assert client.post('/api/validate',json=body).json()['valid']
        response=client.post('/api/export',json=body)
        assert response.status_code==200
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert 'catalog/models.py' in archive.namelist()
            assert 'blocksmith.json' in archive.namelist()
            assert not any('password' in n or 'sqlite' in n for n in archive.namelist())
        assert client.post('/api/validate',json=body,headers={'Origin':'https://evil.example'}).status_code==403
        assert client.get('/api/health',headers={'Host':'evil.example'}).status_code==400

def test_delete_project(monkeypatch, tmp_path):
    stopped = []
    monkeypatch.setattr(runner, 'stop', lambda project_id: stopped.append(project_id))
    with TestClient(app) as client:
        deleted, kept = blueprint(), blueprint()
        for project in (deleted, kept):
            assert client.put('/api/projects/'+project.id, json=project.model_dump()).status_code == 200
        artifact = tmp_path / 'builds' / deleted.id / 'db.sqlite3'
        artifact.parent.mkdir(parents=True)
        artifact.write_bytes(b'preserved database')
        url = '/api/projects/'+deleted.id
        assert client.delete(url, headers={'Origin': 'https://evil.example'}).status_code == 403
        assert client.get(url).status_code == 200
        assert client.delete(url).json() == {'deleted': True}
        assert stopped == [deleted.id]
        assert client.get(url).status_code == 404
        assert [p['id'] for p in client.get('/api/projects').json()] == [kept.id]
        assert client.get('/api/projects/'+kept.id).status_code == 200
        assert artifact.read_bytes() == b'preserved database'
        assert client.delete(url).status_code == 404

def wait_ready(p):
    for _ in range(120):
        status=runner.status(p.id)
        if status['status'] in ['running','failed']:
            assert status['status']=='running', '\n'.join(status['logs'])
            return status
        time.sleep(.25)
    pytest.fail('Server readiness timed out')

def test_real_django_crud_admin_filter_and_restart():
    p=blueprint()
    try:
        runner.start(p);status=wait_ready(p)
        with httpx.Client(base_url=status['url'],timeout=10) as client:
            assert client.get('/admin/login/').status_code==200
            assert client.get('/api/schema/').status_code==200
            response=client.post('/api/products/',json={'name':'Notebook','price':'12.50'})
            assert response.status_code==201,response.text
            key=response.json()['id']
            assert client.get(f'/api/products/{key}/').json()['name']=='Notebook'
            assert client.patch(f'/api/products/{key}/',json={'price':'15.00'}).status_code==200
            assert client.get('/api/products/?search=Notebook').json()['count']==1
            assert client.get('/api/products/?name=Missing').json()['count']==0
            assert client.post('/api/products/',json={'price':'1.00'}).status_code==400
            assert client.post('/api/products/',json={'name':'Notebook','price':'1.00'}).status_code==400
            assert client.put(f'/api/products/{key}/',json={'name':'Updated','price':'20.00'}).status_code==200
        runner.stop(p.id);runner.start(p);status=wait_ready(p)
        with httpx.Client(base_url=status['url'],timeout=10) as client:
            assert client.get(f'/api/products/{key}/').json()['name']=='Updated'
            assert client.delete(f'/api/products/{key}/').status_code==204
            assert client.get(f'/api/products/{key}/').status_code==404
        runner.stop(p.id)
        assert runner.status(p.id)['status']=='stopped'
    finally:
        runner.stop(p.id)

def test_authenticated_api():
    p=blueprint();p.nodes[5].data.config.permission='IsAuthenticated'
    try:
        runner.start(p);status=wait_ready(p)
        with httpx.Client(base_url=status['url']) as client:
            assert client.get('/api/products/').status_code==403
            response=client.get('/api/products/',auth=('admin',status['admin_password']))
            assert response.status_code==200,response.text
    finally:
        runner.stop(p.id)

def test_multiple_models_relationships_and_field_types():
    from backend.schema import Block, Edge
    p=blueprint()
    category=Block(id='category',data={'kind':'model','config':{'name':'Category','fields':[{'name':'title','type':'CharField'}]}})
    p.nodes.append(category)
    p.edges.append(Edge(id='app-category',source='app',target='category'))
    for kind,parent,name in [('serializer','category','CategorySerializer'),('viewset','category-serializer','CategoryViewSet'),('router','category-viewset','categories'),('admin','category','CategoryAdmin')]:
        key='category-'+kind
        p.nodes.append(Block(id=key,data={'kind':kind,'config':{'name':name}}))
        p.edges.append(Edge(id=parent+'-'+key,source=parent,target=key))
    from backend.schema import ModelField
    fields=[('category','ForeignKey','Category'),('featured_category','OneToOneField','Category'),('tags','ManyToManyField','Category'),('description','TextField',''),('quantity','IntegerField',''),('score','FloatField',''),('active','BooleanField',''),('date','DateField',''),('event_at','DateTimeField',''),('email','EmailField',''),('website','URLField',''),('metadata','JSONField',''),('attachment','FileField','')]
    p.nodes[3].data.config.fields.extend(ModelField(name=n,type=t,target=target,required=False) for n,t,target in fields)
    assert validate(p)['valid']
    try:
        runner.start(p);status=wait_ready(p)
        with httpx.Client(base_url=status['url'],timeout=10) as client:
            response=client.post('/api/categories/',json={'title':'Stationery'})
            assert response.status_code==201,response.text
            key=response.json()['id']
            response=client.post('/api/products/',json={'name':'Pencil','price':'1.00','category':key,'featured_category':key,'tags':[key],'metadata':{'color':'green'}})
            assert response.status_code==201,response.text
            assert response.json()['tags']==[key]
            response=client.delete(f'/api/categories/{key}/')
            assert response.status_code==400,response.text
            assert 'referenced' in response.json()['detail']
    finally:
        runner.stop(p.id)

def test_stop_during_build():
    p=blueprint()
    runner.start(p)
    runner.stop(p.id)
    assert runner.status(p.id)['status']=='stopped'
    worker=runner.jobs[p.id]['worker']
    worker.join(timeout=10)
    assert not worker.is_alive()
    process=runner.jobs[p.id].get('process')
    assert process is None or process.poll() is not None
