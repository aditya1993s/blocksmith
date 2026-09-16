import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Box,
  Database,
  Layers,
  Table2,
  Braces,
  Workflow,
  Signpost,
  ShieldCheck,
  KeyRound,
  ListFilter,
  Search,
  BookOpen,
  Check,
  GripVertical,
} from "lucide-react";
import { catalog, type Block, type Kind } from "./model";
export const icons = {
  project: Box,
  database: Database,
  app: Layers,
  model: Table2,
  serializer: Braces,
  viewset: Workflow,
  router: Signpost,
  admin: ShieldCheck,
  auth: KeyRound,
  pagination: ListFilter,
  filter: Search,
  docs: BookOpen,
};
export function BlockIcon({ kind, size = 17 }: { kind: Kind; size?: number }) {
  const Icon = icons[kind];
  return <Icon size={size} />;
}
export default function BlockNode({ data, selected }: NodeProps<Block>) {
  const { kind, config } = data;
  const meta = catalog[kind];
  return (
    <div className={`block-node ${meta.color} ${selected ? "selected" : ""}`}>
      {kind !== "project" && <Handle type="target" position={Position.Top} />}
      <div className="block-top">
        <span className="block-icon">
          <BlockIcon kind={kind} />
        </span>
        <span>{meta.title}</span>
        <GripVertical size={15} className="grip" />
      </div>
      <div className="block-body">
        <div className="block-name">
          {kind === "model"
            ? config.name
            : kind === "serializer"
              ? "Model serializer"
              : kind === "viewset"
                ? "CRUD operations"
                : kind === "router"
                  ? `/api/${config.name}/`
                  : kind === "admin"
                    ? "Django administration"
                    : config.name}
        </div>
        {kind === "project" && (
          <p>
            Django + REST Framework <span className="tiny-dot" />
          </p>
        )}
        {kind === "database" && (
          <p>
            <span className="status-dot" /> Local database{" "}
            <span className="tag">No setup</span>
          </p>
        )}
        {kind === "app" && <p>Your application module</p>}
        {kind === "model" && (
          <div className="node-fields">
            <div>
              <span className="field-mark">#</span>
              <b>id</b>
              <small>AutoField</small>
              <span className="auto-tag">auto</span>
            </div>
            {config.fields?.slice(0, 5).map((f, i) => (
              <div key={i}>
                <span className="field-mark">
                  {f.type.includes("Char")
                    ? "T"
                    : f.type.includes("Boolean")
                      ? "◉"
                      : "#"}
                </span>
                <b>{f.name || "untitled"}</b>
                <small>{f.type.replace("Field", "")}</small>
                <span className="field-required">{f.required ? "*" : ""}</span>
              </div>
            ))}
            {(config.fields?.length || 0) > 5 && (
              <p>+ {(config.fields?.length || 0) - 5} more fields</p>
            )}
            <footer>
              {config.timestamps
                ? "◷  Created & updated timestamps"
                : "Automatic primary key"}
            </footer>
          </div>
        )}
        {kind === "serializer" && (
          <>
            <p>Model → JSON, beautifully simple</p>
            <div className="node-chip">
              fields <code>"__all__"</code>
            </div>
          </>
        )}
        {kind === "viewset" && (
          <>
            <p>Everything your resource needs</p>
            <div className="method-chips">
              {config.methods?.map((m) => (
                <span key={m} className={m}>
                  {m.toUpperCase()}
                </span>
              ))}
            </div>
          </>
        )}
        {kind === "router" && (
          <p>
            <span className="status-dot" /> REST endpoint
          </p>
        )}
        {kind === "admin" && (
          <p>
            <Check size={13} /> Model management enabled
          </p>
        )}
        {kind === "auth" && <p>{config.permission}</p>}
        {kind === "pagination" && <p>{config.page_size} results per page</p>}
        {kind === "filter" && <p>Search · Filter · Order</p>}
        {kind === "docs" && <p>Interactive API documentation</p>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
