import React from 'react'
import ReactDOM from 'react-dom/client'
import ContentApp from './ContentApp'
import './content.css'

const root = document.createElement('div')
root.id = 'ai-interview-assistant-root'
root.style.display = 'block'
document.body.appendChild(root)

let isHidden = false;

function checkCapture() {
  chrome.runtime.sendMessage({action: 'isCaptured'}, (response) => {
    if (chrome.runtime.lastError) {
      if (isHidden) {
        isHidden = false;
        root.style.display = 'block';
      }
      return;
    }

    const shouldHide = response?.isCaptured === true;

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
