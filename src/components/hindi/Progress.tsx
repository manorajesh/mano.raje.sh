import React from "react";
import { Guess } from "../../types/hindi";

interface ProgressProps {
  history: Guess[];
  letterPairs: string[][];
}

function ProgressCard({
  guess,
  variant,
}: {
  guess: Guess;
  variant: "success" | "needs-practice";
}) {
  const colors = {
    success: "emerald",
    "needs-practice": "rose",
  }[variant];

  return (
    <li
      className="bg-white/50 p-4 rounded-xl flex items-center gap-4
      hover:bg-white/70 transition-all duration-300 group"
    >
      <div
        className={`w-14 h-14 bg-${colors}-100 rounded-lg flex items-center 
        justify-center text-3xl text-${colors}-600 font-medium`}
      >
        {guess.letterPair[0]}
      </div>
      <div className="flex-1">
        <div className="text-xl text-slate-700 mb-1">{guess.letterPair[1]}</div>
        <div className="text-sm text-slate-500">
          {guess.numWrongGuesses === 0
            ? "Perfect!"
            : `${guess.numWrongGuesses} mistake${
                guess.numWrongGuesses > 1 ? "s" : ""
              }`}
          · {guess.instantWhenStarted.getSeconds()}s
        </div>
      </div>
    </li>
  );
}

interface GridViewProps {
  history: Guess[];
  letterPairs: string[][];
}

function GridView({ history, letterPairs }: GridViewProps) {
  // Group guesses by letter and calculate average performance
  const letterStats = React.useMemo(() => {
    const stats = new Map<string, { mistakes: number; attempts: number }>();

    history.forEach((guess) => {
      const hindi = guess.letterPair[0];
      const current = stats.get(hindi) || { mistakes: 0, attempts: 0 };
      stats.set(hindi, {
        mistakes: current.mistakes + guess.numWrongGuesses,
        attempts: current.attempts + 1,
      });
    });

    return stats;
  }, [history]);

  return (
    <div className="grid grid-cols-8 gap-2 mt-4">
      {letterPairs.map(([hindi]) => {
        const stats = letterStats.get(hindi);
        const avgMistakes = stats ? stats.mistakes / stats.attempts : 0;
        const attempted = Boolean(stats);
        const opacity = attempted ? "1" : "0.3";
        const bgColor = attempted
          ? avgMistakes > 1
            ? `bg-gradient-to-br from-rose-100 to-rose-200`
            : `bg-gradient-to-br from-emerald-100 to-emerald-200`
          : "bg-slate-100";

        return (
          <div
            key={hindi}
            className={`aspect-square rounded-lg ${bgColor} flex flex-col items-center justify-center
              transition-all duration-300 hover:scale-105 cursor-pointer group`}
            style={{ opacity }}
          >
            <span className="text-2xl font-medium text-slate-700">{hindi}</span>
            {attempted && (
              <span className="text-xs mt-1 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                {stats!.attempts} tries
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Progress({ history, letterPairs }: ProgressProps) {
  const [view, setView] = React.useState<"list" | "grid">("list");

  const needsPractice = history
    .filter((guess) => guess.numWrongGuesses >= 2)
    .sort((a, b) => b.numWrongGuesses - a.numWrongGuesses)
    .slice(0, 6);

  const goodProgress = history
    .filter((guess) => guess.numWrongGuesses < 2)
    .sort(
      (a, b) =>
        a.instantWhenStarted.getSeconds() - b.instantWhenStarted.getSeconds()
    )
    .slice(0, 6);

  return (
    <div className="mt-6 flex-1 bg-white/40 rounded-2xl p-6 backdrop-blur-sm flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-slate-700 flex items-center gap-2">
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
        <button
          onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}
          className="px-3 py-1.5 bg-white/50 rounded-lg text-sm text-slate-600
            hover:bg-white/70 transition-all duration-300"
        >
          {view === "list" ? "Show Grid" : "Show List"}
        </button>
      </div>

      {history.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <p className="text-center">
            Start practicing to see your progress here!
          </p>
        </div>
      ) : view === "list" ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-2">
          {needsPractice.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-rose-600/70 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                Needs Practice
              </h4>
              <ul className="grid grid-cols-2 gap-3">
                {needsPractice.map((guess, idx) => (
                  <ProgressCard
                    key={idx}
                    guess={guess}
                    variant="needs-practice"
                  />
                ))}
              </ul>
            </div>
          )}

          {goodProgress.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-emerald-600/70 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                Good Progress
              </h4>
              <ul className="grid grid-cols-2 gap-3">
                {goodProgress.map((guess, idx) => (
                  <ProgressCard key={idx} guess={guess} variant="success" />
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          <GridView history={history} letterPairs={letterPairs} />
        </div>
      )}
    </div>
  );
}
