import { setNonce } from "get-nonce";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { App } from "./App";
import { theme } from "./theme";
import "./styles.css";
const nonce = () =>
  document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ||
  "";
setNonce(nonce());
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      forceColorScheme="light"
      getStyleNonce={nonce}
    >
      <Notifications position="bottom-right" />
      <App />
    </MantineProvider>
  </StrictMode>,
);
