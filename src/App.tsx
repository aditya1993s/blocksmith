import { useState, useEffect, useRef, useCallback } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import {
  Box,
  Blocks,
  FolderOpen,
  BookOpen,
  Settings2,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Play,
  Square,
  Download,
  Check,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Code2,
  Workflow,
  Terminal,
  ZoomIn,
  ZoomOut,
  Maximize,
  Undo2,
  Redo2,
  MousePointer2,
  Hand,
  X,
  LoaderCircle,
  Save,
  LayoutGrid,
  ExternalLink,
  FileCode2,
  Copy,
  ShieldCheck,
  Upload,
  HelpCircle,
  Trash2,
} from "lucide-react";
import BlockNode, { BlockIcon } from "./BlockNode";
import Inspector from "./Inspector";
import {
  catalog,
  depends,
  block,
  edge,
  starter,
  emptyProject,
  loadDraft,
  api,
  type Kind,
  type Block,
  type Project,
  type Issue,
  type Report,
  type Run,
} from "./model";

const nodeTypes = { block: BlockNode };
type Modal = "projects" | "templates" | "guide" | "admin" | null;
const emptyRun: Run = { status: "stopped", logs: [] };
export default function App() {
  const [project, setProject] = useState<Project>(loadDraft);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [validationError, setValidationError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All blocks");
  const [tab, setTab] = useState<"canvas" | "code" | "endpoints">("canvas");
  const [modal, setModal] = useState<Modal>(null);
  const [run, setRun] = useState<Run>(emptyRun);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [saveState, setSaveState] = useState("Local draft");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [file, setFile] = useState("");
  const [savedProjects, setSavedProjects] = useState<
    { id: string; name: string; updated: string; status: string }[]
  >([]);
  const [pan, setPan] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [credentials, setCredentials] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useRef<Project[]>([]),
    future = useRef<Project[]>([]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const importRef = useRef<HTMLInputElement>(null);
  const saveSequence = useRef(0);
  const deletingProjects = useRef(new Set<string>());
  const pendingSaves = useRef(new Set<Promise<unknown>>());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const persistProject = useCallback(async (value: Project) => {
    if (deletingProjects.current.has(value.id)) return;
    const request = api(`/projects/${value.id}`, value, "PUT");
    pendingSaves.current.add(request);
    try {
      await request;
    } finally {
      pendingSaves.current.delete(request);
    }
  }, []);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (tab === "canvas") {
      const t = setTimeout(
        () => fitView({ padding: 0.12, duration: 250 }),
        150,
      );
      return () => clearTimeout(t);
    }
  }, [tab, consoleOpen, fitView]);
  const commit = useCallback((next: Project) => {
    history.current = [...history.current.slice(-39), projectRef.current];
    future.current = [];
    setHistoryVersion((v) => v + 1);
    setProject(next);
  }, []);
  const undo = () => {
    const last = history.current.pop();
    if (last) {
      future.current.push(project);
      setProject(last);
      setHistoryVersion((v) => v + 1);
      setSelected(null);
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      history.current.push(project);
      setProject(next);
      setHistoryVersion((v) => v + 1);
      setSelected(null);
    }
  };
  void historyVersion;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    try {
      localStorage.setItem("blocksmith-draft", JSON.stringify(project));
    } catch {
      notify("Browser storage is full. Save the project to the backend.");
    }
    setSaveState("Saving…");
    const sequence = ++saveSequence.current;
    const t = setTimeout(() => {
      if (deletingProjects.current.has(project.id)) return;
      persistProject(project)
        .then(() => {
          if (saveSequence.current === sequence)
            setSaveState("All changes saved");
        })
        .catch(() => {
          if (saveSequence.current === sequence)
            setSaveState("Saved in browser");
        });
    }, 700);
    return () => clearTimeout(t);
  }, [project, notify, persistProject]);
  useEffect(() => {
    let alive = true;
    setReport(null);
    const t = setTimeout(() => {
      api<Report>("/validate", project)
        .then((r) => {
          if (alive) {
            setReport(r);
            setValidationError("");
          }
        })
        .catch((e) => {
          if (alive) setValidationError(e.message);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [project]);
  useEffect(() => {
    let alive = true;
    setRun(emptyRun);
    setCredentials(false);
    const poll = () =>
      api<Run>(`/projects/${project.id}/status`)
        .then((r) => {
          if (alive) setRun(r);
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [project.id]);
  useEffect(() => {
    if (tab !== "code") return;
    let alive = true;
    setCodeError("");
    const t = setTimeout(() => {
      api<{ files: Record<string, string> }>("/generate", project)
        .then((r) => {
          if (alive) {
            setFiles(r.files);
            setFile((f) =>
              r.files[f] !== undefined
                ? f
                : Object.keys(r.files).find((p) => p.endsWith("/models.py")) ||
                  Object.keys(r.files)[0],
            );
          }
        })
        .catch((e) => {
          if (alive) {
            setFiles({});
            setCodeError(e.message);
          }
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [tab, project]);
  const current = project.nodes.find((n) => n.id === selected);
  const errors = report?.issues.filter((i) => i.severity === "error") || [];
  const warnings = report?.issues.filter((i) => i.severity === "warning") || [];
  const running = run.status === "running" || run.status === "starting";
  const save = async () => {
    try {
      await persistProject(project);
      setSaveState("All changes saved");
      notify("Project saved to your workspace.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const createBlock = (
    kind: Kind,
    position?: { x: number; y: number },
    fix?: Issue["fix"],
  ) => {
    const count = project.nodes.filter((n) => n.data.kind === kind).length;
    let parent = fix?.source
      ? project.nodes.find((n) => n.id === fix.source)
      : project.nodes.find(
          (n) => n.id === selected && n.data.kind === depends[kind],
        ) || project.nodes.filter((n) => n.data.kind === depends[kind]).at(-1);
    if (fix?.target) {
      const existing = project.nodes.find((n) => n.data.kind === kind);
      if (existing) {
        commit({
          ...project,
          edges: [
            ...project.edges.filter((e) => e.target !== fix.target),
            edge(existing.id, fix.target),
          ],
        });
        setSelected(null);
        return;
      }
    }
    if (fix?.source) {
      const existing = project.nodes.find(
        (n) =>
          n.data.kind === kind && !project.edges.some((e) => e.target === n.id),
      );
      if (existing) {
        commit({
          ...project,
          edges: [...project.edges, edge(fix.source, existing.id)],
        });
        setSelected(null);
        return;
      }
    }
    const id = crypto.randomUUID();
    const pos =
      position ||
      (parent
        ? { x: parent.position.x + 330, y: parent.position.y + 100 }
        : { x: 90 + count * 60, y: 100 + count * 100 });
    const n = block(
      kind,
      id,
      pos.x,
      pos.y,
      kind === "model"
        ? { name: count ? `Model${count + 1}` : "Product" }
        : kind === "router"
          ? { name: count ? `resource${count + 1}` : "products" }
          : {},
    );
    let edges = [...project.edges];
    if (parent) edges.push(edge(parent.id, id));
    if (fix?.target) edges.push(edge(id, fix.target));
    commit({ ...project, nodes: [...project.nodes, n], edges });
    setSelected(fix ? null : id);
    setTab("canvas");
    setTimeout(() => fitView({ padding: 0.12, duration: 250 }), 100);
    notify(`${catalog[kind].title} added${parent ? " and connected" : ""}.`);
  };
  const fixIssue = (issue: Issue) => {
    if (issue.fix) createBlock(issue.fix.kind, undefined, issue.fix);
    else if (issue.node_id) setSelected(issue.node_id);
  };
  const onNodesChange = useCallback((changes: NodeChange<Block>[]) => {
    setProject((p) => ({ ...p, nodes: applyNodeChanges(changes, p.nodes) }));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setProject((p) => ({ ...p, edges: applyEdgeChanges(changes, p.edges) }));
  }, []);
  const onConnect = (connection: Connection) => {
    const source = project.nodes.find((n) => n.id === connection.source),
      target = project.nodes.find((n) => n.id === connection.target);
    if (!source || !target || depends[target.data.kind] !== source.data.kind) {
      notify(
        "These blocks do not connect. Check the guide for the expected block order.",
      );
      return;
    }
    commit({
      ...project,
      edges: addEdge(
        { ...connection, type: "smoothstep" },
        project.edges.filter((e) => e.target !== connection.target),
      ),
    });
  };
  const remove = () => {
    commit({
      ...project,
      nodes: project.nodes.filter((n) => n.id !== selected),
      edges: project.edges.filter(
        (e) => e.source !== selected && e.target !== selected,
      ),
    });
    setSelected(null);
  };
  const runProject = async () => {
    setBusy(true);
    setConsoleOpen(true);
    try {
      const validation = await api<Report>("/validate", project);
      setReport(validation);
      if (!validation.valid) {
        notify(
          "A few blocks need attention. Follow the project guide to finish your app.",
        );
        setSelected(null);
        return;
      }
      setRun(await api<Run>(`/projects/${project.id}/run`, project));
      notify("Building your Django app…");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    try {
      setRun(await api<Run>(`/projects/${project.id}/stop`, {}));
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportProject = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!response.ok)
        throw new Error(
          "Complete the project checklist before exporting Django code.",
        );
      download(
        await response.blob(),
        `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip`,
      );
      notify("Django source exported.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const showModal = async (value: Modal) => {
    setModal(value);
    if (value === "projects" || value === "admin") {
      try {
        setSavedProjects(await api("/projects"));
      } catch {
        notify("Start the backend to load saved projects.");
      }
    }
  };
  const switchProject = (next: Project) => {
    // Explicitly importing a previously deleted blueprint may restore it.
    deletingProjects.current.delete(next.id);
    commit(next);
    setSelected(null);
    setModal(null);
    setTab("canvas");
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 100);
  };
  const deleteProject = async (target: { id: string; name: string }) => {
    if (deletingId || busy) return;
    if (
      !window.confirm(
        `Delete "${target.name}"? This removes its saved blueprint and stops its server. Generated files and databases are kept. This cannot be undone.`,
      )
    )
      return;
    deletingProjects.current.add(target.id);
    setDeletingId(target.id);
    ++saveSequence.current;
    try {
      // Let already dispatched saves finish before deleting their row.
      await Promise.allSettled([...pendingSaves.current]);
      await api(`/projects/${target.id}`, {}, "DELETE");
      setSavedProjects((items) =>
        items.filter((item) => item.id !== target.id),
      );
      history.current = history.current.filter((item) => item.id !== target.id);
      future.current = future.current.filter((item) => item.id !== target.id);
      setHistoryVersion((value) => value + 1);
      if (projectRef.current.id === target.id) {
        const next = emptyProject();
        // Replace the browser draft immediately, including before a refresh.
        try {
          localStorage.setItem("blocksmith-draft", JSON.stringify(next));
        } catch {}
        setProject(next);
        setSelected(null);
        setRun(emptyRun);
        setFiles({});
        setTab("canvas");
      }
      notify(`Deleted "${target.name}".`);
    } catch (e) {
      deletingProjects.current.delete(target.id);
      notify((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };
  const importProject = async (f: File) => {
    try {
      const p = JSON.parse(await f.text());
      if (!p.name || !Array.isArray(p.nodes) || !Array.isArray(p.edges))
        throw new Error("Choose a Blocksmith JSON project.");
      await api("/validate", p);
      switchProject(p);
      notify("Project imported.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const templates = [
    {
      name: "Product catalog",
      desc: "Products, pricing and inventory. Your first API, ready to build.",
      tag: "STARTER",
      style: "mint",
    },
    {
      name: "Blank canvas",
      desc: "A fresh start for your next big idea. We’ll guide you along the way.",
      tag: "FROM SCRATCH",
      style: "lavender",
    },
    {
      name: "Team directory",
      desc: "A simple people API with names, emails and roles.",
      tag: "PEOPLE",
      style: "peach",
    },
  ];
  const useTemplate = (index: number) => {
    if (index === 1) {
      switchProject(emptyProject());
      return;
    }
    const p = starter();
    if (index === 2) {
      p.name = "Team directory";
      p.nodes = p.nodes.map((n) =>
        n.data.kind === "project"
          ? { ...n, data: { ...n.data, config: { name: "team_directory" } } }
          : n.data.kind === "model"
            ? {
                ...n,
                data: {
                  ...n.data,
                  config: {
                    name: "Person",
                    timestamps: true,
                    fields: [
                      { name: "name", type: "CharField", required: true },
                      {
                        name: "email",
                        type: "EmailField",
                        required: true,
                        unique: true,
                      },
                      { name: "role", type: "CharField", required: false },
                    ],
                  },
                },
              }
            : n.data.kind === "router"
              ? { ...n, data: { ...n.data, config: { name: "people" } } }
              : n,
      );
    }
    switchProject(p);
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("canvas");
          }}
        >
          <span className="brand-mark">
            <Blocks size={25} />
          </span>
          blocksmith<span className="beta">BETA</span>
        </a>
        <div className="header-divider" />
        <div className="breadcrumbs">
          <span>Workspace</span>
          <ChevronRight size={14} />
          <button onClick={() => showModal("projects")}>
            {project.name}
            <ChevronDown size={14} />
          </button>
        </div>
        <div className="header-right">
          <span className="local-badge">
            <span className="status-dot" />
            Local workspace
          </span>
          <button className="help-button" onClick={() => showModal("guide")}>
            <HelpCircle size={16} />
            Quick guide
          </button>
          <span className="avatar">AD</span>
        </div>
      </header>
      <div className="app-body">
        <nav className="rail" aria-label="Main navigation">
          <button
            className={modal === null ? "active" : ""}
            title="Builder"
            onClick={() => {
              setModal(null);
              setTab("canvas");
            }}
          >
            <Blocks size={21} />
            <span>Builder</span>
          </button>
          <button title="My projects" onClick={() => showModal("projects")}>
            <FolderOpen size={21} />
            <span>Projects</span>
          </button>
          <button title="Templates" onClick={() => showModal("templates")}>
            <LayoutGrid size={21} />
            <span>Templates</span>
          </button>
          <button title="Admin app" onClick={() => showModal("admin")}>
            <ShieldCheck size={21} />
            <span>Admin</span>
          </button>
          <div className="rail-bottom">
            <button title="Learn" onClick={() => showModal("guide")}>
              <BookOpen size={20} />
              <span>Learn</span>
            </button>
            <span className="rail-version">v1.0</span>
          </div>
        </nav>
        <aside className="library">
          <div className="library-header">
            <div className="section-heading">
              <h2>Building blocks</h2>
              <span className="count">12</span>
            </div>
            <p>Small blocks. Endless possibilities.</p>
            <div className="search-box">
              <Search size={15} />
              <input
                placeholder="Find a block…"
                aria-label="Find a block"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span>⌕</span>
            </div>
            <div className="library-tabs">
              <button
                className={category === "All blocks" ? "active" : ""}
                onClick={() => setCategory("All blocks")}
              >
                All blocks
              </button>
              <button
                className={category === "Essentials" ? "active" : ""}
                onClick={() => setCategory("Essentials")}
              >
                Essentials
              </button>
            </div>
          </div>
          <div className="library-list">
            {["Foundation", "Data & models", "API & logic", "Extensions"].map(
              (group) => {
                const entries = Object.entries(catalog).filter(
                  ([, v]) =>
                    v.group === group &&
                    (category !== "Essentials" || group !== "Extensions") &&
                    `${v.title} ${v.desc}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                );
                return (
                  entries.length > 0 && (
                    <section key={group}>
                      <h4>
                        {group}
                        <span>{entries.length}</span>
                      </h4>
                      {entries.map(([k, v]) => (
                        <button
                          key={k}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/blocksmith", k);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => createBlock(k as Kind)}
                          className={`library-block ${v.color}`}
                          title={`Add ${v.title}`}
                        >
                          <span className="block-icon">
                            <BlockIcon kind={k as Kind} />
                          </span>
                          <span>
                            <b>{v.title}</b>
                            <small>{v.desc}</small>
                          </span>
                          <Plus size={14} />
                        </button>
                      ))}
                    </section>
                  )
                );
              },
            )}
            {!Object.values(catalog).some((v) =>
              (v.title + " " + v.desc)
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && (
              <div className="empty-small">
                No blocks found. Try “model” or “API”.
              </div>
            )}
          </div>
          <div className="library-tip">
            <span>✦</span>
            <div>
              <b>A little head start?</b>
              <p>Turn an idea into a working API.</p>
              <button onClick={() => showModal("templates")}>
                Explore starter templates
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </aside>
        <main className="main">
          <div className="project-toolbar">
            <div>
              <div className="project-title">
                <input
                  aria-label="Project name"
                  value={project.name}
                  onChange={(e) => commit({ ...project, name: e.target.value })}
                />
                <span className="project-label">Django REST</span>
              </div>
              <div className="save-status">
                <CheckCheck size={13} />
                {saveState}
                <span>·</span>
                {project.nodes.length} blocks
              </div>
            </div>
            <div className="toolbar-actions">
              <button
                className="button quiet"
                onClick={save}
                title="Save project"
              >
                <Save size={15} />
                <span>Save</span>
              </button>
              <button
                className="button"
                onClick={exportProject}
                disabled={busy}
              >
                <Download size={15} />
                Export
              </button>
              <button
                className={`button primary ${running ? "running" : ""}`}
                disabled={busy}
                onClick={running ? stop : runProject}
              >
                {busy || run.status === "starting" ? (
                  <LoaderCircle size={15} className="spin" />
                ) : running ? (
                  <Square size={13} />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}
                {run.status === "starting"
                  ? "Cancel build"
                  : running
                    ? "Stop server"
                    : "Run project"}
              </button>
            </div>
          </div>
          <div className="workspace-toolbar">
            <div className="view-tabs">
              {(
                [
                  ["canvas", "Canvas", Workflow],
                  ["code", "Code preview", Code2],
                  ["endpoints", "Endpoints", SignpostIcon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <div className="workspace-tools">
              <span className="draft-badge">
                {report?.valid ? (
                  <>
                    <span className="status-dot" />
                    Ready to build
                  </>
                ) : validationError ? (
                  "Backend offline"
                ) : report ? (
                  "Needs attention"
                ) : (
                  "Checking…"
                )}
              </span>
              <button
                aria-label="Undo"
                disabled={!history.current.length}
                onClick={undo}
              >
                <Undo2 size={16} />
              </button>
              <button
                aria-label="Redo"
                disabled={!future.current.length}
                onClick={redo}
              >
                <Redo2 size={16} />
              </button>
            </div>
          </div>
          <div className="work-area">
            <div className="canvas-column">
              <div className="workspace-content">
                {tab === "canvas" && (
                  <>
                    <div className="canvas-heading">
                      <span className="eyebrow">YOUR IDEAS, CONNECTED</span>
                      <h1>
                        Build something real<span>.</span>
                      </h1>
                      <p>
                        Drag a block. Connect the dots. Bring your API to life.
                      </p>
                    </div>
                    <ReactFlow
                      nodes={project.nodes}
                      edges={project.edges}
                      nodeTypes={nodeTypes}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onNodeClick={(_, n) => setSelected(n.id)}
                      onPaneClick={() => setSelected(null)}
                      onNodeDragStart={() => {
                        history.current.push(project);
                        future.current = [];
                      }}
                      onInit={() =>
                        setTimeout(() => fitView({ padding: 0.14 }), 100)
                      }
                      onMove={(_, v) => setZoom(Math.round(v.zoom * 100))}
                      fitView
                      fitViewOptions={{ padding: 0.14 }}
                      minZoom={0.3}
                      maxZoom={1.7}
                      nodesDraggable={!pan}
                      panOnDrag={pan ? true : [1, 2]}
                      deleteKeyCode={null}
                      defaultEdgeOptions={{
                        type: "smoothstep",
                        style: { stroke: "#a8b5b1", strokeWidth: 1.8 },
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const kind = e.dataTransfer.getData(
                          "application/blocksmith",
                        ) as Kind;
                        if (catalog[kind])
                          createBlock(
                            kind,
                            screenToFlowPosition({
                              x: e.clientX,
                              y: e.clientY,
                            }),
                          );
                      }}
                      onEdgeDoubleClick={(_, e) =>
                        commit({
                          ...project,
                          edges: project.edges.filter((x) => x.id !== e.id),
                        })
                      }
                    >
                      <Background
                        variant={BackgroundVariant.Dots}
                        gap={22}
                        size={1.1}
                        color="#d6ded9"
                      />
                      <MiniMap
                        pannable
                        zoomable
                        nodeColor={(n) =>
                          ({
                            green: "#b5d5c7",
                            blue: "#a8c8ee",
                            violet: "#c9b5ed",
                            orange: "#ebc39e",
                            pink: "#eab2c7",
                            teal: "#9acfc4",
                          })[catalog[(n.data as Block["data"]).kind].color] ||
                          "#ccc"
                        }
                        maskColor="rgba(247,249,247,.65)"
                      />
                    </ReactFlow>
                    <div className="canvas-controls">
                      <button
                        className={!pan ? "chosen" : ""}
                        aria-label="Select and move blocks"
                        onClick={() => setPan(false)}
                      >
                        <MousePointer2 size={16} />
                      </button>
                      <button
                        className={pan ? "chosen" : ""}
                        aria-label="Pan canvas"
                        onClick={() => setPan(true)}
                      >
                        <Hand size={16} />
                      </button>
                      <i />
                      <button aria-label="Zoom out" onClick={() => zoomOut()}>
                        <ZoomOut size={16} />
                      </button>
                      <span>{zoom}%</span>
                      <button aria-label="Zoom in" onClick={() => zoomIn()}>
                        <ZoomIn size={16} />
                      </button>
                      <i />
                      <button
                        aria-label="Fit canvas"
                        onClick={() =>
                          fitView({ padding: 0.15, duration: 300 })
                        }
                      >
                        <Maximize size={16} />
                      </button>
                    </div>
                    <div className="canvas-instruction">
                      Click a block to customize <span>·</span> Drag handles to
                      connect
                    </div>
                  </>
                )}
                {tab === "code" && (
                  <div className="code-view">
                    <div className="code-heading">
                      <div>
                        <h2>Your blocks, in Python.</h2>
                        <p>Real, editable Django source. No lock-in.</p>
                      </div>
                      <button
                        className="button"
                        onClick={() => {
                          if (files[file]) {
                            navigator.clipboard
                              .writeText(files[file])
                              .then(() => notify("Code copied."))
                              .catch(() =>
                                notify(
                                  "Clipboard unavailable. Export the source instead.",
                                ),
                              );
                          }
                        }}
                      >
                        <Copy size={14} />
                        Copy file
                      </button>
                    </div>
                    {codeError ? (
                      <div className="code-error">
                        <AlertCircle />
                        <h3>Let’s complete your application first</h3>
                        <p>{codeError}</p>
                        <button
                          className="button"
                          onClick={() => setTab("canvas")}
                        >
                          Back to canvas
                        </button>
                      </div>
                    ) : (
                      <div className="code-layout">
                        <div className="file-tree">
                          {Object.keys(files).map((f) => (
                            <button
                              className={file === f ? "active" : ""}
                              onClick={() => setFile(f)}
                              key={f}
                            >
                              <FileCode2 size={14} />
                              {f}
                            </button>
                          ))}
                        </div>
                        <div className="code-source">
                          <div>
                            {file}
                            <span>Python / source</span>
                          </div>
                          <pre>{files[file] || "Generating your code…"}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {tab === "endpoints" && (
                  <div className="endpoints-view">
                    <span className="eyebrow">API EXPLORER</span>
                    <h1>A home for every request.</h1>
                    <p>
                      Your routers become real endpoints when you run your
                      project.
                    </p>
                    {project.nodes.filter((n) => n.data.kind === "router")
                      .length === 0 && (
                      <div className="empty-small">
                        Add a URL router block to expose your API.
                      </div>
                    )}
                    {project.nodes
                      .filter((n) => n.data.kind === "router")
                      .map((n) => (
                        <div className="endpoint-card" key={n.id}>
                          <div>
                            <span className="endpoint-icon">
                              <Workflow size={20} />
                            </span>
                            <h3>/api/{n.data.config.name}/</h3>
                            {run.status === "running" && (
                              <a
                                href={`${run.url}/api/${n.data.config.name}/`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open API
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                          {(
                            project.nodes.find((v) =>
                              project.edges.some(
                                (e) => e.source === v.id && e.target === n.id,
                              ),
                            )?.data.config.methods || []
                          ).map((m) => (
                            <div className="endpoint-row" key={m}>
                              <span className={`method ${m}`}>
                                {m.toUpperCase()}
                              </span>
                              <code>
                                /api/{n.data.config.name}/
                                {["put", "patch", "delete"].includes(m)
                                  ? "{id}/"
                                  : ""}
                              </code>
                              <small>
                                {
                                  (
                                    {
                                      get: "List and retrieve",
                                      post: "Create record",
                                      put: "Replace record",
                                      patch: "Update record",
                                      delete: "Delete record",
                                    } as Record<string, string>
                                  )[m]
                                }
                              </small>
                            </div>
                          ))}
                        </div>
                      ))}
                    <div className="tip">
                      Use the browsable API to try requests. The admin panel
                      lets you create and manage records without writing code.
                    </div>
                  </div>
                )}
              </div>
              <div className={`console ${consoleOpen ? "open" : ""}`}>
                <button
                  className="console-bar"
                  onClick={() => setConsoleOpen(!consoleOpen)}
                >
                  <Terminal size={15} />
                  <b>Server console</b>
                  <span className={`server-state ${run.status}`}>
                    <span className="status-dot" />
                    {run.status === "stopped" ? "Not running" : run.status}
                  </span>
                  <span className="console-bar-right">
                    {consoleOpen ? "Collapse" : "Show output"}
                    <ChevronDown size={14} />
                  </span>
                </button>
                {consoleOpen && (
                  <div className="console-body">
                    {run.status === "running" && (
                      <div className="server-links">
                        <a
                          href={run.url + "/api/"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open API
                          <ArrowUpRight size={13} />
                        </a>
                        <a
                          href={run.url + "/admin/"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Django admin
                          <ArrowUpRight size={13} />
                        </a>
                        {project.nodes.some((n) => n.data.kind === "docs") && (
                          <a
                            href={run.url + "/api/docs/"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            API docs
                            <ArrowUpRight size={13} />
                          </a>
                        )}
                        <button onClick={() => setCredentials(!credentials)}>
                          {credentials ? "Hide" : "Show"} admin login
                        </button>
                      </div>
                    )}
                    {run.status === "running" && (
                      <p className="server-hint">
                        Stop and run again to apply block changes. Schema
                        changes create a separate database revision.
                      </p>
                    )}
                    {credentials && run.admin_password && (
                      <div className="credentials">
                        Username: <code>{run.admin_username}</code> · Password:{" "}
                        <code>{run.admin_password}</code>
                      </div>
                    )}
                    <pre>
                      {run.logs.length
                        ? run.logs.join("\n")
                        : "Your next idea starts here. Click Run project to generate, migrate and start your Django server."}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            <aside className="right-panel">
              {current ? (
                <Inspector
                  node={current}
                  nodes={project.nodes}
                  update={(config) =>
                    commit({
                      ...project,
                      nodes: project.nodes.map((n) =>
                        n.id === current.id
                          ? { ...n, data: { ...n.data, config } }
                          : n,
                      ),
                    })
                  }
                  remove={remove}
                  close={() => setSelected(null)}
                />
              ) : (
                <>
                  <div className="guide-header">
                    <span className="guide-icon">
                      <Lightbulb size={20} />
                    </span>
                    <div>
                      <h3>Your project guide</h3>
                      <p>A little help at every step.</p>
                    </div>
                    <span className="live-label">LIVE</span>
                  </div>
                  <div
                    className={`health-card ${errors.length ? "has-errors" : ""}`}
                  >
                    <div>
                      <span className="health-icon">
                        {report?.valid ? (
                          <Check size={21} />
                        ) : (
                          <Blocks size={21} />
                        )}
                      </span>
                      <div>
                        <h3>
                          {report?.valid
                            ? "Looking good!"
                            : validationError
                              ? "Let’s get connected"
                              : report
                                ? "Let’s connect the pieces"
                                : "Checking your blocks…"}
                        </h3>
                        <p>
                          {report?.valid
                            ? "Your application is ready to run."
                            : validationError
                              ? "The builder backend is offline."
                              : `${errors.length} things to finish before running.`}
                        </p>
                      </div>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: report?.valid
                            ? "100%"
                            : `${Math.max(8, 100 - errors.length * 15)}%`,
                        }}
                      />
                    </div>
                    <footer>
                      <span>
                        {report?.valid
                          ? "All essentials connected"
                          : "Project readiness"}
                      </span>
                      <b>
                        {report?.valid
                          ? "100%"
                          : `${Math.max(8, 100 - errors.length * 15)}%`}
                      </b>
                    </footer>
                  </div>
                  <div className="checklist">
                    <div className="section-heading">
                      <h4>THE ESSENTIALS</h4>
                      <span>
                        {
                          [
                            "project",
                            "database",
                            "model",
                            "serializer",
                            "viewset",
                            "router",
                          ].filter((k) =>
                            project.nodes.some((n) => n.data.kind === k),
                          ).length
                        }
                        /6
                      </span>
                    </div>
                    {[
                      [
                        "project",
                        "Project configured",
                        "Your Django starting point",
                      ],
                      [
                        "database",
                        "Database connected",
                        "A place for your data",
                      ],
                      [
                        "model",
                        "Data model defined",
                        "The shape of your records",
                      ],
                      [
                        "serializer",
                        "Serializer connected",
                        "Your data, API-ready",
                      ],
                      [
                        "viewset",
                        "CRUD operations ready",
                        "Read, create, update, delete",
                      ],
                      [
                        "router",
                        "Routes registered",
                        "An address for your API",
                      ],
                    ].map(([k, label, detail]) => {
                      const exists =
                        project.nodes.some((n) => n.data.kind === k) &&
                        !errors.some((i) =>
                          project.nodes.some(
                            (n) => n.id === i.node_id && n.data.kind === k,
                          ),
                        );
                      return (
                        <button
                          className="check-row"
                          key={k}
                          onClick={() => {
                            const n = project.nodes.find(
                              (n) => n.data.kind === k,
                            );
                            if (n) setSelected(n.id);
                            else createBlock(k as Kind);
                          }}
                        >
                          <span
                            className={
                              exists ? "check-circle" : "check-circle missing"
                            }
                          >
                            {exists ? <Check size={12} /> : <Plus size={12} />}
                          </span>
                          <span>
                            <b>{label}</b>
                            <small>{detail}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {validationError && (
                    <div className="issue error">
                      <AlertCircle size={17} />
                      <div>
                        <b>Backend connection</b>
                        <p>{validationError}</p>
                      </div>
                    </div>
                  )}
                  {report?.issues.map((issue, i) => (
                    <div className={`issue ${issue.severity}`} key={i}>
                      <AlertCircle size={17} />
                      <div>
                        <b>{issue.message}</b>
                        <p>{issue.detail}</p>
                        <button onClick={() => fixIssue(issue)}>
                          {issue.fix ? "Add or connect block" : "Review block"}
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="next-step">
                    <div className="section-heading">
                      <h4>MAKE IT YOURS</h4>
                      <span>✦</span>
                    </div>
                    <p>
                      Your API can do more. Add a little extra when you’re
                      ready.
                    </p>
                    <button onClick={() => createBlock("auth")}>
                      <span className="mini-icon violet">
                        <BlockIcon kind="auth" size={15} />
                      </span>
                      <span>
                        <b>Add authentication</b>
                        <small>Give your API a front door</small>
                      </span>
                      <Plus size={15} />
                    </button>
                    <button onClick={() => createBlock("docs")}>
                      <span className="mini-icon teal">
                        <BookOpen size={15} />
                      </span>
                      <span>
                        <b>Make it discoverable</b>
                        <small>Generate interactive API docs</small>
                      </span>
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="guide-bottom">
                    <span>↗</span>
                    <p>
                      You’re building a real Django app.
                      <br />
                      <b>And the code is always yours.</b>
                    </p>
                  </div>
                </>
              )}
            </aside>
          </div>
          <footer className="statusbar">
            <span>
              <span className="status-dot" />{" "}
              {validationError ? "Local draft mode" : "Workspace ready"}
            </span>
            <span>
              {project.nodes.filter((n) => n.data.kind === "model").length}{" "}
              models<span>·</span>
              {
                project.nodes.filter((n) => n.data.kind === "router").length
              }{" "}
              endpoints<span>·</span>
              {errors.length} errors
              {warnings.length > 0 && ` · ${warnings.length} suggestions`}
            </span>
            <span>
              Made of small, good ideas <span className="status-flower">✳</span>
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className={`modal ${modal === "guide" ? "guide-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              onClick={() => setModal(null)}
              aria-label="Close dialog"
            >
              <X size={21} />
            </button>
            <span className="eyebrow">BLOCKSMITH WORKSPACE</span>
            <h1>
              {modal === "templates"
                ? "A spark for your next idea."
                : modal === "projects"
                  ? "Your projects. Your possibilities."
                  : modal === "admin"
                    ? "A little mission control."
                    : "From a block to a working API."}
            </h1>
            <p className="modal-subtitle">
              {modal === "templates"
                ? "Start with a blueprint. Make every block your own."
                : modal === "projects"
                  ? "Everything you’re building, right where you left it."
                  : modal === "admin"
                    ? "Manage your local projects and running Django servers."
                    : "You don’t need to know every detail. We’ll help you connect the pieces."}
            </p>
            {modal === "templates" && (
              <div className="template-grid">
                {templates.map((t, i) => (
                  <button
                    key={t.name}
                    className={`template ${t.style}`}
                    onClick={() => useTemplate(i)}
                  >
                    <div className="template-art">
                      <div />
                      <span>
                        <Blocks size={32} />
                      </span>
                      <div />
                    </div>
                    <span className="eyebrow">{t.tag}</span>
                    <h3>{t.name}</h3>
                    <p>{t.desc}</p>
                    <span className="template-cta">
                      Use template
                      <ArrowRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {modal === "projects" && (
              <>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    onClick={() => switchProject(emptyProject())}
                  >
                    <Plus size={15} />
                    New project
                  </button>
                  <button
                    className="button"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload size={15} />
                    Import JSON
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(project, null, 2)], {
                          type: "application/json",
                        }),
                        `${project.id}.json`,
                      )
                    }
                  >
                    <Download size={15} />
                    Save blueprint
                  </button>
                  <input
                    hidden
                    ref={importRef}
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importProject(f);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="project-list">
                  {savedProjects.map((p) => (
                    <div className="project-list-row" key={p.id}>
                      <button
                        className="project-open"
                        disabled={deletingId !== null}
                        onClick={async () => {
                          try {
                            switchProject(
                              await api<Project>(`/projects/${p.id}`),
                            );
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        <span className="project-list-icon">
                          <Box size={22} />
                        </span>
                        <span>
                          <b>{p.name}</b>
                          <small>
                            Edited {new Date(p.updated).toLocaleString()}
                          </small>
                        </span>
                        <span className="project-list-status">
                          {p.status === "running" ? "Running" : "Draft"}
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                      <button
                        className="project-delete"
                        aria-label={`Delete ${p.name}`}
                        title={`Delete ${p.name}`}
                        disabled={deletingId !== null || busy}
                        onClick={() => deleteProject(p)}
                      >
                        {deletingId === p.id ? (
                          <LoaderCircle size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        {deletingId === p.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  ))}
                  {!savedProjects.length && (
                    <div className="empty-small">
                      Your saved projects will appear here. Use Save to keep
                      your first project.
                    </div>
                  )}
                </div>
              </>
            )}
            {modal === "admin" && (
              <>
                <div className="admin-stats">
                  <div>
                    <FolderOpen />
                    <b>{savedProjects.length}</b>
                    <span>Saved projects</span>
                  </div>
                  <div>
                    <Play />
                    <b>
                      {
                        savedProjects.filter((p) => p.status === "running")
                          .length
                      }
                    </b>
                    <span>Running servers</span>
                  </div>
                  <div>
                    <DatabaseIcon />
                    <b>Local</b>
                    <span>Private workspace</span>
                  </div>
                </div>
                <div className="project-list">
                  {savedProjects.map((p) => (
                    <div className="admin-project" key={p.id}>
                      <Box size={19} />
                      <b>{p.name}</b>
                      <span className={`server-state ${p.status}`}>
                        {p.status}
                      </span>
                      <button
                        className="button"
                        onClick={async () => {
                          try {
                            switchProject(
                              await api<Project>(`/projects/${p.id}`),
                            );
                            setConsoleOpen(true);
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        Open builder
                        <ArrowRight size={14} />
                      </button>
                      {["running", "starting"].includes(p.status) && (
                        <button
                          className="button"
                          onClick={async () => {
                            await api(`/projects/${p.id}/stop`, {});
                            setSavedProjects(await api("/projects"));
                          }}
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="tip">
                  Each generated application has its own Django admin at{" "}
                  <code>/admin/</code>. Open a project and run it to see the
                  admin link and local login credentials.
                </div>
              </>
            )}
            {modal === "guide" && (
              <>
                <div className="guide-steps">
                  {[
                    [
                      "01",
                      "Lay the foundation",
                      "Connect Django project → Database → Django app. SQLite works immediately, with no extra setup.",
                    ],
                    [
                      "02",
                      "Give your data a shape",
                      "Add a Model, then click it to define fields, types, required values and relationships.",
                    ],
                    [
                      "03",
                      "Build your API",
                      "Connect Model → Serializer → CRUD viewset → URL router. Add Admin panel to your model for visual data management.",
                    ],
                    [
                      "04",
                      "Make it real",
                      "Check the live guide, then press Run project. We generate Python, migrate the database and start your server.",
                    ],
                  ].map(([n, h, p]) => (
                    <div key={n}>
                      <span>{n}</span>
                      <section>
                        <h3>{h}</h3>
                        <p>{p}</p>
                      </section>
                    </div>
                  ))}
                </div>
                <div className="tip">
                  Click a library block to add it and connect it to a matching
                  block, or drag it onto the canvas. Drag from a bottom
                  connector to a top connector to wire blocks manually.
                  Double-click a connection to remove it. Use Undo to restore
                  edits.
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal(null)}
                >
                  Let’s build
                  <ArrowRight size={15} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function SignpostIcon({ size = 16 }: { size?: number }) {
  return <ArrowUpRight size={size} />;
}
function DatabaseIcon() {
  return <LayersIcon />;
}
function LayersIcon() {
  return <Settings2 size={24} />;
}
