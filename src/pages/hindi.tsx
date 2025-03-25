import React from "react";
import { Header } from "../components/hindi/Header";
import { LetterDisplay } from "../components/hindi/LetterDisplay";
import { GuessInput } from "../components/hindi/GuessInput";
import { Progress } from "../components/hindi/Progress";
import { Guess, Mode } from "../types/hindi";

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

function Hindi() {
  const [currentLetterIdx, setCurrentLetterIdx] = React.useState(0);
  const [showHint, setShowHint] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("hindiToEnglish");
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

  function handleModeChange(newMode: Mode) {
    setMode(newMode);
    setShowHint(false);
    randomLetter();
  }

  function handleGuess(guess: string) {
    if (onGuess(guess)) {
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
      setTimeout(() => setIsWrongGuess(false), 1000);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-100 p-6 font-sans relative grain-bg">
      <div className="h-[calc(100vh-3rem)] max-w-4xl mx-auto">
        <div className="h-full bg-white/30 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/40 flex flex-col">
          <Header mode={mode} onModeChange={handleModeChange} />
          <LetterDisplay
            letter={displayedLetter}
            hint={hintAnswer}
            showHint={showHint}
            isWrongGuess={isWrongGuess}
            onLetterClick={() => setShowHint(!showHint)}
          />
          <GuessInput onGuess={handleGuess} />
          <Progress history={history} letterPairs={letterPairs} />
        </div>
      </div>
    </div>
  );
}

export default Hindi;
