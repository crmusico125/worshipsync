import { useEffect, useState } from "react";

const PRESET_COLORS = [
  { label: "Deep blue", value: "color:#0a0a2e" },
  { label: "Forest green", value: "color:#0a1a0a" },
  { label: "Deep red", value: "color:#1a0505" },
  { label: "Dark amber", value: "color:#1a1000" },
  { label: "Deep purple", value: "color:#12062a" },
  { label: "Teal", value: "color:#051a1a" },
  { label: "Pure black", value: "color:#000000" },
  { label: "Dark gray", value: "color:#111111" },
];

const COLOR_HEX: Record<string, string> = {
  "color:#0a0a2e": "#0a0a2e",
  "color:#0a1a0a": "#0a1a0a",
  "color:#1a0505": "#1a0505",
  "color:#1a1000": "#1a1000",
  "color:#12062a": "#12062a",
  "color:#051a1a": "#051a1a",
  "color:#000000": "#000000",
  "color:#111111": "#111111",
};

interface Props {
  currentBackground: string | null;
  previewLabel?: string;
  onSelect: (background: string | null) => void;
}

export default function BackgroundPickerPanel({
  currentBackground,
  previewLabel = "",
  onSelect,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [libraryImages, setLibraryImages] = useState<string[]>([]);
  const [tab, setTab] = useState<"colors" | "images">("colors");

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    const images = await window.worshipsync.backgrounds.listImages();
    setLibraryImages(images);
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      const path = await window.worshipsync.backgrounds.pickImage();
      if (path) {
        await loadLibrary();
        onSelect(path);
        setTab("images");
      }
    } finally {
      setUploading(false);
    }
  };

  const isColor = currentBackground?.startsWith("color:");
  const isImage = currentBackground && !isColor;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Preview */}
      <div
        style={{
          aspectRatio: "16/9",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border-default)",
          position: "relative",
          background: "#07070f",
          flexShrink: 0,
        }}
      >
        {isImage && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url("file://${encodeURI(currentBackground!)}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        {isColor && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                COLOR_HEX[currentBackground!] ??
                currentBackground!.replace("color:", ""),
            }}
          />
        )}
        {!currentBackground && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              No background
            </span>
          </div>
        )}
        {/* Overlay + label */}
        {currentBackground && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                textAlign: "center",
                textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                padding: "0 12px",
              }}
            >
              {previewLabel}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["colors", "images"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "5px 0",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 11,
              border: `1px solid ${tab === t ? "var(--accent-blue)" : "var(--border-subtle)"}`,
              background:
                tab === t ? "var(--accent-blue-dim)" : "var(--surface-2)",
              color: tab === t ? "var(--accent-blue)" : "var(--text-muted)",
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === "colors" ? `Colors` : `Images (${libraryImages.length})`}
          </button>
        ))}
      </div>

      {/* Color tab */}
      {tab === "colors" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="label">Preset colors</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {PRESET_COLORS.map((preset) => (
              <div
                key={preset.value}
                onClick={() => onSelect(preset.value)}
                title={preset.label}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: COLOR_HEX[preset.value],
                  cursor: "pointer",
                  border:
                    currentBackground === preset.value
                      ? "2px solid var(--accent-blue)"
                      : "1px solid var(--border-strong)",
                  transition: "transform 0.1s, box-shadow 0.1s",
                  boxShadow:
                    currentBackground === preset.value
                      ? "0 0 0 3px rgba(77,142,240,0.25)"
                      : "none",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.transform = "scale(1.12)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "scale(1)")
                }
              />
            ))}
            {/* Custom color picker */}
            <div style={{ position: "relative", width: 32, height: 32 }}>
              <input
                type="color"
                title="Custom color"
                defaultValue="#1a0a2e"
                onChange={(e) => onSelect(`color:${e.target.value}`)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  cursor: "pointer",
                  border: "1px solid var(--border-strong)",
                  padding: 2,
                  background: "var(--surface-3)",
                }}
              />
            </div>
          </div>
          {currentBackground && (
            <button
              className="btn"
              style={{
                fontSize: 11,
                alignSelf: "flex-start",
                color: "var(--accent-red)",
              }}
              onClick={() => onSelect(null)}
            >
              Clear background
            </button>
          )}
        </div>
      )}

      {/* Images tab */}
      {tab === "images" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, flex: 1, justifyContent: "center" }}
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "+ Upload new image"}
            </button>
            {currentBackground && isImage && (
              <button
                className="btn"
                style={{ fontSize: 11, color: "var(--accent-red)" }}
                onClick={() => onSelect(null)}
              >
                Clear
              </button>
            )}
          </div>

          {libraryImages.length === 0 ? (
            <div
              style={{
                padding: "20px 0",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 11,
              }}
            >
              No images uploaded yet.
              <br />
              Click "Upload new image" to add one.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 6,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {libraryImages.map((imgPath) => {
                const isSelected = currentBackground === imgPath;
                const filename = imgPath.split("/").pop() ?? imgPath;

                const handleDelete = async (e: React.MouseEvent) => {
                  e.stopPropagation();
                  const count =
                    await window.worshipsync.backgrounds.getUsageCount(imgPath);
                  const message =
                    count > 0
                      ? `This image is used by ${count} song${count > 1 ? "s" : ""}. Deleting it will remove it from those songs too. Continue?`
                      : "Delete this image from the library?";
                  if (!confirm(message)) return;
                  await window.worshipsync.backgrounds.deleteImage(imgPath);
                  await loadLibrary();
                  if (isSelected) onSelect(null);
                };

                return (
                  <div
                    key={imgPath}
                    onClick={() => onSelect(imgPath)}
                    style={{
                      aspectRatio: "16/9",
                      borderRadius: 7,
                      overflow: "hidden",
                      cursor: "pointer",
                      position: "relative",
                      border: isSelected
                        ? "2px solid var(--accent-blue)"
                        : "1px solid var(--border-subtle)",
                      boxShadow: isSelected
                        ? "0 0 0 3px rgba(77,142,240,0.25)"
                        : "none",
                      transition: "border-color 0.1s, box-shadow 0.1s",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url("file://${encodeURI(imgPath)}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />

                    {/* Selected checkmark */}
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(77,142,240,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "var(--accent-blue)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            color: "#fff",
                            fontWeight: 700,
                          }}
                        >
                          ✓
                        </div>
                      </div>
                    )}

                    {/* Filename + delete button */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "rgba(0,0,0,0.7)",
                        padding: "3px 5px",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          fontSize: 9,
                          color: "rgba(255,255,255,0.7)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {filename.replace(/^bg_\d+\./, "img.")}
                      </div>
                      <button
                        onClick={handleDelete}
                        style={{
                          flexShrink: 0,
                          fontSize: 9,
                          padding: "1px 5px",
                          borderRadius: 4,
                          cursor: "pointer",
                          background: "rgba(240,82,82,0.8)",
                          border: "1px solid rgba(240,82,82,0.5)",
                          color: "#fff",
                          fontWeight: 600,
                          lineHeight: 1.4,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            Images are shared across all songs and themes. Supported: JPG, PNG,
            WebP.
          </div>
        </div>
      )}
    </div>
  );
}
