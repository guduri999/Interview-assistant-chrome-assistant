import React from 'react'
import ReactDOM from 'react-dom/client'
import ContentApp from './ContentApp'
import './content.css'

const root = document.createElement('div')
root.id = 'ai-interview-assistant-root'
root.style.display = 'none'  // Start hidden by default
document.body.appendChild(root)

let isHidden = true;

function checkCapture() {
  chrome.runtime.sendMessage({action: 'isCaptured'}, (response) => {
    const shouldHide = response?.isCaptured === true;

    if (chrome.runtime.lastError) {
      // If the background call fails for any reason, keep the UI visible.
      if (isHidden) {
        isHidden = false;
        root.style.display = 'block';
      }
      return;
    }

    if (shouldHide !== isHidden) {
      isHidden = shouldHide;
      root.style.display = isHidden ? 'none' : 'block';
    }
  });
}

checkCapture();
setInterval(checkCapture, 1000);  // Check every 1 second for better responsiveness

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ContentApp />
  </React.StrictMode>
)
