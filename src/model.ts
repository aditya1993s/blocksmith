import type { Node, Edge } from "@xyflow/react";
export type Kind =
  | "project"
  | "database"
  | "app"
  | "model"
  | "serializer"
  | "viewset"
  | "router"
  | "admin"
  | "auth"
  | "pagination"
  | "filter"
  | "docs";
export type ModelField = {
  name: string;
  type: string;
  required: boolean;
  unique?: boolean;
  max_length?: number;
  target?: string;
};
export type Config = {
  name: string;
  fields?: ModelField[];
  permission?: string;
  methods?: string[];
  page_size?: number;
  timestamps?: boolean;
};
export type BlockData = { kind: Kind; label: string; config: Config };
export type Block = Node<BlockData, "block">;
export type Project = {
  id: string;
  name: string;
  nodes: Block[];
  edges: Edge[];
};
export type Issue = {
  message: string;
  detail: string;
  node_id?: string;
  severity: "error" | "warning";
  fix?: { kind: Kind; source?: string; target?: string };
};
export type Report = { valid: boolean; issues: Issue[]; block_count: number };
export type Run = {
  status: string;
  logs: string[];
  url?: string;
  revision?: string;
  admin_username?: string;
  admin_password?: string;
};
export const catalog: Record<
  Kind,
  { title: string; desc: string; color: string; group: string }
> = {
  project: {
    title: "Django project",
    desc: "The beginning of something great",
    color: "green",
    group: "Foundation",
  },
  database: {
    title: "Database",
    desc: "Give your data a place to live",
    color: "green",
    group: "Foundation",
  },
  app: {
    title: "Django app",
    desc: "Organize your application",
    color: "green",
    group: "Foundation",
  },
  model: {
    title: "Model",
    desc: "Define your data and its fields",
    color: "blue",
    group: "Data & models",
  },
  serializer: {
    title: "Serializer",
    desc: "Turn your models into JSON",
    color: "violet",
    group: "API & logic",
  },
  viewset: {
    title: "CRUD viewset",
    desc: "Create, read, update and delete",
    color: "orange",
    group: "API & logic",
  },
  router: {
    title: "URL router",
    desc: "Give your API an endpoint",
    color: "pink",
    group: "API & logic",
  },
  admin: {
    title: "Admin panel",
    desc: "Manage your data visually",
    color: "teal",
    group: "Extensions",
  },
  auth: {
    title: "Authentication",
    desc: "Choose who can use your API",
    color: "violet",
    group: "Extensions",
  },
  pagination: {
    title: "Pagination",
    desc: "Serve results a page at a time",
    color: "orange",
    group: "Extensions",
  },
  filter: {
    title: "Search & filtering",
    desc: "Find exactly what you need",
    color: "blue",
    group: "Extensions",
  },
  docs: {
    title: "API documentation",
    desc: "Interactive OpenAPI explorer",
    color: "teal",
    group: "Extensions",
  },
};
export const depends: Partial<Record<Kind, Kind>> = {
  database: "project",
  app: "database",
  model: "app",
  serializer: "model",
  viewset: "serializer",
  router: "viewset",
  admin: "model",
  auth: "project",
  pagination: "project",
  filter: "viewset",
  docs: "project",
};
export const fieldTypes = [
  "CharField",
  "TextField",
  "IntegerField",
  "FloatField",
  "DecimalField",
  "BooleanField",
  "DateField",
  "DateTimeField",
  "EmailField",
  "URLField",
  "JSONField",
  "FileField",
  "ForeignKey",
  "OneToOneField",
  "ManyToManyField",
];
export function block(
  kind: Kind,
  id: string,
  x: number,
  y: number,
  config: Partial<Config> = {},
): Block {
  const defaults: Record<Kind, Config> = {
    project: { name: "my_project" },
    database: { name: "SQLite" },
    app: { name: "catalog" },
    model: {
      name: "Product",
      fields: [
        { name: "name", type: "CharField", required: true, max_length: 255 },
      ],
      timestamps: true,
    },
    serializer: { name: "ModelSerializer" },
    viewset: {
      name: "ModelViewSet",
      permission: "AllowAny",
      methods: ["get", "post", "put", "patch", "delete"],
    },
    router: { name: "products" },
    admin: { name: "ModelAdmin" },
    auth: { name: "Session & Basic", permission: "IsAuthenticatedOrReadOnly" },
    pagination: { name: "Page number", page_size: 20 },
    filter: { name: "Search & filter" },
    docs: { name: "OpenAPI / Swagger" },
  };
  return {
    id,
    type: "block",
    position: { x, y },
    data: {
      kind,
      label: catalog[kind].title,
      config: { ...defaults[kind], ...config },
    },
  };
}
export function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target, type: "smoothstep" };
}
export function starter(): Project {
  return {
    id: crypto.randomUUID(),
    name: "Product catalog",
    nodes: [
      block("project", "project", 0, 0, { name: "product_catalog" }),
      block("database", "database", 0, 165),
      block("app", "app", 0, 330),
      block("model", "model", 315, 20, {
        fields: [
          { name: "name", type: "CharField", required: true, max_length: 255 },
          { name: "description", type: "TextField", required: false },
          { name: "price", type: "DecimalField", required: true },
          { name: "in_stock", type: "BooleanField", required: true },
        ],
      }),
      block("serializer", "serializer", 630, 0),
      block("viewset", "viewset", 630, 175),
      block("router", "router", 630, 355),
      block("admin", "admin", 315, 370),
    ],
    edges: [
      edge("project", "database"),
      edge("database", "app"),
      edge("app", "model"),
      edge("model", "serializer"),
      edge("serializer", "viewset"),
      edge("viewset", "router"),
      edge("model", "admin"),
    ],
  };
}
export function emptyProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: "Untitled project",
    nodes: [block("project", "project", 150, 120)],
    edges: [],
  };
}
export function loadDraft(): Project {
  try {
    const raw = localStorage.getItem("blocksmith-draft");
    if (raw) {
      const p = JSON.parse(raw);
      if (
        p.id &&
        Array.isArray(p.nodes) &&
        Array.isArray(p.edges) &&
        p.nodes.every((n: Block) => catalog[n.data?.kind])
      )
        return p;
    }
  } catch {}
  return starter();
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      "/api" + path,
      body === undefined
        ? undefined
        : {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new Error(
      "Cannot reach the backend. Start FastAPI to validate and run your app.",
    );
  }
  if (!response.ok) {
    let d;
    try {
      d = await response.json();
    } catch {}
    throw new Error(
      typeof d?.detail === "string"
        ? d.detail
        : d?.detail?.issues?.map((i: Issue) => i.message).join("; ") ||
            (Array.isArray(d?.detail)
              ? d.detail
                  .map(
                    (e: { loc: string[]; msg: string }) =>
                      `${e.loc.slice(1).join(".")}: ${e.msg}`,
                  )
                  .join("; ")
              : "Request failed. Check your blocks and the backend connection."),
    );
  }
  return response.json();
}
