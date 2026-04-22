import React from 'react'
import ReactDOM from 'react-dom/client'
import ContentApp from './ContentApp'
import './content.css'

// Inject stealth detection script into the page's main world
const script = document.createElement('script');
script.textContent = `
  (function() {
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async function(constraints) {
      window.dispatchEvent(new CustomEvent('AI_ASSISTANT_STEALTH_ON'));
      try {
        const stream = await originalGetDisplayMedia(constraints);
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          window.dispatchEvent(new CustomEvent('AI_ASSISTANT_STEALTH_OFF'));
        }, { once: true });
        return stream;
      } catch (err) {
        window.dispatchEvent(new CustomEvent('AI_ASSISTANT_STEALTH_OFF'));
        throw err;
      }
    };
  })();
`;
(document.head || document.documentElement).appendChild(script);
script.remove();

const root = document.createElement('div')
root.id = 'ai-interview-assistant-root'
document.body.appendChild(root)

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ContentApp />
  </React.StrictMode>
)
