import { useEffect, useState } from "react";
import { useServiceStore } from "../store/useServiceStore";
import { useQuickLaunch } from "../store/useQuickLaunch";

function getNextSundays(count: number): string[] {
  const sundays: string[] = [];
  const d = new Date();
  const daysUntil = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  for (let i = 0; i < count; i++) {
    sundays.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 7);
  }
  return sundays;
}

function getDaysAway(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(dateStr: string): { month: string; day: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: String(d.getDate()),
  };
}

const STATUS_CONFIG = {
  empty: {
    label: "Not started",
    color: "var(--text-muted)",
    bg: "var(--surface-3)",
    border: "var(--border-subtle)",
  },
  "in-progress": {
    label: "In prep",
    color: "var(--accent-amber)",
    bg: "var(--accent-amber-dim)",
    border: "var(--accent-amber)",
  },
  ready: {
    label: "Ready",
    color: "var(--accent-green)",
    bg: "var(--accent-green-dim)",
    border: "var(--accent-green)",
  },
};

interface Props {
  onOpenBuilder: (serviceId: number) => void;
  onGoLive: () => void;
}

export default function PlannerScreen({ onOpenBuilder, onGoLive }: Props) {
  const {
    services,
    selectedService,
    loadServices,
    selectService,
    createService,
    updateStatus,
    deleteService,
  } = useServiceStore();
  const [showNewModal, setShowNewModal] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const { todayResult, loading: qlLoading, launch } = useQuickLaunch();

  useEffect(() => {
    loadServices();
  }, []);

  const handleInitSundays = async () => {
    setInitializing(true);
    const sundays = getNextSundays(6);
    for (const date of sundays) {
      const exists = services.find((s) => s.date === date);
      if (!exists) await createService(date, "Regular Sunday");
    }
    setInitializing(false);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Quick launch banner ──────────────────────────────────────────── */}
      {!qlLoading && todayResult && (
        <div
          style={{
            flexShrink: 0,
            background:
              todayResult.daysAway === 0
                ? "var(--accent-green-dim)"
                : "var(--accent-blue-dim)",
            borderBottom: `1px solid ${todayResult.daysAway === 0 ? "var(--accent-green)" : "var(--accent-blue)"}`,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Pulse dot */}
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              flexShrink: 0,
              background:
                todayResult.daysAway === 0
                  ? "var(--accent-green)"
                  : "var(--accent-blue)",
              animation: "pulse 2s infinite",
            }}
          />

          {/* Message */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color:
                  todayResult.daysAway === 0
                    ? "var(--accent-green)"
                    : "var(--accent-blue)",
              }}
            >
              {todayResult.daysAway === 0
                ? `Today's service — ${todayResult.service.label}`
                : `${todayResult.service.label} is in ${todayResult.daysAway} day${todayResult.daysAway > 1 ? "s" : ""}`}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}
            >
              {todayResult.service.date} ·{" "}
              {todayResult.service.status === "ready"
                ? "Lineup ready"
                : todayResult.service.status === "in-progress"
                  ? "Lineup in progress"
                  : "No lineup yet"}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              className="btn"
              style={{ fontSize: 12 }}
              onClick={() =>
                launch(todayResult.service, (serviceId) =>
                  onOpenBuilder(serviceId),
                )
              }
            >
              Open in builder
            </button>

            {todayResult.daysAway === 0 ? (
              <button
                className="btn btn-success"
                style={{ fontSize: 12, fontWeight: 600 }}
                onClick={async () => {
                  await launch(todayResult.service, () => {});
                  onGoLive();
                }}
              >
                ▶ Go live now
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, fontWeight: 600 }}
                onClick={() =>
                  launch(todayResult.service, (serviceId) =>
                    onOpenBuilder(serviceId),
                  )
                }
              >
                Prepare lineup →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main content: left + right columns ──────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: service list */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border-subtle)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
              onClick={() => setShowNewModal(true)}
            >
              + New service date
            </button>
          </div>

          {services.length === 0 && (
            <div
              style={{
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                No service dates yet. Add upcoming Sundays to get started.
              </div>
              <button
                className="btn btn-success"
                style={{ fontSize: 11 }}
                onClick={handleInitSundays}
                disabled={initializing}
              >
                {initializing ? "Creating..." : "Add next 6 Sundays"}
              </button>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            {services.map((service) => {
              const daysAway = getDaysAway(service.date);
              const { month, day } = formatShortDate(service.date);
              const status = STATUS_CONFIG[service.status];
              const isSelected = selectedService?.id === service.id;

              return (
                <div
                  key={service.id}
                  onClick={() => selectService(service)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 8,
                    marginBottom: 5,
                    cursor: "pointer",
                    border: `1px solid ${isSelected ? "rgba(77,142,240,0.3)" : "var(--border-subtle)"}`,
                    background: isSelected
                      ? "var(--accent-blue-dim)"
                      : "var(--surface-1)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      minWidth: 36,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: isSelected
                          ? "var(--accent-blue)"
                          : "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {month}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: isSelected
                          ? "var(--accent-blue)"
                          : "var(--text-primary)",
                        lineHeight: 1,
                      }}
                    >
                      {day}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isSelected
                          ? "var(--accent-blue)"
                          : "var(--text-primary)",
                        marginBottom: 3,
                      }}
                    >
                      {service.label}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: isSelected
                          ? "var(--accent-blue)"
                          : "var(--text-muted)",
                      }}
                    >
                      {daysAway === 0
                        ? "Today"
                        : daysAway === 1
                          ? "Tomorrow"
                          : `${daysAway} days away`}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 9,
                      padding: "2px 7px",
                      borderRadius: 20,
                      fontWeight: 600,
                      background: status.bg,
                      color: status.color,
                      border: `1px solid ${status.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {status.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: service detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {selectedService ? (
            <ServiceDetail
              service={selectedService}
              onOpenBuilder={() => onOpenBuilder(selectedService.id)}
              onStatusChange={updateStatus}
              onDelete={deleteService}
            />
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              Select a service date to see details
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewServiceModal
          onClose={() => setShowNewModal(false)}
          onSaved={async (date, label) => {
            const service = await createService(date, label);
            await selectService(service);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}

function ServiceDetail({
  service,
  onOpenBuilder,
  onStatusChange,
  onDelete,
}: {
  service: {
    id: number;
    date: string;
    label: string;
    status: "empty" | "in-progress" | "ready";
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  onOpenBuilder: () => void;
  onStatusChange: (
    id: number,
    status: "empty" | "in-progress" | "ready",
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const { lineup } = useServiceStore();
  const daysAway = getDaysAway(service.date);

  const readiness = [
    { label: "Songs added to lineup", done: lineup.length > 0 },
    { label: "At least 3 songs", done: lineup.length >= 3 },
    {
      label: "All songs have sections",
      done: lineup.every(
        (item) => JSON.parse(item.selectedSections || "[]").length > 0,
      ),
    },
    { label: "Lineup marked ready", done: service.status === "ready" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 680,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            {formatDate(service.date)}
          </div>
          <div
            style={{
              fontSize: 12,
              color:
                daysAway <= 3
                  ? "var(--accent-amber)"
                  : daysAway <= 7
                    ? "var(--accent-blue)"
                    : "var(--text-muted)",
            }}
          >
            {daysAway === 0
              ? "Today"
              : daysAway === 1
                ? "Tomorrow"
                : `${daysAway} days away`}
            {daysAway <= 7 && daysAway > 0 && " — prep window open"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            className="btn"
            style={{ fontSize: 11 }}
            onClick={() => {
              if (confirm("Delete this service date?")) onDelete(service.id);
            }}
          >
            Delete
          </button>
          <button
            className="btn btn-success"
            style={{ fontSize: 11, fontWeight: 600 }}
            onClick={onOpenBuilder}
          >
            Open in builder →
          </button>
        </div>
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 10 }}>
          Service status
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["empty", "in-progress", "ready"] as const).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const isActive = service.status === s;
            return (
              <button
                key={s}
                onClick={() => onStatusChange(service.id, s)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  border: `1px solid ${isActive ? cfg.border : "var(--border-subtle)"}`,
                  background: isActive ? cfg.bg : "var(--surface-2)",
                  color: isActive ? cfg.color : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  transition: "all 0.1s",
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div className="label">Songs in lineup ({lineup.length})</div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 11 }}
            onClick={onOpenBuilder}
          >
            Edit lineup →
          </button>
        </div>
        {lineup.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "8px 0",
            }}
          >
            No songs added yet — open the builder to add songs
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lineup.map((item, i) => {
              const selectedIds: number[] = JSON.parse(
                item.selectedSections || "[]",
              );
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 7,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      flexShrink: 0,
                      background: ["#1a1a4e", "#1e3a1a", "#3d1010", "#2a1a00"][
                        i % 4
                      ],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {item.song.title}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 1,
                      }}
                    >
                      {item.song.artist}
                      {item.song.key && ` · Key of ${item.song.key}`}
                      {` · ${selectedIds.length} sections`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 10 }}>
          Readiness checklist
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {readiness.map((item) => (
            <div
              key={item.label}
              style={{ display: "flex", alignItems: "center", gap: 9 }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  flexShrink: 0,
                  background: item.done
                    ? "var(--accent-green-dim)"
                    : "var(--surface-3)",
                  border: `1px solid ${item.done ? "var(--accent-green)" : "var(--border-default)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "var(--accent-green)",
                }}
              >
                {item.done ? "✓" : ""}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: item.done
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewServiceModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (date: string, label: string) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("Regular Sunday");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!date) return;
    setSaving(true);
    await onSaved(date, label);
    setSaving(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: 14,
          width: 380,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>New service date</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="label">Date *</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="label">Label</label>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Easter Sunday, Regular Sunday"
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !date}
          >
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
