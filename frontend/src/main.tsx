import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import App from "./App";
import { WorkspaceProvider } from "./app/workspace-provider";
import { queryClient } from "./lib/query-client";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="schedule-theme">
        <WorkspaceProvider>
          <App />
          <Toaster position="bottom-right" richColors />
        </WorkspaceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
