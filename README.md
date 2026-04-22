# AI Interview Assistant (React + Vite)

A Chrome extension that provides live interview support with speech-to-text transcription and AI-powered guidance.

## Overview

This extension listens to spoken interview dialogue, converts it to text, and delivers context-aware suggestions using Groq APIs. It supports microphone capture, browser-native speech recognition, and tab audio capture.

## Features

- Dual transcription modes:
  - **Whisper (Groq)**: Microphone capture with voice activity detection.
  - **Native Browser Speech**: Local speech-to-text using browser APIs.
  - **Tab Audio Capture**: Listen to audio from the active browser tab.
- Real-time AI suggestions streamed while you speak.
- Draggable floating overlay with transcript, AI responses, and logs.
- Export session transcript and suggestions as a `.txt` file.
- Settings page for API key, transcription engine, and job context.

## Tech Stack

- React 18
- Vite
- CRXJS Chrome extension plugin
- Groq API for speech transcription and AI response

## Setup

### Requirements

- Node.js 16+
- npm 8+
- Groq API key

### Install

```bash
git clone https://github.com/guduri999/Interview-assistant-chrome-assistant.git
cd Interview-chrome-assistant
npm install
```

### Build

```bash
npm run build
```

### Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the generated `dist/` folder

## Configuration

Open the extension options page and configure:

- `Groq API Key`
- `Transcription Engine`
- Optional `Job Description` context

## Usage

- Click the extension action icon to open the assistant.
- Speak naturally and watch the live transcript update.
- Read AI suggestions as the assistant processes the conversation.
- Use pause, clear, and export controls from the overlay.

## Scripts

- `npm run dev` - build in watch mode
- `npm run build` - production build
- `npm run docs` - generate documentation from source comments

## Documentation

- `API.md` — human-readable API reference
- `docs/` — generated JSDoc HTML documentation

## License

MIT

## 📚 Documentation

This project includes comprehensive documentation generated from the codebase:

### API Documentation
- **[API.md](API.md)**: Detailed API reference for all functions, components, and message protocols
- **[docs/](docs/)**: JSDoc-generated HTML documentation

### Generating Documentation
To regenerate the documentation after code changes:
```bash
npm run docs
```

The documentation includes:
- Function signatures and parameters
- Return types and descriptions
- Component overviews
- Message protocol details
- Architecture explanations
