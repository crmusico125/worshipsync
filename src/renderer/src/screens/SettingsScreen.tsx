import { useState } from "react";

export default function SettingsScreen() {
  const [dataStatus, setDataStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const handleExport = async () => {
    setDataStatus(null);
    const res = await (window.worshipsync as any).data.export();
    if (res?.success) {
      setDataStatus({ type: "success", msg: "Backup saved successfully." });
    } else if (!res?.canceled) {
      setDataStatus({ type: "error", msg: "Export failed." });
    }
  };

  const handleImport = async () => {
    setDataStatus(null);
    const res = await (window.worshipsync as any).data.import();
    if (res?.success) {
      setDataStatus({
        type: "success",
        msg: "Data imported successfully. Restart the app to reload everything.",
      });
    } else if (res?.error) {
      setDataStatus({ type: "error", msg: res.error });
    }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      <div style={{ maxWidth: 520 }}>
        {/* Data backup */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Data backup
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 14,
              lineHeight: 1.6,
            }}
          >
            Export all your songs, service plans, themes, and background images
            into a single file. Import that file on another computer to transfer
            everything across.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: dataStatus ? 10 : 0 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 12, fontWeight: 600 }}
              onClick={handleExport}
            >
              Export backup…
            </button>
            <button
              className="btn"
              style={{ flex: 1, fontSize: 12 }}
              onClick={handleImport}
            >
              Import backup…
            </button>
          </div>

          {dataStatus && (
            <div
              style={{
                fontSize: 11,
                padding: "7px 10px",
                borderRadius: 6,
                background:
                  dataStatus.type === "success"
                    ? "var(--accent-green-dim)"
                    : "rgba(248,71,71,0.1)",
                color:
                  dataStatus.type === "success"
                    ? "var(--accent-green)"
                    : "var(--accent-red)",
                border: `1px solid ${dataStatus.type === "success" ? "var(--accent-green)" : "var(--accent-red)"}`,
              }}
            >
              {dataStatus.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
