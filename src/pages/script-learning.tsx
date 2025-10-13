import React from "react";
import { MousePositionProvider } from "../components/MousePosition";
import ScriptLearning from "../components/ScriptLearning";

function ScriptLearningPage() {
  return (
    <MousePositionProvider>
      <ScriptLearning />
    </MousePositionProvider>
  );
}

export default ScriptLearningPage;
