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
  | "blank"
  | "entrance"
  | "rotate"
  | "meow"
  | "translated"
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

function Valentine() {
  const [phase, setPhase] = useState<Phase>("blank");
  const [uncrumpleSrc, setUncrumpleSrc] = useState<string | null>(null);
  const [showPaper, setShowPaper] = useState(false);
  const [shapePos, setShapePos] = useState<{ x: number; y: number } | null>(null);
  const [noClickCount, setNoClickCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLandscape, setIsLandscape] = useState(
    () => window.innerWidth >= window.innerHeight
  );
  const [scale, setScale] = useState(1);
  const passedRotateRef = useRef(false);

  // Track orientation
  useEffect(() => {
    const check = () => {
      const landscape = window.innerWidth >= window.innerHeight;
      setIsLandscape(landscape);
      if (landscape) {
        // Only scale in landscape to fit content
        const DESIGN_HEIGHT = 600;
        const vScale = Math.min(1, window.innerHeight / DESIGN_HEIGHT);
        const hScale = Math.min(1, window.innerWidth / 1100);
        setScale(Math.min(vScale, hScale));
      } else {
        // In portrait, don't scale — just show rotate prompt at full size
        setScale(1);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    timerRef.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    schedule(() => setPhase("entrance"), 400);
    schedule(() => {
      // After entrance, check orientation
      if (window.innerWidth < window.innerHeight) {
        setPhase("rotate");
      } else {
        passedRotateRef.current = true;
        setPhase("meow");
      }
    }, 2800);

    return () => timerRef.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When orientation changes to landscape and we're stuck on rotate, proceed
  useEffect(() => {
    if (isLandscape && phase === "rotate" && !passedRotateRef.current) {
      passedRotateRef.current = true;
      setPhase("meow");
    }
  }, [isLandscape, phase]);

  // Schedule meow->translated->paper if we skipped rotate
  useEffect(() => {
    if (phase === "meow" && passedRotateRef.current) {
      const t1 = setTimeout(() => setPhase("translated"), 2200);
      return () => clearTimeout(t1);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "translated") {
      const t2 = setTimeout(() => {
        setPhase("paper");
        setShowPaper(true);
      }, 2200);
      return () => clearTimeout(t2);
    }
  }, [phase]);

  const handlePaperClick = async () => {
    if (phase === "paper") {
      const blobUrl = await fetchNonLoopingGif("/uncrumple.gif");
      setUncrumpleSrc(blobUrl);
      setPhase("uncrumpled");
    }
  };

  useEffect(() => {
    return () => {
      if (uncrumpleSrc) URL.revokeObjectURL(uncrumpleSrc);
    };
  }, [uncrumpleSrc]);

  const catInScene = phase !== "blank" && phase !== "uncrumpled" && phase !== "accepted" && phase !== "rejected";

  const rotateText = "meow meow";
  const rotateTranslation = "can you rotate the phone?";
  const meowText = "meow... meow meow meow";
  const translationText = "\"i found this outside with your name on it.\"";

  const rotateTyping = useTypewriter(rotateText, 70, phase === "rotate");
  const rotateTranslationTyping = useTypewriter(rotateTranslation, 40, phase === "rotate");
  const meowTyping = useTypewriter(meowText, 70, phase === "meow" || phase === "translated" || phase === "paper");
  const translationTyping = useTypewriter(translationText, 40, phase === "translated" || phase === "paper");

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{
        cursor: pawCursor,
        background: "#f5e6d3",
        fontFamily: "'Caveat', cursive",
      }}
    >
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
            width: "1100px",
            height: "600px",
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
              width: "360px",
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
            }}
          />
        </div>
      )}

      {/* === ROTATE PHONE PROMPT === */}
      {phase === "rotate" && (
        <div
          className="animate-fade-in absolute"
          style={{
            bottom: "calc(50% + 140px)",
            left: "18%",
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "20px 32px",
              position: "relative",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.1)",
              maxWidth: "420px",
              whiteSpace: "nowrap",
            }}
          >
            <p className="text-3xl text-gray-800">{rotateTyping.displayed}</p>
            <p className="mt-2 text-2xl text-gray-400">
              {rotateTranslationTyping.displayed}
            </p>
            <p className="mt-3 text-center text-4xl">
              &#x1F504;
            </p>
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

      {/* === SPEECH BUBBLE (above cat) === */}
      {(phase === "meow" || phase === "translated" || phase === "paper") && (
        <div
          className="animate-fade-in absolute"
          style={{
            bottom: "calc(50% + 140px)",
            left: "28%",
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "20px 32px",
              position: "relative",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.1)",
              maxWidth: "420px",
              whiteSpace: "nowrap",
            }}
          >
            <p className="text-3xl text-gray-800">{meowTyping.displayed}</p>
            {(phase === "translated" || phase === "paper") && (
              <p className="mt-2 text-2xl text-gray-400">
                {translationTyping.displayed}
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
          style={{
            top: "50%",
            left: "calc(50% - 300px)",
            transform: "translateY(-50%)",
            animation: "paper-appear 0.5s steps(6) forwards",
            zIndex: 15,
          }}
          onClick={handlePaperClick}
        >
          <img
            src="/static_crumpled.gif"
            alt="crumpled paper"
            className="select-none drop-shadow-lg"
            draggable={false}
            style={{
              width: "300px",
              cursor: pawPointer,
              animation: "wiggle 2s ease-in-out infinite",
            }}
          />
          <p className="mt-3 animate-pulse text-center text-2xl text-amber-800/60">
            open it?
          </p>
        </div>
      )}

      {/* === UNCRUMPLED STATE === */}
      {phase === "uncrumpled" && (
        <div
          className="animate-fade-in absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 30 }}
        >
          {/* Paper is the container; text + buttons sit on top */}
          <div
            className="animate-choppy-rock relative"
            style={{ width: "min(100vw, 1500px)" }}
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
                  width: "90px",
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
                  width: "90px",
                  bottom: "15%",
                  right: "18%",
                }}
              />
              <img
                src="/valentine.png"
                alt="Will you be my Valentine?"
                className="max-w-[50%] select-none"
                draggable={false}
                style={{ transform: "rotate(-1.5deg)" }}
              />
              <div className="flex items-center gap-8">
                <button
                  onClick={() => setPhase("accepted")}
                  className="text-3xl font-bold text-pink-900 transition-transform hover:scale-110 md:text-4xl"
                  style={{
                    cursor: pawPointer,
                    transform: "rotate(-2deg)",
                    background: "#fce4ec",
                    border: "2px solid #d4748a",
                    borderRadius:
                      "255px 15px 225px 15px / 15px 225px 15px 255px",
                    padding: "18px 52px",
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
                    if (containerRef.current) {
                      const rect = containerRef.current.getBoundingClientRect();
                      const x = (e.clientX - rect.left) / scale;
                      const y = (e.clientY - rect.top) / scale;
                      setShapePos({ x, y });
                    }
                  }}
                  style={{ cursor: pawPointer }}
                >
                  {!shapePos && (
                    <img
                      src="/shape.png"
                      alt="shape blocking no"
                      className="pointer-events-none absolute select-none"
                      draggable={false}
                      style={{
                        width: "100px",
                        bottom: "5px",
                        left: "50%",
                        transform: "translateX(-25%) rotate(99deg)",
                        filter:
                          "brightness(1.7) drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
                        zIndex: 5,
                      }}
                    />
                  )}
                  <button
                    className="text-3xl font-bold text-gray-400 opacity-50 md:text-4xl"
                    style={{
                      transform: "rotate(2deg)",
                      background: "#f0ede8",
                      border: "2px solid #b0a898",
                      borderRadius:
                        "255px 15px 225px 15px / 15px 225px 15px 255px",
                      padding: "18px 52px",
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
        </div>
      )}

      {/* Shape that flew to cursor */}
      {phase == "uncrumpled" && shapePos && (
        <img
          src="/shape.png"
          alt="shape moved to cursor"
          className="pointer-events-none select-none"
          draggable={false}
          style={{
            position: "absolute",
            left: shapePos.x - 50,
            top: shapePos.y - 50,
            width: "100px",
            transform: "rotate(99deg)",
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
                width: "90px",
                top: "-50px",
                right: "-60px",
                zIndex: -1,                transform: "scaleX(-1)",              }}
            />
            <img
              src="/5EB4F8E0-11A7-4A21-8A94-849F0A5C97A6.png"
              alt="happy cat"
              className="select-none"
              draggable={false}
              style={{
                width: "380px",
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
            <h1 className="text-7xl font-bold text-pink-800 md:text-8xl">
              yayayayayay!!
            </h1>
            <p className="text-4xl text-pink-700">I love you mwah &lt;3</p>
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
              width: "340px",
              border: "3px solid white",
              transform: "rotate(-2deg)",
            }}
          />
          <p
            className="text-3xl text-gray-500"
            style={{ transform: "rotate(1deg)" }}
          >
            did you change your mind?
          </p>
          <button
            onClick={() => window.location.reload()}
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
      </div>{/* end scaled container */}
    </div>
  );
}

export default Valentine;
