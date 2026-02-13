import React, { useState, useEffect, useRef } from "react";

const pawCursor = "url(/cat_paw.png) 24 24, auto";
const pawPointer = "url(/cat_paw.png) 24 24, pointer";

function useTypewriter(text: string, speed: number = 60, active: boolean = true) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) {
      setDisplayed("");
      setDone(false);
      return;
    }
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, active]);

  return { displayed, done };
}

type Phase =
  | "loading"
  | "blank"
  | "entrance"
  | "meow"
  | "translated"
  | "meow2"
  | "translated2"
  | "paper"
  | "uncrumpled"
  | "accepted"
  | "rejected";

async function fetchNonLoopingGif(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sig = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30];
  let pos = -1;
  for (let i = 0; i < bytes.length - sig.length; i++) {
    if (sig.every((b, j) => bytes[i + j] === b)) {
      pos = i;
      break;
    }
  }
  if (pos !== -1) {
    const blockStart = pos - 3;
    const blockEnd = pos + 16;
    const stripped = new Uint8Array(bytes.length - (blockEnd - blockStart));
    stripped.set(bytes.slice(0, blockStart));
    stripped.set(bytes.slice(blockEnd), blockStart);
    return URL.createObjectURL(new Blob([stripped], { type: "image/gif" }));
  }
  return URL.createObjectURL(new Blob([buffer], { type: "image/gif" }));
}

const PRELOAD_ASSETS = [
  "/cat_paw.png",
  "/stripy.png",
  "/static_crumpled.gif",
  "/name.png",
  "/hearts.png",
  "/valentine.png",
  "/shape.png",
  "/5EB4F8E0-11A7-4A21-8A94-849F0A5C97A6.png",
  "/IMG_9629.jpeg",
];

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // don't block on errors
    img.src = src;
  });
}

function Valentine() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadProgress, setLoadProgress] = useState(0);
  const [uncrumpleSrc, setUncrumpleSrc] = useState<string | null>(null);
  const [showPaper, setShowPaper] = useState(false);
  const [shapePos, setShapePos] = useState<{ x: number; y: number } | null>(null);
  const [noClickCount, setNoClickCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const preloadedGifRef = useRef<string | null>(null);

  // Preload all assets
  useEffect(() => {
    let loaded = 0;
    const total = PRELOAD_ASSETS.length + 1; // +1 for the GIF processing

    const promises = PRELOAD_ASSETS.map((src) =>
      preloadImage(src).then(() => {
        loaded++;
        setLoadProgress(Math.round((loaded / total) * 100));
      })
    );

    const gifPromise = fetchNonLoopingGif("/uncrumple.gif").then((url) => {
      preloadedGifRef.current = url;
      loaded++;
      setLoadProgress(Math.round((loaded / total) * 100));
    });

    Promise.all([...promises, gifPromise]).then(() => {
      setPhase("blank");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scale container to fit viewport
  useEffect(() => {
    const check = () => {
      const DESIGN_W = 360;
      const DESIGN_H = 500;
      const vScale = window.innerHeight / DESIGN_H;
      const hScale = window.innerWidth / DESIGN_W;
      setScale(Math.min(vScale, hScale));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    timerRef.current.push(setTimeout(fn, ms));
  };

  const startedRef = useRef(false);

  useEffect(() => {
    if (phase !== "blank" || startedRef.current) return;
    startedRef.current = true;
    schedule(() => setPhase("entrance"), 400);
    schedule(() => setPhase("meow"), 2800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Schedule meow->translated
  useEffect(() => {
    if (phase === "meow") {
      const t1 = setTimeout(() => setPhase("translated"), 2200);
      return () => clearTimeout(t1);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "translated") {
      const t2 = setTimeout(() => setPhase("meow2"), 2200);
      return () => clearTimeout(t2);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "meow2") {
      const t3 = setTimeout(() => setPhase("translated2"), 2200);
      return () => clearTimeout(t3);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "translated2") {
      const t4 = setTimeout(() => {
        setPhase("paper");
        setShowPaper(true);
      }, 2200);
      return () => clearTimeout(t4);
    }
  }, [phase]);

  const handlePaperClick = async () => {
    if (phase === "paper") {
      if (preloadedGifRef.current) {
        setUncrumpleSrc(preloadedGifRef.current);
        preloadedGifRef.current = null;
      } else {
        const blobUrl = await fetchNonLoopingGif("/uncrumple.gif");
        setUncrumpleSrc(blobUrl);
      }
      setPhase("uncrumpled");
    }
  };

  useEffect(() => {
    return () => {
      if (uncrumpleSrc) URL.revokeObjectURL(uncrumpleSrc);
    };
  }, [uncrumpleSrc]);

  const catInScene = phase !== "loading" && phase !== "blank" && phase !== "uncrumpled" && phase !== "accepted" && phase !== "rejected";

  const meowText = "meow... meow meow meow";
  const translationText = "\"i found this outside with your name on it.\"";
  const meow2Text = "meow... meooow";
  const translation2Text = '"i think it\'s from mano"';

  const meowTyping = useTypewriter(meowText, 70, phase === "meow" || phase === "translated" || phase === "meow2" || phase === "translated2" || phase === "paper");
  const translationTyping = useTypewriter(translationText, 40, phase === "translated" || phase === "meow2" || phase === "translated2" || phase === "paper");
  const meow2Typing = useTypewriter(meow2Text, 70, phase === "meow2" || phase === "translated2" || phase === "paper");
  const translation2Typing = useTypewriter(translation2Text, 40, phase === "translated2" || phase === "paper");

  return (
    <div
      className={`relative flex min-h-screen items-center justify-center ${phase === "uncrumpled" || phase === "accepted" || phase === "rejected" ? "" : "overflow-hidden"}`}
      style={{
        cursor: pawCursor,
        background: "#f5e6d3",
        fontFamily: "'Caveat', cursive",
      }}
    >
      {/* === LOADING SCREEN === */}
      {phase === "loading" && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-3xl text-amber-800/70">one sec...</p>
          <div
            style={{
              width: "180px",
              height: "6px",
              background: "#e8d5c0",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${loadProgress}%`,
                height: "100%",
                background: "#c9a87c",
                borderRadius: "3px",
                transition: "width 0.2s ease-out",
              }}
            />
          </div>
        </div>
      )}

      {/* Subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg, transparent, transparent 28px, #c9a87c 28px, #c9a87c 29px
          ), repeating-linear-gradient(
            90deg, transparent, transparent 28px, #c9a87c 28px, #c9a87c 29px
          )`,
        }}
      />

      {/* Scaled container to prevent content cutoff */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          ref={containerRef}
          style={{
            width: "360px",
            height: "500px",
            position: "relative",
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >

      {/* === CAT (intro scenes) === */}
      {catInScene && (
        <div
          className="absolute"
          style={
            phase === "entrance"
              ? {
                  animation: "cat-walk-in 2s steps(1, end) forwards",
                  zIndex: 10,
                }
              : {
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 10,
                }
          }
        >
          <img
            src="/stripy.png"
            alt="stripy the cat"
            className="select-none"
            draggable={false}
            style={{
              width: "300px",
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
            }}
          />
        </div>
      )}

      {/* === SPEECH BUBBLE (above cat) === */}
      {(phase === "meow" || phase === "translated" || phase === "meow2" || phase === "translated2" || phase === "paper") && (
        <div
          className="animate-fade-in absolute"
          style={{
            bottom: "calc(40% + 120px)",
            left: "25%",
            zIndex: 20,
            maxWidth: "calc(100% - 40px)",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "12px 18px",
              position: "relative",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.1)",
              maxWidth: "100%",
            }}
          >
            <p className="text-xl text-gray-800" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{meowTyping.displayed}</p>
            {(phase === "translated" || phase === "meow2" || phase === "translated2" || phase === "paper") && (
              <p className="mt-1 text-base text-gray-400">
                {translationTyping.displayed}
              </p>
            )}
            {(phase === "meow2" || phase === "translated2" || phase === "paper") && (
              <p className="mt-1 text-xl text-gray-800" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{meow2Typing.displayed}</p>
            )}
            {(phase === "translated2" || phase === "paper") && (
              <p className="mt-1 text-base text-gray-400">
                {translation2Typing.displayed}
              </p>
            )}
            {/* Bubble tail */}
            <div
              style={{
                position: "absolute",
                bottom: "-14px",
                left: "20px",
                width: 0,
                height: 0,
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderTop: "16px solid white",
              }}
            />
          </div>
        </div>
      )}

      {/* === CRUMPLED PAPER (next to cat) === */}
      {showPaper && phase === "paper" && (
        <div
          className="absolute"
          role="button"
          tabIndex={0}
          style={{
            top: "50%",
            left: "calc(50% - 200px)",
            transform: "translateY(-50%)",
            animation: "paper-appear 0.5s steps(6) forwards",
            zIndex: 15,
            cursor: pawPointer,
            WebkitTapHighlightColor: "transparent",
          }}
          onClick={handlePaperClick}
          onTouchStart={(e) => { e.preventDefault(); handlePaperClick(); }}
        >
          <img
            src="/static_crumpled.gif"
            alt="crumpled paper"
            className="select-none drop-shadow-lg"
            draggable={false}
            style={{
              width: "240px",
              cursor: pawPointer,
              animation: "wiggle 2s ease-in-out infinite",
            }}
          />
          <p className="mt-3 animate-pulse text-center text-2xl text-amber-800/60">
            open it?
          </p>
        </div>
      )}

        </div>
      </div>{/* end scaled container */}

      {/* === UNCRUMPLED STATE (outside scaled container, uses viewport) === */}
      {phase === "uncrumpled" && (
        <div
          className="animate-fade-in"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          {/* Positioning wrapper */}
          <div
            style={{
              position: "absolute",
              width: "160vw",
              maxWidth: "900px",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto",
            }}
          >
          {/* Paper is the container; text + buttons sit on top */}
          <div
            className="animate-choppy-rock"
          >
            {uncrumpleSrc && (
              <img
                src={uncrumpleSrc}
                alt="uncrumpled paper"
                className="w-full select-none drop-shadow-xl"
                draggable={false}
              />
            )}
            {/* Overlay centered on the paper */}
            <div className="animate-fade-in-delayed absolute inset-0 flex flex-col items-center justify-center gap-6 px-8">
              {/* Name in top-left corner */}
              <img
                src="/name.png"
                alt="name"
                className="pointer-events-none absolute select-none"
                draggable={false}
                style={{
                  width: "8ch",
                  top: "20%",
                  left: "26%",
                }}
              />
              {/* Hearts in bottom-right corner */}
              <img
                src="/hearts.png"
                alt="hearts"
                className="pointer-events-none absolute select-none"
                draggable={false}
                style={{
                  width: "6ch",
                  bottom: "15%",
                  right: "18%",
                }}
              />
              <img
                src="/valentine.png"
                alt="Will you be my Valentine?"
                className="max-w-[55%] select-none"
                draggable={false}
                style={{ transform: "rotate(-1.5deg)" }}
              />
              <div className="flex items-center gap-8">
                <button
                  onClick={() => setPhase("accepted")}
                  onTouchEnd={(e) => { e.preventDefault(); setPhase("accepted"); }}
                  className="text-xl font-bold text-pink-900 transition-transform hover:scale-110"
                  style={{
                    cursor: pawPointer,
                    transform: "rotate(-2deg)",
                    background: "#fce4ec",
                    border: "2px solid #d4748a",
                    borderRadius:
                      "255px 15px 225px 15px / 15px 225px 15px 255px",
                    padding: "10px 32px",
                    boxShadow: "3px 4px 0px #c2788a",
                  }}
                >
                  yes
                </button>

                {/* No button with shape sitting on it */}
                <div
                  className="relative"
                  onClick={(e) => {
                    const next = noClickCount + 1;
                    setNoClickCount(next);
                    if (next >= 5) {
                      setPhase("rejected");
                      return;
                    }
                    setShapePos({ x: e.clientX, y: e.clientY });
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    const touch = e.changedTouches[0];
                    const next = noClickCount + 1;
                    setNoClickCount(next);
                    if (next >= 5) {
                      setPhase("rejected");
                      return;
                    }
                    setShapePos({ x: touch.clientX, y: touch.clientY });
                  }}
                  style={{ cursor: pawPointer }}
                >
                  {!shapePos && (
                    <img
                      src="/shape.png"
                      alt="shape blocking no"
                      className="animate-fade-in-delayed pointer-events-none absolute select-none"
                      draggable={false}
                      style={{
                        width: "7ch",
                        bottom: "5px",
                        left: "50%",
                        transform: "translateX(-25%)",
                        filter:
                          "brightness(1.7) drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
                        zIndex: 5,
                      }}
                    />
                  )}
                  <button
                    className="text-xl font-bold text-gray-400 opacity-50"
                    style={{
                      transform: "rotate(2deg)",
                      background: "#f0ede8",
                      border: "2px solid #b0a898",
                      borderRadius:
                        "255px 15px 225px 15px / 15px 225px 15px 255px",
                      padding: "10px 32px",
                      boxShadow: "3px 4px 0px #999",
                      pointerEvents: "none",
                    }}
                  >
                    no
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>{/* end positioning wrapper */}
        </div>
      )}

      {/* Shape that flew to cursor */}
      {phase === "uncrumpled" && shapePos && (
        <img
          src="/shape.png"
          alt="shape moved to cursor"
          className="pointer-events-none select-none"
          draggable={false}
          style={{
            position: "fixed",
            left: shapePos.x - 50,
            top: shapePos.y - 50,
            width: "7ch",
            filter: "brightness(1.7) drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
            zIndex: 100,
            transition: "left 0.2s ease-out, top 0.2s ease-out",
          }}
        />
      )}

      {/* === ACCEPTED === */}
      {phase === "accepted" && (
        <div
          className="animate-fade-in absolute inset-0 flex flex-col items-center justify-center gap-6"
          style={{ zIndex: 50 }}
        >
          <div className="relative">
            <img
              src="/hearts.png"
              alt="hearts"
              className="pointer-events-none absolute select-none"
              draggable={false}
              style={{
                width: "10ch",
                top: "-70px",
                right: "-4px",
                zIndex: -1,                transform: "scaleX(-1)",              }}
            />
            <img
              src="/5EB4F8E0-11A7-4A21-8A94-849F0A5C97A6.png"
              alt="happy cat"
              className="select-none"
              draggable={false}
              style={{
                width: "44ch",
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
                animation: "wiggle 3s ease-in-out infinite",
              }}
            />
          </div>
          <div
            className="flex flex-col items-center gap-3 px-12 py-8"
            style={{
              background: "#fffef9",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              border: "2px solid #c9a87c",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.12)",
              transform: "rotate(-2deg)",
            }}
          >
            <h1 className="text-5xl font-bold text-pink-800">
              yayayayayay!!
            </h1>
            <p className="text-2xl text-pink-700">I love you mwah &lt;3</p>
          </div>
        </div>
      )}

      {/* === REJECTED === */}
      {phase === "rejected" && (
        <div
          className="animate-fade-in absolute inset-0 flex flex-col items-center justify-center gap-6"
          style={{ zIndex: 50 }}
        >
          <img
            src="/IMG_9629.jpeg"
            alt="sad"
            className="select-none rounded-lg shadow-lg"
            draggable={false}
            style={{
              width: "400px",
              border: "3px solid white",
              transform: "rotate(-2deg)",
            }}
          />
          <p
            className="text-3xl text-gray-500"
            style={{ transform: "rotate(1deg)" }}
          >
            oh okay.. did you change your mind?
          </p>
          <button
            onClick={() => window.location.reload()}
            onTouchEnd={(e) => { e.preventDefault(); window.location.reload(); }}
            className="text-2xl font-bold text-amber-800 transition-transform hover:scale-110"
            style={{
              cursor: pawPointer,
              background: "#fffef9",
              border: "2px solid #c9a87c",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              padding: "14px 40px",
              boxShadow: "3px 4px 0px #b0a898",
              transform: "rotate(-1deg)",
            }}
          >
            yes :)
          </button>
        </div>
      )}
    </div>
  );
}

export default Valentine;
