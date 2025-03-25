import React from "react";

const letterPairs = [
  ["क", "ka"],
  ["ख", "kha"],
  ["ग", "ga"],
  ["घ", "gha"],
  ["ङ", "nga"],
  ["च", "cha"],
  ["छ", "chha"],
  ["ज", "ja"],
  ["झ", "jha"],
  ["ञ", "nya"],
  ["ट", "ta"],
  ["ठ", "tha"],
  ["ड", "da"],
  ["ढ", "dha"],
  ["ण", "na"],
  ["त", "ta"],
  ["थ", "tha"],
  ["द", "da"],
  ["ध", "dha"],
  ["न", "na"],
  ["प", "pa"],
  ["फ", "pha"],
  ["ब", "ba"],
  ["भ", "bha"],
  ["म", "ma"],
  ["य", "ya"],
  ["र", "ra"],
  ["ल", "la"],
  ["व", "va"],
  ["श", "sha"],
  ["ष", "sa"],
  ["स", "sa"],
  ["ह", "ha"],
  ["ऋ", "ri"],
  ["अ", "a"],
  ["आ", "aa"],
  ["इ", "i"],
  ["ई", "ii"],
  ["उ", "u"],
  ["ऊ", "uu"],
  ["ऋ", "ri"],
  ["ए", "e"],
  ["ऐ", "ai"],
  ["ओ", "o"],
  ["औ", "au"],
  ["अं", "am"],
  ["अः", "ah"],
];

interface Guess {
  letterPair: string[];
  numWrongGuesses: number;
  instantWhenStarted: Date;
}

function Hindi() {
  const [currentLetterIdx, setCurrentLetterIdx] = React.useState(0);
  const [showHint, setShowHint] = React.useState(false);
  const [mode, setMode] = React.useState("hindiToEnglish"); // "hindiToEnglish" or "englishToHindi"
  const [history, setHistory] = React.useState<Guess[]>([]);
  const [isWrongGuess, setIsWrongGuess] = React.useState(false);
  const [numWrongGuesses, setNumWrongGuesses] = React.useState(0);
  const [instantWhenStarted, setInstantWhenStarted] = React.useState(
    new Date()
  );

  function randomLetter() {
    const randomIndex = Math.floor(Math.random() * letterPairs.length);
    setCurrentLetterIdx(randomIndex);
  }

  function onGuess(guess: string) {
    const correctAnswer =
      mode === "hindiToEnglish"
        ? letterPairs[currentLetterIdx][1]
        : letterPairs[currentLetterIdx][0];
    if (guess.trim().toLowerCase() === correctAnswer.toLowerCase()) {
      randomLetter();
      return true;
    }
    return false;
  }

  // This is a React hook that runs when the component mounts
  React.useEffect(() => {
    randomLetter();
  }, []);

  React.useEffect(() => {
    if (numWrongGuesses >= 3) {
      setShowHint(true);
    }
  }, [numWrongGuesses]);

  const displayedLetter =
    mode === "hindiToEnglish"
      ? letterPairs[currentLetterIdx][0]
      : letterPairs[currentLetterIdx][1];

  const hintAnswer =
    mode === "hindiToEnglish"
      ? letterPairs[currentLetterIdx][1]
      : letterPairs[currentLetterIdx][0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-100 p-6 font-sans relative grain-bg">
      <div className="h-[calc(100vh-3rem)] max-w-4xl mx-auto">
        <div className="h-full bg-white/30 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/40 flex flex-col">
          <div className="flex justify-between items-center mb-12">
            <h2 className="text-3xl font-bold text-slate-700">
              {mode === "hindiToEnglish"
                ? "Hindi to English"
                : "English to Hindi"}
            </h2>
            <button
              onClick={() => {
                setMode(
                  mode === "hindiToEnglish"
                    ? "englishToHindi"
                    : "hindiToEnglish"
                );
                setShowHint(false);
                randomLetter();
              }}
              className="px-6 py-3 bg-white/40 text-slate-700 rounded-2xl hover:bg-white/60 
                transition-all duration-300 backdrop-blur-sm font-medium shadow-lg hover:shadow-xl
                hover:scale-105 active:scale-95"
            >
              {mode === "hindiToEnglish" ? "A" : "क"}
            </button>
          </div>

          <div className="flex flex-col items-center justify-center mb-6 pt-4 pb-6">
            <h1
              onClick={() => setShowHint(!showHint)}
              className={`text-[10rem] cursor-pointer transition-all duration-500 
                hover:scale-110 animate-[float_6s_ease-in-out_infinite]
                ${isWrongGuess ? "text-rose-500" : "text-slate-700"}`}
            >
              {displayedLetter}
            </h1>
            {showHint && (
              <p
                className="mt-6 text-3xl text-slate-600/80 font-light 
                animate-[fadeIn_0.5s_ease-out]"
              >
                {hintAnswer}
              </p>
            )}
          </div>

          <input
            type="text"
            placeholder="Enter your guess..."
            className="w-full p-4 bg-white/50 border-2 border-white/50 rounded-2xl 
              text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-4 
              focus:ring-teal-200/30 text-xl backdrop-blur-sm transition-all duration-300
              hover:bg-white/60"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (onGuess(e.currentTarget.value)) {
                  e.currentTarget.value = "";
                  setHistory([
                    ...history,
                    {
                      letterPair: letterPairs[currentLetterIdx],
                      numWrongGuesses,
                      instantWhenStarted: new Date(
                        new Date().getTime() - instantWhenStarted.getTime()
                      ),
                    },
                  ]);
                  setNumWrongGuesses(0);
                  setIsWrongGuess(false);
                  setShowHint(false);
                  setInstantWhenStarted(new Date());
                } else {
                  setIsWrongGuess(true);
                  setNumWrongGuesses(numWrongGuesses + 1);
                  setTimeout(() => {
                    setIsWrongGuess(false);
                  }, 1000);
                }
              }
            }}
          />

          <div className="mt-6 flex-1 bg-white/40 rounded-2xl p-6 backdrop-blur-sm flex flex-col min-h-0">
            <h3 className="text-xl font-semibold text-slate-700 mb-6 flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Progress
            </h3>

            {history.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <p className="text-center">
                  Start practicing to see your progress here!
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-2">
                {/* Needs Practice Section */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-rose-600/70 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                    Needs Practice
                  </h4>
                  <ul className="grid grid-cols-2 gap-3">
                    {history
                      .filter((guess) => guess.numWrongGuesses >= 2)
                      .sort((a, b) => b.numWrongGuesses - a.numWrongGuesses)
                      .slice(0, 6)
                      .map((guess, idx) => (
                        <li
                          key={idx}
                          className="bg-white/50 p-4 rounded-xl flex items-center gap-4
                            hover:bg-white/70 transition-all duration-300 group"
                        >
                          <div
                            className="w-14 h-14 bg-rose-100 rounded-lg flex items-center 
                            justify-center text-3xl text-rose-600 font-medium"
                          >
                            {guess.letterPair[0]}
                          </div>
                          <div className="flex-1">
                            <div className="text-xl text-slate-700 mb-1">
                              {guess.letterPair[1]}
                            </div>
                            <div className="text-sm text-slate-500">
                              {guess.numWrongGuesses} mistakes ·{" "}
                              {guess.instantWhenStarted.getSeconds()}s avg
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>

                {/* Good Progress Section */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-emerald-600/70 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    Good Progress
                  </h4>
                  <ul className="grid grid-cols-2 gap-3">
                    {history
                      .filter((guess) => guess.numWrongGuesses < 2)
                      .sort(
                        (a, b) =>
                          a.instantWhenStarted.getSeconds() -
                          b.instantWhenStarted.getSeconds()
                      )
                      .slice(0, 6)
                      .map((guess, idx) => (
                        <li
                          key={idx}
                          className="bg-white/50 p-4 rounded-xl flex items-center gap-4
                            hover:bg-white/70 transition-all duration-300 group"
                        >
                          <div
                            className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center 
                            justify-center text-3xl text-emerald-600 font-medium"
                          >
                            {guess.letterPair[0]}
                          </div>
                          <div className="flex-1">
                            <div className="text-xl text-slate-700 mb-1">
                              {guess.letterPair[1]}
                            </div>
                            <div className="text-sm text-slate-500">
                              {guess.numWrongGuesses === 0
                                ? "Perfect!"
                                : `${guess.numWrongGuesses} mistake`}{" "}
                              · {guess.instantWhenStarted.getSeconds()}s
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hindi;
