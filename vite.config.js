import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'

const manifest = {
  manifest_version: 3,
  name: "AI Interview Assistant",
  version: "1.0.1",
  description: "Real-time AI interview assistant with speech-to-text and Groq integration.",
  permissions: [
    "activeTab",
    "storage",
    "scripting",
    "tabCapture",
    "offscreen"
  ],
  host_permissions: [
    "https://api.openai.com/*",
    "https://api.groq.com/*"
  ],
  action: {
    // REMOVED default_popup to allow background script to handle onClicked
  },
  options_ui: {
    "page": "options.html",
    "open_in_tab": true
  },
  background: {
    "service_worker": "src/background/index.js",
    "type": "module"
  },
  content_scripts: [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.jsx"]
    }
  ],
  commands: {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+K",
        "mac": "Command+Shift+K"
      },
      "description": "Toggle AI Interview Assistant"
    }
  }
};

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  build: {
    rollupOptions: {
      input: {
        options: 'options.html',
        offscreen: 'offscreen.html'
      }
    }
  }
})
