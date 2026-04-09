import { useEffect, useState } from "react";

interface SongWithUsage {
  id: number;
  title: string;
  artist: string;
  key: string | null;
  usageCount: number;
  lastUsedDate: string | null;
  lastUsedLabel: string | null;
}

interface ServiceDate {
  id: number;
  date: string;
  label: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function weeksAgo(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  return Math.floor(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 7),
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AnalyticsScreen() {
  const [songUsage, setSongUsage] = useState<SongWithUsage[]>([]);
  const [serviceHistory, setServiceHistory] = useState<ServiceDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"usage" | "recent" | "alpha" | "never">(
    "usage",
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [usage, history] = await Promise.all([
      window.worshipsync.analytics.getSongUsage() as Promise<SongWithUsage[]>,
      window.worshipsync.analytics.getServiceHistory() as Promise<
        ServiceDate[]
      >,
    ]);
    setSongUsage(usage);
    setServiceHistory(history);
    setLoading(false);
  };

  const sorted = [...songUsage].sort((a, b) => {
    if (sortBy === "usage") return b.usageCount - a.usageCount;
    if (sortBy === "alpha") return a.title.localeCompare(b.title);
    if (sortBy === "never") {
      if (!a.lastUsedDate && !b.lastUsedDate) return 0;
      if (!a.lastUsedDate) return -1;
      if (!b.lastUsedDate) return 1;
      return a.lastUsedDate.localeCompare(b.lastUsedDate);
    }
    // recent
    if (!a.lastUsedDate && !b.lastUsedDate) return 0;
    if (!a.lastUsedDate) return 1;
    if (!b.lastUsedDate) return -1;
    return b.lastUsedDate.localeCompare(a.lastUsedDate);
  });

  const maxUsage = Math.max(...songUsage.map((s) => s.usageCount), 1);
  const totalServices = serviceHistory.length;
  const totalUnique = songUsage.filter((s) => s.usageCount > 0).length;
  const neverUsed = songUsage.filter((s) => s.usageCount === 0).length;
  const overdueCount = songUsage.filter(
    (s) => s.lastUsedDate && weeksAgo(s.lastUsedDate) >= 8,
  ).length;

  const getRotationStatus = (
    song: SongWithUsage,
  ): { label: string; color: string } => {
    if (song.usageCount === 0)
      return { label: "Never used", color: "var(--text-muted)" };
    if (!song.lastUsedDate)
      return { label: "Unknown", color: "var(--text-muted)" };
    const weeks = weeksAgo(song.lastUsedDate);
    if (weeks <= 2)
      return { label: `${weeks}w ago`, color: "var(--accent-green)" };
    if (weeks <= 6)
      return { label: `${weeks}w ago`, color: "var(--accent-blue)" };
    if (weeks <= 10)
      return { label: `${weeks}w ago`, color: "var(--accent-amber)" };
    return { label: `${weeks}w ago`, color: "var(--accent-red)" };
  };

  if (loading) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Loading analytics...
        </span>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 16 }}>
      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {[
          { label: "Total services", value: totalServices, sub: "logged" },
          {
            label: "Songs used",
            value: totalUnique,
            sub: `of ${songUsage.length} in library`,
          },
          {
            label: "Overdue rotation",
            value: overdueCount,
            sub: "not used in 8+ wks",
          },
          { label: "Never used", value: neverUsed, sub: "songs in library" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--surface-2)",
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 5,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {stat.value}
            </div>
            <div
              style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}
            >
              {stat.sub}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}
      >
        {/* Song usage table */}
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div className="label" style={{ flex: 1 }}>
              Song usage
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {(["usage", "recent", "alpha", "never"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 5,
                    cursor: "pointer",
                    border: `1px solid ${sortBy === s ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                    background:
                      sortBy === s
                        ? "var(--accent-blue-dim)"
                        : "var(--surface-2)",
                    color:
                      sortBy === s ? "var(--accent-blue)" : "var(--text-muted)",
                    fontWeight: sortBy === s ? 600 : 400,
                  }}
                >
                  {s === "usage"
                    ? "Most used"
                    : s === "recent"
                      ? "Recent"
                      : s === "alpha"
                        ? "A–Z"
                        : "Overdue"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {sorted.map((song) => {
              const status = getRotationStatus(song);
              const barWidth =
                maxUsage > 0 ? (song.usageCount / maxUsage) * 100 : 0;
              return (
                <div
                  key={song.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    borderRadius: 7,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {song.title}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        height: 4,
                        background: "var(--surface-3)",
                        borderRadius: 2,
                      }}
                    >
                      <div
                        style={{
                          height: 4,
                          borderRadius: 2,
                          width: `${barWidth}%`,
                          background:
                            song.usageCount === 0
                              ? "var(--border-default)"
                              : "var(--accent-blue)",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {song.usageCount}×
                    </div>
                    <div
                      style={{ fontSize: 9, color: status.color, marginTop: 1 }}
                    >
                      {status.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Rotation health */}
          <div className="card">
            <div className="label" style={{ marginBottom: 10 }}>
              Rotation health
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {songUsage
                .filter((s) => s.usageCount > 0)
                .sort((a, b) => {
                  if (!a.lastUsedDate) return 1;
                  if (!b.lastUsedDate) return -1;
                  return a.lastUsedDate.localeCompare(b.lastUsedDate);
                })
                .slice(0, 6)
                .map((song) => {
                  const weeks = song.lastUsedDate
                    ? weeksAgo(song.lastUsedDate)
                    : 99;
                  const isOverdue = weeks >= 8;
                  const isOverused = song.usageCount >= 4 && weeks <= 3;
                  return (
                    <div
                      key={song.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: "var(--surface-2)",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: isOverused
                            ? "var(--accent-red)"
                            : isOverdue
                              ? "var(--accent-amber)"
                              : "var(--accent-green)",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {song.title}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: "var(--text-muted)",
                            marginTop: 1,
                          }}
                        >
                          {isOverused
                            ? "Consider a break"
                            : isOverdue
                              ? `${weeks} weeks since last use`
                              : "Good rotation"}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Service history */}
          <div className="card">
            <div className="label" style={{ marginBottom: 10 }}>
              Service history
            </div>
            {serviceHistory.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                No services logged yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {serviceHistory.slice(0, 8).map((service) => (
                  <div
                    key={service.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "var(--surface-2)",
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background:
                          service.status === "ready"
                            ? "var(--accent-green)"
                            : service.status === "in-progress"
                              ? "var(--accent-amber)"
                              : "var(--border-default)",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>
                        {service.label}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--text-muted)",
                          marginTop: 1,
                        }}
                      >
                        {formatDate(service.date)}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 10,
                        fontWeight: 600,
                        background:
                          service.status === "ready"
                            ? "var(--accent-green-dim)"
                            : service.status === "in-progress"
                              ? "var(--accent-amber-dim)"
                              : "var(--surface-3)",
                        color:
                          service.status === "ready"
                            ? "var(--accent-green)"
                            : service.status === "in-progress"
                              ? "var(--accent-amber)"
                              : "var(--text-muted)",
                      }}
                    >
                      {service.status === "ready"
                        ? "Ready"
                        : service.status === "in-progress"
                          ? "In prep"
                          : "Empty"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
