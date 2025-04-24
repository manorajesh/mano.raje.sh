import React from "react";
import { MousePositionProvider } from "../components/MousePosition";
import WordleVisualizer from "../components/WordleVisualizer";

function WordleVisualizerPage() {
  return (
    <div className="bg-dark-blue min-h-screen font-sans">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="pb-8 text-white">
          <h1 className="text-3xl font-serif italic font-light mb-6">
            wordle to image
          </h1>

          <p className="text-lg opacity-90 mb-4">
            get a nice image of your wordle.
          </p>

          <div className="text-sm opacity-75 mb-8 p-4 bg-black bg-opacity-20 rounded-lg">
            <p className="mb-2">Example format:</p>
            <pre className="font-mono text-xs">
              Wordle 1,404 4/6
              <br />
              <br />
              ⬛🟨⬛⬛🟩
              <br />
              ⬛⬛🟩⬛🟩
              <br />
              ⬛⬛🟩⬛🟩
              <br />
              🟩🟩🟩🟩🟩
            </pre>
          </div>
        </div>

        <WordleVisualizer />

        <div className="mt-12 pt-8 border-t border-gray-800 text-gray-500 text-sm">
          <p>everything is run in the browser. no data is sent anywhere.</p>
        </div>
      </div>
    </div>
  );
}

export default WordleVisualizerPage;
