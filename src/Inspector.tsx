import { Plus, Trash2, X, ArrowRight } from "lucide-react";
import {
  catalog,
  fieldTypes,
  type Block,
  type Config,
  type ModelField,
} from "./model";
import { BlockIcon } from "./BlockNode";
export default function Inspector({
  node,
  nodes,
  update,
  remove,
  close,
}: {
  node: Block;
  nodes: Block[];
  update: (config: Config) => void;
  remove: () => void;
  close: () => void;
}) {
  const { kind, config } = node.data;
  const meta = catalog[kind];
  const set = (p: Partial<Config>) => update({ ...config, ...p });
  const changeField = (index: number, p: Partial<ModelField>) =>
    set({
      fields: config.fields?.map((f, i) => (i === index ? { ...f, ...p } : f)),
    });
  return (
    <div className="inspector">
      <div className="side-title">
        <h3>Block settings</h3>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close settings"
        >
          <X size={17} />
        </button>
      </div>
      <div className={`inspector-heading ${meta.color}`}>
        <span className="block-icon">
          <BlockIcon kind={kind} size={21} />
        </span>
        <div>
          <h3>{meta.title}</h3>
          <p>{meta.desc}</p>
        </div>
      </div>
      <label>
        {kind === "router" ? "Endpoint path" : "Name"}
        <input
          aria-label="Block name"
          value={config.name}
          onChange={(e) => set({ name: e.target.value })}
          readOnly={!["project", "app", "model", "router"].includes(kind)}
        />
      </label>
      {kind === "model" && (
        <>
          <div className="section-heading">
            <h4>Model fields</h4>
            <span>{config.fields?.length || 0}</span>
          </div>
          <p className="hint">
            The ID is added automatically. Add the information each record
            should hold.
          </p>
          <div className="field-editors">
            {config.fields?.map((f, i) => (
              <div className="field-editor" key={i}>
                <div className="field-edit-top">
                  <input
                    aria-label={`Field ${i + 1} name`}
                    placeholder="field_name"
                    value={f.name}
                    onChange={(e) => changeField(i, { name: e.target.value })}
                  />
                  <button
                    aria-label={`Delete field ${i + 1}`}
                    className="icon-button danger"
                    onClick={() =>
                      set({ fields: config.fields?.filter((_, j) => i !== j) })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <select
                  aria-label={`Field ${i + 1} type`}
                  value={f.type}
                  onChange={(e) => changeField(i, { type: e.target.value })}
                >
                  {fieldTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {["ForeignKey", "OneToOneField", "ManyToManyField"].includes(
                  f.type,
                ) && (
                  <select
                    aria-label={`Field ${i + 1} related model`}
                    value={f.target || ""}
                    onChange={(e) => changeField(i, { target: e.target.value })}
                  >
                    <option value="">Choose related model…</option>
                    {nodes
                      .filter((n) => n.data.kind === "model")
                      .map((n) => (
                        <option key={n.id}>{n.data.config.name}</option>
                      ))}
                  </select>
                )}
                {["CharField", "EmailField", "URLField"].includes(f.type) && (
                  <label className="inline-label">
                    Max length
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      aria-label={`Field ${i + 1} max length`}
                      value={f.max_length || 255}
                      onChange={(e) =>
                        changeField(i, { max_length: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
                <div className="checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) =>
                        changeField(i, { required: e.target.checked })
                      }
                    />
                    Required
                  </label>
                  {f.type !== "ManyToManyField" && (
                    <label>
                      <input
                        type="checkbox"
                        checked={f.unique || false}
                        onChange={(e) =>
                          changeField(i, { unique: e.target.checked })
                        }
                      />
                      Unique
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            className="button full dashed"
            onClick={() =>
              set({
                fields: [
                  ...(config.fields || []),
                  {
                    name: `field_${(config.fields?.length || 0) + 1}`,
                    type: "CharField",
                    required: true,
                    max_length: 255,
                  },
                ],
              })
            }
          >
            <Plus size={15} />
            Add field
          </button>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.timestamps ?? true}
              onChange={(e) => set({ timestamps: e.target.checked })}
            />{" "}
            Created & updated timestamps
          </label>
        </>
      )}
      {(kind === "viewset" || kind === "auth") && (
        <>
          <label>
            Access permissions
            <select
              value={config.permission || "AllowAny"}
              onChange={(e) => set({ permission: e.target.value })}
            >
              <option value="AllowAny">Anyone (local development)</option>
              <option value="IsAuthenticated">Signed-in users only</option>
              <option value="IsAuthenticatedOrReadOnly">
                Public read, signed-in write
              </option>
              <option value="IsAdminUser">Administrators only</option>
            </select>
          </label>
          <p className="hint">
            An Authentication block sets permissions across all viewsets. Sign
            in through the generated admin or use Basic authentication.
          </p>
        </>
      )}
      {kind === "viewset" && (
        <>
          <h4>CRUD operations</h4>
          {[
            ["get", "Read records"],
            ["post", "Create records"],
            ["put", "Replace records"],
            ["patch", "Update records"],
            ["delete", "Delete records"],
          ].map(([m, label]) => (
            <label className="method-option" key={m}>
              <input
                type="checkbox"
                checked={config.methods?.includes(m) || false}
                onChange={(e) =>
                  set({
                    methods: e.target.checked
                      ? [...(config.methods || []), m]
                      : config.methods?.filter((x) => x !== m),
                  })
                }
              />
              <code>{m.toUpperCase()}</code>
              {label}
            </label>
          ))}
        </>
      )}
      {kind === "pagination" && (
        <label>
          Records per page
          <input
            type="number"
            min="1"
            max="200"
            value={config.page_size || 20}
            onChange={(e) => set({ page_size: Number(e.target.value) })}
          />
        </label>
      )}
      {kind === "database" && (
        <div className="tip">
          SQLite is ready out of the box. Each schema revision keeps its own
          database. Export the project to configure another database.
        </div>
      )}
      {kind === "serializer" && (
        <div className="tip">
          Includes every model field. Django validates required fields, types
          and unique values automatically.
        </div>
      )}
      {kind === "filter" && (
        <div className="tip">
          Use <code>?search=hello</code>, <code>?ordering=name</code> or{" "}
          <code>?name=hello</code> on the connected API endpoint.
        </div>
      )}
      {kind === "admin" && (
        <div className="tip">
          Run your project to open Django admin. Your local administrator
          credentials appear in the server panel.
        </div>
      )}
      {kind === "router" && (
        <div className="tip">
          Collection <code>/api/{config.name}/</code>
          <br />
          Record <code>/api/{config.name}/1/</code>
          <ArrowRight size={16} />
        </div>
      )}
      <button className="button delete-block" onClick={remove}>
        <Trash2 size={15} />
        Remove block
      </button>
    </div>
  );
}
