import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: change this to match your GitHub repo name, e.g. "/finance-tracker/".
// If your repo is at github.com/yourname/finance-tracker, this stays as is.
// If GitHub Pages is served from a custom domain or a user/org root site
// (yourname.github.io), set this to "/" instead.
const REPO_NAME = "/Finance-Tracker/";

export default defineConfig({
  plugins: [react()],
  base: REPO_NAME,
});
