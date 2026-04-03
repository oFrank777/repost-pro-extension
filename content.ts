import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["*://*.tiktok.com/*"],
  all_frames: true
}

let state = {
  isRunning: false,
  processedCount: 0,
  maxActions: 25,
  criticalPause: false, 
  consecutiveErrors: 0,
  logBuffer: [],
  delayMultiplier: 1.0,
  appLang: 'es',
  isOrphaned: false
};

const T_LOG = (es: string, en: string) => state.appLang === 'es' ? es : en;

let SELECTORS = {
  repostTab: [],
  shareActionBtn: [],
  repostInnerShareBtn: [],
  nextVideoBtn: [],
  threatModals: ['[data-e2e="verify-slider"]', '.tiktok-modal-title', '[data-e2e="toast-message"]']
};

const DEFAULT_FALLBACKS = {
  shareActionBtn: ['a[data-e2e="video-share-repost"]', 'div[aria-label*="Eliminar" i]', 'div[aria-label*="Remove" i]'],
  nextBtn: ['button[data-e2e="arrow-right"]', 'button[data-e2e="browse-video-down"]']
};

let currentSessionToken: string | null = null;
let activeTrialFingerprint: string | null = null;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const calculateHumanDelay = (baseMs: number) => (baseMs + (Math.random() * (baseMs * 0.5))) * state.delayMultiplier;

function queryWithFallbacks(selectorList: string[], context: Document | Element = document) {
  for (let selector of selectorList) {
    try {
      if (selector.startsWith('TEXT:')) {
        const textToFind = selector.substring(5).toLowerCase();
        const elements = context.querySelectorAll('button, span, div, p');
        for (let el of elements) {
           const htmlEl = el as HTMLElement;
           if (htmlEl.innerText && htmlEl.innerText.toLowerCase().trim() === textToFind) return htmlEl;
        }
      } else {
        const el = context.querySelector(selector) as HTMLElement;
        if (el) return el;
      }
    } catch(e) { }
  }
  return null;
}

async function waitForElement(selectorList: string[], maxTimeout = 5000, context: Document | Element = document) {
  let timeElapsed = 0;
  const tick = 250;
  while (timeElapsed < maxTimeout) {
    if (!state.isRunning) return null;
    const el = queryWithFallbacks(selectorList, context);
    if (el) return el;
    await delay(tick);
    timeElapsed += tick;
  }
  return null;
}

function safeSendMessage(message: any) {
  try {
    if (chrome.runtime && chrome.runtime.id) {
      return chrome.runtime.sendMessage(message).catch(() => {});
    }
  } catch (e) { }
  return Promise.resolve();
}

function emitUpdate(statusMode = state.isRunning ? 'running' : 'stopped') {
  safeSendMessage({
    type: 'UPDATE_STATUS',
    state: statusMode,
    count: state.processedCount,
    max: state.maxActions
  });
}

function emitLog(text: string, level = 'normal') {
  const timestamp = new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
  const logMessage = { text: `[${timestamp}] ${text}`, level };
  
  state.logBuffer.push(logMessage as never);
  if (state.logBuffer.length > 20) state.logBuffer.shift(); 

  console.log(`[TikTok Repost Manager] ${level.toUpperCase()}: ${text}`);
  safeSendMessage({ type: 'LOG', ...logMessage });
}

function detectThreats() {
  const threatElement = queryWithFallbacks(SELECTORS.threatModals);
  if (threatElement) {
    const text = (threatElement.innerText || "").toLowerCase();
    const limitKeywords = ['demasiado', 'too many', 'límite', 'limit', 'rápido', 'fast', 'frecuencia'];
    if (limitKeywords.some(kw => text.includes(kw))) return 'RATE_LIMIT';
    if (queryWithFallbacks(['[data-e2e="verify-slider"]'])) return 'CAPTCHA';
    return 'UNKNOWN_MODAL';
  }
  return 'SAFE';
}

function simulateHumanClick(element: HTMLElement) {
  const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  events.forEach(evType => {
    element.dispatchEvent(new MouseEvent(evType, { view: window, bubbles: true, cancelable: true, buttons: 1 }));
  });
}

function heuristicSearch(type: 'DELETE' | 'NEXT' | 'TAB') {
  if (type === 'TAB') {
     const tabs = Array.from(document.querySelectorAll('div[role="tab"], [data-e2e="repost-tab"]')) as HTMLElement[];
     return tabs.find(el => el.innerText?.toLowerCase().includes('repost') || el.getAttribute('data-e2e') === 'repost-tab');
  }
  if (type === 'DELETE') {
     const possible = Array.from(document.querySelectorAll('a, button, div[role="button"]')) as HTMLElement[];
     return possible.find(el => {
        const label = (el.getAttribute('aria-label') || "").toLowerCase();
        const text = (el.innerText || "").toLowerCase();
        return (label.includes('eliminar') || label.includes('remove') || text.includes('repost')) && (el.offsetWidth > 0);
     });
  } else {
     const nextSelectors = ['button[data-e2e="arrow-right"]', 'button[data-e2e="browse-video-down"]', '.arrow-right'];
     let btn = queryWithFallbacks(nextSelectors) as HTMLElement;
     if (btn) return btn;
     const possible = Array.from(document.querySelectorAll('button')) as HTMLElement[];
     return possible.find(el => el.getAttribute('data-e2e')?.includes('arrow') || el.className.includes('down'));
  }
}

function unlockRepostTab() {
  let tab = queryWithFallbacks(SELECTORS.repostTab) || heuristicSearch('TAB');
  if (tab) {
    tab.style.setProperty('display', 'block', 'important');
    tab.style.setProperty('visibility', 'visible', 'important');
    tab.style.setProperty('opacity', '1', 'important');
    simulateHumanClick(tab);
    emitLog(T_LOG('Sincronizando pestaña de Reposts...', 'Syncing Reposts tab...'), 'success');
  }
}

async function stopManager(reason = 'Usuario abortó.') {
  state.isRunning = false;
  emitUpdate(state.criticalPause ? 'blocked' : 'stopped');
  emitLog(`Ejecución terminada: ${reason}`, 'warn');
  
  safeSendMessage({ 
      type: "NOTIFY_SYSTEM", 
      title: "Limpieza Puesta en Pausa", 
      message: reason 
  });
}

async function startManager() {
  if (state.isRunning || state.criticalPause) return;
  
  state.isRunning = true;
  state.processedCount = 0;
  state.consecutiveErrors = 0;
  emitUpdate('running');
  emitLog(`Motor Iniciado (Límite: ${state.maxActions})`, 'info');
  await executeLifecycle();
}

async function handleThreat(threatType: string) {
  emitLog(`[THREAT DETECTED] ${threatType}`, 'error');
  if (threatType === 'CAPTCHA') {
    state.criticalPause = true;
    stopManager('Sistema exige Captcha manual para continuar.');
  } else if (threatType === 'RATE_LIMIT') {
    emitLog('Rate Limit en efecto. Pausa reactiva de 30s...', 'warn');
    state.isRunning = false; 
    emitUpdate('paused');
    await delay(30000); 
    if (detectThreats() !== 'SAFE') {
       state.criticalPause = true;
       stopManager('Persistent Rate Limit. Servidor rechaza solicitudes.');
    } else {
       emitLog('Vía libre detectada. Reanudando operaciones.', 'info');
       state.isRunning = true;
       emitUpdate('running');
       await executeLifecycle(); 
    }
  }
}

async function executeLifecycle() {
  try {
    while (state.processedCount < state.maxActions && state.isRunning) {
      if (isOrphaned()) { stopManager("Extensión desconectada."); break; }

      // ENTERPRISE INTEGRITY CHECK
      if (!currentSessionToken || currentSessionToken.length < 5) {
        emitLog(T_LOG("❌ Error de Seguridad: Sesión no autorizada.", "❌ Security Error: Unauthorized Session."), "error");
        stopManager("Unauthorized");
        break;
      }

      emitLog(`Analizando nodo ${state.processedCount + 1}...`);
      
      const threat = detectThreats();
      if (threat !== 'SAFE') { await handleThreat(threat); if (!state.isRunning) break; }

      let deleteBtn = queryWithFallbacks(SELECTORS.shareActionBtn) as HTMLElement;
      if (!deleteBtn) deleteBtn = queryWithFallbacks(DEFAULT_FALLBACKS.shareActionBtn) as HTMLElement;
      if (!deleteBtn) deleteBtn = heuristicSearch('DELETE');
                     
      if (deleteBtn) {
        simulateHumanClick(deleteBtn);
        state.processedCount++;
        state.consecutiveErrors = 0; 
        emitUpdate('running');
        
        safeSendMessage({ type: "UPDATE_BADGE", text: state.processedCount.toString() });
        
        if (activeTrialFingerprint) {
           safeSendMessage({ type: "TRIAL_INCREMENT", amount: 1, fingerprint: activeTrialFingerprint });
        }
      } else {
        state.consecutiveErrors++;
        emitLog(T_LOG('Buscando botón... Reintentando heurística.', 'Searching button... retrying heuristics.'), 'warn');
        if (state.consecutiveErrors >= 5) {
            safeSendMessage({ 
               type: "TELEMETRY", 
               error: "DOM_SELECTOR_FAIL", 
               details: "TikTok UI changed or blocked. Reporting to Engineering."
            });
            stopManager(T_LOG('Protección Anti-Crash: Interfaz no reconocida.', 'Anti-Crash: Recognition fail.'));
            break;
        }
      }

      if (!state.isRunning) break;

      let nextBtn = queryWithFallbacks(SELECTORS.nextVideoBtn) as HTMLButtonElement;
      if (!nextBtn) nextBtn = queryWithFallbacks(DEFAULT_FALLBACKS.nextBtn) as HTMLButtonElement;
      if (!nextBtn) nextBtn = heuristicSearch('NEXT') as HTMLButtonElement;

      if (nextBtn && !nextBtn.disabled) {
        simulateHumanClick(nextBtn);
      } else {
        stopManager(T_LOG('Fin de la lista detectado.', 'End of list detected.'));
        break;
      }

      const jitterMs = Math.floor(Math.random() * (1100 - 714 + 1)) + 714;
      await delay(jitterMs * state.delayMultiplier);
    }

    if (state.processedCount >= state.maxActions) {
      stopManager('Límite de capa de seguridad alcanzado exitosamente.');
    }

  } catch (error) {
    stopManager('Fallo catastrófico del controlador.');
  }
}

try {
  chrome.runtime.onConnect?.addListener(() => {});
} catch(e) { }

window.addEventListener('unload', () => { }); 

const isOrphaned = () => {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
    return true;
  }
  return false;
};

setInterval(() => {
  if (isOrphaned()) {
    if (state.isRunning) {
      state.isRunning = false;
      console.warn("[TikTok PRO] Contexto invalidado - Recarga la página.");
    }
  }
}, 5000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (isOrphaned()) return;
  if (request.sessionToken) {
    if (!currentSessionToken) currentSessionToken = request.sessionToken;
    const isVipBypass = request.sessionToken === 'VIP-PERMANENT-BYPASS' || request.sessionToken === 'AUTO-TRIAL';
    if (currentSessionToken !== request.sessionToken && !isVipBypass) {
       emitLog(T_LOG('ALERTA DE SEGURIDAD: Token de sesión alterado.', 'SECURITY ALERT: Altered session token.'), 'error');
       return false;
    }
  }

  if (request.config && typeof request.config === 'object') {
     SELECTORS = { ...SELECTORS, ...request.config };
     emitLog('Configuración en la nube sincronizada correctamente.', 'info');
  }

  if (request.settings) {
     if (request.settings.maxActions) state.maxActions = request.settings.maxActions;
     if (request.settings.delayMultiplier) state.delayMultiplier = request.settings.delayMultiplier;
     if (request.settings.lang) state.appLang = request.settings.lang;
  }

  switch (request.action) {
    case 'SHOW_TAB': unlockRepostTab(); sendResponse({ status: 'ok' }); break;
    case 'START': 
      const isVideoOrPhotoUrl = window.location.href.includes('/video/') || window.location.href.includes('/photo/');
      const isModalOpen = !!document.querySelector('[data-e2e="browse-close"]') || !!document.querySelector('button[data-e2e="browse-video-down"]');
      if (!isVideoOrPhotoUrl && !isModalOpen) {
         sendResponse({ status: 'error', reason: 'Abre un video de la cuadrícula antes de iniciar (haz clic sobre él).' });
         break;
      }
      activeTrialFingerprint = request.trialData ? request.trialData.fingerprint : null;
      startManager(); 
      sendResponse({ status: 'ok' }); 
      break;
    case 'STOP': stopManager('Parada Manual de Administrador.'); sendResponse({ status: 'ok' }); break;
    case 'GET_STATE':
      let currentStatus = state.isRunning ? 'running' : 'stopped';
      if (state.criticalPause) currentStatus = 'blocked';
      sendResponse({ state: currentStatus, count: state.processedCount, max: state.maxActions, logs: state.logBuffer });
      break;
  }
  return true;
});
