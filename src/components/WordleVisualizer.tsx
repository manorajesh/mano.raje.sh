import React, { useState, useRef, useEffect } from "react";

interface WordleVisualizerProps {
  initialText?: string;
}

const WordleVisualizer: React.FC<WordleVisualizerProps> = ({
  initialText = "",
}) => {
  const [inputText, setInputText] = useState<string>(initialText);
  const [parsedGrid, setParsedGrid] = useState<string[][]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Standard Wordle has 6 attempts of 5 letters each
  const STANDARD_ROWS = 6;
  const STANDARD_COLS = 5;

  // Parse the Wordle result text into a grid
  const parseWordleText = (text: string) => {
    // Extract just the emoji grid part from a full Wordle paste
    const emojiLines = text
      .split("\n")
      .filter(
        (line) =>
          line.includes("⬛") ||
          line.includes("🟨") ||
          line.includes("🟩") ||
          line.includes("⬜") ||
          line.includes("🟧") ||
          line.includes("🟦")
      );

    return emojiLines.map((line) =>
      Array.from(line).filter((char) =>
        ["⬛", "🟨", "🟩", "⬜", "🟧", "🟦"].includes(char)
      )
    );
  };

  // Generate image on canvas with flat design
  const generateImage = () => {
    if (!canvasRef.current || parsedGrid.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Calculate grid dimensions from the parsed content
    const gridWidth = parsedGrid[0].length;
    const gridHeight = parsedGrid.length;

    // Set canvas size as a perfect square
    const size = 1000; // Larger size for better quality
    canvas.width = size;
    canvas.height = size;

    // Fill background (transparent)
    ctx.clearRect(0, 0, size, size);

    // Calculate total rows - if less than standard, we'll add empty rows
    const totalRows = Math.max(STANDARD_ROWS, gridHeight);

    // Calculate cell size based on the standard or actual dimensions
    const cellWidth = size / gridWidth;
    const cellHeight = size / totalRows;

    // First draw empty (unused) rows for all possible positions
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
      for (let colIndex = 0; colIndex < gridWidth; colIndex++) {
        const x = colIndex * cellWidth;
        const y = rowIndex * cellHeight;

        // Fill with dark gray for unused cells
        ctx.fillStyle = "rgba(120, 124, 126, 0.5)"; // Semi-transparent dark gray
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
    }

    // Then draw the actual guesses over the empty grid
    parsedGrid.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const x = colIndex * cellWidth;
        const y = rowIndex * cellHeight;

        // Use flat colors that match Wordle's palette
        let cellColor;
        switch (cell) {
          case "🟩":
            cellColor = "#6aaa64";
            break; // Green
          case "🟨":
            cellColor = "#c9b458";
            break; // Yellow
          case "⬛":
            cellColor = "#787c7e";
            break; // Dark gray
          case "⬜":
            cellColor = "#d3d6da";
            break; // Light gray
          case "🟧":
            cellColor = "#f5793a";
            break; // Orange
          case "🟦":
            cellColor = "#85c0f9";
            break; // Blue
          default:
            cellColor = "#787c7e";
        }

        // Draw flat square
        ctx.fillStyle = cellColor;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      });
    });
  };

  // Process input text when it changes
  useEffect(() => {
    const grid = parseWordleText(inputText);
    setParsedGrid(grid);
  }, [inputText]);

  // Generate image when grid changes
  useEffect(() => {
    generateImage();
  }, [parsedGrid]);

  // Download the canvas as an image
  const downloadImage = () => {
    if (!canvasRef.current) return;

    const link = document.createElement("a");
    link.download = "wordle-result.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-xl mb-8">
        <label
          htmlFor="wordleInput"
          className="block text-lg mb-2 text-white font-light"
        >
          Paste your Wordle result:
        </label>
        <textarea
          id="wordleInput"
          className="w-full h-40 p-4 border border-gray-700 rounded-lg bg-dark-blue text-white font-mono text-sm"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste your Wordle result (e.g. Wordle 1,404 4/6 ⬛🟨⬛⬛🟩...)"
        />
      </div>

      {parsedGrid.length > 0 && (
        <>
          <div className="mb-8">
            <div className="bg-white p-4 rounded-lg shadow-md">
              <canvas
                ref={canvasRef}
                className="w-full max-w-sm mx-auto"
                style={{ maxHeight: "300px", maxWidth: "300px" }}
              />
            </div>
          </div>

          <button
            onClick={downloadImage}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-light"
          >
            Download Image
          </button>
        </>
      )}
    </div>
  );
};

export default WordleVisualizer;
