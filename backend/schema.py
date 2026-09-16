"""The graph is data, never arbitrary executable Python."""
import keyword
import re
import sys
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

Kind = Literal['project', 'database', 'app', 'model', 'serializer', 'viewset', 'router', 'admin', 'auth', 'pagination', 'filter', 'docs']
FieldKind = Literal['CharField', 'TextField', 'IntegerField', 'FloatField', 'DecimalField', 'BooleanField', 'DateField', 'DateTimeField', 'EmailField', 'URLField', 'JSONField', 'FileField', 'ForeignKey', 'OneToOneField', 'ManyToManyField']

class ModelField(BaseModel):
    name: str = Field(max_length=64)
    type: FieldKind = 'CharField'
    required: bool = True
    unique: bool = False
    max_length: int = Field(default=255, ge=1, le=10000)
    target: str = ''

class Config(BaseModel):
    name: str = Field(default='', max_length=80)
    fields: list[ModelField] = Field(default_factory=list, max_length=60)
    model: str = ''
    permission: Literal['AllowAny', 'IsAuthenticated', 'IsAuthenticatedOrReadOnly', 'IsAdminUser'] = 'AllowAny'
    methods: list[Literal['get', 'post', 'put', 'patch', 'delete']] = Field(default_factory=lambda: ['get', 'post', 'put', 'patch', 'delete'])
    page_size: int = Field(default=20, ge=1, le=200)
    timestamps: bool = True

class BlockData(BaseModel):
    kind: Kind
    label: str = ''
    config: Config = Field(default_factory=Config)

class Position(BaseModel):
    x: float = 0
    y: float = 0

class Block(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str = Field(max_length=80)
    type: str = 'block'
    position: Position = Field(default_factory=Position)
    data: BlockData

class Edge(BaseModel):
    id: str
    source: str
    target: str

class Project(BaseModel):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    name: str = Field(min_length=1, max_length=100)
    nodes: list[Block] = Field(max_length=150)
    edges: list[Edge] = Field(default_factory=list, max_length=500)

DEPENDENCIES = {'database': 'project', 'app': 'database', 'model': 'app', 'serializer': 'model', 'viewset': 'serializer', 'router': 'viewset', 'admin': 'model', 'auth': 'project', 'pagination': 'project', 'filter': 'viewset', 'docs': 'project'}
RESERVED = {'id', 'pk', 'objects', 'save', 'delete', 'clean', 'Meta', 'created_at', 'updated_at', 'models', 'admin', 'serializers', 'views', 'server', 'core', 'auth', 'contenttypes', 'sessions', 'messages', 'staticfiles', 'rest_framework', 'django', 'config', 'User', 'Group', 'BaseModel'}

def identifier(value):
    return bool(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', value)) and not keyword.iskeyword(value) and value not in RESERVED and '__' not in value and not value.endswith('_')

def validate(project: Project):
    issues = []
    def add(message, detail, node=None, fix=None, severity='error'):
        issues.append({'message': message, 'detail': detail, 'node_id': node, 'fix': fix, 'severity': severity})
    nodes = {n.id: n for n in project.nodes}
    groups = {k: [n for n in project.nodes if n.data.kind == k] for k in Kind.__args__}
    if len(nodes) != len(project.nodes):
        add('Duplicate block IDs', 'Each block must have its own ID. Remove the duplicated block.')
    for kind in ['project', 'database', 'app', 'model']:
        if not groups[kind]:
            add(f'Add a {kind} block', f'Your application needs a {kind} block before it can run.', fix={'kind': kind})
    for kind in ['project', 'database', 'app', 'auth', 'pagination', 'docs']:
        if len(groups[kind]) > 1:
            add(f'Only one {kind} block is supported', 'Keep one shared configuration block per project.', groups[kind][1].id)
    if groups['project'] and groups['app'] and groups['project'][0].data.config.name == groups['app'][0].data.config.name:
        add('Project and app names must differ', 'Use separate Python package names, for example shop_project and catalog.', groups['app'][0].id)
    incoming = {n.id: [] for n in project.nodes}
    for e in project.edges:
        if e.source not in nodes or e.target not in nodes:
            add('A connection points to a missing block', 'Delete the dangling connection and reconnect the blocks.')
            continue
        source, target = nodes[e.source], nodes[e.target]
        incoming[e.target].append(source)
        if DEPENDENCIES.get(target.data.kind) != source.data.kind:
            add('Incompatible connection', f'{source.data.kind} cannot feed {target.data.kind}. Follow the block dependency chain.', target.id)
    for n in project.nodes:
        kind, cfg = n.data.kind, n.data.config
        if kind in DEPENDENCIES:
            required = DEPENDENCIES[kind]
            parents = [p for p in incoming[n.id] if p.data.kind == required]
            if len(parents) != 1:
                add(f'Connect {n.data.label or kind} to a {required}', f'This block needs exactly one incoming {required} connection.', n.id, {'kind': required, 'target': n.id})
        if kind in ['project', 'app', 'model'] and not identifier(cfg.name):
            add(f'Invalid {kind} name', 'Use letters, numbers and underscores, starting with a letter. Avoid Python keywords and reserved Django names.', n.id)
        if kind in ['project', 'app'] and cfg.name in sys.stdlib_module_names:
            add('This name belongs to Python', 'Choose a package name that does not shadow a Python standard library module.', n.id)
        if kind == 'model':
            if not cfg.fields:
                add(f'{cfg.name} needs a field', 'Add at least one field, for example name (CharField). IDs and timestamps are automatic.', n.id)
            names = set()
            for f in cfg.fields:
                if not identifier(f.name) or f.name in names:
                    add(f'Invalid or duplicate field: {f.name}', 'Choose a unique Python field name. id, created_at and updated_at are generated automatically.', n.id)
                names.add(f.name)
                if f.type in ['ForeignKey', 'OneToOneField', 'ManyToManyField'] and f.target not in [m.data.config.name for m in groups['model']]:
                    add(f'Choose a related model for {f.name}', 'Add the target model to the canvas, then select it in the field settings.', n.id)
            for f in cfg.fields:
                if f.type in ['ForeignKey', 'OneToOneField'] and f.name + '_id' in names:
                    add(f'Field collision: {f.name}_id', 'Django creates this database column for the relationship. Rename the explicit field.', n.id)
            for stage in ['serializer', 'admin']:
                if not any(e.source == n.id and nodes.get(e.target) and nodes[e.target].data.kind == stage for e in project.edges):
                    add(f'{cfg.name} needs a {stage}', f'Add and connect a {stage} block to expose this model in the '+('REST API.' if stage == 'serializer' else 'Django admin.'), n.id, {'kind': stage, 'source': n.id}, 'error' if stage == 'serializer' else 'warning')
        if kind in ['serializer', 'viewset']:
            stage = 'viewset' if kind == 'serializer' else 'router'
            if not any(e.source == n.id and nodes.get(e.target) and nodes[e.target].data.kind == stage for e in project.edges):
                add(f'Add a {stage} after {n.data.label or kind}', f'A {stage} makes this part of your API reachable.', n.id, {'kind': stage, 'source': n.id})
        if kind == 'viewset' and not cfg.methods:
            add('Choose at least one CRUD operation', 'Enable a method in the viewset settings.', n.id)
        if kind == 'router' and not re.fullmatch(r'[a-z][a-z0-9_-]{0,60}', cfg.name):
            add('Invalid endpoint path', 'Use a lowercase path such as products. Do not include slashes.', n.id)
        if kind == 'router' and cfg.name in ['auth', 'docs', 'schema']:
            add('Reserved endpoint path', 'auth, docs and schema are reserved. Choose another collection path.', n.id)
    for kind in ['model', 'router']:
        values = [n.data.config.name.lower() for n in groups[kind]]
        if len(values) != len(set(values)):
            add(f'Duplicate {kind} names', f'Each {kind} must have a unique name or path.')
    # A single model has one generated pipeline. Reject ambiguous duplicate descendants.
    for n in project.nodes:
        for kind in ['serializer', 'viewset', 'router', 'admin', 'filter']:
            children = [e.target for e in project.edges if e.source == n.id and e.target in nodes and nodes[e.target].data.kind == kind]
            if len(children) > 1:
                add(f'Duplicate {kind} connections', 'Keep one block of this type per pipeline.', n.id)
    return {'valid': not any(i['severity'] == 'error' for i in issues), 'issues': issues, 'block_count': len(nodes)}
