import React from 'react'
import ReactDOM from 'react-dom/client'
import ContentApp from './ContentApp'
import './content.css'

const root = document.createElement('div')
root.id = 'ai-interview-assistant-root'
root.style.display = 'block'
document.body.appendChild(root)

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ContentApp />
  </React.StrictMode>
)
