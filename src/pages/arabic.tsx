import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Practice reading Arabic letter by letter: a word is shown with one letter
// picked out, and you type its sound. Letters you know less well come up more.

type Form = "isolated" | "initial" | "medial" | "final";
type Letter = {
  c: string;
  name: string;
  ar: string;
  tr: string;
  sound: string;
  accept: string[];
  related?: { c: string; name: string; tr: string }[];
};

const LETTERS: Letter[] = [
  {
    c: "ا", name: "alif", ar: "ألف", tr: "ā", sound: "Long a, as in father. Also carries hamza, the glottal stop.",
    accept: ["a", "aa", "alef"],
    related: [
      { c: "أ", name: "hamza above", tr: "ʾa / ʾu" },
      { c: "إ", name: "hamza below", tr: "ʾi" },
      { c: "آ", name: "alif madda", tr: "ʾā" },
      { c: "ء", name: "hamza", tr: "ʾ" },
      { c: "لا", name: "lām-alif", tr: "lā" },
    ],
  },
  { c: "ب", name: "bāʾ", ar: "باء", tr: "b", sound: "b, as in bat.", accept: ["ba", "baa"] },
  {
    c: "ت", name: "tāʾ", ar: "تاء", tr: "t", sound: "t, as in tea.", accept: ["ta", "taa"],
    related: [{ c: "ة", name: "tāʾ marbūṭa", tr: "a / at" }],
  },
  { c: "ث", name: "thāʾ", ar: "ثاء", tr: "th", sound: "th, as in think.", accept: ["tha", "thaa"] },
  { c: "ج", name: "jīm", ar: "جيم", tr: "j", sound: "j, as in jam. A hard g in Egypt.", accept: ["g", "dj", "jeem"] },
  { c: "ح", name: "ḥāʾ", ar: "حاء", tr: "ḥ", sound: "A breathy h pushed from deep in the throat.", accept: ["7", "hh", "ha", "haa"] },
  { c: "خ", name: "khāʾ", ar: "خاء", tr: "kh", sound: "kh, like the ch in Scottish loch.", accept: ["x", "5", "kha", "khaa"] },
  { c: "د", name: "dāl", ar: "دال", tr: "d", sound: "d, as in day.", accept: ["da"] },
  { c: "ذ", name: "dhāl", ar: "ذال", tr: "dh", sound: "th, as in this.", accept: ["th", "ḏ", "thal"] },
  { c: "ر", name: "rāʾ", ar: "راء", tr: "r", sound: "A tapped or rolled r.", accept: ["ra", "raa"] },
  { c: "ز", name: "zāy", ar: "زاي", tr: "z", sound: "z, as in zoo.", accept: ["zay", "zain"] },
  { c: "س", name: "sīn", ar: "سين", tr: "s", sound: "s, as in sun.", accept: ["seen"] },
  { c: "ش", name: "shīn", ar: "شين", tr: "sh", sound: "sh, as in shoe.", accept: ["š", "sheen"] },
  { c: "ص", name: "ṣād", ar: "صاد", tr: "ṣ", sound: "A heavy s, with the tongue pulled back.", accept: ["9"] },
  { c: "ض", name: "ḍād", ar: "ضاد", tr: "ḍ", sound: "A heavy d. Arabic is called the language of ḍād.", accept: ["9'"] },
  { c: "ط", name: "ṭāʾ", ar: "طاء", tr: "ṭ", sound: "A heavy t.", accept: ["6"] },
  { c: "ظ", name: "ẓāʾ", ar: "ظاء", tr: "ẓ", sound: "A heavy th, as in this. Often said as z.", accept: ["dh", "6'"] },
  { c: "ع", name: "ʿayn", ar: "عين", tr: "ʿ", sound: "A voiced squeeze in the throat. No English match.", accept: ["3", "ain"] },
  { c: "غ", name: "ghayn", ar: "غين", tr: "gh", sound: "gh, like a gargled French r.", accept: ["ġ", "3'", "ghain"] },
  { c: "ف", name: "fāʾ", ar: "فاء", tr: "f", sound: "f, as in far.", accept: ["fa", "faa"] },
  { c: "ق", name: "qāf", ar: "قاف", tr: "q", sound: "A k made far back in the throat.", accept: ["8"] },
  { c: "ك", name: "kāf", ar: "كاف", tr: "k", sound: "k, as in kite.", accept: [] },
  {
    c: "ل", name: "lām", ar: "لام", tr: "l", sound: "l, as in lamp.", accept: [],
    related: [{ c: "لا", name: "lām-alif", tr: "lā" }],
  },
  { c: "م", name: "mīm", ar: "ميم", tr: "m", sound: "m, as in moon.", accept: ["meem"] },
  { c: "ن", name: "nūn", ar: "نون", tr: "n", sound: "n, as in noon.", accept: ["noon"] },
  {
    c: "ه", name: "hāʾ", ar: "هاء", tr: "h", sound: "h, as in hat.", accept: ["ha", "haa"],
    related: [{ c: "ة", name: "tāʾ marbūṭa", tr: "a / at" }],
  },
  {
    c: "و", name: "wāw", ar: "واو", tr: "w", sound: "w, as in wet, or a long ū, as in moon.", accept: ["u", "uu", "ū", "o", "oo", "v"],
    related: [{ c: "ؤ", name: "hamza on wāw", tr: "ʾ" }],
  },
  {
    c: "ي", name: "yāʾ", ar: "ياء", tr: "y", sound: "y, as in yes, or a long ī, as in ski.", accept: ["i", "ii", "ī", "ee", "e"],
    related: [
      { c: "ى", name: "alif maqṣūra", tr: "ā" },
      { c: "ئ", name: "hamza on yāʾ", tr: "ʾ" },
    ],
  },
];

// Letters that share a shape and differ only in their dots.
const FAMILIES = ["بتثني", "جحخ", "دذ", "رز", "سش", "صض", "طظ", "عغ", "فق"];

const WORDS: [string, string, string][] = [
  ["كتاب", "kitāb", "book"], ["قلم", "qalam", "pen"], ["باب", "bāb", "door"], ["بيت", "bayt", "house"],
  ["شمس", "shams", "sun"], ["قمر", "qamar", "moon"], ["نجم", "najm", "star"], ["بحر", "baḥr", "sea"],
  ["ماء", "māʾ", "water"], ["خبز", "khubz", "bread"], ["حليب", "ḥalīb", "milk"], ["قهوة", "qahwa", "coffee"],
  ["شاي", "shāy", "tea"], ["تفاحة", "tuffāḥa", "apple"], ["موز", "mawz", "bananas"], ["عين", "ʿayn", "eye"],
  ["يد", "yad", "hand"], ["قلب", "qalb", "heart"], ["وجه", "wajh", "face"], ["ولد", "walad", "boy"],
  ["بنت", "bint", "girl"], ["رجل", "rajul", "man"], ["صديق", "ṣadīq", "friend"], ["مدرسة", "madrasa", "school"],
  ["مدينة", "madīna", "city"], ["سوق", "sūq", "market"], ["طريق", "ṭarīq", "road"], ["سيارة", "sayyāra", "car"],
  ["طائرة", "ṭāʾira", "airplane"], ["مطار", "maṭār", "airport"], ["شجرة", "shajara", "tree"], ["زهرة", "zahra", "flower"],
  ["ورد", "ward", "roses"], ["جبل", "jabal", "mountain"], ["نهر", "nahr", "river"], ["صحراء", "ṣaḥrāʾ", "desert"],
  ["مطر", "maṭar", "rain"], ["ثلج", "thalj", "snow"], ["ريح", "rīḥ", "wind"], ["نار", "nār", "fire"],
  ["ليل", "layl", "night"], ["صباح", "ṣabāḥ", "morning"], ["مساء", "masāʾ", "evening"], ["يوم", "yawm", "day"],
  ["شهر", "shahr", "month"], ["وقت", "waqt", "time"], ["كلب", "kalb", "dog"], ["قطة", "qiṭṭa", "cat"],
  ["حصان", "ḥiṣān", "horse"], ["جمل", "jamal", "camel"], ["أسد", "asad", "lion"], ["طير", "ṭayr", "birds"],
  ["سمك", "samak", "fish"], ["ذهب", "dhahab", "gold"], ["فضة", "fiḍḍa", "silver"], ["ضوء", "ḍawʾ", "light"],
  ["ظل", "ẓill", "shade"], ["ظهر", "ẓuhr", "noon"], ["غرفة", "ghurfa", "room"], ["غداء", "ghadāʾ", "lunch"],
  ["عشاء", "ʿashāʾ", "dinner"], ["فطور", "fuṭūr", "breakfast"], ["لغة", "lugha", "language"], ["عربي", "ʿarabī", "Arabic"],
  ["كلمة", "kalima", "word"], ["حرف", "ḥarf", "letter"], ["سلام", "salām", "peace"], ["شكرا", "shukran", "thank you"],
  ["مرحبا", "marḥaban", "hello"], ["حب", "ḥubb", "love"], ["جميل", "jamīl", "beautiful"], ["كبير", "kabīr", "big"],
  ["صغير", "ṣaghīr", "small"], ["جديد", "jadīd", "new"], ["قديم", "qadīm", "old"], ["سعيد", "saʿīd", "happy"],
  ["بارد", "bārid", "cold"], ["حار", "ḥārr", "hot"], ["ثوب", "thawb", "robe"], ["ثلاثة", "thalātha", "three"],
  ["واحد", "wāḥid", "one"], ["اثنان", "ithnān", "two"], ["خمسة", "khamsa", "five"], ["عشرة", "ʿashara", "ten"],
  ["ذراع", "dhirāʿ", "arm"], ["أذن", "udhun", "ear"], ["ضيف", "ḍayf", "guest"], ["ظرف", "ẓarf", "envelope"],
  ["نظارة", "naẓẓāra", "glasses"], ["مفتاح", "miftāḥ", "key"], ["طاولة", "ṭāwila", "table"], ["كرسي", "kursī", "chair"],
  ["نافذة", "nāfidha", "window"], ["مسجد", "masjid", "mosque"], ["مكتبة", "maktaba", "library"], ["دفتر", "daftar", "notebook"],
  ["خريطة", "kharīṭa", "map"], ["زيت", "zayt", "oil"], ["زيتون", "zaytūn", "olives"], ["عسل", "ʿasal", "honey"],
  ["ملح", "milḥ", "salt"], ["سكر", "sukkar", "sugar"], ["لحم", "laḥm", "meat"], ["رز", "ruzz", "rice"],
  ["نخلة", "nakhla", "palm tree"], ["واحة", "wāḥa", "oasis"], ["قصر", "qaṣr", "palace"], ["مصر", "miṣr", "Egypt"],
  ["غزال", "ghazāl", "gazelle"], ["ضفدع", "ḍifdaʿ", "frog"], ["بطيخ", "baṭṭīkh", "watermelon"], ["فجر", "fajr", "dawn"],
  ["بلد", "balad", "country"], ["شارع", "shāriʿ", "street"], ["جامعة", "jāmiʿa", "university"], ["طبيب", "ṭabīb", "doctor"],
  ["حديقة", "ḥadīqa", "garden"], ["مطبخ", "maṭbakh", "kitchen"], ["سماء", "samāʾ", "sky"], ["أرض", "arḍ", "earth"],
  ["بيض", "bayḍ", "eggs"], ["خيمة", "khayma", "tent"], ["فنجان", "finjān", "cup"], ["هدية", "hadiyya", "gift"],
  ["هلال", "hilāl", "crescent"], ["نور", "nūr", "light"], ["فيل", "fīl", "elephant"], ["دجاج", "dajāj", "chicken"],
  ["ثعلب", "thaʿlab", "fox"], ["عصفور", "ʿuṣfūr", "sparrow"], ["فراشة", "farāsha", "butterfly"], ["كتب", "kutub", "books"],
  ["كثير", "kathīr", "many"], ["حديث", "ḥadīth", "modern"], ["تراث", "turāth", "heritage"], ["صوت", "ṣawt", "voice"],
  ["صاروخ", "ṣārūkh", "rocket"], ["دروس", "durūs", "lessons"], ["عرش", "ʿarsh", "throne"], ["ريش", "rīsh", "feathers"],
  ["قميص", "qamīṣ", "shirt"], ["رصاص", "raṣāṣ", "lead"], ["شرط", "sharṭ", "condition"], ["خط", "khaṭṭ", "line"],
  ["حظ", "ḥaẓẓ", "luck"], ["ربيع", "rabīʿ", "spring"], ["فراغ", "farāgh", "emptiness"], ["دماغ", "dimāgh", "brain"],
  ["مبلغ", "mablagh", "amount"], ["ملوك", "mulūk", "kings"], ["فواكه", "fawākih", "fruit"], ["بنات", "banāt", "girls"], ["مياه", "miyāh", "waters"],
  ["مستشفى", "mustashfā", "hospital"], ["الأحساء", "al-Aḥsāʾ", "al-Ahsa"], ["واحة النخيل", "wāḥat an-nakhīl", "oasis of palms"],
];

const ZWJ = "‍";
const TATWEEL = "ـ";
const ALEFS = new Set(["ا", "أ", "إ", "آ"]);
// Letters that join to the letter after them; every other letter only joins
// to the one before (or, for hamza, to neither).
const DUAL = new Set(Array.from("بتثجحخسشصضطظعغفقكلمنهيىئـ"));
const RIGHT = new Set(Array.from("اأإآدذرزوؤة"));
const joinsNext = (c: string | undefined) => !!c && DUAL.has(c);
const joinsPrev = (c: string | undefined) => !!c && (DUAL.has(c) || RIGHT.has(c));

const BY_CHAR = new Map(LETTERS.map((l) => [l.c, l]));
// Variants open the sheet of the letter they're written on.
const BASE: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ء": "ا", "ة": "ت", "ى": "ي", "ئ": "ي", "ؤ": "و" };
const baseOf = (c: string) => BASE[c] ?? c;

type Cluster = { text: string; letter: string; start: number; form: Form; target: boolean };

// Splits a word into letters, keeping lām-alif together as the ligature it is
// drawn as, and works out which form each letter takes.
function clustersOf(word: string): Cluster[] {
  const out: Cluster[] = [];
  let i = 0;
  while (i < word.length) {
    const c = word[i];
    const lamAlif = c === "ل" && ALEFS.has(word[i + 1]);
    const end = i + (lamAlif ? 2 : 1);
    const prev = joinsPrev(c) && joinsNext(word[i - 1]);
    const next = joinsNext(word[end - 1]) && joinsPrev(word[end]);
    out.push({
      text: word.slice(i, end),
      letter: baseOf(c),
      start: i,
      form: prev && next ? "medial" : prev ? "final" : next ? "initial" : "isolated",
      target: !lamAlif && BY_CHAR.has(c),
    });
    i = end;
  }
  return out;
}

const CLUSTERS = WORDS.map(([word]) => clustersOf(word));
// Every place each letter can be asked about.
const SPOTS = new Map<string, { w: number; k: number }[]>(LETTERS.map((l) => [l.c, []]));
CLUSTERS.forEach((clusters, w) => clusters.forEach((cl, k) => cl.target && SPOTS.get(cl.text)!.push({ w, k })));

const FORMS: Form[] = ["isolated", "initial", "medial", "final"];
const FORM_LABEL: Record<Form, string> = { isolated: "Alone", initial: "Beginning", medial: "Middle", final: "End" };
const formGlyph = (c: string, form: Form) => {
  const dual = DUAL.has(c);
  if (form === "initial") return dual ? c + TATWEEL : c;
  if (form === "medial") return TATWEEL + c + (dual ? TATWEEL : "");
  if (form === "final") return TATWEEL + c;
  return c;
};
const exampleFor = (c: string, form: Form) => {
  const spots = SPOTS.get(c)!.filter((s) => CLUSTERS[s.w][s.k].form === form);
  return spots.sort((a, b) => WORDS[a.w][0].length - WORDS[b.w][0].length)[0];
};

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[’‘`´ʿʾʻʕ]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s.-]/g, "");
const ANSWERS = new Map(
  LETTERS.map((l) => [l.c, new Set([l.tr, l.name, ...l.accept].map(normalize).concat(normalize(l.name).replace(/'/g, "")))])
);

// Proficiency is how many of a letter's last eight first attempts were right.
const WINDOW = 8;
type Progress = Record<string, string>;
const hits = (record: string) => record.split("").filter((r) => r === "1").length;
const proficiency = (p: Progress, c: string) => hits(p[c] ?? "") / WINDOW;
// For colour, the share of the answers actually given — a letter seen twice and
// right twice is doing well, even though the window isn't full yet.
const rate = (record: string) => (record ? hits(record) / record.length : 0);
const levelOf = (p: Progress, c: string) => {
  const seen = (p[c] ?? "").length;
  const prof = proficiency(p, c);
  return seen === 0 ? "new" : prof >= 7 / 8 ? "mastered" : prof >= 0.5 ? "familiar" : "learning";
};

type Question = { n: number; w: number; k: number };
function pick(progress: Progress, n: number, avoid: number[]): Question {
  const weights = LETTERS.map((l) => ((progress[l.c] ?? "").length === 0 ? 1.3 : 0.12 + (1 - proficiency(progress, l.c)) * 1.2));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  let i = 0;
  while (i < LETTERS.length - 1 && (r -= weights[i]) > 0) i++;
  const all = SPOTS.get(LETTERS[i].c)!;
  const fresh = all.filter((s) => !avoid.includes(s.w));
  const spot = (fresh.length ? fresh : all)[Math.floor(Math.random() * (fresh.length || all.length))];
  return { n, ...spot };
}

// The carousel reads right to left: upcoming words wait on the left and
// finished ones slide off to the right. Answered cards are kept around so you
// can swipe back through them.
const AHEAD = 3;
const BEHIND = 12;
const CARD_OPACITY: Record<number, number> = { [-2]: 0.14, [-1]: 0.4, 0: 1, 1: 0.45, 2: 0.16 };
function extend(deck: Question[], progress: Progress, upTo: number) {
  const next = [...deck];
  while (next[next.length - 1].n < upTo) {
    next.push(pick(progress, next[next.length - 1].n + 1, next.slice(-4).map((q) => q.w)));
  }
  return next;
}

const STORE = "arabic-letters-v1";
function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Every number on the page can be written in any of three sets of digits.
// Clicking one of them cycles through: nothing says so, it is there to be found.
type Digits = "west" | "arab" | "deva";
const DIGITS: Record<Digits, { set: string; percent: string }> = {
  west: { set: "0123456789", percent: "%" },
  arab: { set: "٠١٢٣٤٥٦٧٨٩", percent: "٪" },
  deva: { set: "०१२३४५६७८९", percent: "%" },
};
const NEXT_DIGITS: Record<Digits, Digits> = { west: "arab", arab: "deva", deva: "west" };
const pad = (n: number) => String(n).padStart(2, "0");

// The hands a word can be written in.
type Script = "naskh" | "ruqa" | "amiri" | "kufi" | "modern";
const SCRIPTS: [Script, string][] = [
  ["naskh", "naskh"],
  ["ruqa", "ruqʿa"],
  ["amiri", "amiri"],
  ["kufi", "kufi"],
  ["modern", "modern"],
];
const FONTS =
  "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@400;500&family=Noto+Naskh+Arabic:wght@400;500&family=Reem+Kufi:wght@400;500&display=swap";

const prefersDark = () => {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
};

// Keeps a modal mounted for the length of its fade-out, so closing one is as
// gentle as opening it.
function useClosing<T>(value: T | null, ms: number) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value) {
      setShown(value);
      return;
    }
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), ms);
    return () => window.clearTimeout(timer);
  }, [value, shown, ms]);
  return [shown, !value && !!shown] as const;
}

const SUN = "M12 4.5v-2M12 21.5v-2M4.5 12h-2M21.5 12h-2M6.7 6.7 5.3 5.3M18.7 18.7l-1.4-1.4M6.7 17.3l-1.4 1.4M18.7 5.3l-1.4 1.4";
function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4.2" />
          <path d={SUN} />
        </>
      ) : (
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      )}
    </svg>
  );
}

// Each letter is its own span so it can be tapped. Zero-width joiners on
// either side of a split keep the letters drawn in their joined forms.
function Word({
  w,
  highlight,
  onLetter,
  size,
}: {
  w: number;
  highlight: number | null;
  onLetter?: (letter: string, form: Form, k: number) => void;
  size?: number;
}) {
  const clusters = CLUSTERS[w];
  const word = WORDS[w][0];
  const len = word.replace(/ /g, "").length + (word.includes(" ") ? 1 : 0);
  return (
    <span className="ar-word" dir="rtl" lang="ar" style={size ? { fontSize: size } : ({ "--len": len } as React.CSSProperties)}>
      {clusters.map((cl, k) => {
        const before = cl.form === "medial" || cl.form === "final" ? ZWJ : "";
        const after = cl.form === "medial" || cl.form === "initial" ? ZWJ : "";
        if (cl.text === " ") return " ";
        return (
          <span
            key={k}
            className={`ar-letter${k === highlight ? " ar-letter-hl" : ""}${onLetter ? " ar-letter-tap" : ""}`}
            onClick={onLetter ? () => onLetter(cl.letter, cl.form, k) : undefined}
          >
            {before + cl.text + after}
          </span>
        );
      })}
    </span>
  );
}

function Dots({ record }: { record: string }) {
  const cells = Array.from({ length: WINDOW }, (_, i) => record[i - (WINDOW - record.length)]);
  return (
    <span className="ar-dots" aria-hidden>
      {cells.map((r, i) => (
        <i key={i} className={r === "1" ? "ar-dot-hit" : r === "0" ? "ar-dot-miss" : undefined} />
      ))}
    </span>
  );
}

type Status = "asking" | "right" | "revealed";

function Arabic() {
  const [progress, setProgress] = useState<Progress>(() => load(STORE, {} as Progress));
  const [prefs, setPrefs] = useState(() =>
    load(`${STORE}-prefs`, { script: "naskh" as Script, digits: "west" as Digits, best: 0, dark: prefersDark() })
  );
  const [deck, setDeck] = useState<Question[]>(() => extend([pick(progress, 0, [])], progress, AHEAD));
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState<Status>("asking");
  const [missed, setMissed] = useState(0);
  const [peeked, setPeeked] = useState(false);
  const [guess, setGuess] = useState("");
  const [shake, setShake] = useState(0);
  const [streak, setStreak] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const [sheet, setSheet] = useState<{ c: string; form?: Form; variant?: string } | null>(null);

  // The furthest question reached. Anything before it has been answered and can
  // be swiped back to; nothing past it is reachable until it is answered.
  const [peak, setPeak] = useState(0);
  const reviewing = current < peak;

  // Numbers are written in whichever digits are picked, and any of them can be
  // clicked to move on to the next set.
  const digits = DIGITS[prefs.digits] ?? DIGITS.west;
  const num = (n: number | string) => String(n).replace(/[0-9]/g, (d) => digits.set[Number(d)]);
  const cycleDigits = () => setPrefs((p) => ({ ...p, digits: NEXT_DIGITS[p.digits] ?? "arab" }));

  const inputRef = useRef<HTMLInputElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const question = deck.find((q) => q.n === current)!;
  const cluster = CLUSTERS[question.w][question.k];
  const letter = BY_CHAR.get(cluster.text)!;
  const [word] = WORDS[question.w];

  useEffect(() => save(STORE, progress), [progress]);
  useEffect(() => save(`${STORE}-prefs`, prefs), [prefs]);

  useEffect(() => {
    const title = document.title;
    document.title = "ḥurūf — mano";
    const id = "ar-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = FONTS;
      document.head.appendChild(link);
    }
    return () => {
      document.title = title;
    };
  }, []);

  const record = (c: string, right: boolean) => {
    setProgress((p) => ({ ...p, [c]: ((p[c] ?? "") + (right ? "1" : "0")).slice(-WINDOW) }));
    const next = right ? streak + 1 : 0;
    setStreak(next);
    if (next > prefs.best) setPrefs((p) => ({ ...p, best: next }));
  };

  const advance = useCallback(() => {
    const n = peak + 1;
    setDeck((d) => extend(d.filter((q) => q.n >= n - BEHIND), progress, n + AHEAD));
    setPeak(n);
    setCurrent(n);
    setStatus("asking");
    setMissed(0);
    setPeeked(false);
    setGuess("");
    setShake(0);
  }, [peak, progress]);

  // Stepping through cards that already exist. The question in play keeps its
  // state while you look back, so coming forward picks it up untouched.
  const goTo = useCallback(
    (n: number) => setCurrent(Math.max(deck[0].n, Math.min(n, peak))),
    [deck, peak]
  );

  // A right answer moves on by itself after a moment, but not while you are
  // looking back through old cards.
  useEffect(() => {
    if (status !== "right" || reviewing) return;
    const timer = window.setTimeout(advance, 1100);
    return () => window.clearTimeout(timer);
  }, [status, reviewing, advance]);

  const reveal = () => {
    if (status !== "asking") return;
    if (!missed && !peeked) record(letter.c, false);
    setStatus("revealed");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewing) return setCurrent(peak);
    if (status !== "asking") return advance();
    if (!normalize(guess)) return;
    if (ANSWERS.get(letter.c)!.has(normalize(guess))) {
      if (!missed && !peeked) record(letter.c, true);
      setStatus("right");
      return;
    }
    if (!missed && !peeked) record(letter.c, false);
    setMissed((m) => m + 1);
    setShake((s) => s + 1);
    inputRef.current?.select();
    if (missed + 1 >= 3) setStatus("revealed");
  };

  const openLetter = (c: string, form?: Form, variant?: string) => setSheet({ c, form, variant });
  const tapLetter = (c: string, form: Form, k: number) => {
    // Looking up the letter being asked about means this one won't count. Old
    // cards are already answered, so looking at those is free.
    if (k === question.k && status === "asking" && !reviewing) setPeeked(true);
    const text = CLUSTERS[question.w][k].text;
    openLetter(c, form, text !== c ? text : undefined);
  };

  // Desktop focuses the answer box; on touch the keyboard waits for a tap.
  useEffect(() => {
    if (!browsing && !sheet && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [current, browsing, sheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sheet) setSheet(null);
        else if (browsing) setBrowsing(false);
        return;
      }
      if (sheet || browsing) return;
      // Only when there is nothing to move a caret through, so the arrows still
      // belong to the answer box while you are typing in it.
      if (guess && !reviewing) return;
      if (e.key === "ArrowRight") goTo(current + 1);
      else if (e.key === "ArrowLeft") goTo(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, browsing, guess, reviewing, current, goTo]);

  // Swipe (or drag) the deck sideways: towards the right pulls the next card
  // over from the left, the way the writing runs.
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragTo = (dx: number) => {
    deckRef.current?.style.setProperty("--drag", `${dx.toFixed(1)}px`);
  };
  const onSwipeStart = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    swipe.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onSwipeMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.moved) {
      if (Math.abs(dx) < 8 || Math.abs(e.clientY - s.y) > Math.abs(dx)) return;
      s.moved = true;
      // A drag across a word would otherwise leave a selection behind it.
      window.getSelection()?.removeAllRanges();
      deckRef.current?.classList.add("ar-dragging");
    }
    dragTo(dx * 0.42);
  };
  const onSwipeEnd = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    deckRef.current?.classList.remove("ar-dragging");
    dragTo(0);
    if (!s.moved) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) >= 44) goTo(current + (dx > 0 ? 1 : -1));
  };

  // The deck leans a little towards the cursor.
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !worldRef.current) return;
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    worldRef.current.style.setProperty("--tilt-x", `${(-y * 5).toFixed(2)}deg`);
    worldRef.current.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
  };

  const counts = useMemo(() => {
    const c = { new: 0, learning: 0, familiar: 0, mastered: 0 };
    LETTERS.forEach((l) => c[levelOf(progress, l.c)]++);
    return c;
  }, [progress]);
  const seen = LETTERS.reduce((sum, l) => sum + (progress[l.c] ?? "").length, 0);
  const right = LETTERS.reduce((sum, l) => sum + (progress[l.c] ?? "").split("").filter((r) => r === "1").length, 0);

  const answered = status !== "asking";
  const detail = `${letter.tr} · ${letter.name}, ${FORM_LABEL[cluster.form].toLowerCase()} form`;
  let feedback: React.ReactNode = "Type the sound of the dark letter";
  if (reviewing) feedback = <>Looking back at {num(pad((current % 100) + 1))} — {detail}</>;
  else if (status === "right") feedback = <>Right — {detail}</>;
  else if (status === "revealed") feedback = <>{detail} · enter for next</>;
  else if (missed) feedback = <>Not quite{missed > 1 ? ", one more try" : " — try again"}</>;
  else if (peeked) feedback = "Looked up · this one won't count";

  // Both overlays outlive their state a moment so they can fade out.
  const [panel, panelOut] = useClosing(browsing || null, 460);
  const [openSheet, sheetOut] = useClosing(sheet, 320);
  const sheetLetter = openSheet ? BY_CHAR.get(openSheet.c)! : null;
  const sheetRecord = sheetLetter ? progress[sheetLetter.c] ?? "" : "";
  const family = sheetLetter ? FAMILIES.find((f) => f.includes(sheetLetter.c)) : undefined;

  return (
    <div
      className={`ar-root ar-${prefs.script} ar-${prefs.digits}${prefs.dark ? " ar-dark" : ""}${browsing ? " ar-browsing" : ""}`}
      onPointerMove={onPointerMove}
    >
      <div
        className="ar-scene"
        onPointerDown={onSwipeStart}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeEnd}
        onPointerLeave={onSwipeEnd}
        onPointerCancel={onSwipeEnd}
      >
        <div className="ar-world" ref={worldRef}>
          <div className="ar-backdrop" />
          <div className="ar-deck" ref={deckRef}>
            {deck.map((q) => {
              const k = q.n - current;
              const active = k === 0;
              // Cards behind the furthest one reached have all been answered.
              const done = q.n < peak || (q.n === peak && answered);
              const form = CLUSTERS[q.w][q.k].form;
              return (
                <div
                  key={q.n}
                  className={`ar-card${active ? " ar-card-active" : ""}`}
                  style={
                    {
                      "--k": k,
                      "--a": Math.abs(k),
                      "--s": Math.sign(k),
                      opacity: CARD_OPACITY[k] ?? 0,
                      zIndex: 10 - Math.abs(k),
                    } as React.CSSProperties
                  }
                  aria-hidden={!active}
                >
                  <div
                    className={`ar-card-body${done ? " ar-card-done" : ""}${active && shake && !reviewing ? " ar-shake" : ""}`}
                    key={active && !reviewing ? shake : undefined}
                  >
                    <span
                      className={`ar-card-index ar-num${active ? " ar-num-tap" : ""}`}
                      onClick={active ? cycleDigits : undefined}
                      title="Numerals"
                    >
                      {num(pad((q.n % 100) + 1))}
                    </span>
                    {done && <span className="ar-card-form">{FORM_LABEL[form]}</span>}
                    <div className="ar-card-word">
                      <Word w={q.w} highlight={active || done ? q.k : null} onLetter={active ? tapLetter : undefined} />
                    </div>
                    <div className="ar-card-gloss">
                      {done ? (
                        <>
                          {WORDS[q.w][1]}
                          <span>{WORDS[q.w][2]}</span>
                        </>
                      ) : (
                        <span className="ar-card-ellipsis">· · ·</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <form className="ar-dock" onSubmit={submit}>
        <div
          className={`ar-field${status === "right" && !reviewing ? " ar-field-right" : ""}${
            missed && !reviewing ? " ar-field-missed" : ""
          }${reviewing ? " ar-field-back" : ""}`}
        >
          <span className="ar-field-glyph" lang="ar">{formGlyph(letter.c, cluster.form)}</span>
          <input
            ref={inputRef}
            value={reviewing || answered ? (status === "right" && !reviewing ? guess : letter.tr) : guess}
            onChange={(e) => setGuess(e.target.value)}
            readOnly={reviewing || answered}
            placeholder="Its sound, e.g. b, th, kh"
            aria-label={`Sound of the highlighted letter in ${word}`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint={reviewing || answered ? "next" : "done"}
          />
          {reviewing ? (
            <button type="submit" className="ar-field-go ar-field-next">
              Catch up →
            </button>
          ) : status === "asking" ? (
            <>
              <button type="button" className="ar-field-quiet" onClick={reveal}>
                Show
              </button>
              <button type="submit" className="ar-field-go" aria-label="Check">
                →
              </button>
            </>
          ) : (
            <button type="submit" className="ar-field-go ar-field-next">
              Next →
            </button>
          )}
        </div>
        <p className="ar-feedback" key={`${current}-${status}-${missed}`}>
          {feedback}
        </p>
      </form>

      <nav className="ar-top">
        <a className="ar-box ar-brand" href="/">
          mano
        </a>
        <button className={`ar-box${!browsing ? " ar-box-active" : ""}`} onClick={() => setBrowsing(false)}>
          Practice
        </button>
        <button className={`ar-box${browsing ? " ar-box-active" : ""}`} onClick={() => setBrowsing(true)}>
          Letters
          <sup className="ar-num">
            {num(counts.mastered)}/{num(LETTERS.length)}
          </sup>
        </button>
        <div className="ar-box ar-seg" role="group" aria-label="Script style">
          {SCRIPTS.map(([s, label]) => (
            <button
              key={s}
              className={prefs.script === s ? "ar-seg-active" : undefined}
              onClick={() => setPrefs((p) => ({ ...p, script: s }))}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="ar-box ar-icon"
          onClick={() => setPrefs((p) => ({ ...p, dark: !p.dark }))}
          aria-label={prefs.dark ? "Switch to light" : "Switch to dark"}
          title={prefs.dark ? "Light" : "Dark"}
        >
          <ThemeIcon dark={prefs.dark} />
        </button>
      </nav>

      <div className="ar-bottom">
        <span className="ar-box ar-box-small">
          Streak <b className="ar-num ar-num-tap" onClick={cycleDigits} title="Numerals">{num(pad(streak))}</b>
        </span>
        <span className="ar-box ar-box-small ar-hide-narrow">
          Best <b className="ar-num ar-num-tap" onClick={cycleDigits} title="Numerals">{num(pad(prefs.best))}</b>
        </span>
        <span className="ar-box ar-box-small ar-hide-narrow">
          Recent <b className="ar-num ar-num-tap" onClick={cycleDigits} title="Numerals">
            {num(seen ? Math.round((right / seen) * 100) : 0)}
            {digits.percent}
          </b>
        </span>
        {prefs.digits !== "west" && (
          <a className="ar-box ar-box-small ar-numerals" href="/numerals">
            Can't read{" "}
            <b className="ar-num">
              {num(7)} {num(8)} {num(9)}
            </b>
          </a>
        )}
      </div>
      <div className="ar-hint">Tap any letter for its forms · swipe the deck to look back</div>

      {panel && <div className={`ar-veil${panelOut ? " ar-veil-out" : ""}`} onClick={() => setBrowsing(false)} />}
      {panel && (
        <section className={`ar-panel${panelOut ? " ar-panel-out" : ""}`} aria-label="Letters">
          <header className="ar-panel-head">
            <div>
              <h2>Letters</h2>
              <p>
                {num(counts.mastered)} mastered · {num(counts.familiar)} familiar · {num(counts.learning)} learning ·{" "}
                {num(counts.new)} new
              </p>
            </div>
            <button
              className="ar-link"
              onClick={() => window.confirm("Clear your progress on every letter?") && setProgress({})}
            >
              Reset
            </button>
          </header>
          <div className="ar-grid" dir="rtl">
            {LETTERS.map((l, i) => {
              const record = progress[l.c] ?? "";
              return (
                <button
                  key={l.c}
                  className={`ar-tile ar-tile-${levelOf(progress, l.c)}${record ? " ar-tile-seen" : ""}`}
                  style={{ animationDelay: `${i * 14}ms`, "--ar-p": rate(record).toFixed(2) } as React.CSSProperties}
                  onClick={() => openLetter(l.c)}
                >
                  <span className="ar-tile-glyph" lang="ar">{l.c}</span>
                  <span className="ar-tile-tr" dir="ltr">{l.tr}</span>
                  <Dots record={record} />
                </button>
              );
            })}
          </div>
          <p className="ar-panel-note">
            <i aria-hidden />
            Each row of dots is a letter's last eight answers, and the wash runs red where they went badly to green where
            they went well. Weaker letters come up more often.
          </p>
        </section>
      )}

      {sheetLetter && (
        <div className={`ar-veil ar-veil-top${sheetOut ? " ar-veil-out" : ""}`} onClick={() => setSheet(null)} />
      )}
      {sheetLetter && (
        <section
          className={`ar-sheet${sheetOut ? " ar-sheet-out" : ""}${sheetRecord ? " ar-sheet-seen" : ""}`}
          style={{ "--ar-p": rate(sheetRecord).toFixed(2) } as React.CSSProperties}
          aria-label={`The letter ${sheetLetter.name}`}
          key={sheetLetter.c}
        >
          <button className="ar-sheet-close" onClick={() => setSheet(null)} aria-label="Close">
            ×
          </button>
          <header className="ar-sheet-head">
            <span className="ar-sheet-glyph" lang="ar">{sheetLetter.c}</span>
            <div>
              <h2>
                {sheetLetter.name} <span lang="ar">{sheetLetter.ar}</span>
              </h2>
              <p className="ar-sheet-tr">{sheetLetter.tr}</p>
              <p className="ar-sheet-sound">{sheetLetter.sound}</p>
              <Dots record={sheetRecord} />
            </div>
          </header>

          <h3>Forms</h3>
          <div className="ar-forms" dir="rtl">
            {FORMS.map((form) => {
              const ex = exampleFor(sheetLetter.c, form);
              return (
                <div key={form} className={`ar-form${openSheet?.form === form && !openSheet.variant ? " ar-form-current" : ""}`}>
                  <span className="ar-form-glyph" lang="ar">{formGlyph(sheetLetter.c, form)}</span>
                  <span className="ar-form-label" dir="ltr">{FORM_LABEL[form]}</span>
                  {ex && (
                    <span className="ar-form-ex" dir="ltr">
                      <Word w={ex.w} highlight={ex.k} size={22} />
                      <span>{WORDS[ex.w][1]}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {!DUAL.has(sheetLetter.c) && (
            <p className="ar-sheet-note">
              {sheetLetter.name} never joins the letter after it, so it starts and ends a word the same way.
            </p>
          )}

          {sheetLetter.related && (
            <>
              <h3>Other versions</h3>
              <div className="ar-related" dir="rtl">
                {sheetLetter.related.map((r) => (
                  <div key={r.c} className={`ar-rel${openSheet?.variant === r.c ? " ar-form-current" : ""}`}>
                    <span className="ar-rel-glyph" lang="ar">{r.c}</span>
                    <span dir="ltr">
                      {r.name}
                      <b>{r.tr}</b>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {family && (
            <>
              <h3>Same shape, different dots</h3>
              <div className="ar-family" dir="rtl">
                {Array.from(family).map((c) => {
                  const l = BY_CHAR.get(c)!;
                  return (
                    <button
                      key={c}
                      className={c === sheetLetter.c ? "ar-family-self" : undefined}
                      onClick={() => openLetter(c)}
                    >
                      <span lang="ar">{formGlyph(c, "initial")}</span>
                      <em dir="ltr">{l.tr}</em>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default Arabic;
