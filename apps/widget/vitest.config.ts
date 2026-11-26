import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        url: "https://customer.example.org/",
        // Tests must never reach the network: iframes stay blank.
        settings: {
          disableIframePageLoading: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
  },
});
