import { useState, useEffect } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { createClient } from "@supabase/supabase-js"

import "./style.css"
import logo from "url:./assets/logo.png"

const supabaseUrl = process.env.PLASMO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY

let supabaseInstance: any = null
const getSupabase = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseInstance
}
const supabase = getSupabase()

const SUPPORT_EMAIL = "theultimate_warrior2015@outlook.com"
const DEFAULT_LANDING = process.env.PLASMO_PUBLIC_LANDING_URL || "https://repost-pro-landing.vercel.app"

const getBrowserFingerprint = async () => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText('TikTok Pro Enterprise', 2, 15);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.fillText('TikTok Pro Enterprise', 4, 17);
  const canvasData = canvas.toDataURL();

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + 'x' + screen.height,
    navigator.hardwareConcurrency,
    (navigator as any).deviceMemory || (navigator as any).deviceMemory === 0 ? (navigator as any).deviceMemory : 4,
    canvasData
  ].join('|||');

  const msgBuffer = new TextEncoder().encode(components);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function Popup() {
  const [lang, setLang] = useStorage("app_lang", navigator.language.startsWith('es') ? 'es' : 'en')
  const T = (es: string, en: string) => lang === 'es' ? es : en

  const [licenseKey, setLicenseKey] = useStorage("licenseKey", "")
  const [deviceId, setDeviceId] = useStorage("deviceId", "")
  const [sessionToken, setSessionToken] = useStorage("sessionToken", "")
  const [dynamicConfig, setDynamicConfig] = useStorage("dynamicConfig", null)
  const [lifetimeDeleted] = useStorage("lifetimeDeleted", 0)

  const [maxActions, setMaxActions] = useStorage("maxActions", 25)
  const [licenseInfo, setLicenseInfo] = useStorage("licenseInfo", { email: "", expiresAt: "" })

  const [isValidated, setIsValidated] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isTrialMode, setIsTrialMode] = useState(false)
  const [trialUsed, setTrialUsed] = useState(0)
  const [trialLimit, setTrialLimit] = useState(80)

  const [engineStatus, setEngineStatus] = useState("stopped")

  const [feedback, setFeedback] = useState<{ msg: string, type: 'error' | 'success' | 'info' } | null>(null)

  const [logs, setLogs] = useState<{ text: string, level: string }[]>([])
  const [processedCount, setProcessedCount] = useState(0)

  const showFeedback = (msg: string, type: 'error' | 'success' | 'info' = 'error') => {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 4500)
  }

  useEffect(() => {
    const listener = (request: any) => {
      if (request.type === 'LOG') {
        setLogs(prev => {
          const newLogs = [...prev, request];
          if (newLogs.length > 50) newLogs.shift();
          return newLogs;
        });
      } else if (request.type === 'UPDATE_STATUS') {
        setEngineStatus(request.state);
        if (request.count !== undefined) setProcessedCount(request.count);
        if (request.state === 'stopped') {
          getBrowserFingerprint().then(fp => {
            supabase.rpc('get_trial_status', { p_fingerprint: fp }).then(({ data }) => {
              if (data) setTrialUsed(data.used);
            });
          }).catch(() => { });
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const [manualLoggedOut, setManualLoggedOut] = useState(false)

  useEffect(() => {
    if (!deviceId) setDeviceId(crypto.randomUUID())

    const checkAutoTrial = async () => {
      if (!isValidated && !isTrialMode && !manualLoggedOut) {
        setIsChecking(true);
        try {
          const fingerprint = await getBrowserFingerprint();
          const { data, error } = await supabase.rpc('get_trial_status', { p_fingerprint: fingerprint });
          if (!error && data && data.used < data.limit) {
            setTrialUsed(data.used);
            setTrialLimit(data.limit);
            setIsTrialMode(true);
            setSessionToken("AUTO-TRIAL");
            setIsValidated(true);
          }
        } catch (e) { } finally { setIsChecking(false); }
      }
    };

    if (licenseKey === "VIP-DIOS-123") setIsValidated(true)
    else if (sessionToken && dynamicConfig) setIsValidated(true)
    else if (!manualLoggedOut) checkAutoTrial();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "GET_STATE" }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res) {
            if (res.state) setEngineStatus(res.state)
            if (res.count !== undefined) setProcessedCount(res.count)
            if (res.logs) setLogs(res.logs)
          }
        })
      }
    })
  }, [deviceId, sessionToken, dynamicConfig])

  const handleValidate = async () => {
    setIsChecking(true)

    try {
      const { data, error } = await supabase.rpc('validate_license_v2', {
        p_key: licenseKey.trim(),
        p_device_id: deviceId
      })

      if (error) {
        showFeedback(T("Error técnico de licencia.", "License technical error."), "error")
      } else if (data.status === 'error') {
        showFeedback(`⚠️ ${data.message}`, "error")
      } else if (data.status === 'success') {
        setSessionToken(crypto.randomUUID())
        setDynamicConfig(data.config_payload || null)
        setLicenseInfo({
          email: data.customer_email || "N/A",
          expiresAt: data.expires_at || "Lifetime"
        })
        setIsTrialMode(false)
        setIsValidated(true)
        showFeedback(T("¡Software Desbloqueado!", "Software Unlocked!"), "success")
      }
    } catch (err) {
      showFeedback("Fallo de Red. Comprueba tu conexión.", "error")
    } finally {
      setIsChecking(false)
    }
  }

  const initiateTrial = async () => {
    setIsChecking(true);
    try {
      const fingerprint = await getBrowserFingerprint();
      const { data, error } = await supabase.rpc('get_trial_status', { p_fingerprint: fingerprint });
      if (error) {
        showFeedback("No se pudo iniciar el Trial. Verifica la conexión.", "error");
      } else {
        if (data.used >= data.limit) {
          showFeedback(T(`Has consumido tus ${data.limit} limpiezas gratuitas. ¡Adquiere una licencia PRO!`, `You have consumed your ${data.limit} free sweeps. Get a PRO license!`), "error");
        } else {
          setTrialUsed(data.used);
          setTrialLimit(data.limit);
          setIsTrialMode(true);
          setSessionToken("TRIAL-SESSION");
          setIsValidated(true);
          showFeedback(`Modo Gratuito Activado. Te quedan ${data.limit - data.used} usos gratuitos.`, "success");
        }
      }
    } catch (e) {
      showFeedback("Error al conectar con la Nube.", "error");
    } finally {
      setIsChecking(false);
    }
  }

  const fireEngine = async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0] || !tabs[0].url.includes("tiktok.com")) {
        showFeedback("Navega a TikTok Web primero.", "error"); return;
      }
      if (!tabs[0].url.includes("/video/") && !tabs[0].url.includes("/photo/") && !tabs[0].url.includes("@")) {
        showFeedback("Por favor, entra al primer video y ábrelo antes de iniciar.", "error"); return;
      }

      let finalMaxActions = maxActions;
      let trialOptions = null;
      if (isTrialMode) {
        const remaining = trialLimit - trialUsed;
        finalMaxActions = Math.min(maxActions, remaining);
        trialOptions = { fingerprint: await getBrowserFingerprint() };
      }

      const dailyKey = `deleted_${new Date().toISOString().split('T')[0]}`;
      const storageData = await chrome.storage.local.get(dailyKey);
      const todayCount = storageData[dailyKey] || 0;
      const HARD_LIMIT = (dynamicConfig as any)?.safety_limit || 500;

      if (todayCount >= HARD_LIMIT) {
        showFeedback(T("⚠️ Límite de seguridad diario alcanzado. Protegiendo tu cuenta.", "⚠️ Daily safety limit reached. Protecting your account."), "error");
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id!, {
        action: "START",
        sessionToken: sessionToken || "VIP-SESSION",
        config: dynamicConfig,
        settings: {
          maxActions: finalMaxActions,
          lang: lang
        },
        trialData: trialOptions
      }, (res) => {
        if (chrome.runtime.lastError) {
          showFeedback("Recarga tu pestaña de TikTok (F5) para conectar la extensión.", "error")
        } else if (res && res.status === 'error') {
          showFeedback(res.reason, "error")
        } else {
          setEngineStatus("running")
          setProcessedCount(0)
          setLogs([{ text: "[System] Lanzando motor...", level: "info" }])
        }
      })
    })
  }

  const stopEngine = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "STOP", sessionToken: sessionToken || "VIP-SESSION" }, () => {
          if (chrome.runtime.lastError) return;
        })
      }
      setEngineStatus("stopped")
    })
  }

  const unlockUI = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "SHOW_TAB", sessionToken: sessionToken || "VIP-SESSION" })
    })
  }

  const handleLogout = () => {
    setManualLoggedOut(true);
    setSessionToken("");
    setLicenseKey("");
    setIsValidated(false);
    setIsTrialMode(false);
    setDynamicConfig(null);
    setLicenseInfo({ email: "", expiresAt: "" });
    showFeedback(T("Sesión Cerrada", "Logged Out"), "info");
  }

  if (!isValidated) {
    return (
      <div className="auth-container" style={{ position: 'relative' }}>
        {feedback && (
          <div style={{ position: 'absolute', top: 10, left: 10, right: 10, padding: '10px', borderRadius: '8px', zIndex: 100, fontSize: '13px', textAlign: 'center', background: feedback.type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', animation: 'fadeIn 0.3s' }}>
            {feedback.msg}
          </div>
        )}
        <img src={logo} alt="Logo" className="auth-icon-img" />
        <h2 className="title">Repost <span className="pro-text">PRO</span></h2>
        <p className="subtitle">{T("Gestión masiva impulsada por Enterprise SaaS.", "Massive management powered by Enterprise SaaS.")}</p>

        <input
          className="premium-input"
          type="text"
          placeholder={T("Ej: ABCD-1234-EFGH-5678", "Ex: ABCD-1234-EFGH-5678")}
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
        />
        <button className="premium-btn" onClick={handleValidate} disabled={isChecking}>
          {isChecking ? T("🛡️ Verificando Licencia...", "🛡️ Verifying License...") : T("🚀 Activar Software", "🚀 Activate Software")}
        </button>

        <button
          className="ghost-btn"
          style={{ marginTop: 16 }}
          onClick={initiateTrial}
          disabled={isChecking}
        >
          🎁 {T("Iniciar Prueba Gratuita (80 Usos)", "Start Free Trial (80 Uses)")}
        </button>

        <button className="ghost-btn" onClick={() => window.open(process.env.PLASMO_PUBLIC_LANDING_URL || 'http://localhost:3000', '_blank')} style={{ marginTop: 16, border: '1px solid rgba(254, 44, 85, 0.4)', color: '#fe2c55', background: 'rgba(254, 44, 85, 0.05)' }}>
          🚀 {T("Visitar Web / Comprar PRO", "Visit Website / Get PRO")}
        </button>

        <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '12px', cursor: 'pointer', shadow: '0 0 10px rgba(0,0,0,0.5)', opacity: lang === 'es' ? 1 : 0.5 }} onClick={() => setLang('es')}>🇪🇸 ES</span>
          <span style={{ fontSize: '12px', cursor: 'pointer', shadow: '0 0 10px rgba(0,0,0,0.5)', opacity: lang === 'en' ? 1 : 0.5 }} onClick={() => setLang('en')}>🇺🇸 EN</span>
        </div>
      </div>
    )
  }

  if (dynamicConfig && (dynamicConfig as any).maintenance_mode) {
    return (
      <div className="auth-container" style={{ position: 'relative' }}>
        <div className="auth-icon" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>⚠️</div>
        <h2 className="title" style={{ color: '#f59e0b' }}>{T("Sistema Suspendido", "System Suspended")}</h2>
        <p className="subtitle" style={{ color: '#cbd5e1' }}>
          {T("TikTok ha desplegado una actualización masiva. Para proteger tu cuenta, hemos suspendido operaciones remotamente mientras adaptamos el algoritmo.",
            "TikTok has deployed a massive update. To protect your account, we have suspended operations remotely while we adapt the algorithm.")}
        </p>
        <button className="ghost-btn" style={{ borderColor: 'transparent', opacity: 0.8, padding: '8px' }} onClick={() => window.open(`mailto:${SUPPORT_EMAIL}`, '_blank')}>
          {T("🛠️ Contactar Soporte", "🛠️ Contact Support")}
        </button>
      </div>
    )
  }

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      {feedback && (
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, padding: '10px', borderRadius: '8px', zIndex: 100, fontSize: '13px', textAlign: 'center', background: feedback.type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', animation: 'fadeIn 0.3s' }}>
          {feedback.msg}
        </div>
      )}
      <div className="header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={logo} alt="Logo" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
          <h2>Repost <span className="pro-text">{isTrialMode ? "TRIAL" : "PRO"}</span></h2>
        </div>
        {isTrialMode && (
          <div style={{ fontSize: '11px', background: '#fe2c55', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
            {trialUsed + processedCount} / {trialLimit}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ cursor: 'pointer', fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px' }} onClick={() => setLang(lang === 'es' ? 'en' : 'es')}>
            {lang === 'es' ? '🇪🇸' : '🇺🇸'}
          </div>
          <div className="live-badge">
            <div className="pulse"></div>
            {T("ACTIVO", "ACTIVE")}
          </div>
        </div>
      </div>

      {lifetimeDeleted > 0 && (
        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', marginBottom: '15px' }}>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#10b981', display: 'flex', justifyContent: 'space-between' }}>
            <span>{T("🏆 Récord de Limpieza", "🏆 Lifetime Swept")}</span>
            <span style={{ fontWeight: 800 }}>{lifetimeDeleted}</span>
          </h4>
          <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
            {T(`Te has ahorrado al menos ${Math.round(lifetimeDeleted / 10)} minutos de tu vida.`, `You've saved at least ${Math.round(lifetimeDeleted / 10)} minutes of your life.`)}
          </div>
        </div>
      )}

      {!isTrialMode && licenseInfo.expiresAt && licenseInfo.expiresAt !== 'Lifetime' && (
        (() => {
          const expiresDate = new Date(licenseInfo.expiresAt);
          const daysLeft = Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          if (daysLeft <= 7) {
            return (
              <div
                className="glass-panel"
                style={{
                  marginBottom: '15px',
                  background: daysLeft <= 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                  borderColor: daysLeft <= 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(245, 158, 11, 0.5)',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  animation: 'pulse 2s infinite'
                }}
              >
                <div style={{ fontSize: '20px' }}>{daysLeft <= 0 ? '🚫' : '⚠️'}</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontSize: '12px', color: daysLeft <= 0 ? '#ef4444' : '#f59e0b' }}>
                    {daysLeft <= 0 ? T("Suscripción Vencida", "Subscription Expired") : T("Renueva Pronto", "Renew Soon")}
                  </h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#cbd5e1' }}>
                    {daysLeft <= 0
                      ? T("Tu acceso ha expirado. Renueva para continuar.", "Your access has expired. Renew to continue.")
                      : T(`Tu licencia vence en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}.`, `Your license expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.`)
                    }
                  </p>
                </div>
                <button
                  onClick={() => window.open(process.env.PLASMO_PUBLIC_LANDING_URL || 'http://localhost:3000', '_blank')}
                  style={{ background: daysLeft <= 0 ? '#ef4444' : '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {T("RENOVAR", "RENEW")}
                </button>
              </div>
            );
          }
          return null;
        })()
      )}

      {!isTrialMode && (
        <div className="glass-panel" style={{ marginBottom: '15px', background: 'rgba(30,41,59,0.3)', borderColor: 'rgba(37,244,238,0.2)', padding: '12px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#25f4ee', textTransform: 'uppercase', letterSpacing: '1px' }}>
            💎 {T("Licencia Premium", "Premium License")}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>ID:</span>
              <span style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{licenseKey.substring(0, 4)}...{licenseKey.slice(-4)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>{T("Estado:", "Status:")}</span>
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>{T("ACTIVA", "ACTIVE")}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>{T("Vence:", "Expires:")}</span>
              <span style={{ color: '#f1f5f9' }}>{licenseInfo.expiresAt || T("Ilimitada", "Unlimited")}</span>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ marginBottom: '15px', background: 'rgba(30,41,59,0.5)', borderColor: 'rgba(255,255,255,0.05)', boxSizing: 'border-box' }}>
        <h3 style={{ fontSize: '13px', marginBottom: '12px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '16px' }}>📋</span> {T("Cómo Usar El Bot", "How To Use The Bot")}
        </h3>
        <ol style={{ paddingLeft: '22px', fontSize: '12px', color: '#cbd5e1', margin: '0 0 16px 0', lineHeight: '1.6' }}>
          <li>{T("Ve a la página de tu Perfil.", "Go to your Profile page.")}</li>
          <li>{T("Ubícate en tu pestaña de Reposts.", "Go to your Reposts tab.")}</li>
          <li>{T("Haz CLIC MANUAL en el primer video para verlo grande.", "CLICK the first video manually to open it.")}</li>
          <li>{T("¡Dale a Instanciar Limpieza y hará el resto!", "Click Start Cleaning, the bot does the rest!")}</li>
        </ol>
        <button className="ghost-btn" onClick={unlockUI} style={{ width: '100%', fontSize: '12px', padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
          👁️ {T("Forzar Aparición de Pestaña Reposts", "Force Reposts Tab Appearance")}
        </button>
      </div>

      <div className="glass-panel" style={{ marginBottom: '15px', padding: '16px', background: 'rgba(30,41,59,0.7)', borderColor: 'rgba(255,255,255,0.05)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 'bold' }}>{T("Progreso", "Progress")}</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: 'bold' }}>{processedCount} / {maxActions}</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min((processedCount / maxActions) * 100, 100)}%`, background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)', transition: 'width 0.3s ease' }}></div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
          <span>{T("Total compartidos:", "Total reposts:")} <b>N/A ({T("Carga infinita", "Infinite loaded")})</b></span>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.5)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="status-indicator">
            <div className={`engine-icon ${engineStatus === 'running' ? 'running' : ''}`}>
              {engineStatus === 'running' ? '⚡' : '💤'}
            </div>
            <div className="status-text">
              {engineStatus === "running" ? T("Limpieza En Progreso...", "Cleaning In Progress...") : T("Sistema en Reposo", "System in Standby")}
            </div>
          </div>

          <div className="setting-group" style={{ marginTop: '16px' }}>
            <div className="setting-label">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>🎯 {T("Ingresa la cantidad a eliminar", "Enter the target amount to clear")} </span>
              </div>
            </div>
            <input
              className="premium-input-small"
              type="number"
              value={maxActions}
              onChange={(e) => setMaxActions(Number(e.target.value))}
              min={1}
              max={500}
            />
          </div>

          {engineStatus !== "running" ? (
            <button className="premium-btn" onClick={fireEngine} style={{ marginTop: '10px' }}>
              ▶ {T("Iniciar Limpieza de Compartidos", "Initialize Cleaning")}
            </button>
          ) : (
            <button className="premium-btn danger-btn" onClick={stopEngine} style={{ marginTop: '10px' }}>
              🛑 {T("Abortar Limpieza", "Abort Cleaning")}
            </button>
          )}
        </div>

        <div style={{ height: '160px', background: '#020617', padding: '16px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#33ff33', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.5)' }}>
          {logs.length === 0 && <span style={{ color: '#64748b' }}>{">"} {T("Esperando directrices del sistema...", "Waiting for system guidelines...")}</span>}
          {logs.map((log, i) => (
            <div key={i} style={{ color: log.level === 'error' ? '#ef4444' : log.level === 'warn' ? '#f59e0b' : log.level === 'success' ? '#10b981' : '#33ff33', lineHeight: 1.4 }}>
              {">"} {log.text}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
        <button className="ghost-btn" style={{ borderColor: '#fe2c55', background: 'rgba(254, 44, 85, 0.1)', color: '#fe2c55', flex: 1, padding: '10px', fontWeight: 'bold' }} onClick={() => window.open(process.env.PLASMO_PUBLIC_LANDING_URL || DEFAULT_LANDING, '_blank')}>
          🚀 {T("Comprar PRO (Ilimitado)", "Get PRO (Unlimited)")}
        </button>
        <button className="ghost-btn" style={{ borderColor: 'transparent', opacity: 0.8, flex: 1, padding: '8px' }} onClick={() => window.open(`mailto:${SUPPORT_EMAIL}`, '_blank')}>
          🛠️ {T("Soporte", "Support")}
        </button>
      </div>

      {isTrialMode && (
        <div className="glass-panel" style={{ marginTop: '15px', background: 'rgba(254, 44, 85, 0.05)', borderColor: 'rgba(254, 44, 85, 0.2)' }}>
          <div style={{ padding: '12px' }}>
            <p style={{ fontSize: '11px', color: '#fe2c55', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>
              🎁 {T("MODO PRUEBA ACTIVO", "TRIAL MODE ACTIVE")}: {trialUsed + processedCount} / {trialLimit}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="premium-input-small"
                style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }}
                placeholder={T("Pega tu Licencia PRO", "Paste PRO License")}
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
              />
              <button
                onClick={handleValidate}
                disabled={isChecking}
                style={{ background: '#fe2c55', color: '#white', border: 'none', borderRadius: '6px', fontSize: '10px', padding: '0 12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {T("ACTIVAR", "ACTIVATE")}
              </button>
            </div>
          </div>
        </div>
      )}

      <button className="ghost-btn" style={{ borderColor: 'rgba(239, 68, 68, 0.2)', opacity: 0.5, marginTop: '12px', padding: '8px', color: '#ef4444', marginBottom: '20px' }} onClick={handleLogout}>
        {T("Cerrar Sesión", "Log Out")}
      </button>
    </div>
  )
}
