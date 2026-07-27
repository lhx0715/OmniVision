import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import Home from "@/pages/Home";
import Library from "@/pages/Library";
import Graph from "@/pages/Graph";
import Explore from "@/pages/Explore";
import GraphLibrary from "@/pages/GraphLibrary";
import FolderDetail from "@/pages/FolderDetail";
import FolderGraph from "@/pages/FolderGraph";

export default function App() {
  // 全局恢复会话：只在 App 挂载时调用一次。
  // 之前各页面各自调用 restoreSession，页面组件 HMR 重新挂载时会重复发起 /api/auth/me，
  // 旧请求被浏览器中止导致 console 报 net::ERR_ABORTED。集中到 App 后根组件不会因页面 HMR 重新挂载。
  const restoreSession = useAuthStore((s) => s.restoreSession);
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/folder/:id" element={<FolderDetail />} />
        <Route path="/folder/:id/graph" element={<FolderGraph />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/graph-library" element={<GraphLibrary />} />
      </Routes>
    </Router>
  );
}
