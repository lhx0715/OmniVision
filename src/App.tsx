import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Library from "@/pages/Library";
import Graph from "@/pages/Graph";
import Explore from "@/pages/Explore";
import GraphLibrary from "@/pages/GraphLibrary";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/graph-library" element={<GraphLibrary />} />
      </Routes>
    </Router>
  );
}
