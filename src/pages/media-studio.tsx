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
  if (name === "undo") {
    return <svg {...common}><path d="M9 7 4.5 11.5 9 16" /><path d="M5 11.5h7.5a6 6 0 0 1 6 6" /></svg>;
  }
  if (name === "redo") {
    return <svg {...common}><path d="m15 7 4.5 4.5L15 16" /><path d="M19 11.5h-7.5a6 6 0 0 0-6 6" /></svg>;
  }
  if (name === "preview") {
    return <svg {...common}><rect x="4" y="7" width="13" height="13" rx="2" /><path d="M8 4h10a2 2 0 0 1 2 2v10" /></svg>;
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

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

type DropZone = "before" | "after" | "swap";

const EDGE_ZONE = 0.28;

function getDropZone(event: DragEvent<HTMLElement>, rect: DOMRect): DropZone {
  const ratio = (event.clientX - rect.left) / rect.width;
  if (ratio < EDGE_ZONE) return "before";
  if (ratio > 1 - EDGE_ZONE) return "after";
  return "swap";
}

export default function MediaStudio() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [undoStack, setUndoStack] = useState<MediaItem[][]>([]);
  const [redoStack, setRedoStack] = useState<MediaItem[][]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<{ id: string; zone: DropZone } | null>(null);
  const [isFileOver, setIsFileOver] = useState(false);
  const [processing, setProcessing] = useState<{
    completed: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const objectUrlsRef = useRef<string[]>([]);
  const previewPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const previewWasSwipedRef = useRef(false);
  const previewDialogRef = useRef<HTMLDivElement>(null);

  const lockedCount = useMemo(() => items.filter((item) => item.locked).length, [items]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!items.length) {
      setIsPreviewOpen(false);
      setPreviewIndex(0);
    } else if (previewIndex >= items.length) {
      setPreviewIndex(items.length - 1);
    }
  }, [items.length, previewIndex]);

  useEffect(() => {
    if (!isPreviewOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPreviewOpen(false);
      if (!items.length) return;
      if (event.key === "ArrowLeft") {
        setPreviewIndex((current) => (current - 1 + items.length) % items.length);
      }
      if (event.key === "ArrowRight") {
        setPreviewIndex((current) => (current + 1) % items.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPreviewOpen, items.length]);

  useEffect(() => {
    previewDialogRef.current?.querySelectorAll("video").forEach((video) => video.pause());
  }, [previewIndex]);

  const commitItems = (update: MediaItem[] | ((current: MediaItem[]) => MediaItem[])) => {
    const current = itemsRef.current;
    const next = typeof update === "function" ? update(current) : update;
    const unchanged = next.length === current.length && next.every((item, index) => item === current[index]);
    if (unchanged) return;

    setUndoStack((stack) => [...stack, current].slice(-50));
    setRedoStack([]);
    itemsRef.current = next;
    setItems(next);
  };

  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    const current = itemsRef.current;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current].slice(-50));
    itemsRef.current = previous;
    setItems(previous);
  };

  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    const current = itemsRef.current;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current].slice(-50));
    itemsRef.current = next;
    setItems(next);
  };

  const addFiles = async (files: FileList | File[]) => {
    const acceptedFiles = Array.from(files).filter((file) => getKind(file) !== "other");
    if (!acceptedFiles.length || processing) return;

    const next: MediaItem[] = [];
    setProcessing({ completed: 0, total: acceptedFiles.length, fileName: acceptedFiles[0].name });
    await waitForPaint();

    try {
      for (let index = 0; index < acceptedFiles.length; index += 1) {
        const file = acceptedFiles[index];
        setProcessing({ completed: index, total: acceptedFiles.length, fileName: file.name });
        await waitForPaint();

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

        const src = URL.createObjectURL(previewBlob);
        objectUrlsRef.current.push(src);
        next.push({
          id: `${file.name}-${file.lastModified}-${Math.random()}`,
          name: file.name,
          kind: getKind(file),
          src,
          locked: false,
          size: file.size,
          mimeType: file.type,
          previewAvailable,
          downloadBlob: file,
          downloadName: file.name,
        });

        setProcessing({ completed: index + 1, total: acceptedFiles.length, fileName: file.name });
        await waitForPaint();
      }

      commitItems((current) => [...current, ...next]);
    } finally {
      setProcessing(null);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsFileOver(false);
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  };

  const shuffle = () => {
    commitItems((current) => {
      const movable = current.filter((item) => !item.locked);
      for (let index = movable.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [movable[index], movable[randomIndex]] = [movable[randomIndex], movable[index]];
      }
      let movableIndex = 0;
      return current.map((item) => item.locked ? item : movable[movableIndex++]);
    });
  };

  const swapItems = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    commitItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || current[sourceIndex].locked || current[targetIndex].locked) return current;
      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next;
    });
  };

  const insertItem = (sourceId: string, targetId: string, side: "before" | "after") => {
    if (sourceId === targetId) return;
    commitItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      if (sourceIndex < 0 || current[sourceIndex].locked) return current;
      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      if (targetIndex < 0) return current;
      const insertAt = side === "after" ? targetIndex + 1 : targetIndex;
      next.splice(insertAt, 0, source);
      return next;
    });
  };

  const removeItem = (id: string) => {
    commitItems((current) => current.filter((entry) => entry.id !== id));
  };

  const toggleLock = (id: string) => {
    commitItems((current) => current.map((item) => item.id === id ? { ...item, locked: !item.locked } : item));
  };

  const changePreview = (direction: -1 | 1) => {
    if (items.length < 2) return;
    setPreviewIndex((current) => (current + direction + items.length) % items.length);
  };

  const openPreview = () => {
    if (!items.length) return;
    setPreviewIndex(0);
    setIsPreviewOpen(true);
  };

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, video")) return;
    previewWasSwipedRef.current = false;
    previewPointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = previewPointerStartRef.current;
    previewPointerStartRef.current = null;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
      previewWasSwipedRef.current = true;
      changePreview(deltaX < 0 ? 1 : -1);
    }
  };

  const handlePreviewClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (previewWasSwipedRef.current) {
      previewWasSwipedRef.current = false;
      return;
    }
    if (items.length < 2 || (event.target as HTMLElement).closest("button, video")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    changePreview(event.clientX < rect.left + rect.width / 2 ? -1 : 1);
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
    <main className="media-page" aria-busy={Boolean(processing)}>
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
            <div className="media-history-actions" aria-label="Edit history">
              <button
                className="media-button media-button-quiet media-button-icon"
                onClick={undo}
                disabled={!undoStack.length}
                aria-label="Undo"
                title="Undo"
              >
                <Icon name="undo" />
              </button>
              <button
                className="media-button media-button-quiet media-button-icon"
                onClick={redo}
                disabled={!redoStack.length}
                aria-label="Redo"
                title="Redo"
              >
                <Icon name="redo" />
              </button>
            </div>
            <button
              className="media-button media-button-quiet"
              onClick={openPreview}
              disabled={!items.length}
            >
              <Icon name="preview" /> preview
            </button>
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
              disabled={Boolean(processing)}
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
              className={`media-card ${item.locked ? "media-card-locked" : ""} ${draggedId === item.id ? "media-card-dragging" : ""} ${dropZone?.id === item.id && dropZone.zone === "swap" ? "media-card-drop-target" : ""}`}
              key={item.id}
              draggable={!item.locked}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
                setDraggedId(item.id);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDropZone(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!draggedId || draggedId === item.id) return;
                const zone = getDropZone(event, event.currentTarget.getBoundingClientRect());
                event.dataTransfer.dropEffect = zone === "swap" && item.locked ? "none" : "move";
                setDropZone({ id: item.id, zone });
              }}
              onDragLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (
                  relatedTarget instanceof Node &&
                  event.currentTarget.contains(relatedTarget)
                )
                  return;
                setDropZone((current) =>
                  current?.id === item.id ? null : current,
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (draggedId && draggedId !== item.id) {
                  const zone = getDropZone(event, event.currentTarget.getBoundingClientRect());
                  if (zone === "swap") swapItems(draggedId, item.id);
                  else insertItem(draggedId, item.id, zone);
                }
                setDraggedId(null);
                setDropZone(null);
              }}
            >
              {dropZone?.id === item.id && dropZone.zone === "before" && (
                <div className="media-insert-bar media-insert-bar-before" />
              )}
              {dropZone?.id === item.id && dropZone.zone === "after" && (
                <div className="media-insert-bar media-insert-bar-after" />
              )}
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
                  className={`media-card-lock ${item.locked ? "media-card-lock-active" : ""}`}
                  onClick={() => toggleLock(item.id)}
                  aria-label={
                    item.locked ? `Unlock ${item.name}` : `Lock ${item.name}`
                  }
                  aria-pressed={item.locked}
                >
                  <Icon name={item.locked ? "lock" : "unlock"} size={15} />
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

      {processing && (
        <div className="media-processing-backdrop">
          <div className="media-processing-card" role="status" aria-live="polite">
            <div className="media-processing-spinner" aria-hidden="true" />
            <p>one sec...</p>
            <h2>{processing.completed === processing.total ? "Finishing up…" : "Processing…"}</h2>
            <div className="media-processing-file" title={processing.fileName}>{processing.fileName}</div>
            <div className="media-processing-track" aria-hidden="true">
              <span style={{ width: `${(processing.completed / processing.total) * 100}%` }} />
            </div>
            <div className="media-processing-meta">
              <span>{processing.completed} of {processing.total} complete</span>
              <span>{Math.round((processing.completed / processing.total) * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && items.length > 0 && (
        <div
          className="media-preview-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsPreviewOpen(false);
          }}
        >
          <div
            className="media-preview-dialog"
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Instagram preview"
          >
            <div className="media-preview-topbar">
              <div>
                <strong>preview</strong>
                <span>{previewIndex + 1} / {items.length}</span>
              </div>
              <button
                className="media-preview-close"
                onClick={() => setIsPreviewOpen(false)}
                aria-label="Close preview"
              >
                <Icon name="x" />
              </button>
            </div>

            <div
              className="media-preview-stage"
              onPointerDown={handlePreviewPointerDown}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={() => { previewPointerStartRef.current = null; }}
              onClick={handlePreviewClick}
            >
              <div
                className="media-preview-track"
                style={{ transform: `translate3d(-${previewIndex * 100}%, 0, 0)` }}
              >
                {items.map((item, index) => (
                  <div
                    className="media-preview-slide"
                    key={item.id}
                    aria-hidden={index !== previewIndex}
                  >
                    {item.kind === "video" ? (
                      <video
                        src={item.src}
                        controls={index === previewIndex}
                        playsInline
                        preload="metadata"
                        tabIndex={index === previewIndex ? 0 : -1}
                      />
                    ) : item.previewAvailable ? (
                      <img src={item.src} alt={item.name} draggable={false} />
                    ) : (
                      <div className="media-preview-unavailable">
                        <span>HEIC</span>
                        <strong>Preview unavailable</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {items.length > 1 && (
                <>
                  <span className="media-preview-stack-icon" aria-hidden="true"><Icon name="preview" /></span>
                  <button
                    className="media-preview-arrow media-preview-arrow-previous"
                    onClick={(event) => { event.stopPropagation(); changePreview(-1); }}
                    aria-label="Previous item"
                  >
                    <Icon name="chevron" />
                  </button>
                  <button
                    className="media-preview-arrow media-preview-arrow-next"
                    onClick={(event) => { event.stopPropagation(); changePreview(1); }}
                    aria-label="Next item"
                  >
                    <Icon name="chevron" />
                  </button>
                </>
              )}
            </div>

            <div className="media-preview-footer">
              <div className="media-preview-dots" aria-label="Carousel position">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    className={index === previewIndex ? "media-preview-dot media-preview-dot-active" : "media-preview-dot"}
                    onClick={() => setPreviewIndex(index)}
                    aria-label={`Show item ${index + 1}`}
                    aria-current={index === previewIndex ? "true" : undefined}
                  />
                ))}
              </div>
              <span>{items[previewIndex]?.name}</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
