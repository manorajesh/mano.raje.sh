import React, { useState } from "react";

interface PinImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  description: string;
  selected: boolean;
}

interface FetchState {
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  bookmark: string | null;
  totalPins: number | null;
}

export default function Pinterest() {
  const [boardUrl, setBoardUrl] = useState("");
  const [images, setImages] = useState<PinImage[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>({
    loading: false,
    loadingMore: false,
    error: null,
    bookmark: null,
    totalPins: null,
  });
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
  });

  const extractBoardInfo = (
    url: string
  ): { username: string; boardName: string } | null => {
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes("pinterest")) {
        return null;
      }
      // Extract username and board name from path like /username/board-name/
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2) {
        return { username: pathParts[0], boardName: pathParts[1] };
      }
      return null;
    } catch {
      return null;
    }
  };

  const fetchBoardImages = async (loadMore = false) => {
    if (!loadMore) {
      setFetchState((prev) => ({ ...prev, error: null, loading: true }));
      setImages([]);
    } else {
      setFetchState((prev) => ({ ...prev, loadingMore: true }));
    }

    const boardInfo = extractBoardInfo(boardUrl);
    if (!boardInfo) {
      setFetchState((prev) => ({
        ...prev,
        error: "Please enter a valid Pinterest board URL",
        loading: false,
      }));
      return;
    }

    try {
      // First fetch: get board info to show total pins
      if (!loadMore) {
        const boardResponse = await fetch(
          `/api/pinterest?action=get-board&username=${encodeURIComponent(boardInfo.username)}&board=${encodeURIComponent(boardInfo.boardName)}`
        );

        if (!boardResponse.ok) {
          const errorData = await boardResponse.json();
          throw new Error(
            errorData.error || `Failed to fetch board: ${boardResponse.status}`
          );
        }

        const boardData = await boardResponse.json();
        setFetchState((prev) => ({
          ...prev,
          totalPins: boardData.pin_count || null,
        }));
      }

      // Fetch pins
      const params = new URLSearchParams({
        action: "get-pins",
        username: boardInfo.username,
        board: boardInfo.boardName,
      });

      if (loadMore && fetchState.bookmark) {
        params.set("bookmark", fetchState.bookmark);
      }

      const response = await fetch(`/api/pinterest?${params}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Failed to fetch pins: ${response.status}`
        );
      }

      const data = await response.json();

      const newImages: PinImage[] = data.pins
        .filter((pin: { url: string }) => pin.url) // Only include pins with images
        .map((pin: { id: string; url: string; thumbnailUrl: string; title: string; description: string }) => ({
          id: pin.id,
          url: pin.url,
          thumbnailUrl: pin.thumbnailUrl || pin.url,
          title: pin.title,
          description: pin.description,
          selected: true,
        }));

      if (!loadMore && newImages.length === 0) {
        setFetchState((prev) => ({
          ...prev,
          error:
            "No images found. The board might be empty or contain only non-image pins.",
          loading: false,
        }));
      } else {
        setImages((prev) => (loadMore ? [...prev, ...newImages] : newImages));
        setFetchState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: null,
          bookmark: data.bookmark,
        }));
      }
    } catch (err) {
      setFetchState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to fetch board",
        loading: false,
        loadingMore: false,
      }));
    }
  };

  const toggleSelectAll = () => {
    const allSelected = images.every((img) => img.selected);
    setImages(images.map((img) => ({ ...img, selected: !allSelected })));
  };

  const toggleImage = (id: string) => {
    setImages(
      images.map((img) =>
        img.id === id ? { ...img, selected: !img.selected } : img
      )
    );
  };

  const downloadImages = async () => {
    const selectedImages = images.filter((img) => img.selected);
    if (selectedImages.length === 0) {
      setFetchState((prev) => ({
        ...prev,
        error: "Please select at least one image to download",
      }));
      return;
    }

    setDownloading(true);
    setDownloadProgress({ current: 0, total: selectedImages.length });
    setFetchState((prev) => ({ ...prev, error: null }));

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let successCount = 0;

      // Download in batches to avoid overwhelming the browser
      const batchSize = 5;
      for (let i = 0; i < selectedImages.length; i += batchSize) {
        const batch = selectedImages.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (img, batchIndex) => {
            const index = i + batchIndex;
            try {
              // Pinterest images should be directly fetchable
              const response = await fetch(img.url);
              if (!response.ok) throw new Error("Failed to fetch image");

              const blob = await response.blob();
              if (blob.size > 0) {
                const extension =
                  img.url.split(".").pop()?.split("?")[0] || "jpg";
                const filename = `pinterest-${String(index + 1).padStart(3, "0")}.${extension}`;
                zip.file(filename, blob);
                successCount++;
              }
            } catch (e) {
              console.error(`Failed to download image ${index + 1}:`, e);
            }

            setDownloadProgress((prev) => ({ ...prev, current: index + 1 }));
          })
        );
      }

      if (successCount === 0) {
        throw new Error(
          "Failed to download any images. Try opening them individually."
        );
      }

      // Generate and download the zip
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pinterest-images-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (successCount < selectedImages.length) {
        setFetchState((prev) => ({
          ...prev,
          error: `Downloaded ${successCount} of ${selectedImages.length} images. Some images couldn't be fetched.`,
        }));
      }
    } catch (err) {
      setFetchState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to download images",
      }));
    } finally {
      setDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  const selectedCount = images.filter((img) => img.selected).length;
  const canLoadMore =
    fetchState.bookmark && !fetchState.loading && !fetchState.loadingMore;

  return (
    <div className="min-h-screen bg-dark-blue text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-serif mb-2">Pinterest Board Downloader</h1>
        <p className="text-gray-400 mb-8">
          Paste a Pinterest board URL to view and download images
        </p>

        {/* URL Input Form */}
        <div className="flex gap-4 mb-8">
          <input
            type="text"
            value={boardUrl}
            onChange={(e) => setBoardUrl(e.target.value)}
            placeholder="https://pinterest.com/username/board-name"
            className="flex-1 p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                fetchBoardImages(false);
              }
            }}
          />
          <button
            onClick={() => fetchBoardImages(false)}
            disabled={fetchState.loading || !boardUrl}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            {fetchState.loading ? "Loading..." : "Fetch Images"}
          </button>
        </div>

        {/* Error Message */}
        {fetchState.error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            {fetchState.error}
          </div>
        )}

        {/* Results */}
        {images.length > 0 && (
          <>
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-white/5 rounded-lg">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleSelectAll}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  {images.every((img) => img.selected)
                    ? "Deselect All"
                    : "Select All"}
                </button>
                <span className="text-gray-400">
                  {selectedCount} of {images.length} selected
                  {fetchState.totalPins && ` (${fetchState.totalPins} total in board)`}
                </span>
              </div>
              <button
                onClick={downloadImages}
                disabled={downloading || selectedCount === 0}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {downloading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {downloadProgress.total > 0
                      ? `${downloadProgress.current}/${downloadProgress.total}`
                      : "Preparing..."}
                  </>
                ) : (
                  <>
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download ZIP ({selectedCount})
                  </>
                )}
              </button>
            </div>

            {/* Image Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  onClick={() => toggleImage(img.id)}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    img.selected
                      ? "border-green-500 ring-2 ring-green-500/50"
                      : "border-transparent hover:border-white/30"
                  }`}
                >
                  <img
                    src={img.thumbnailUrl}
                    alt={img.title || img.description || "Pinterest image"}
                    className="w-full h-48 object-cover bg-white/5"
                    loading="lazy"
                    onError={(e) => {
                      // Try original URL if thumbnail fails
                      const target = e.target as HTMLImageElement;
                      if (target.src !== img.url) {
                        target.src = img.url;
                      }
                    }}
                  />
                  {/* Selection Indicator */}
                  <div
                    className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      img.selected ? "bg-green-500" : "bg-black/50"
                    }`}
                  >
                    {img.selected && (
                      <svg
                        className="h-4 w-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  {/* Title overlay */}
                  {img.title && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-xs text-white truncate">{img.title}</p>
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1 bg-white text-black rounded text-sm font-medium hover:bg-gray-200"
                    >
                      Open
                    </a>
                    <a
                      href={img.url}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600"
                    >
                      Save
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More Button */}
            {canLoadMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => fetchBoardImages(true)}
                  disabled={fetchState.loadingMore}
                  className="px-8 py-3 bg-white/10 hover:bg-white/20 disabled:bg-white/5 rounded-lg font-medium transition-colors"
                >
                  {fetchState.loadingMore ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Loading more...
                    </span>
                  ) : (
                    `Load More Images${fetchState.totalPins ? ` (${images.length}/${fetchState.totalPins} loaded)` : ""}`
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* Loading State */}
        {fetchState.loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              className="animate-spin h-10 w-10 text-red-500 mb-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-gray-400">Fetching images from Pinterest...</p>
          </div>
        )}

        {/* Empty State */}
        {!fetchState.loading && images.length === 0 && !fetchState.error && (
          <div className="text-center py-20 text-gray-500">
            <svg
              className="h-16 w-16 mx-auto mb-4 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p>Enter a Pinterest board URL above to get started</p>
            <p className="text-sm mt-2 text-gray-600">
              Example: https://pinterest.com/username/board-name
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
