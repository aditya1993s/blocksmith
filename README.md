# Blocksmith

A visual Django REST application builder. React + TypeScript and React Flow power the workspace; FastAPI saves blueprints, validates connections, generates Django source, and supervises real local Django servers.

## Start on Windows

Requires Python 3.12+ and Node.js 20.19+ (tested with Python 3.14 and Node 24).

```powershell
.\start.ps1
```

Open **http://127.0.0.1:8000**. This script installs dependencies, builds the frontend and serves the entire application from FastAPI. If PowerShell execution policy blocks scripts, run the individual commands below instead of changing machine policy.

Development, in two terminals:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to FastAPI. FastAPI's own API reference is at `/docs`.

## Build your application

1. Start with Product catalog, Team directory, or Blank canvas in Templates.
2. Click or drag blocks from the library. Clicking adds a connection to a compatible selected or existing parent. Drag bottom handles to top handles for manual connections.
3. Connect `Django project → Database → Django app → Model → Serializer → CRUD viewset → URL router`.
4. Click a model to add fields, required/unique constraints, timestamps, and relationships. Supported types: text, long text, integer, float, decimal, boolean, date, datetime, email, URL, JSON, file, foreign key, one-to-one, and many-to-many.
5. Connect an Admin panel to each model. Optional blocks add global authentication, pagination, search/filter/order, and OpenAPI/Swagger docs.
6. Follow the live guide to fix missing blocks, incompatible connections, invalid names, duplicate fields, missing relationship targets and incomplete pipelines. Errors block generation; suggestions do not.
7. Click **Run project**. The backend generates source, checks Django, creates migrations, applies them, creates a local administrator, starts a loopback server and waits for a successful health response. Follow progress in Server console.
8. Open the API or Django admin from the console. **Show admin login** reveals credentials generated for this project revision. Stop server shuts down the child process.
9. Export a ZIP containing editable source, requirements, setup instructions and the blueprint. Projects → Save blueprint/Import JSON supports portable graph editing.

Double-click a connection to remove it. Remove blocks in their settings. Undo/redo restores edits. Model fields are nested inside Model blocks, rather than separate graph nodes. Connections define dependencies; this is a declarative application graph rather than an imperative Scratch program.

## Walkthrough: Student CRUD app

This example creates a Student REST API and a Django admin interface where you can create, read, update, and delete students. Start Blocksmith using the instructions above, then open the builder.

### 1. Create the project and connect blocks

Open **Projects → New project**. Select the **Django project** block and set its **Name** to `student_project`.

Select each parent block before clicking the next block in the library to connect them automatically. Build this chain:

```text
Django project → Database → Django app → Model → Serializer → CRUD viewset → URL router
```

If a connection is missing, drag from the parent's bottom handle to the child's top handle. Configure the blocks as follows:

| Block | Setting |
|---|---|
| Django project | Name: `student_project` |
| Database | Keep SQLite |
| Django app | Name: `students` |
| Model | Name: `Student` |
| Serializer | Keep defaults |
| CRUD viewset | Keep GET, POST, PUT, PATCH, and DELETE checked |
| URL router | Endpoint path: `students` (without `/api/` or slashes) |

For local API testing, set the **CRUD viewset → Access permissions** to **Anyone (local development)**. An Authentication block, if added, overrides this permission across viewsets. Django admin still requires a login.

### 2. Define the Student fields

Select the **Student Model** block. Edit the existing fields and use **Add field** to create this set; remove any unwanted default fields:

| Field name | Type | Required | Unique |
|---|---|---|---|
| `name` | `CharField` | Yes | No |
| `email` | `EmailField` | Yes | Yes |
| `age` | `IntegerField` | Yes | No |
| `course` | `CharField` | Yes | No |

An `id` is generated automatically; do not add it as a field. You can leave **Created & updated timestamps** enabled.

### 3. Add the admin interface and run

Select the **Student Model** block, then click **Admin panel** in the library. It must connect directly to the model as a separate branch, while the model also connects to the serializer:

```text
Student Model → Serializer → CRUD viewset → URL router
      └──────→ Admin panel
```

Keep the Admin panel name as `ModelAdmin`. If blocks overlap, drag them apart to see their connections.

Resolve any errors in the live guide, then click **Run project**. Expand **Show output** at the bottom if the server console is collapsed. Wait until the server is running.

### 4. Log in and manage students

In the server console:

1. Click **Show admin login** to reveal the username (`admin`) and the generated password for this project revision.
2. Click **Django admin** and sign in with those credentials.
3. Open **Students**.

| Action | In Django admin |
|---|---|
| Create | Click **Add student**, fill in the fields, and click **Save**. |
| Read | View the student list or click a student to open its details. |
| Update | Open a student, edit its fields, and click **Save**. |
| Delete | Open a student, click **Delete**, and confirm. |

The generated server uses an assigned port. Its admin address is `http://127.0.0.1:<port>/admin/`; use the **Django admin** button to open the correct address. The password is shown in Blocksmith's output panel, not on the Django login page.

**Seeing “Page not found (404)” at the server's base address?** The generated app has no homepage at `/`. Append `/admin/` for the admin interface or `/api/students/` for the Student API. For example, if the current server address is `http://127.0.0.1:58548`, use `http://127.0.0.1:58548/admin/`. The port may change when you restart the generated server.

### 5. Try the Student API

Click **Open API** in the server console and navigate to the students endpoint. Use the generated server's address for these paths:

| Action | Method | Path |
|---|---|---|
| List students | GET | `/api/students/` |
| Create student | POST | `/api/students/` |
| Read one student | GET | `/api/students/1/` |
| Replace student | PUT | `/api/students/1/` |
| Update selected fields | PATCH | `/api/students/1/` |
| Delete student | DELETE | `/api/students/1/` |

Replace `1` with an existing student's ID. To create a student, send this JSON to `/api/students/` using POST:

```json
{
  "name": "Aarav",
  "email": "aarav@example.com",
  "age": 20,
  "course": "Computer Science"
}
```

Each student needs a unique email address. To update only the course, send `{"course": "Mathematics"}` using PATCH to that student's detail URL.

## Storage and lifecycle

Use **Projects → Delete** beside a saved project and confirm to remove its blueprint and stop its server. Generated files and databases are preserved. Deleting the open project replaces the canvas with a new blank draft; deletion cannot be undone.

- Browser local storage keeps the current draft; SQLite in `.runtime/projects.sqlite3` stores saved projects.
- Generated apps live under `.runtime/builds/<project-id>/<model-schema-hash>/`.
- A changed model schema creates a separate database revision. Existing revisions remain intact; returning to the same model source reuses its database. API-only edits reuse the existing schema database. This is deliberate data preservation, not an automatic data migration tool.
- Each server listens only on `127.0.0.1`, on an available OS-assigned port. Stop before running changed blocks. Up to four local servers may run at once.
- Shutdown of the FastAPI process stops supervised Django processes. A hard OS kill cannot guarantee graceful child cleanup.
- Local admin passwords and Django secrets remain in ignored runtime files and are never included in source ZIPs.
- The builder is a **single-user local development admin application**, not a hosted multi-tenant service. It rejects foreign browser origins and untrusted Host headers. Do not expose its port publicly. Generated source is from allowlisted block configuration, not arbitrary uploaded Python.
- Generated Django admin has normal Django authentication. API permissions can be public, authenticated, authenticated writes/public reads, or admin only. A global Authentication block overrides viewset permissions.
- SQLite and one Django app module per project are supported. Multiple models and pipelines are supported. Configure PostgreSQL or additional Django apps in exported source.
- This version does not import arbitrary Django repositories or reproduce Saturn's organization-level ACL, publish workflows, backup jobs or domain business rules. See the reference study for the mapping.
- Swagger's UI bundle and optional Google Fonts need internet; normal CRUD, admin and canvas editing work with locally installed dependencies and fallback fonts.

## Checks

```powershell
npm run build
.\.venv\Scripts\python.exe -m pytest backend -q
```

Tests validate graph errors, identifier safety, export contents, persistence, local-origin restrictions, and actual generated Django servers: CRUD, validation, filtering, schema endpoint, admin availability, authentication and restart persistence.

The completed implementation passed 14 backend tests and the TypeScript/Vite production build. Browser checks covered Run/Stop, generated code preview, model field editing, undo, templates, and recovery after removing a required serializer. The Python test client currently emits two upstream deprecation warnings; neither affects the tests. `backend/requirements.lock.txt` records the exact installed Python versions; use it instead of `requirements.txt` to reproduce this environment. `npm ci` uses the committed npm lockfile.

## Structure

```
src/                 React workspace, canvas, inspectors, templates and admin
backend/schema.py    Typed graph schema and actionable validation
backend/generator.py Deterministic Django source generation
backend/runner.py    Build, migrate, supervise, health-check and stop
backend/main.py      FastAPI persistence, validation, source and runtime API
docs/REFERENCE_STUDY.md  Design decisions based on supplied projects
```

Design and implementation references: [Scratch editor](https://scratch.mit.edu/projects/editor/?tutorial=getStarted), [React Flow](https://reactflow.dev/learn), [FastAPI](https://fastapi.tiangolo.com/tutorial/), [DRF viewsets](https://www.django-rest-framework.org/api-guide/viewsets/).
