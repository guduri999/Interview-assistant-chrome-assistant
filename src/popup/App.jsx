import { useState, useEffect } from 'react'

function App() {
  const [isRunning, setIsRunning] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [savedStatus, setSavedStatus] = useState('Save Key')

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "GET_STATUS" }, (response) => {
                if (response && response.isListening !== undefined) {
                    setIsRunning(response.isListening)
                }
            })
        }
    })
    chrome.storage.local.get(['apiKey'], (result) => {
        if (result.apiKey) setApiKey(result.apiKey)
    })
  }, [])

  const toggleListening = () => {
    const newState = !isRunning
    setIsRunning(newState)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            const action = newState ? "START_LISTENING" : "STOP_LISTENING"
            chrome.tabs.sendMessage(tabs[0].id, { action: action })
        }
    })
  }

  const saveKey = () => {
    chrome.storage.local.set({ apiKey: apiKey.trim() }, () => {
        setSavedStatus('Saved!')
        setTimeout(() => setSavedStatus('Save Key'), 1500)
    })
  }

  return (
    <div className="popup-container">
      <h3>Interview Assistant</h3>
      <button 
        onClick={toggleListening}
        className={isRunning ? 'stop-btn' : 'start-btn'}
      >
        {isRunning ? 'Stop Listening' : 'Start Listening'}
      </button>
      <div className="status-text">Status: {isRunning ? 'Listening...' : 'Idle'}</div>
      
      <div className="api-section">
          <input 
            type="password" 
            value={apiKey} 
            onChange={(e) => setApiKey(e.target.value)} 
            placeholder="Enter Groq API Key" 
          />
          <button className="save-btn" onClick={saveKey}>{savedStatus}</button>
      </div>
    </div>
  )
}

export default App
