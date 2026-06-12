// STATE MANAGEMENT
let appState = {
  rows: [], // Array of [targetLanguage, formal, informal, native]
  nativeLangCode: 'en-US',
  targetLangCode: 'es-ES',
  translationProvider: localStorage.getItem('translation_provider') || 'gemini',
  geminiKey: localStorage.getItem('gemini_api_key') || '',
  gptKey: localStorage.getItem('gpt_api_key') || '',
  claudeKey: localStorage.getItem('claude_api_key') || '',
  customInstructions: localStorage.getItem('custom_instructions') || '',
  selectedVoiceName: localStorage.getItem('tts_selected_voice') || '',
  speechRate: parseFloat(localStorage.getItem('tts_speech_rate')) || 1.0,
  viewMode: localStorage.getItem('translation_view_mode') || 'both', // formal, both, informal
  autoSave: true,
  isRecording: false,
  alwaysMatchAccents: localStorage.getItem('tts_always_match_accents') !== 'false'
};

// LANGUAGE CODE TO NAME MAP FOR LLM PROMPT
const languageNameMap = {
  'en-US': 'English',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'de-DE': 'German',
  'it-IT': 'Italian',
  'ja-JP': 'Japanese',
  'zh-CN': 'Chinese (Simplified)',
  'pt-BR': 'Portuguese',
  'ko-KR': 'Korean'
};

// SPEECH RECOGNITION (STT) INITIALIZATION
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
}

// DOM ELEMENTS
const nativeLangSelect = document.getElementById('native-lang-select');
const targetLangSelect = document.getElementById('target-lang-select');
const saveBtn = document.getElementById('save-btn');
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const phraseInput = document.getElementById('phrase-input');
const translateBtn = document.getElementById('translate-btn');
const recordBtn = document.getElementById('record-btn');
const stopRecordBtn = document.getElementById('stop-record-btn');
const recordingOverlay = document.getElementById('recording-overlay');
const spreadsheetTbody = document.getElementById('spreadsheet-tbody');
const addRowBtn = document.getElementById('add-row-btn');
const autoSaveToggle = document.getElementById('auto-save-toggle');
const gridSearch = document.getElementById('grid-search');
const totalRowsCount = document.getElementById('total-rows-count');
const saveIndicator = document.getElementById('save-indicator');
const sttStatusPill = document.getElementById('stt-status-pill');
const viewSlider = document.getElementById('view-slider');

// Settings Drawer Elements
const settingsDrawer = document.getElementById('settings-drawer');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const drawerOverlay = document.getElementById('drawer-overlay');
const providerSelect = document.getElementById('provider-select');
const apiKeyLabel = document.getElementById('api-key-label');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyStatusLabel = document.getElementById('key-status-label');
const customInstructionsInput = document.getElementById('custom-instructions-input');
const ttsVoiceSelect = document.getElementById('tts-voice-select');
const exportCsvBtn = document.getElementById('export-csv-btn');
const importCsvTriggerBtn = document.getElementById('import-csv-trigger-btn');
const csvFileInput = document.getElementById('csv-file-input');
const alwaysMatchAccentsToggle = document.getElementById('always-match-accents-toggle');
const voiceSelectGroup = document.getElementById('voice-select-group');

// INITIALIZE APP
document.addEventListener('DOMContentLoaded', () => {
  setupSTT();
  setupEventListeners();
  loadAppState();
  loadCSVData();
  populateVoices();
  
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }
});

// LOAD APP STATE
function loadAppState() {
  const savedTarget = localStorage.getItem('target_lang_code');
  if (savedTarget) {
    appState.targetLangCode = savedTarget;
    targetLangSelect.value = savedTarget;
  }
  
  const savedNative = localStorage.getItem('native_lang_code');
  if (savedNative) {
    appState.nativeLangCode = savedNative;
    nativeLangSelect.value = savedNative;
  }

  const savedAutoSave = localStorage.getItem('auto_save_pref');
  if (savedAutoSave !== null) {
    appState.autoSave = savedAutoSave === 'true';
    autoSaveToggle.checked = appState.autoSave;
  }

  const savedProvider = localStorage.getItem('translation_provider');
  if (savedProvider) {
    appState.translationProvider = savedProvider;
    providerSelect.value = savedProvider;
  }

  const savedInstructions = localStorage.getItem('custom_instructions');
  if (savedInstructions) {
    appState.customInstructions = savedInstructions;
    customInstructionsInput.value = savedInstructions;
  }

  const savedViewMode = localStorage.getItem('translation_view_mode');
  if (savedViewMode) {
    appState.viewMode = savedViewMode;
    const activeSegment = viewSlider.querySelector(`[data-view="${savedViewMode}"]`);
    if (activeSegment) {
      viewSlider.querySelectorAll('.slider-segment').forEach(s => s.classList.remove('active'));
      activeSegment.classList.add('active');
    }
  }

  const savedSpeechRate = localStorage.getItem('tts_speech_rate');
  if (savedSpeechRate) {
    appState.speechRate = parseFloat(savedSpeechRate);
  }
  const rateInput = document.getElementById('tts-rate-input');
  const rateVal = document.getElementById('tts-rate-val');
  if (rateInput) rateInput.value = appState.speechRate;
  if (rateVal) rateVal.textContent = `${appState.speechRate.toFixed(1)}x`;
  updateSpeedTicksUI(appState.speechRate);

  const savedTheme = localStorage.getItem('app_theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  const activeThemeBtn = document.querySelector(`.theme-btn[data-theme="${savedTheme}"]`);
  if (activeThemeBtn) {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    activeThemeBtn.classList.add('active');
  }

  const savedAlwaysMatch = localStorage.getItem('tts_always_match_accents');
  if (savedAlwaysMatch !== null) {
    appState.alwaysMatchAccents = savedAlwaysMatch === 'true';
  } else {
    appState.alwaysMatchAccents = true;
  }
  if (alwaysMatchAccentsToggle) {
    alwaysMatchAccentsToggle.checked = appState.alwaysMatchAccents;
  }
  if (voiceSelectGroup) {
    if (appState.alwaysMatchAccents) {
      voiceSelectGroup.classList.add('hidden');
    } else {
      voiceSelectGroup.classList.remove('hidden');
    }
  }

  updateKeyUI();
  updateTableHeaders();
}

// UPDATE TABLE HEADERS
function updateTableHeaders() {
  const nativeName = languageNameMap[appState.nativeLangCode] || 'Native';
  
  const thFormal = document.getElementById('th-foreign-formal');
  const thInformal = document.getElementById('th-foreign-informal');
  const thNative = document.getElementById('th-native');
  
  if (thFormal) thFormal.textContent = `Formal Translation`;
  if (thInformal) thInformal.textContent = `Casual Translation`;
  if (thNative) thNative.textContent = `Native Sentence (${nativeName})`;
}

// LOAD DATA FROM SERVER & PARSE DUAL FORMAL/INFORMAL Representation
async function loadCSVData() {
  setSyncStatus('syncing', 'Loading CSV...');
  try {
    const res = await fetch('/api/csv');
    const result = await res.json();
    if (result.success) {
      // Unpack rows with backward compatibility for 2, 3, or 4 columns
      appState.rows = result.rows.map(row => {
        if (row.length >= 4) {
          return [row[3] || '', row[0] || '', row[1] || '', row[2] || ''];
        } else if (row.length === 3) {
          const targetLangName = languageNameMap[appState.targetLangCode] || 'Spanish';
          return [targetLangName, row[0] || '', row[1] || '', row[2] || ''];
        } else {
          const foreignCombined = row[0] || '';
          const native = row[1] || '';
          
          let formal = foreignCombined;
          let informal = '';
          
          if (foreignCombined.includes('|')) {
            const parts = foreignCombined.split('|');
            formal = parts[0].trim();
            informal = parts[1].trim();
          }
          
          const targetLangName = languageNameMap[appState.targetLangCode] || 'Spanish';
          return [targetLangName, formal, informal, native];
        }
      });
      
      renderTable();
      setSyncStatus('synced', 'Loaded & Synced');
    } else {
      showToast('Failed to load CSV from server', 'danger');
      setSyncStatus('error', 'Error Loading CSV');
    }
  } catch (error) {
    console.error(error);
    showToast('Cannot connect to server. Running offline.', 'danger');
    setSyncStatus('error', 'Server Offline');
  }
}

// SAVE DATA TO SERVER
async function saveCSVData(silent = false) {
  if (!silent) setSyncStatus('syncing', 'Saving to CSV...');
  
  // Format state rows directly as [formal, informal, native, targetLanguage]
  const serializedRows = appState.rows.map(row => [
    row[1] || '', // formal
    row[2] || '', // informal
    row[3] || '', // native
    row[0] || ''  // targetLanguage
  ]);

  try {
    const res = await fetch('/api/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: serializedRows })
    });
    const result = await res.json();
    if (result.success) {
      if (!silent) {
        setSyncStatus('synced', 'Changes Saved');
        showToast('CSV saved to disk successfully', 'success');
      } else {
        setSyncStatus('synced', 'Auto-saved');
      }
    } else {
      setSyncStatus('error', 'Save Failed');
      showToast('Failed to save CSV to server', 'danger');
    }
  } catch (error) {
    console.error(error);
    setSyncStatus('error', 'Offline - Unsaved');
    showToast('Offline: Could not save CSV to server.', 'danger');
  }
}

// SETUP EVENT LISTENERS
function setupEventListeners() {
  targetLangSelect.addEventListener('change', (e) => {
    appState.targetLangCode = e.target.value;
    localStorage.setItem('target_lang_code', appState.targetLangCode);
    updateTableHeaders();
    populateVoices();
    showToast(`Target language updated to ${languageNameMap[appState.targetLangCode]}`, 'info');
  });

  nativeLangSelect.addEventListener('change', (e) => {
    appState.nativeLangCode = e.target.value;
    localStorage.setItem('native_lang_code', appState.nativeLangCode);
    updateTableHeaders();
    showToast(`Native language set to ${languageNameMap[appState.nativeLangCode]}`, 'info');
  });

  // Slider view toggle triggers
  const segments = viewSlider.querySelectorAll('.slider-segment');
  segments.forEach(segment => {
    segment.addEventListener('click', () => {
      segments.forEach(s => s.classList.remove('active'));
      segment.classList.add('active');
      appState.viewMode = segment.dataset.view;
      localStorage.setItem('translation_view_mode', appState.viewMode);
      renderTable();
      showToast(`Spreadsheet view set to: ${appState.viewMode.toUpperCase()}`, 'info');
    });
  });

  settingsToggleBtn.addEventListener('click', toggleDrawer);
  settingsCloseBtn.addEventListener('click', toggleDrawer);
  drawerOverlay.addEventListener('click', toggleDrawer);

  // Theme selector triggers
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const selectedTheme = btn.dataset.theme;
      document.body.setAttribute('data-theme', selectedTheme);
      localStorage.setItem('app_theme', selectedTheme);
      showToast(`Visual theme set to: ${selectedTheme.toUpperCase()}`, 'info');
    });
  });

  providerSelect.addEventListener('change', (e) => {
    appState.translationProvider = e.target.value;
    localStorage.setItem('translation_provider', appState.translationProvider);
    updateKeyUI();
    showToast(`Translation engine switched to ${appState.translationProvider.toUpperCase()}`, 'info');
  });

  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const provider = appState.translationProvider;
    
    if (provider === 'gemini') {
      appState.geminiKey = key;
      localStorage.setItem('gemini_api_key', key);
    } else if (provider === 'gpt') {
      appState.gptKey = key;
      localStorage.setItem('gpt_api_key', key);
    } else if (provider === 'claude') {
      appState.claudeKey = key;
      localStorage.setItem('claude_api_key', key);
    }
    
    updateKeyUI();
    apiKeyInput.value = '';
    showToast(`${provider.toUpperCase()} API Key saved client-side`, 'success');
  });

  customInstructionsInput.addEventListener('input', (e) => {
    appState.customInstructions = e.target.value;
    localStorage.setItem('custom_instructions', e.target.value);
  });

  saveBtn.addEventListener('click', () => saveCSVData());

  translateBtn.addEventListener('click', handleManualTranslate);
  phraseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleManualTranslate();
  });

  if (recognition) {
    recordBtn.addEventListener('click', startSpeechToText);
    stopRecordBtn.addEventListener('click', stopSpeechToText);
  } else {
    recordBtn.disabled = true;
    sttStatusPill.textContent = 'STT Unavail';
    sttStatusPill.className = 'badge disabled';
  }

  addRowBtn.addEventListener('click', () => {
    const defaultLang = languageNameMap[appState.targetLangCode] || 'Spanish';
    appState.rows.push([defaultLang, '', '', '']);
    renderTable();
    
    const newTr = spreadsheetTbody.lastElementChild;
    if (newTr) {
      const nativeCell = newTr.querySelector('.col-native');
      if (nativeCell) enterCellEditMode(nativeCell, appState.rows.length - 1, 3);
    }
    triggerAutoSave();
  });

  autoSaveToggle.addEventListener('change', (e) => {
    appState.autoSave = e.target.checked;
    localStorage.setItem('auto_save_pref', appState.autoSave);
    showToast(appState.autoSave ? 'Auto-save enabled' : 'Auto-save disabled', 'info');
  });

  gridSearch.addEventListener('input', renderTable);

  ttsVoiceSelect.addEventListener('change', (e) => {
    appState.selectedVoiceName = e.target.value;
    localStorage.setItem('tts_selected_voice', appState.selectedVoiceName);
    showToast('Pronunciation voice updated', 'info');
  });

  if (alwaysMatchAccentsToggle) {
    alwaysMatchAccentsToggle.addEventListener('change', (e) => {
      appState.alwaysMatchAccents = e.target.checked;
      localStorage.setItem('tts_always_match_accents', appState.alwaysMatchAccents);
      if (appState.alwaysMatchAccents) {
        voiceSelectGroup.classList.add('hidden');
      } else {
        voiceSelectGroup.classList.remove('hidden');
      }
      showToast(appState.alwaysMatchAccents ? 'Auto-matching accents enabled' : 'Manual voice selection active', 'info');
    });
  }

  const ttsRateInput = document.getElementById('tts-rate-input');
  const ttsRateVal = document.getElementById('tts-rate-val');
  if (ttsRateInput) {
    let lastValue = ttsRateInput.value;
    ttsRateInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val !== lastValue) {
        lastValue = val;
        appState.speechRate = parseFloat(val);
        localStorage.setItem('tts_speech_rate', val);
        if (ttsRateVal) ttsRateVal.textContent = `${val}x`;
        updateSpeedTicksUI(val);
        playRatchetClick();
      }
    });
  }

  exportCsvBtn.addEventListener('click', exportLocalCSV);
  importCsvTriggerBtn.addEventListener('click', () => csvFileInput.click());
  csvFileInput.addEventListener('change', importLocalCSV);
}

// SPEECH RECOGNITION TRIGGERS
function setupSTT() {
  if (!recognition) return;

  recognition.onstart = () => {
    appState.isRecording = true;
    recordingOverlay.classList.remove('hidden');
    showToast('Listening...', 'info');
  };

  recognition.onresult = async (event) => {
    const resultText = event.results[0][0].transcript;
    recordingOverlay.classList.add('hidden');
    appState.isRecording = false;
    
    if (resultText && resultText.trim()) {
      showToast(`Speech recognized: "${resultText}"`, 'success');
      await translateAndAddRow(resultText.trim(), true);
    }
  };

  recognition.onerror = (event) => {
    console.error(event.error);
    recordingOverlay.classList.add('hidden');
    appState.isRecording = false;
    if (event.error === 'not-allowed') {
      showToast('Microphone access denied. Enable browser permissions.', 'danger');
    } else {
      showToast(`Speech capture failed: ${event.error}`, 'danger');
    }
  };

  recognition.onend = () => {
    recordingOverlay.classList.add('hidden');
    appState.isRecording = false;
  };
}

function startSpeechToText() {
  if (!recognition) return;
  recognition.lang = appState.nativeLangCode;
  try {
    recognition.start();
  } catch (err) {
    console.error(err);
    recognition.stop();
  }
}

function stopSpeechToText() {
  if (!recognition) return;
  recognition.stop();
}

async function handleManualTranslate() {
  const text = phraseInput.value.trim();
  if (!text) {
    showToast('Please enter some text to translate.', 'info');
    return;
  }
  phraseInput.value = '';
  await translateAndAddRow(text, false);
}

// CALL TRANSLATE SERVICE & APPEND DUAL SENTENCES
async function translateAndAddRow(nativeText, isSTT = false) {
  setSyncStatus('syncing', 'Translating...');
  showToast('Translating phrase with LLM...', 'info');
  
  const provider = appState.translationProvider;
  const clientApiKey = 
    provider === 'gemini' ? appState.geminiKey :
    provider === 'gpt' ? appState.gptKey :
    provider === 'claude' ? appState.claudeKey : '';
  
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: nativeText,
        targetLanguage: languageNameMap[appState.targetLangCode] || 'Spanish',
        nativeLanguage: languageNameMap[appState.nativeLangCode] || 'English',
        provider: provider,
        clientApiKey: clientApiKey,
        customInstructions: appState.customInstructions
      })
    });

    const result = await res.json();
    if (result.success) {
      const formalText = result.formal || '';
      const informalText = result.informal || '';
      const cleanNativeText = isSTT ? (result.correctedNative || nativeText) : nativeText;
      const targetLangName = languageNameMap[appState.targetLangCode] || 'Spanish';
      
      appState.rows.push([targetLangName, formalText, informalText, cleanNativeText]);
      renderTable();
      triggerAutoSave();
      
      // Auto-pronounce according to view mode
      if (appState.viewMode === 'informal' && informalText) {
        playSpeechSynthesis(informalText, targetLangName);
      } else {
        playSpeechSynthesis(formalText, targetLangName);
      }
      showToast('Structured translation added to island', 'success');
    } else {
      showToast(`Translation error: ${result.error}`, 'danger');
      setSyncStatus('error', 'Translation failed');
    }
  } catch (error) {
    console.error(error);
    showToast('Failed to connect to translation server.', 'danger');
    setSyncStatus('error', 'Network failure');
  }
}

// RENDER SPREADSHEET GRID
function renderTable() {
  const query = gridSearch.value.toLowerCase().trim();
  spreadsheetTbody.innerHTML = '';
  let rowCount = 0;
  
  const tableEl = document.getElementById('spreadsheet-table');
  if (tableEl) {
    tableEl.className = `spreadsheet-table view-mode-${appState.viewMode}`;
  }
  
  appState.rows.forEach((row, index) => {
    const targetLanguage = row[0] || '';
    const formal = row[1] || '';
    const informal = row[2] || '';
    const native = row[3] || '';

    if (query && 
        !targetLanguage.toLowerCase().includes(query) &&
        !formal.toLowerCase().includes(query) && 
        !informal.toLowerCase().includes(query) && 
        !native.toLowerCase().includes(query)) {
      return;
    }

    rowCount++;
    const tr = document.createElement('tr');
    tr.dataset.index = index;
    tr.setAttribute('draggable', 'false');

    const targetLangs = [
      'Spanish',
      'French',
      'German',
      'Italian',
      'Japanese',
      'Chinese (Simplified)',
      'Portuguese',
      'Korean'
    ];
    const normalizedLangs = targetLangs.map(l => l.toLowerCase());
    let optionsHTML = '';
    targetLangs.forEach(lang => {
      const isSelected = (lang.toLowerCase() === targetLanguage.toLowerCase() || 
                          (lang === 'Chinese (Simplified)' && targetLanguage === 'Chinese'));
      optionsHTML += `<option value="${lang}" ${isSelected ? 'selected' : ''}>${lang}</option>`;
    });
    if (targetLanguage && !normalizedLangs.includes(targetLanguage.toLowerCase())) {
      optionsHTML += `<option value="${targetLanguage}" selected>${targetLanguage}</option>`;
    }
    
    const formalHTML = `
      <div class="translation-block">
        <span class="translation-text">${escapeHtml(formal)}</span>
        <div class="translation-actions">
          ${formal ? `<button class="play-inline-btn formal-play" data-text="${escapeHtml(formal)}" title="Hear formal pronunciation"><i class="fa-solid fa-volume-high"></i></button>` : ''}
          ${formal ? `<button class="copy-inline-btn formal-copy" data-text="${escapeHtml(formal)}" title="Copy formal translation"><i class="fa-solid fa-copy"></i></button>` : ''}
        </div>
      </div>
    `;

    const informalHTML = `
      <div class="translation-block">
        <span class="translation-text">${escapeHtml(informal)}</span>
        <div class="translation-actions">
          ${informal ? `<button class="play-inline-btn informal-play" data-text="${escapeHtml(informal)}" title="Hear casual pronunciation"><i class="fa-solid fa-volume-high"></i></button>` : ''}
          ${informal ? `<button class="copy-inline-btn informal-copy" data-text="${escapeHtml(informal)}" title="Copy casual translation"><i class="fa-solid fa-copy"></i></button>` : ''}
        </div>
      </div>
    `;

    tr.innerHTML = `
      <td class="col-drag">
        <div class="drag-handle" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></div>
      </td>
      <td class="col-index">${index + 1}</td>
      <td class="col-foreign-formal editable-cell" tabindex="0">${formalHTML}</td>
      <td class="col-foreign-informal editable-cell" tabindex="0">${informalHTML}</td>
      <td class="col-native editable-cell" tabindex="0">${escapeHtml(native)}</td>
      <td class="col-actions">
        <select class="row-language-select" title="Change target language">
          ${optionsHTML}
        </select>
        <button class="regenerate-row-btn" title="Regenerate Translation"><i class="fa-solid fa-arrows-rotate"></i></button>
        <button class="delete-row-btn" title="Delete Row"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;

    const formalCell = tr.querySelector('.col-foreign-formal');
    const informalCell = tr.querySelector('.col-foreign-informal');
    const nativeCell = tr.querySelector('.col-native');
    const langSelect = tr.querySelector('.row-language-select');

    formalCell.addEventListener('dblclick', () => enterCellEditMode(formalCell, index, 1));
    informalCell.addEventListener('dblclick', () => enterCellEditMode(informalCell, index, 2));
    nativeCell.addEventListener('dblclick', () => enterCellEditMode(nativeCell, index, 3));

    formalCell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); enterCellEditMode(formalCell, index, 1); }
    });
    informalCell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); enterCellEditMode(informalCell, index, 2); }
    });
    nativeCell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); enterCellEditMode(nativeCell, index, 3); }
    });

    // Inline TTS triggers
    tr.querySelectorAll('.play-inline-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const speakText = btn.dataset.text;
        playSpeechSynthesis(speakText, targetLanguage);
      });
    });

    // Copy to clipboard triggers
    tr.querySelectorAll('.copy-inline-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const textToCopy = btn.dataset.text;
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('Copied to clipboard!', 'success');
          const iconEl = btn.querySelector('i');
          const originalClass = iconEl.className;
          iconEl.className = 'fa-solid fa-check';
          setTimeout(() => {
            iconEl.className = originalClass;
          }, 1500);
        }).catch(err => {
          console.error('Failed to copy: ', err);
          showToast('Failed to copy to clipboard', 'danger');
        });
      });
    });

    // Row language select change listener
    langSelect.addEventListener('change', async () => {
      const prevLang = appState.rows[index][0];
      const newLang = langSelect.value;
      const success = await regenerateRowTranslation(index, newLang, prevLang);
      if (!success) {
        langSelect.value = prevLang;
      }
    });

    // Regenerate & Delete triggers
    tr.querySelector('.regenerate-row-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      regenerateRowTranslation(index);
    });

    tr.querySelector('.delete-row-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      appState.rows.splice(index, 1);
      renderTable();
      triggerAutoSave();
      showToast('Row deleted', 'info');
    });

    setupRowDragAndDrop(tr, index);

    spreadsheetTbody.appendChild(tr);
  });

  totalRowsCount.textContent = rowCount;
}

// REGENERATE ROW TRANSLATION
async function regenerateRowTranslation(index, targetLanguageStr = null, fallbackLanguageStr = null) {
  const row = appState.rows[index];
  if (!row) return false;
  const targetLang = targetLanguageStr || row[0] || languageNameMap[appState.targetLangCode] || 'Spanish';
  const nativeText = row[3];
  if (!nativeText) {
    showToast('Native sentence is empty.', 'info');
    return false;
  }

  // Find the row's regenerate button and language select to animate/disable
  const rowEl = spreadsheetTbody.querySelector(`tr[data-index="${index}"]`);
  const regenBtn = rowEl ? rowEl.querySelector('.regenerate-row-btn') : null;
  const langSelect = rowEl ? rowEl.querySelector('.row-language-select') : null;

  if (regenBtn) {
    regenBtn.classList.add('spinning');
    regenBtn.disabled = true;
  }
  if (langSelect) {
    langSelect.disabled = true;
  }

  setSyncStatus('syncing', 'Re-translating...');
  showToast('Re-translating row...', 'info');

  const provider = appState.translationProvider;
  const clientApiKey = 
    provider === 'gemini' ? appState.geminiKey :
    provider === 'gpt' ? appState.gptKey :
    provider === 'claude' ? appState.claudeKey : '';

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: nativeText,
        targetLanguage: targetLang,
        nativeLanguage: languageNameMap[appState.nativeLangCode] || 'English',
        provider: provider,
        clientApiKey: clientApiKey,
        customInstructions: appState.customInstructions
      })
    });

    const result = await res.json();
    if (result.success) {
      appState.rows[index] = [
        targetLang,
        result.formal || '',
        result.informal || '',
        nativeText
      ];
      renderTable();
      triggerAutoSave();
      showToast('Translation regenerated successfully!', 'success');
      return true;
    } else {
      showToast(`Regeneration failed: ${result.error}`, 'danger');
      setSyncStatus('error', 'Regeneration failed');
      if (langSelect && fallbackLanguageStr) {
        langSelect.value = fallbackLanguageStr;
      }
      return false;
    }
  } catch (err) {
    console.error(err);
    showToast('Network error during regeneration.', 'danger');
    setSyncStatus('error', 'Network failure');
    if (langSelect && fallbackLanguageStr) {
      langSelect.value = fallbackLanguageStr;
    }
    return false;
  } finally {
    if (regenBtn) {
      regenBtn.classList.remove('spinning');
      regenBtn.disabled = false;
    }
    if (langSelect) {
      langSelect.disabled = false;
    }
  }
}

// SETUP ROW DRAG AND DROP
let dragSourceEl = null;

function setupRowDragAndDrop(tr, index) {
  const handle = tr.querySelector('.drag-handle');
  if (handle) {
    handle.addEventListener('mousedown', () => {
      tr.setAttribute('draggable', 'true');
    });
    handle.addEventListener('mouseup', () => {
      tr.setAttribute('draggable', 'false');
    });
    handle.addEventListener('mouseleave', () => {
      tr.setAttribute('draggable', 'false');
    });
  }

  tr.addEventListener('dragstart', (e) => {
    dragSourceEl = tr;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  });

  tr.addEventListener('dragover', (e) => {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    if (tr !== dragSourceEl) {
      const bounding = tr.getBoundingClientRect();
      const offset = e.clientY - bounding.top;
      if (offset > bounding.height / 2) {
        tr.classList.add('drag-over-bottom');
        tr.classList.remove('drag-over-top');
      } else {
        tr.classList.add('drag-over-top');
        tr.classList.remove('drag-over-bottom');
      }
    }
    return false;
  });

  tr.addEventListener('dragleave', () => {
    tr.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  tr.addEventListener('drop', (e) => {
    e.stopPropagation();
    if (dragSourceEl && dragSourceEl !== tr) {
      const fromIndex = parseInt(dragSourceEl.dataset.index);
      let toIndex = parseInt(tr.dataset.index);

      const bounding = tr.getBoundingClientRect();
      const offset = e.clientY - bounding.top;
      const isBelow = offset > bounding.height / 2;

      if (isBelow && fromIndex > toIndex) {
        toIndex++;
      } else if (!isBelow && fromIndex < toIndex) {
        toIndex--;
      }

      if (fromIndex !== toIndex) {
        const movedRow = appState.rows.splice(fromIndex, 1)[0];
        appState.rows.splice(toIndex, 0, movedRow);
        renderTable();
        triggerAutoSave();
        showToast('Row reordered', 'success');
      }
    }
    return false;
  });

  tr.addEventListener('dragend', () => {
    tr.classList.remove('dragging');
    const rows = spreadsheetTbody.querySelectorAll('tr');
    rows.forEach(row => {
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      row.setAttribute('draggable', 'false');
    });
  });
}


// INLINE SPREADSHEET CELL EDITORS
function enterCellEditMode(cellElement, rowIndex, colIndex) {
  if (cellElement.classList.contains('editing')) return;
  cellElement.classList.add('editing');

  const originalText = appState.rows[rowIndex][colIndex] || '';
  cellElement.innerHTML = '';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalText;
  input.className = 'cell-input-editor';
  
  cellElement.appendChild(input);
  input.focus();

  const commitSingleEdit = () => {
    if (!cellElement.classList.contains('editing')) return;
    const newText = input.value.trim();
    appState.rows[rowIndex][colIndex] = newText;
    cellElement.classList.remove('editing');
    
    renderTable();

    if (newText !== originalText) {
      triggerAutoSave();
    }
  };

  input.addEventListener('blur', commitSingleEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitSingleEdit();
    } else if (e.key === 'Escape') {
      cellElement.classList.remove('editing');
      renderTable();
    }
  });
}

// BROWSER NATIVE SPEECH ACCENT SELECTOR
function playSpeechSynthesis(text, rowLanguage = '') {
  if (!text) return;
  if (typeof speechSynthesis === 'undefined') {
    showToast('Speech synthesis is not supported on this browser.', 'danger');
    return;
  }

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const allVoices = speechSynthesis.getVoices();
  let selectedVoice = null;

  if (appState.alwaysMatchAccents && rowLanguage) {
    let langCode = '';
    for (const [code, name] of Object.entries(languageNameMap)) {
      if (name.toLowerCase() === rowLanguage.toLowerCase() || 
          (name === 'Chinese (Simplified)' && rowLanguage === 'Chinese')) {
        langCode = code;
        break;
      }
    }
    
    if (langCode) {
      const prefix = langCode.split('-')[0].toLowerCase();
      selectedVoice = allVoices.find(voice => {
        const voiceLang = voice.lang.toLowerCase();
        return voiceLang.startsWith(prefix) || voiceLang === langCode.toLowerCase();
      });
      if (selectedVoice) {
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = langCode;
      }
    }
  }

  if (!selectedVoice) {
    selectedVoice = allVoices.find(v => v.name === appState.selectedVoiceName);
  }

  if (!selectedVoice) {
    const langPrefix = appState.targetLangCode.split('-')[0].toLowerCase();
    selectedVoice = allVoices.find(voice => {
      const voiceLang = voice.lang.toLowerCase();
      return voiceLang.startsWith(langPrefix) || voiceLang === appState.targetLangCode.toLowerCase();
    });
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    if (!utterance.lang) {
      utterance.lang = selectedVoice.lang;
    }
  } else {
    utterance.lang = appState.targetLangCode;
  }

  utterance.rate = appState.speechRate || 1.0;
  speechSynthesis.speak(utterance);
}

// POPULATE BROWSER SYNTHESIS VOICES
function populateVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  const allVoices = speechSynthesis.getVoices();
  ttsVoiceSelect.innerHTML = '';
  
  const targetPrefix = appState.targetLangCode.split('-')[0].toLowerCase();
  const matchingVoices = allVoices.filter(voice => {
    const voiceLang = voice.lang.toLowerCase();
    return voiceLang.startsWith(targetPrefix) || voiceLang === appState.targetLangCode.toLowerCase();
  });

  // Check if current selected voice name actually matches the target language.
  // If not, default to the first matching voice (or empty if none).
  if (allVoices.length > 0) {
    let currentVoiceValid = false;
    if (appState.selectedVoiceName) {
      const selectedVoice = allVoices.find(v => v.name === appState.selectedVoiceName);
      if (selectedVoice) {
        const voiceLang = selectedVoice.lang.toLowerCase();
        if (voiceLang.startsWith(targetPrefix) || voiceLang === appState.targetLangCode.toLowerCase()) {
          currentVoiceValid = true;
        }
      }
    }

    if (!currentVoiceValid) {
      appState.selectedVoiceName = matchingVoices.length > 0 ? matchingVoices[0].name : '';
      localStorage.setItem('tts_selected_voice', appState.selectedVoiceName);
    }
  }

  const otherVoices = allVoices.filter(voice => !matchingVoices.includes(voice));
  const optGroupMatching = document.createElement('optgroup');
  optGroupMatching.label = `Accents matching: ${languageNameMap[appState.targetLangCode] || 'Foreign'}`;
  
  matchingVoices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    if (voice.name === appState.selectedVoiceName) option.selected = true;
    optGroupMatching.appendChild(option);
  });
  ttsVoiceSelect.appendChild(optGroupMatching);

  const optGroupOther = document.createElement('optgroup');
  optGroupOther.label = 'Other Accents';
  otherVoices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    if (voice.name === appState.selectedVoiceName) option.selected = true;
    optGroupOther.appendChild(option);
  });
  ttsVoiceSelect.appendChild(optGroupOther);

  if (matchingVoices.length === 0 && allVoices.length > 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'System default (No matching accent found)';
    ttsVoiceSelect.prepend(option);
  }
}

// AUTO-SAVE MANAGER
function triggerAutoSave() {
  if (appState.autoSave) {
    saveCSVData(true);
  } else {
    setSyncStatus('unsaved', 'Unsaved changes');
  }
}

// SYSTEM DRAWER HANDLERS
function toggleDrawer() {
  const isOpen = settingsDrawer.classList.contains('open');
  if (isOpen) {
    settingsDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  } else {
    settingsDrawer.classList.add('open');
    drawerOverlay.classList.add('open');
  }
}

function setSyncStatus(state, message) {
  saveIndicator.className = `sync-status ${state}`;
  let icon = '<i class="fa-solid fa-circle-check"></i>';
  
  if (state === 'syncing') {
    icon = '<i class="fa-solid fa-arrows-rotate fa-spin"></i>';
    saveIndicator.className = 'sync-status unsaved';
  } else if (state === 'unsaved') {
    icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    saveIndicator.className = 'sync-status unsaved';
  } else if (state === 'error') {
    icon = '<i class="fa-solid fa-circle-xmark"></i>';
    saveIndicator.className = 'sync-status text-danger';
  } else if (state === 'synced') {
    saveIndicator.className = 'sync-status saved';
  }

  saveIndicator.innerHTML = `${icon} ${message}`;
}

function updateKeyUI() {
  const provider = appState.translationProvider;
  if (provider === 'gemini') {
    apiKeyLabel.textContent = 'Gemini API Key';
    apiKeyInput.placeholder = 'AIzaSy...';
    keyStatusLabel.textContent = appState.geminiKey ? 'Gemini Key Saved (Client Active)' : 'Using Server Config Key (defined in server .env or blank)';
    keyStatusLabel.className = appState.geminiKey ? 'form-help text-success' : 'form-help text-muted';
  } else if (provider === 'gpt') {
    apiKeyLabel.textContent = 'GPT (OpenAI) API Key';
    apiKeyInput.placeholder = 'sk-...';
    keyStatusLabel.textContent = appState.gptKey ? 'OpenAI Key Saved (Client Active)' : 'Using Server Config Key (defined in server .env or blank)';
    keyStatusLabel.className = appState.gptKey ? 'form-help text-success' : 'form-help text-muted';
  } else if (provider === 'claude') {
    apiKeyLabel.textContent = 'Claude (Anthropic) API Key';
    apiKeyInput.placeholder = 'sk-ant-...';
    keyStatusLabel.textContent = appState.claudeKey ? 'Claude Key Saved (Client Active)' : 'Using Server Config Key (defined in server .env or blank)';
    keyStatusLabel.className = appState.claudeKey ? 'form-help text-success' : 'form-help text-muted';
  }
}

// BROWSER EXPORT TO CSV
function exportLocalCSV() {
  if (appState.rows.length === 0) {
    showToast('Spreadsheet is empty. Nothing to export.', 'info');
    return;
  }

  const data = [['Foreign (Formal)', 'Foreign (Informal)', 'Native Tongue', 'Target Language']];
  
  appState.rows.forEach(row => {
    data.push([
      row[1] || '', // formal
      row[2] || '', // informal
      row[3] || '', // native
      row[0] || ''  // targetLanguage
    ]);
  });
  
  // Custom CSV Stringifier
  const csvContent = data.map(row => 
    row.map(val => {
      const str = val === null || val === undefined ? '' : String(val);
      const cleaned = str.replace(/"/g, '""');
      if (cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n') || cleaned.includes('\r')) {
        return `"${cleaned}"`;
      }
      return cleaned;
    }).join(',')
  ).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  const targetName = languageNameMap[appState.targetLangCode] || 'foreign';
  link.setAttribute('download', `language_island_${targetName.toLowerCase()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('CSV downloaded successfully', 'success');
}

// BROWSER IMPORT FROM CSV
function importLocalCSV(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    const allRows = clientParseCSV(text);
    
    if (allRows.length === 0) {
      showToast('Uploaded CSV is empty.', 'danger');
      return;
    }

    let targetIdx = -1;
    let formalIdx = -1;
    let informalIdx = -1;
    let nativeIdx = -1;

    let rowsToImport = allRows;
    if (rowsToImport.length > 0) {
      const headers = rowsToImport[0].map(h => h.trim().toLowerCase());
      
      const hasHeader = headers.some(h => 
        h.includes('target') || 
        h.includes('foreign') || 
        h.includes('native') || 
        h.includes('formal') || 
        h.includes('informal') || 
        h.includes('translation') || 
        h.includes('casual')
      );
      
      if (hasHeader) {
        headers.forEach((header, idx) => {
          if (header.includes('target') || header === 'language') {
            targetIdx = idx;
          } else if (header.includes('formal') || (header.includes('foreign') && !header.includes('informal') && formalIdx === -1)) {
            formalIdx = idx;
          } else if (header.includes('informal') || header.includes('casual')) {
            informalIdx = idx;
          } else if (header.includes('native') || header.includes('english') || header.includes('tongue')) {
            nativeIdx = idx;
          }
        });
        rowsToImport = rowsToImport.slice(1);
      }
    }

    // Map rows based on header mapping or index fallback
    appState.rows = rowsToImport.map(row => {
      let targetVal = '';
      let formalVal = '';
      let informalVal = '';
      let nativeVal = '';

      if (targetIdx !== -1) targetVal = row[targetIdx] || '';
      if (formalIdx !== -1) formalVal = row[formalIdx] || '';
      if (informalIdx !== -1) informalVal = row[informalIdx] || '';
      if (nativeIdx !== -1) nativeVal = row[nativeIdx] || '';

      if (targetIdx === -1 && formalIdx === -1 && informalIdx === -1 && nativeIdx === -1) {
        if (row.length >= 4) {
          targetVal = row[3] || '';
          formalVal = row[0] || '';
          informalVal = row[1] || '';
          nativeVal = row[2] || '';
        } else if (row.length === 3) {
          targetVal = languageNameMap[appState.targetLangCode] || 'Spanish';
          formalVal = row[0] || '';
          informalVal = row[1] || '';
          nativeVal = row[2] || '';
        } else {
          const foreignCombined = row[0] || '';
          nativeVal = row[1] || '';
          formalVal = foreignCombined;
          if (foreignCombined.includes('|')) {
            const parts = foreignCombined.split('|');
            formalVal = parts[0].trim();
            informalVal = parts[1].trim();
          }
          targetVal = languageNameMap[appState.targetLangCode] || 'Spanish';
        }
      } else {
        if (targetIdx === -1) targetVal = languageNameMap[appState.targetLangCode] || 'Spanish';
      }

      return [targetVal, formalVal, informalVal, nativeVal];
    });

    renderTable();
    triggerAutoSave();
    showToast(`Successfully imported ${rowsToImport.length} rows!`, 'success');
  };
  
  reader.readAsText(file);
  e.target.value = '';
}

// Robust character-by-character CSV parser supporting newlines inside quotes
function clientParseCSV(text) {
  const result = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      i++;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      row.push(current);
      result.push(row);
      row = [];
      current = '';
      if (char === '\r' && text[i + 1] === '\n') {
        i += 2;
      } else {
        i++;
      }
    } else {
      current += char;
      i++;
    }
  }
  
  if (row.length > 0 || current !== '') {
    row.push(current);
    result.push(row);
  }
  
  return result.filter(r => r.some(cell => cell.trim() !== ''));
}

// TOAST NOTIFICATIONS
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === 'danger') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  
  toast.innerHTML = `${icon} <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 4000);
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// RATCHET SELECTOR UTILITIES
let audioCtx = null;
function playRatchetClick() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.015);
    
    gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.015);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.015);
  } catch (e) {
    console.warn('Audio Context error:', e);
  }
}

function updateSpeedTicksUI(val) {
  const valFloat = parseFloat(val);
  const tickIndex = Math.round((valFloat - 0.5) * 10);
  const ticks = document.querySelectorAll('.slider-ticks .tick');
  ticks.forEach((tick, i) => {
    if (i === tickIndex) {
      tick.classList.add('active');
    } else {
      tick.classList.remove('active');
    }
  });
}
