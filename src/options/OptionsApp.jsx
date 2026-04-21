import { useState, useEffect } from 'react'

function OptionsApp() {
  const [apiKey, setApiKey] = useState('')
  const [engine, setEngine] = useState('whisper')
  const [jd, setJd] = useState('')
  const [status, setStatus] = useState('Save Settings')

  useEffect(() => {
    chrome.storage.local.get(['apiKey', 'TRANSCRIPTION_ENGINE', 'JOB_DESCRIPTION'], (res) => {
        if (res.apiKey) setApiKey(res.apiKey)
        if (res.TRANSCRIPTION_ENGINE) setEngine(res.TRANSCRIPTION_ENGINE)
        if (res.JOB_DESCRIPTION) setJd(res.JOB_DESCRIPTION)
    })
  }, [])

  const save = () => {
    chrome.storage.local.set({ 
        apiKey: apiKey.trim(), 
        TRANSCRIPTION_ENGINE: engine,
        JOB_DESCRIPTION: jd.trim()
    }, () => {
        setStatus('Saved Successfully!')
        setTimeout(() => setStatus('Save Settings'), 1500)
    })
  }

  return (
    <div className="container">
        <h2>Configuration Settings</h2>
        <p>Set your Groq API key here. The AI Assistant will directly start whenever you click the extension icon on a webpage.</p>
        
        <label>Transcription Engine</label>
        <select value={engine} onChange={(e) => setEngine(e.target.value)}>
            <option value="whisper">Groq Whisper API (Prevents Outer-Voice Loops)</option>
            <option value="native">Chrome Native Speech (Fastest, zero API cost)</option>
        </select>
        
        <label>Groq API Key</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="gsk_..." />
        
        <label>Job Description Context (Optional)</label>
        <textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste job description here..." />
        
        <button onClick={save}>{status}</button>
    </div>
  )
}

export default OptionsApp
