let processingAudioContext = null;
let captureStream = null;
let playbackStream = null;
let processingStream = null;
let playbackAudio = null;
let mediaRecorder = null;
let chunksBuffer = [];
let vadIntervalId = null;
let silenceTimeoutId = null;
let activeTabId = null;
let isPaused = false;

async function stopEngine() {
    if (vadIntervalId) {
        clearInterval(vadIntervalId);
        vadIntervalId = null;
    }

    if (silenceTimeoutId) {
        clearTimeout(silenceTimeoutId);
        silenceTimeoutId = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (captureStream) {
        captureStream.getTracks().forEach((track) => track.stop());
        captureStream = null;
    }

    if (playbackStream) {
        playbackStream.getTracks().forEach((track) => track.stop());
        playbackStream = null;
    }

    if (processingStream) {
        processingStream.getTracks().forEach((track) => track.stop());
        processingStream = null;
    }

    if (playbackAudio) {
        playbackAudio.pause();
        playbackAudio.srcObject = null;
        playbackAudio.remove();
        playbackAudio = null;
    }

    if (processingAudioContext) {
        await processingAudioContext.close().catch(() => {});
        processingAudioContext = null;
    }

    mediaRecorder = null;
    chunksBuffer = [];
    activeTabId = null;
    isPaused = false;
}

async function startEngine(streamId, tabId) {
    await stopEngine();

    captureStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
            }
        },
        video: false
    });

    activeTabId = tabId;
    isPaused = false;
    playbackStream = captureStream.clone();
    processingStream = captureStream.clone();

    playbackAudio = document.createElement('audio');
    playbackAudio.autoplay = true;
    playbackAudio.muted = false;
    playbackAudio.playsInline = true;
    playbackAudio.style.display = 'none';
    playbackAudio.srcObject = playbackStream;
    document.body.appendChild(playbackAudio);
    await playbackAudio.play();

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    processingAudioContext = new AudioContextCtor();
    const processingSource = processingAudioContext.createMediaStreamSource(processingStream);
    const analyser = processingAudioContext.createAnalyser();
    analyser.fftSize = 512;

    processingSource.connect(analyser);
    if (processingAudioContext.state === 'suspended') {
        await processingAudioContext.resume();
    }

    const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

    mediaRecorder = new MediaRecorder(
        processingStream,
        preferredMimeType ? { mimeType: preferredMimeType } : undefined
    );

    mediaRecorder.ondataavailable = (event) => {
        chunksBuffer.push(event.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(chunksBuffer, { type: 'audio/webm' });
        chunksBuffer = [];

        if (!blob.size || !activeTabId) return;

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            chrome.runtime.sendMessage({
                action: 'TRANSCRIBE_CHUNK',
                audioData: reader.result.split(',')[1],
                tabId: activeTabId
            });
        };
    };

    const pcm = new Float32Array(analyser.fftSize);
    let volumeSpikeCount = 0;
    let isSustainedSpeaking = false;
    let phraseStart = 0;

    vadIntervalId = setInterval(() => {
        if (isPaused) return;

        analyser.getFloatTimeDomainData(pcm);
        let sumSq = 0;
        for (const value of pcm) sumSq += value * value;
        const rms = Math.sqrt(sumSq / pcm.length);

        if (rms > 0.008) {
            volumeSpikeCount++;

            if (volumeSpikeCount > 2 && !isSustainedSpeaking) {
                isSustainedSpeaking = true;
                phraseStart = Date.now();
                chunksBuffer = [];

                if (mediaRecorder.state === 'inactive') {
                    mediaRecorder.start();
                }
            }

            if (silenceTimeoutId) {
                clearTimeout(silenceTimeoutId);
                silenceTimeoutId = null;
            }

            if (isSustainedSpeaking && Date.now() - phraseStart > 7000) {
                isSustainedSpeaking = false;
                volumeSpikeCount = 0;
                if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            }
        } else if (isSustainedSpeaking) {
            volumeSpikeCount = 0;
            if (!silenceTimeoutId) {
                silenceTimeoutId = setTimeout(() => {
                    silenceTimeoutId = null;
                    isSustainedSpeaking = false;
                    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
                }, 1500);
            }
        } else {
            volumeSpikeCount = Math.max(0, volumeSpikeCount - 1);
        }
    }, 50);
}

async function setPaused(paused) {
    isPaused = paused;

    if (silenceTimeoutId) {
        clearTimeout(silenceTimeoutId);
        silenceTimeoutId = null;
    }

    if (paused) {
        chunksBuffer = [];
        if (mediaRecorder?.state === 'recording') {
            mediaRecorder.stop();
        }
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'OFFSCREEN_START_TAB_ENGINE') {
        startEngine(request.streamId, request.tabId)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (request.action === 'OFFSCREEN_STOP_AUDIO') {
        stopEngine()
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }

    if (request.action === 'OFFSCREEN_SET_PAUSED') {
        setPaused(Boolean(request.paused))
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
});
