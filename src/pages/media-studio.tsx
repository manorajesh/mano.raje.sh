import React, { DragEvent, useEffect, useMemo, useRef, useState } from "react";

type MediaKind = "image" | "video" | "other";

type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  src: string;
  locked: boolean;
  size?: number;
  mimeType?: string;
  previewAvailable: boolean;
  downloadBlob: Blob;
  downloadName: string;
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "upload") {
    return <svg {...common}><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></svg>;
  }
  if (name === "download") {
    return <svg {...common}><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 19.5h14" /></svg>;
  }
  if (name === "shuffle") {
    return <svg {...common}><path d="M3.5 7h2.1c3.7 0 4.1 6.8 8.8 6.8h5.8" /><path d="m17 10.5 3.2 3.3-3.2 3.2M3.5 17.5h2.1c1.4 0 2.3-.7 3.1-1.7M14.4 8.7c1-1.1 2-1.7 3.4-1.7h2.4" /><path d="m17 4.8 3.2 2.2-3.2 3" /></svg>;
  }
  if (name === "lock") {
    return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" /></svg>;
  }
  if (name === "unlock") {
    return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.3-2" /><path d="M12 14v2" /></svg>;
  }
  if (name === "grid") {
    return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
  }
  if (name === "chevron") {
    return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  }
  if (name === "more") {
    return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></svg>;
  }
  if (name === "x") {
    return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
}

function getKind(file: File): MediaKind {
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif|avif|svg)$/i.test(file.name)) return "image";
  if (file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name)) return "video";
  return "other";
}

function isHeicFile(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaStudio() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isFileOver, setIsFileOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);

  const lockedCount = useMemo(() => items.filter((item) => item.locked).length, [items]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => itemsRef.current.forEach((item) => {
      URL.revokeObjectURL(item.src);
    });
  }, []);

  const addFiles = async (files: FileList | File[]) => {
    const acceptedFiles = Array.from(files).filter((file) => getKind(file) !== "other");
    const next = await Promise.all(acceptedFiles.map(async (file) => {
      let previewBlob: Blob = file;
      let previewAvailable = true;

      if (isHeicFile(file)) {
        try {
          const { heicTo } = await import("heic-to");
          previewBlob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
        } catch (error) {
          console.error("Unable to decode HEIC file", file.name, error);
          previewAvailable = false;
        }
      }

      return {
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        name: file.name,
        kind: getKind(file),
        src: URL.createObjectURL(previewBlob),
        locked: false,
        size: file.size,
        mimeType: file.type,
        previewAvailable,
        downloadBlob: file,
        downloadName: file.name,
      };
    }));
    if (next.length) setItems((current) => [...current, ...next]);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsFileOver(false);
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  };

  const shuffle = () => {
    setItems((current) => {
      const movable = current.filter((item) => !item.locked);
      for (let index = movable.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [movable[index], movable[randomIndex]] = [movable[randomIndex], movable[index]];
      }
      let movableIndex = 0;
      return current.map((item) => item.locked ? item : movable[movableIndex++]);
    });
  };

  const moveItem = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || current[sourceIndex].locked || current[targetIndex].locked) return current;
      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  };

  const removeItem = (id: string) => {
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item) URL.revokeObjectURL(item.src);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const toggleLock = (id: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, locked: !item.locked } : item));
  };

  const downloadOrder = async () => {
    if (!items.length) return;

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      items.forEach((item, index) => {
        const order = String(index + 1).padStart(2, "0");
        zip.file(`${order}_${item.downloadName}`, item.downloadBlob);
      });

      const archive = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = "media-order.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Unable to download media order", error);
    }
  };

  return (
    <main className="media-page">
      <section className="media-intro">
        <div>
          <h1 style={{ fontStyle: "normal" }}>मिक्सी</h1>
          <p className="media-eyebrow">mixie</p>
        </div>
        <p className="media-description">
          arrange whatever you like.
        </p>
      </section>

      <section
        className="media-workspace"
        aria-label="Media arrangement workspace"
      >
        <div className="media-toolbar">
          <div className="media-count">
            <span className="media-count-dot" /> {items.length}{" "}
            {items.length === 1 ? "item" : "items"}
            <span className="media-count-divider" /> {lockedCount} locked
          </div>
          <div className="media-actions">
            <button
              className="media-button media-button-quiet"
              onClick={shuffle}
              disabled={items.filter((item) => !item.locked).length < 2}
            >
              <Icon name="shuffle" /> shuffle
            </button>
            <button
              className="media-button media-button-quiet"
              onClick={() => void downloadOrder()}
              disabled={!items.length}
            >
              <Icon name="download" /> download order
            </button>
            <button
              className="media-button media-button-dark"
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="upload" /> add media
            </button>
            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              accept="image/*,video/*,image/heic,image/heif,.heic,.heif"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <div
          className={`media-grid ${isFileOver ? "media-grid-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!draggedId && event.dataTransfer.types.includes("Files"))
              setIsFileOver(true);
          }}
          onDragLeave={() => setIsFileOver(false)}
          onDrop={onDrop}
        >
          {items.map((item, index) => (
            <article
              className={`media-card ${item.locked ? "media-card-locked" : ""} ${draggedId === item.id ? "media-card-dragging" : ""} ${dragOverId === item.id && draggedId !== item.id && !item.locked ? "media-card-drop-target" : ""}`}
              key={item.id}
              draggable={!item.locked}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
                setDraggedId(item.id);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              onDragEnter={() => {
                if (draggedId && draggedId !== item.id && !item.locked)
                  setDragOverId(item.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = item.locked ? "none" : "move";
                if (draggedId && draggedId !== item.id && !item.locked)
                  setDragOverId(item.id);
              }}
              onDragLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (
                  relatedTarget instanceof Node &&
                  event.currentTarget.contains(relatedTarget)
                )
                  return;
                setDragOverId((current) =>
                  current === item.id ? null : current,
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (draggedId) moveItem(draggedId, item.id);
                setDraggedId(null);
                setDragOverId(null);
              }}
            >
              <div className="media-card-image">
                {item.kind === "video" ? (
                  <video
                    className="media-card-video"
                    src={item.src}
                    muted
                    playsInline
                    controls
                    preload="metadata"
                  />
                ) : item.previewAvailable ? (
                  <img src={item.src} alt={item.name} />
                ) : (
                  <div className="media-card-heic">
                    <span>HEIC</span>
                    <strong>Preview unavailable</strong>
                  </div>
                )}
                <div className="media-card-shade" />
                <span className="media-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {item.kind === "video" && (
                  <span className="media-video-badge">video</span>
                )}
                <button
                  className="media-card-lock"
                  onClick={() => toggleLock(item.id)}
                  aria-label={
                    item.locked ? `Unlock ${item.name}` : `Lock ${item.name}`
                  }
                >
                  <Icon name="lock" size={15} />
                </button>
                <button
                  className="media-remove"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.name}`}
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
              <div className="media-card-meta">
                <span className="media-card-name">{item.name}</span>
                <span>{item.size ? formatBytes(item.size) : ""}</span>
              </div>
            </article>
          ))}

          <div
            className="media-drop-card"
            onClick={() => inputRef.current?.click()}
          >
            <div className="media-drop-plus">+</div>
            <strong>Drop more here</strong>
            <span>PNG, JPEG, HEIC, MP4 & more</span>
          </div>
        </div>

        <div className="media-hint">
          <Icon name="grid" size={15} />
          <span>Drag cards to arrange</span>
          <span className="media-hint-separator">·</span>
          <Icon name="lock" size={14} />
          <span>Lock cards to keep them in place</span>
        </div>
      </section>

      <footer className="media-footer">
        <span>local by default</span>
        <span>your files stay in this browser</span>
        <a href="/">
          back home <Icon name="chevron" size={14} />
        </a>
      </footer>
    </main>
  );
}
