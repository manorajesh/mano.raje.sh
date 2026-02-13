import React from "react";
import ReactDOM from "react-dom/client";
import Home from "./pages/home";
import { ErrorPage } from "./components/ErrorPage";
import "./index.css";
import reportWebVitals from "./reportWebVitals";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Ideas from "./pages/ideas";
import Now from "./pages/now";
import Hindi from "./pages/hindi";
import Words from "./pages/words";
import WordleVisualizerPage from "./pages/wordle-visualizer";
import LetterBoxd from "./pages/letterboxd";
import Pinterest from "./pages/pinterest";
import Valentine from "./pages/valentine";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/ideas",
    element: <Ideas />,
  },
  {
    path: "/now",
    element: <Now />,
  },
  {
    path: "/hindi",
    element: <Hindi />,
  },
  {
    path: "/peculiar-code",
    element: <Words />,
  },
  {
    path: "/wordle",
    element: <WordleVisualizerPage />,
  },
  {
    path: "/letterboxd",
    element: <LetterBoxd />,
  },
  {
    path: "/pinterest",
    element: <Pinterest />,
  },
  {
    path: "/ss",
    element: <Valentine />,
  },
  {
    path: "*",
    element: <ErrorPage errorNumber={404} />,
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
