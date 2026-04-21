import { useState, useEffect, useRef } from 'react'

function ContentApp() {
    const [isListening, setIsListening] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [transcript, setTranscript] = useState([])
    const [aiResponses, setAiResponses] = useState([])
    const [logs, setLogs] = useState([])
    const [autoScroll, setAutoScroll] = useState(true)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    
    // Position tracking Refs
    const isDragging = useRef(false)
    const offset = useRef({ x: 0, y: 0 })
    
    // Logic Refs
    const stateRef = useRef({ isListening: false, isPaused: false, transcript: [] })
    const recorderRef = useRef(null)
    const streamRef = useRef(null)
    const recognitionRef = useRef(null)
    const activeAiBlockRef = useRef(null)
    const chunksRef = useRef([])

    const transcriptRef = useRef(null)
    const aiRef = useRef(null)
    const logRef = useRef(null)

    useEffect(() => {
        stateRef.current.isListening = isListening
        stateRef.current.isPaused = isPaused
    }, [isListening, isPaused])

    useEffect(() => {
        const listener = (request, sender, sendResponse) => {
            if (request.action === 'GET_STATUS') {
                sendResponse({ isListening: stateRef.current.isListening })
            } else if (request.action === 'TOGGLE_LISTENING') {
                setIsListening(prev => !prev)
            } else if (request.action === 'START_LISTENING') {
                setIsListening(true)
            } else if (request.action === 'STOP_LISTENING') {
                setIsListening(false)
            } else if (request.action === 'CHUNK_TRANSCRIBED') {
                if (request.text) {
                   setTranscript(prev => [...prev, request.text])
                   addLog(`Processed: ${request.text.slice(0, 30)}...`)
                } else {
                   addLog(`Silence detected / Hallucination dropped.`, 'warn')
                }
            } else if (request.action === 'SHOW_AI_RESPONSE') {
                if (request.response === 'Thinking...') return
                setAiResponses(prev => [...prev, { text: request.response, id: Date.now() }])
            } else if (request.action === 'START_AI_STREAM') {
                const id = Date.now()
                setAiResponses(prev => [...prev, { text: '', id, isStreaming: true }])
                activeAiBlockRef.current = id
            } else if (request.action === 'STREAM_AI_TOKEN') {
                setAiResponses(prev => prev.map(msg => 
                    msg.id === activeAiBlockRef.current ? { ...msg, text: msg.text + request.token } : msg
                ))
            } else if (request.action === 'DELETE_SPAM_BLOCK') {
                setAiResponses(prev => prev.filter(msg => msg.id !== activeAiBlockRef.current))
            }
        }
        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [])

    const addLog = (text, type = 'info') => {
        setLogs(prev => [...prev, { text, time: new Date().toLocaleTimeString(), type, id: Date.now() }])
    }

    // Drag Logic
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging.current) return
            setPosition({
                x: e.clientX - offset.current.x,
                y: e.clientY - offset.current.y
            })
        }
        const handleMouseUp = () => { isDragging.current = false }
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    const startDragging = (e) => {
        isDragging.current = true
        offset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        }
    }

    // Speech & VAD Engine
    useEffect(() => {
        if (!isListening) {
            stopAll()
            return
        }
        chrome.storage.local.get(['TRANSCRIPTION_ENGINE'], (res) => {
            const engine = res.TRANSCRIPTION_ENGINE || 'whisper'
            if (engine === 'whisper') startWhisper()
            else startNative()
        })
    }, [isListening])

    const stopAll = () => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
        if (recognitionRef.current) recognitionRef.current.stop()
        streamRef.current = null
        recorderRef.current = null
        recognitionRef.current = null
    }

    const startNative = () => {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!Speech) return
        recognitionRef.current = new Speech()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.onresult = (e) => {
            if (stateRef.current.isPaused) return
            let final = ""
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                if (e.results[i].isFinal) final += e.results[i][0].transcript
            }
            if (final) {
                const text = final.trim()
                setTranscript(prev => [...prev, text])
                chrome.runtime.sendMessage({ action: "PROCESS_TRANSCRIPT", transcript: text })
            }
        }
        recognitionRef.current.onend = () => { if (stateRef.current.isListening) try { recognitionRef.current.start() } catch(e){} }
        recognitionRef.current.start()
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
            recorderRef.current.ondataavailable = e => chunksRef.current.push(e.data)
            recorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
                chunksRef.current = []
                if (blob.size > 0 && stateRef.current.isListening && !stateRef.current.isPaused) {
                    const reader = new FileReader()
                    reader.readAsDataURL(blob)
                    reader.onloadend = () => {
                        chrome.runtime.sendMessage({ action: "TRANSCRIBE_CHUNK", audioData: reader.result.split(',')[1] })
                    }
                }
            }

            const pcm = new Float32Array(analyser.fftSize)
            let isSpeakingLocal = false
            let silTimer = null
            const vadInterval = setInterval(() => {
                if (!stateRef.current.isListening || stateRef.current.isPaused) return
                analyser.getFloatTimeDomainData(pcm)
                let sumSq = 0
                for (let v of pcm) sumSq += v * v
                const rms = Math.sqrt(sumSq / pcm.length)
                
                if (rms > 0.005) {
                    if (!isSpeakingLocal) {
                        isSpeakingLocal = true
                        if (recorderRef.current.state === 'inactive') recorderRef.current.start()
                    }
                    clearTimeout(silTimer)
                } else if (isSpeakingLocal) {
                    if (!silTimer) silTimer = setTimeout(() => {
                        isSpeakingLocal = false
                        if (recorderRef.current.state === 'recording') recorderRef.current.stop()
                        silTimer = null
                    }, 1500)
                }
            }, 50)
            return () => { clearInterval(vadInterval); stopAll() }
        } catch (e) { addLog("Microphone access denied!", "error") }
    }

    useEffect(() => {
        if (autoScroll) {
            [transcriptRef, aiRef, logRef].forEach(ref => {
                if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
            })
        }
    }, [transcript, aiResponses, logs, autoScroll])

    if (!isListening) return null

    return (
        <div id="ai-interview-overlay" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
            <div id="ai-interview-header" onMouseDown={startDragging}>
                <div className="ai-controls-group">
                    <button onClick={() => setAutoScroll(!autoScroll)} className={!autoScroll ? 'off' : ''} title="Toggle Scroll">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"/></svg>
                    </button>
                    <button onClick={() => setIsPaused(!isPaused)} className={isPaused ? 'paused' : ''} title={isPaused ? "Resume" : "Pause"}>
                        {isPaused ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-14 9V3z"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h4v16H6zM14 4h4v16h4z"/></svg>}
                    </button>
                    <button onClick={() => { setTranscript([]); setAiResponses([]); setLogs([]) }} title="Clear All">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
                <div id="ai-interview-drag-handle">
                    <span className={`status-dot ${!isPaused ? 'active' : ''}`}></span>
                    AI Assistant
                </div>
                <div className="ai-controls-group">
                    <button onClick={() => setIsListening(false)} title="Close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>
            
            <div id="ai-interview-body">
                <div className="ai-interview-pane">
                    <div className="ai-interview-pane-title">Live Transcript</div>
                    <div className="pane-content" ref={transcriptRef}>
                        {transcript.length === 0 ? <div className="placeholder">Listening to audio...</div> : transcript.map((t, i) => <div key={i} className="msg">{t}</div>)}
                    </div>
                </div>
                <div className="ai-interview-pane">
                    <div className="ai-interview-pane-title">AI Suggestions</div>
                    <div className="pane-content" ref={aiRef}>
                        {aiResponses.length === 0 ? <div className="placeholder">Waiting for question...</div> : aiResponses.map(m => (
                            <div key={m.id} className={`ai-msg ${m.isStreaming ? 'streaming' : ''}`}>
                                {m.text}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            <div className="ai-interview-pane bottom-pane">
                <div className="ai-interview-pane-title">System Logs</div>
                <div className="pane-content log-content" ref={logRef}>
                    {logs.map(l => (
                        <div key={l.id} className={l.type}>
                            <span className="log-time">[{l.time}]</span> {l.text}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default ContentApp
