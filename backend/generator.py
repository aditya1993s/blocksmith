"""Deterministic Django source generation from a validated block graph."""
from .schema import Project, validate

def generate(project: Project) -> dict[str, str]:
    report = validate(project)
    if not report['valid']:
        raise ValueError(report)
    nodes = {n.id: n for n in project.nodes}
    groups = {}
    for n in project.nodes:
        groups.setdefault(n.data.kind, []).append(n)
    app = groups['app'][0].data.config.name
    package = groups['project'][0].data.config.name
    def parent(n):
        return nodes[next(e.source for e in project.edges if e.target == n.id)]
    def model_for(n):
        while n.data.kind != 'model':
            n = parent(n)
        return n
    def child(n, kind):
        return next((nodes[e.target] for e in project.edges if e.source == n.id and nodes[e.target].data.kind == kind), None)
    files = {f'{package}/__init__.py': '', f'{app}/__init__.py': '', f'{app}/migrations/__init__.py': ''}
    files['manage.py'] = f"import os, sys\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', '{package}.settings')\nfrom django.core.management import execute_from_command_line\nexecute_from_command_line(sys.argv)\n"
    files[f'{package}/wsgi.py'] = f"import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', '{package}.settings')\nfrom django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()\n"
    files[f'{package}/asgi.py'] = f"import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', '{package}.settings')\nfrom django.core.asgi import get_asgi_application\napplication = get_asgi_application()\n"
    permission = groups.get('auth', [None])[0]
    permission = permission.data.config.permission if permission else 'AllowAny'
    page = groups.get('pagination', [None])[0]
    rest = {'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication', 'rest_framework.authentication.BasicAuthentication'], 'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.' + permission], 'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema'}
    if page:
        rest.update(DEFAULT_PAGINATION_CLASS='rest_framework.pagination.PageNumberPagination', PAGE_SIZE=page.data.config.page_size)
    files[f'{package}/settings.py'] = f'''from pathlib import Path
import os
import secrets
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_FILE = BASE_DIR / '.secret'
if not os.environ.get('DJANGO_SECRET_KEY') and not SECRET_FILE.exists():
    SECRET_FILE.write_text(secrets.token_urlsafe(48))
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or SECRET_FILE.read_text()
DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', 'testserver']
INSTALLED_APPS = ['django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'rest_framework', 'django_filters', 'drf_spectacular', {app!r}]
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware']
ROOT_URLCONF = '{package}.urls'
TEMPLATES = [{{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {{'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}}}]
WSGI_APPLICATION = '{package}.wsgi.application'
DATABASES = {{'default': {{'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}}}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
STATIC_URL = 'static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
USE_TZ = True
TIME_ZONE = 'UTC'
REST_FRAMEWORK = {rest!r}
SPECTACULAR_SETTINGS = {{'TITLE': {project.name!r}, 'VERSION': '1.0.0', 'SWAGGER_UI_DIST': 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5'}}
'''
    models = ['from django.db import models\n']
    serializers = ['from rest_framework import serializers', 'from . import models\n']
    views = ['from rest_framework import viewsets, permissions, filters', 'from rest_framework.exceptions import ValidationError', 'from django.db.models.deletion import ProtectedError', 'from django_filters.rest_framework import DjangoFilterBackend', 'from . import models, serializers\n']
    admin = ['from django.contrib import admin', 'from . import models\n', f'admin.site.site_header = {project.name + " administration"!r}\n']
    routes = ['from rest_framework.routers import DefaultRouter', 'from . import views', 'router = DefaultRouter()']
    for n in groups['model']:
        cfg = n.data.config
        lines = [f'class {cfg.name}(models.Model):']
        for f in cfg.fields:
            args = []
            if f.type in ['CharField', 'EmailField', 'URLField']:
                args.append(f'max_length={f.max_length}')
            if f.type == 'DecimalField':
                args += ['max_digits=12', 'decimal_places=2']
            if f.type in ['ForeignKey', 'OneToOneField', 'ManyToManyField']:
                args.append(repr(f.target))
                args.append("related_name='+'")
                if f.type != 'ManyToManyField':
                    args.append('on_delete=models.PROTECT')
            if f.type == 'FileField':
                args.append("upload_to='uploads/'")
            if not f.required:
                args.append('blank=True')
                if f.type != 'ManyToManyField':
                    args.append('null=True')
            if f.unique and f.type != 'ManyToManyField':
                args.append('unique=True')
            lines.append(f'    {f.name} = models.{f.type}({", ".join(args)})')
        if cfg.timestamps:
            lines.extend(['    created_at = models.DateTimeField(auto_now_add=True)', '    updated_at = models.DateTimeField(auto_now=True)'])
        display = 'name' if any(f.name == 'name' for f in cfg.fields) else 'pk'
        lines.append(f'\n    def __str__(self):\n        return str(self.{display})\n')
        models.append('\n'.join(lines))
    for n in groups.get('serializer', []):
        name = model_for(n).data.config.name
        serializers.append(f'class {name}Serializer(serializers.ModelSerializer):\n    class Meta:\n        model = models.{name}\n        fields = "__all__"\n')
    for n in groups.get('viewset', []):
        model = model_for(n).data.config
        name = model.name
        perms = n.data.config.permission if not groups.get('auth') else permission
        text_fields = [f.name for f in model.fields if f.type in ['CharField', 'TextField', 'EmailField']]
        filter_fields = [f.name for f in model.fields if f.type not in ['JSONField', 'FileField']]
        methods = n.data.config.methods + ['head', 'options']
        code = f'class {name}ViewSet(viewsets.ModelViewSet):\n    queryset = models.{name}.objects.all().order_by("pk")\n    serializer_class = serializers.{name}Serializer\n    permission_classes = [permissions.{perms}]\n    http_method_names = {methods!r}\n'
        if child(n, 'filter'):
            code += f'    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]\n    filterset_fields = {filter_fields!r}\n    search_fields = {text_fields!r}\n    ordering_fields = "__all__"\n'
        code += '\n    def perform_destroy(self, instance):\n        try:\n            instance.delete()\n        except ProtectedError:\n            raise ValidationError({"detail": "This record is referenced by another record. Remove those references before deleting it."})\n'
        views.append(code)
    for n in groups.get('router', []):
        name = model_for(n).data.config.name
        routes.append(f'router.register({n.data.config.name!r}, views.{name}ViewSet, basename={name.lower()!r})')
    routes.append('urlpatterns = router.urls\n')
    for n in groups.get('admin', []):
        cfg = model_for(n).data.config
        fields = ['id'] + [f.name for f in cfg.fields if f.type not in ['ManyToManyField', 'JSONField', 'TextField']][:5]
        search = [f.name for f in cfg.fields if f.type in ['CharField', 'EmailField', 'TextField']]
        admin.append(f'@admin.register(models.{cfg.name})\nclass {cfg.name}Admin(admin.ModelAdmin):\n    list_display = {fields!r}\n    search_fields = {search!r}\n')
    for file, lines in [('models', models), ('serializers', serializers), ('views', views), ('urls', routes), ('admin', admin)]:
        files[f'{app}/{file}.py'] = '\n'.join(lines)
    docs = ", path('api/schema/', SpectacularAPIView.as_view(), name='schema'), path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'))" if groups.get('docs') else ''
    files[f'{package}/urls.py'] = f"from django.contrib import admin\nfrom django.urls import path, include\nfrom django.conf import settings\nfrom django.conf.urls.static import static\nfrom drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView\nurlpatterns = [path('admin/', admin.site.urls), path('api/auth/', include('rest_framework.urls')), path('api/', include('{app}.urls')){docs}] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)\n"
    files['requirements.txt'] = 'Django>=5.2,<6.1\ndjangorestframework>=3.16,<4\ndjango-filter>=25.1,<26\ndrf-spectacular>=0.28,<1\n'
    files['.gitignore'] = '.secret\ndb.sqlite3\nmedia/\n__pycache__/\n.venv/\n'
    files['README.md'] = f'# {project.name}\n\nGenerated by Blocksmith.\n\n```sh\npython -m venv .venv\n# Activate .venv first\npip install -r requirements.txt\npython manage.py makemigrations {app}\npython manage.py migrate\npython manage.py createsuperuser\npython manage.py runserver\n```\n\nAPI: /api/ | Admin: /admin/\n\nLocal development configuration. Set DJANGO_SECRET_KEY and configure production hosts, HTTPS and deployment settings before publishing. Relationships use PROTECT to prevent accidental cascading deletion.\n'
    return files
