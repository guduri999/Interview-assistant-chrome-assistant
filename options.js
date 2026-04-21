const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const engineSelect = document.getElementById('engineSelect');
const jobDescriptionInput = document.getElementById('jobDescriptionInput');

chrome.storage.local.get(['apiKey', 'TRANSCRIPTION_ENGINE', 'JOB_DESCRIPTION'], (result) => {
    if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
    }
    if (result.TRANSCRIPTION_ENGINE) {
        engineSelect.value = result.TRANSCRIPTION_ENGINE;
    }
    if (result.JOB_DESCRIPTION) {
        jobDescriptionInput.value = result.JOB_DESCRIPTION;
    }
});

saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const engine = engineSelect.value;
    const jd = jobDescriptionInput.value.trim();
    
    chrome.storage.local.set({ 
        apiKey: key, 
        TRANSCRIPTION_ENGINE: engine,
        JOB_DESCRIPTION: jd
    }, () => {
        saveKeyBtn.textContent = "Saved Successfully!";
        saveKeyBtn.style.background = "#4caf50";
        setTimeout(() => {
            saveKeyBtn.textContent = "Save Settings";
            saveKeyBtn.style.background = "#2196F3";
        }, 1500);
    });
});
