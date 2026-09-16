# Reference study and implementation decisions

## Inputs examined

- `djangorest-base-template-main`: project layout, README and development lifecycle; settings and dependencies; shared core models, serializers, views and admin patterns; management command inventory.
- `Saturn-main`: core abstractions; product models/serializers/viewsets/routes/admin; people models and relationship patterns; program models and domain workflow structure; source inventory for each app.
- Scratch's actual editor: categorized block palette, main workspace, property controls, contextual tutorial, and start/stop controls. The public pages require JavaScript, so the editor was inspected in a browser.

These were read as reference implementations, not executed or changed. No secrets or configuration values were copied into the new application.

## Architecture mapping

| Reference pattern | Builder implementation |
| --- | --- |
| Server settings and manage.py | Project block and generated server package |
| SQLite development / database config | Database block with immediate local SQLite support |
| Product / people / program app modules | One configurable Django app block per project |
| Core BaseModel created_at/updated_at | Optional generated model audit timestamps |
| Product.name/summary/description | Model fields and product starter template |
| ForeignKey / OneToOne / ManyToMany | Editable relationship fields with validated target models |
| ModelSerializer pipeline | Serializer block generating a ModelSerializer |
| ServerOrgGroupViewSet CRUD shape | DRF ModelViewSet with selectable HTTP methods |
| Search/filter/ordering configuration | Search & filtering block and django-filter |
| DefaultRouter registrations | URL router block and collection/detail endpoints |
| Custom admin registrations | Per-model Django admin with list/search configuration |
| API authentication | Session/Basic authentication and four permission policies |
| API schema tooling | Optional drf-spectacular OpenAPI/Swagger block |
| Migrate/run scripts | FastAPI supervised generation, migration and server lifecycle |

## Deliberate boundaries

Saturn's organization groups, ownership rules, publish/immutability rules, custom storage, import/export of domain data, backups, cron jobs and engineering planning domain are application-specific. They are not represented as finished builder features. The generator uses standard DRF/Django components, rather than copying a large domain codebase or presenting simplified permissions as equivalent to the original ACL system.

The reference viewsets include `filterset_fields = {...}.update(...)`. Since `dict.update()` returns None, the new generator emits explicit lists of filterable fields. The generator also avoids copying exposed user password fields or fixed administrator credentials; no User CRUD block is included.

## Runtime design

The React graph is a typed JSON intermediate representation. The backend validates it before code generation, preview/export or execution. Every supported block has a defined predecessor kind, so a legal dependency graph is acyclic. Python identifiers, paths, field kinds and permission classes are validated or allowlisted. User data is emitted using Python literal quoting. No raw Python code blocks are supported.

Source generation is deterministic. User-controlled app names become paths only after identifier checks. Run starts trusted generated source using the project virtual environment without shell command interpolation. Child servers are loopback-only; logs are bounded. A readiness probe establishes that a server is live before the UI shows Running.

The React Admin workspace manages saved projects and supervised server status. Generated Django admin manages application records and users. Hosted team authentication and process/container isolation would be required before deploying the builder as a shared internet service.

## Future expansion

The block catalog, dependency validator and generator form the extension points for multi-app routing, PostgreSQL configuration, organization-aware ACLs, serializer field selection, explicit choices/defaults, data migrations across schema revisions, and background jobs. These require real semantic validation and runtime support before being added to the palette.
