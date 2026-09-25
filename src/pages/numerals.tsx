import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ScriptSeed = {
  id: string;
  name: string;
  native: string;
  /** Code point of that script's DIGIT ZERO; the ten digits follow it in order. */
  base: number;
};

type Script = ScriptSeed & { digits: string[] };

const SCRIPT_SEEDS: ScriptSeed[] = [
  { id: "devanagari", name: "Devanagari", native: "देवनागरी", base: 0x0966 },
  { id: "arabic", name: "Arabic (Eastern)", native: "العربية", base: 0x0660 },
  { id: "persian", name: "Persian", native: "فارسی", base: 0x06f0 },
  { id: "bengali", name: "Bengali", native: "বাংলা", base: 0x09e6 },
  { id: "gurmukhi", name: "Gurmukhi", native: "ਗੁਰਮੁਖੀ", base: 0x0a66 },
  { id: "gujarati", name: "Gujarati", native: "ગુજરાતી", base: 0x0ae6 },
  { id: "odia", name: "Odia", native: "ଓଡ଼ିଆ", base: 0x0b66 },
  { id: "tamil", name: "Tamil", native: "தமிழ்", base: 0x0be6 },
  { id: "telugu", name: "Telugu", native: "తెలుగు", base: 0x0c66 },
  { id: "kannada", name: "Kannada", native: "ಕನ್ನಡ", base: 0x0ce6 },
  { id: "malayalam", name: "Malayalam", native: "മലയാളം", base: 0x0d66 },
  { id: "thai", name: "Thai", native: "ไทย", base: 0x0e50 },
  { id: "lao", name: "Lao", native: "ລາວ", base: 0x0ed0 },
  { id: "tibetan", name: "Tibetan", native: "བོད་ཡིག", base: 0x0f20 },
  { id: "myanmar", name: "Burmese", native: "မြန်မာ", base: 0x1040 },
  { id: "khmer", name: "Khmer", native: "ខ្មែរ", base: 0x17e0 },
];

const SCRIPTS: Script[] = SCRIPT_SEEDS.map((seed) => ({
  ...seed,
  digits: Array.from({ length: 10 }, (_, i) => String.fromCodePoint(seed.base + i)),
}));

const SCRIPTS_BY_ID: Record<string, Script> = Object.fromEntries(
  SCRIPTS.map((script) => [script.id, script])
);

type Mode = "read" | "write";
type Question = { scriptId: string; value: number };

const STORAGE_KEY = "numerals-settings";
const DEFAULT_SELECTION = ["devanagari", "arabic", "malayalam"];
const TRAIL_LENGTH = 14;

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

  if (name === "backspace") {
    return <svg {...common}><path d="M9 5h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5.2-6.4a1 1 0 0 1 0-1.2Z" /><path d="m12 10 4 4m0-4-4 4" /></svg>;
  }
  if (name === "skip") {
    return <svg {...common}><path d="M5 12h12m0 0-4.5-4.5M17 12l-4.5 4.5" /><path d="M20 6v12" /></svg>;
  }
  if (name === "reset") {
    return <svg {...common}><path d="M4.5 11a7.5 7.5 0 1 1 2.2 5.3" /><path d="M4 6.5V11h4.5" /></svg>;
  }
  if (name === "chevron") {
    return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  }
  if (name === "eye") {
    return <svg {...common}><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
}

/** Renders a western number using a script's digits. */
function toScript(value: string, script: Script) {
  return value.replace(/\d/g, (digit) => script.digits[Number(digit)]);
}

function randomValue(length: number, avoid?: number) {
  const low = length === 1 ? 0 : Math.pow(10, length - 1);
  const high = Math.pow(10, length) - 1;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const value = low + Math.floor(Math.random() * (high - low + 1));
    if (value !== avoid) return value;
  }
  return low;
}

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      selected?: string[];
      mode?: Mode;
      length?: number;
    };
    const selected = (parsed.selected ?? []).filter((id) => SCRIPTS_BY_ID[id]);
    return {
      selected: selected.length ? selected : DEFAULT_SELECTION,
      mode: parsed.mode === "write" ? "write" : ("read" as Mode),
      length: [1, 2, 3].includes(Number(parsed.length)) ? Number(parsed.length) : 2,
    };
  } catch {
    return null;
  }
}

function Numerals() {
  const stored = useMemo(loadSettings, []);
  const [selected, setSelected] = useState<string[]>(
    stored?.selected ?? DEFAULT_SELECTION
  );
  const [mode, setMode] = useState<Mode>(stored?.mode ?? "read");
  const [length, setLength] = useState(stored?.length ?? 2);

  const [question, setQuestion] = useState<Question | null>(null);
  const [entry, setEntry] = useState("");
  const [status, setStatus] = useState<"idle" | "right" | "wrong">("idle");
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [misses, setMisses] = useState(0);
  const [trail, setTrail] = useState<boolean[]>([]);
  const [stats, setStats] = useState({ correct: 0, attempts: 0, streak: 0, best: 0 });

  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, delay: number) => {
    timers.current.push(window.setTimeout(fn, delay));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
    },
    []
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ selected, mode, length })
      );
    } catch {
      /* storage is a nicety, not a requirement */
    }
  }, [selected, mode, length]);

  const nextQuestion = useCallback(
    (previous?: Question | null) => {
      const pool = selected.length ? selected : DEFAULT_SELECTION;
      const scriptId = pool[Math.floor(Math.random() * pool.length)];
      setQuestion({
        scriptId,
        value: randomValue(length, pool.length === 1 ? previous?.value : undefined),
      });
      setEntry("");
      setStatus("idle");
      setRevealed(false);
      setMisses(0);
      setLocked(false);
    },
    [length, selected]
  );

  // A new deck (different scripts or digit count) starts a fresh question.
  useEffect(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    nextQuestion();
  }, [nextQuestion]);

  const script = question ? SCRIPTS_BY_ID[question.scriptId] : SCRIPTS[0];
  const answer = question ? String(question.value) : "";
  const prompt = question
    ? mode === "read"
      ? toScript(answer, script)
      : answer
    : "";
  const solution = mode === "read" ? answer : toScript(answer, script);

  const commit = useCallback(
    (guess: string) => {
      if (!question || guess.length !== answer.length) return;
      setLocked(true);

      if (guess === answer) {
        setStatus("right");
        setTrail((previous) => [...previous, true].slice(-TRAIL_LENGTH));
        setStats((previous) => {
          const streak = previous.streak + 1;
          return {
            correct: previous.correct + 1,
            attempts: previous.attempts + 1,
            streak,
            best: Math.max(previous.best, streak),
          };
        });
        later(() => nextQuestion(question), 420);
        return;
      }

      setStatus("wrong");
      setMisses((previous) => previous + 1);
      setStats((previous) => ({
        ...previous,
        attempts: previous.attempts + 1,
        streak: 0,
      }));
      later(() => {
        setEntry("");
        setStatus("idle");
        setLocked(false);
      }, 560);
    },
    [answer, later, nextQuestion, question]
  );

  const press = useCallback(
    (digit: string) => {
      if (locked || !question || entry.length >= answer.length) return;
      const next = entry + digit;
      setEntry(next);
      if (next.length === answer.length) commit(next);
    },
    [answer.length, commit, entry, locked, question]
  );

  const backspace = useCallback(() => {
    if (locked) return;
    setEntry((previous) => previous.slice(0, -1));
  }, [locked]);

  const skip = useCallback(() => {
    if (!question) return;
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setRevealed(true);
    setLocked(true);
    setEntry("");
    setStatus("idle");
    setTrail((previous) => [...previous, false].slice(-TRAIL_LENGTH));
    setStats((previous) => ({
      ...previous,
      attempts: previous.attempts + 1,
      streak: 0,
    }));
    later(() => nextQuestion(question), 1400);
  }, [later, nextQuestion, question]);

  // Desktop typing mirrors the pad exactly.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        press(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        backspace();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!locked) setEntry("");
      } else if (event.key === "Enter") {
        event.preventDefault();
        skip();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backspace, locked, press, skip]);

  function toggleScript(id: string) {
    setSelected((previous) => {
      if (previous.includes(id)) {
        // Never leave the deck empty.
        return previous.length === 1 ? previous : previous.filter((item) => item !== id);
      }
      return [...previous, id];
    });
  }

  const accuracy = stats.attempts
    ? Math.round((stats.correct / stats.attempts) * 100)
    : 100;
  const showAnswer = revealed || misses >= 2;
  const slots = Array.from({ length: answer.length });

  return (
    <main className="num-page">
      <section className="num-intro">
        <div>
          <h1>{toScript("123", script)}</h1>
          <p className="num-eyebrow">numerals</p>
        </div>
        <p className="num-description">
          learn to read the world's digits.
        </p>
      </section>

      <section className="num-workspace" aria-label="Numeral practice">
        <div className="num-toolbar">
          <div className="num-stats">
            <span className="num-stat-dot" /> streak {stats.streak}
            <span className="num-stat-divider" /> best {stats.best}
            <span className="num-stat-divider" /> {accuracy}%
          </div>
          <div className="num-actions">
            <div className="num-seg" role="group" aria-label="Direction">
              <button
                className={mode === "read" ? "num-seg-active" : ""}
                onClick={() => setMode("read")}
                aria-pressed={mode === "read"}
              >
                read
              </button>
              <button
                className={mode === "write" ? "num-seg-active" : ""}
                onClick={() => setMode("write")}
                aria-pressed={mode === "write"}
              >
                write
              </button>
            </div>
            <div className="num-seg" role="group" aria-label="Digits per number">
              {[1, 2, 3].map((count) => (
                <button
                  key={count}
                  className={length === count ? "num-seg-active" : ""}
                  onClick={() => setLength(count)}
                  aria-pressed={length === count}
                >
                  {count}
                </button>
              ))}
            </div>
            <button
              className="num-button"
              onClick={() => {
                setStats({ correct: 0, attempts: 0, streak: 0, best: 0 });
                setTrail([]);
                nextQuestion(question);
              }}
            >
              <Icon name="reset" size={15} /> reset
            </button>
          </div>
        </div>

        <div className="num-stage">
          <div className={`num-card num-card-${status}`}>
            <p className="num-script-label">
              {script.name} <span>{script.native}</span>
            </p>

            <button
              className="num-glyph"
              onClick={() => setRevealed((previous) => !previous)}
              title="Tap for the answer"
              aria-label={`Prompt ${prompt}. Tap to reveal the answer.`}
            >
              {prompt}
            </button>

            <div
              className={`num-slots ${status === "wrong" ? "num-slots-wrong" : ""}`}
              aria-live="polite"
            >
              {slots.map((_, index) => {
                const character = entry[index];
                const glyph =
                  character === undefined
                    ? ""
                    : mode === "write"
                    ? script.digits[Number(character)]
                    : character;
                const isActive = index === entry.length && !locked;
                return (
                  <span
                    key={index}
                    className={`num-slot ${glyph ? "num-slot-filled" : ""} ${
                      isActive ? "num-slot-active" : ""
                    }`}
                  >
                    {glyph}
                  </span>
                );
              })}
            </div>

            <p className={`num-answer ${showAnswer ? "num-answer-shown" : ""}`}>
              <Icon name="eye" size={13} /> {showAnswer ? solution : " "}
            </p>
          </div>

          <div className="num-pad" role="group" aria-label="Number pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                className="num-key"
                onClick={() => press(String(digit))}
                disabled={locked}
              >
                {mode === "write" ? script.digits[digit] : String(digit)}
              </button>
            ))}
            <button
              className="num-key num-key-quiet"
              onClick={backspace}
              disabled={locked || !entry.length}
              aria-label="Delete"
            >
              <Icon name="backspace" />
            </button>
            <button
              className="num-key"
              onClick={() => press("0")}
              disabled={locked}
            >
              {mode === "write" ? script.digits[0] : "0"}
            </button>
            <button
              className="num-key num-key-quiet"
              onClick={skip}
              aria-label="Skip and reveal"
            >
              <Icon name="skip" />
            </button>
          </div>
        </div>

        <div className="num-deck">
          <div className="num-deck-head">
            <span>study set</span>
            <div className="num-trail" aria-label="Recent answers">
              {trail.map((wasRight, index) => (
                <span
                  key={index}
                  className={`num-trail-dot ${wasRight ? "num-trail-dot-right" : ""}`}
                />
              ))}
            </div>
          </div>
          <div className="num-chips">
            {SCRIPTS.map((item) => {
              const active = selected.includes(item.id);
              return (
                <button
                  key={item.id}
                  className={`num-chip ${active ? "num-chip-active" : ""}`}
                  onClick={() => toggleScript(item.id)}
                  aria-pressed={active}
                >
                  <span className="num-chip-digits">{item.digits.slice(1, 4).join("")}</span>
                  {item.name.toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="num-hint">
          <span>
            {mode === "read"
              ? "read the numeral, answer in 0–9"
              : "read the number, answer in the script"}
          </span>
          <span className="num-hint-separator">·</span>
          <span>type or tap · backspace to fix · enter to skip</span>
        </div>
      </section>

      <footer className="num-footer">
        <span>sixteen scripts</span>
        <span>nothing leaves this browser</span>
        <a href="/">
          back home <Icon name="chevron" size={14} />
        </a>
      </footer>
    </main>
  );
}

export default Numerals;
