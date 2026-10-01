import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Los datos se muestran al instante desde la caché y se refrescan por detrás.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: "var(--font-sans)", fontSize: "0.9375rem", borderRadius: "1rem" } }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
