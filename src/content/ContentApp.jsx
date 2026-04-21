import { useState, useEffect, useRef } from 'react'

function ContentApp() {
    const [isListening, setIsListening] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [transcriptItems, setTranscriptItems] = useState([])
    const [aiResponses, setAiResponses] = useState([])
    const [logs, setLogs] = useState([])
    const [autoScroll, setAutoScroll] = useState(true)
    const [position, setPosition] = useState({ 
        x: (window.innerWidth - 650) / 2, 
        y: (window.innerHeight - 600) / 2 
    })
    const [activeEngine, setActiveEngine] = useState("init...")

    // Logic Persistence Refs
    const isListeningRef = useRef(false)
    const isPausedRef = useRef(false)
    const fullTranscriptRef = useRef("")
    const stateRef = useRef({ engine: 'whisper' })

    // Drag Refs
    const dragInfo = useRef({ isDragging: false, offset: { x: 0, y: 0 } })

    // Hardware Refs
    const streamRef = useRef(null)
    const recorderRef = useRef(null)
    const recognitionRef = useRef(null)
    const aiStreamBlockId = useRef(null)
    const chunksBuffer = useRef([])
    const vadIntervalId = useRef(null)

    // Sync state to refs for use in intervals/callbacks
    useEffect(() => {
        isListeningRef.current = isListening
        isPausedRef.current = isPaused
    }, [isListening, isPaused])

    const addLog = (text, type = 'info') => {
        setLogs(prev => [...prev, { text, time: new Date().toLocaleTimeString(), type, id: Date.now() }])
    }

    const appendToTranscript = (text) => {
        if (!text) return
        fullTranscriptRef.current += (fullTranscriptRef.current ? " " : "") + text
        setTranscriptItems(prev => [...prev, text])

        // Critical: Send to background to trigger Groq AI
        chrome.runtime.sendMessage({
            action: "PROCESS_TRANSCRIPT",
            transcript: fullTranscriptRef.current
        })
    }

    // Message Listener
    useEffect(() => {
        const listener = (request, sender, sendResponse) => {
            if (request.action === 'GET_STATUS') {
                sendResponse({ isListening: isListeningRef.current })
            } else if (request.action === 'TOGGLE_LISTENING') {
                setIsListening(p => !p)
            } else if (request.action === 'START_LISTENING') {
                setIsListening(true)
            } else if (request.action === 'STOP_LISTENING') {
                setIsListening(false)
            } else if (request.action === 'CHUNK_TRANSCRIBED') {
                if (request.text) {
                    appendToTranscript(request.text)
                    addLog(`Transcribed: ${request.text.slice(0, 40)}...`)
                } else {
                    addLog("Silence/Hallucination dropped", "warn")
                }
            } else if (request.action === 'SHOW_AI_RESPONSE') {
                if (request.response === "Thinking...") return
                setAiResponses(prev => [...prev, { text: request.response, id: Date.now() }])
            } else if (request.action === 'START_AI_STREAM') {
                const id = Date.now()
                aiStreamBlockId.current = id
                setAiResponses(prev => [...prev, { text: '', id, isStreaming: true }])
            } else if (request.action === 'STREAM_AI_TOKEN') {
                setAiResponses(prev => prev.map(m => m.id === aiStreamBlockId.current ? { ...m, text: m.text + request.token } : m))
            } else if (request.action === 'DELETE_SPAM_BLOCK') {
                setAiResponses(prev => prev.filter(m => m.id !== aiStreamBlockId.current))
            }
        }
        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [])

    // Global Drag
    useEffect(() => {
        const move = (e) => {
            if (!dragInfo.current.isDragging) return
            setPosition({
                x: e.clientX - dragInfo.current.offset.x,
                y: e.clientY - dragInfo.current.offset.y
            })
        }
        const stop = () => { dragInfo.current.isDragging = false }
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', stop)
        return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop) }
    }, [])

    const stopAssistant = () => {
        setIsListening(false)
        setTranscriptItems([])
        setAiResponses([])
        setLogs([])
        fullTranscriptRef.current = ""
        chrome.runtime.sendMessage({ action: "STOP_LISTENING" })
    }

    const exportChat = () => {
        let content = "Interview Session Log\n"
        content += "Date: " + new Date().toLocaleString() + "\n"
        content += "========================================\n\n"
        
        content += "--- FULL TRANSCRIPT ---\n"
        content += transcriptItems.join(" ") + "\n\n"
        
        content += "--- AI SUGGESTIONS ---\n"
        aiResponses.forEach((res, i) => {
            content += `[Suggestion ${i+1}]: ${res.text}\n\n`
        })
        
        const blob = new Blob([content], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `interview_chat_${Date.now()}.txt`
        a.click()
        URL.revokeObjectURL(url)
        addLog("Chat exported successfully")
    }

    // Engine Switcher
    useEffect(() => {
        if (!isListening) {
            cleanupHardware()
            return
        }
        fullTranscriptRef.current = "" // Reset on new session
        chrome.storage.local.get(['TRANSCRIPTION_ENGINE'], (res) => {
            const engineId = res.TRANSCRIPTION_ENGINE || 'whisper'
            addLog(`Initializing Engine: ${engineId.toUpperCase()}`, 'info')
            setActiveEngine(engineId.toUpperCase())
            
            if (engineId === 'whisper') startWhisper()
            else if (engineId === 'native') startNative()
            else if (engineId === 'engine3') startEngine3()
            else if (engineId === 'engine4') startEngine4()
        })
    }, [isListening])

    const startEngine3 = () => {
        addLog("Engine 3 not implemented yet", "warn")
    }

    const startEngine4 = () => {
        addLog("Engine 4 not implemented yet", "warn")
    }

    const cleanupHardware = () => {
        if (vadIntervalId.current) clearInterval(vadIntervalId.current)
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
        if (recognitionRef.current) recognitionRef.current.stop()
        streamRef.current = null; recorderRef.current = null; recognitionRef.current = null;
    }

    const startNative = () => {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!Speech) return
        recognitionRef.current = new Speech()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.onresult = (e) => {
            if (isPausedRef.current) return
            let final = ""
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                if (e.results[i].isFinal) final += e.results[i][0].transcript
            }
            if (final) appendToTranscript(final.trim())
        }
        recognitionRef.current.onend = () => { if (isListeningRef.current) try { recognitionRef.current.start() } catch (err) { } }
        recognitionRef.current.start()
        addLog("Native Engine Started")
    }

    const startWhisper = async () => {
        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const source = ctx.createMediaStreamSource(streamRef.current)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 512
            source.connect(analyser)

            recorderRef.current = new MediaRecorder(streamRef.current)
            recorderRef.current.ondataavailable = e => chunksBuffer.current.push(e.data)
            recorderRef.current.onstop = () => {
                const blob = new Blob(chunksBuffer.current, { type: 'audio/webm' })
                chunksBuffer.current = []
                if (blob.size > 0 && isListeningRef.current && !isPausedRef.current) {
                    const reader = new FileReader()
                    reader.readAsDataURL(blob)
                    reader.onloadend = () => {
                        chrome.runtime.sendMessage({ action: "TRANSCRIBE_CHUNK", audioData: reader.result.split(',')[1] })
                    }
                }
            }

            const pcm = new Float32Array(analyser.fftSize)
            let volumeSpikeCount = 0
            let isSustainedSpeaking = false
            let silTimer = null
            let phraseStart = 0

            vadIntervalId.current = setInterval(() => {
                if (!isListeningRef.current || isPausedRef.current) return
                analyser.getFloatTimeDomainData(pcm)
                let sumSq = 0; for (let v of pcm) sumSq += v * v
                const rms = Math.sqrt(sumSq / pcm.length)
                
                // Increased threshold slightly and added "sustained" check
                if (rms > 0.020) {
                    volumeSpikeCount++
                    
                    // Only start "Actual" recording after 150ms of sustained sound
                    // This ignores clicks, mouse-taps, keyboard-taps, etc.
                    if (volumeSpikeCount > 3) { 
                        if (!isSustainedSpeaking) {
                            isSustainedSpeaking = true; phraseStart = Date.now()
                            if (recorderRef.current.state === 'inactive') recorderRef.current.start()
                        }
                    }
                    clearTimeout(silTimer); silTimer = null
                    
                    if (isSustainedSpeaking && Date.now() - phraseStart > 7000) {
                        isSustainedSpeaking = false; volumeSpikeCount = 0
                        if (recorderRef.current.state === 'recording') recorderRef.current.stop()
                    }
                } else if (isSustainedSpeaking) {
                    volumeSpikeCount = 0
                    if (!silTimer) silTimer = setTimeout(() => {
                        isSustainedSpeaking = false
                        if (recorderRef.current.state === 'recording') recorderRef.current.stop()
                    }, 1200)
                } else {
                    volumeSpikeCount = Math.max(0, volumeSpikeCount - 1)
                }
            }, 50)
            addLog("Whisper VAD Engine Initialized")
        } catch (e) { addLog("Microphone Access Denied!", "error") }
    }

    // Refs for containers to handle manual auto-scroll
    const tRef = useRef(null); const aRef = useRef(null); const lRef = useRef(null);
    useEffect(() => {
        if (!autoScroll) return
        [tRef, aRef, lRef].forEach(r => { if (r.current) r.current.scrollTop = r.current.scrollHeight })
    }, [transcriptItems, aiResponses, logs, autoScroll])

    if (!isListening) return null

    return (
        <div id="ai-interview-overlay" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
            <div id="ai-interview-header" onMouseDown={(e) => {
                dragInfo.current.isDragging = true
                dragInfo.current.offset = { x: e.clientX - position.x, y: e.clientY - position.y }
            }}>
                <div className="ai-controls-group">
                    <button onClick={() => setAutoScroll(!autoScroll)} className={!autoScroll ? 'off' : ''} title="Auto-scroll">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 13l5 5 5-5M7 6l5 5 5-5" /></svg>
                    </button>
                    <button onClick={() => setIsPaused(!isPaused)} className={isPaused ? 'paused' : ''}>
                        {isPaused ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-14 9V3z" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h4v16H6zM14 4h4v16h4z" /></svg>}
                    </button>
                    <button onClick={exportChat} title="Export Chat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </button>
                    <button onClick={() => { setTranscriptItems([]); setAiResponses([]); setLogs([]); fullTranscriptRef.current = "" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                </div>
                <div id="ai-interview-drag-handle">
                    <span className={`status-dot ${!isPaused ? 'active' : ''}`}></span>
                    AI Assistant
                    <span className="engine-badge">{activeEngine}</span>
                </div>
                <div className="ai-controls-group">
                    <button onClick={stopAssistant} title="Close Assistant">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            <div id="ai-interview-body">
                <div className="ai-interview-pane">
                    <div className="ai-interview-pane-title">Live Transcript</div>
                    <div className="pane-content" ref={tRef}>
                        {transcriptItems.length === 0 ? <div className="placeholder">Listening...</div> : transcriptItems.map((t, i) => <div key={i} className="msg">{t}</div>)}
                    </div>
                </div>
                <div className="ai-interview-pane">
                    <div className="ai-interview-pane-title">AI Suggestions</div>
                    <div className="pane-content" ref={aRef}>
                        {aiResponses.length === 0 ? <div className="placeholder">Awaiting question...</div> : aiResponses.map(m => (
                            <div key={m.id} className={`ai-msg ${m.isStreaming ? 'streaming' : ''}`}>{m.text}</div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="ai-interview-pane bottom-pane">
                <div className="ai-interview-pane-title">Log</div>
                <div className="pane-content log-content" ref={lRef}>
                    {logs.map(l => <div key={l.id} className={l.type}><span className="log-time">[{l.time}]</span> {l.text}</div>)}
                </div>
            </div>
        </div>
    )
}

export default ContentApp
