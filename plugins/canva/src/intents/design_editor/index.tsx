import "@canva/app-ui-kit/styles.css";
import { AppUiProvider } from "@canva/app-ui-kit";
import type { DesignEditorIntent } from "@canva/intents/design";
import { createRoot } from "react-dom/client";
import { App } from "./app";

function render() {
  const root = createRoot(document.getElementById("root") as Element);

  root.render(
    <AppUiProvider>
      <App />
    </AppUiProvider>
  );
}

const designEditor: DesignEditorIntent = { render };
export default designEditor;

if (module.hot) {
  module.hot.accept("./app", render);
}
