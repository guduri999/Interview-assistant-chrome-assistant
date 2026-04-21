# AI Interview Assistant (React + Vite)

A modern, high-performance Chrome Extension designed to provide real-time AI-generated suggestions during interviews using Speech-to-Text and Groq LLMs.

## 🚀 Features

- **Dual Transcription Engines**: 
  - **Whisper (Groq API)**: High-accuracy AI transcription with advanced VAD (Voice Activity Detection).
  - **Native (Browser)**: Zero-cost, local browser-based speech recognition.
- **Real-time AI Streaming**: Suggestions appear token-by-token using Groq's `llama-3.1-8b-instant`.
- **Glassmorphism UI**: Beautiful, draggable overlay window with blur effects.
- **VAD Optimization**: Intelligently filters out background noise, keyboard clicks, and silent "hallucinations".
- **Chat Export**: One-click download of your full interview transcript and AI tips as a `.txt` file.
- **Privacy Mode**: Automatically wipes chat history when the assistant is closed.

## 🛠 Tech Stack

- **Framework**: React 18
- **Bundler**: Vite + CRXJS (Vite Plugin for Chrome Extensions)
- **Styling**: Vanilla CSS (Modern CSS variables + glassmorphism)
- **API**: Groq Cloud (Whisper-large-v3 + Llama-3.1)

## 📦 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- NPM (v8 or higher)
- A Groq API Key (Get it at [console.groq.com](https://console.groq.com/))

### 2. Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/guduri999/Interview-assistant-chrome-assistant.git
   cd Interview-assistant-chrome-assistant
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### 3. Build the Extension
```bash
npm run build
```
This will create a `dist/` folder in your project directory.

### 4. Load into Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the **`dist/`** folder inside your project directory.

## ⚙️ Configuration

1. Click the **AI Assistant** icon in your toolbar or right-click the extension to go to **Options**.
2. Enter your **Groq API Key**.
3. (Optional) Provide a **Job Description** to give the AI more context about your interview.
4. Select your preferred **Transcription Engine**.

## 🖱 Usage

- **Toggle**: Click the extension icon in the Chrome toolbar to open/close the assistant on any webpage.
- **Move**: Drag the header to reposition the window.
- **Pause**: Use the pause button to temporarily stop listening.
- **Export**: Click the download icon to save your notes.

## 📄 License
MIT
