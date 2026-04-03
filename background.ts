import { Storage } from "@plasmohq/storage"

export {}

const storage = new Storage()

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.type === "NOTIFY_SYSTEM") {
    console.log("Sistema Notificado:", request.title, request.message);
  }

  if (request.type === "UPDATE_BADGE") {
    chrome.action.setBadgeText({ text: request.text ? request.text.toString() : "" })
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" })
    
    const current = await storage.get("lifetimeDeleted") || 0;
    await storage.set("lifetimeDeleted", Number(current) + 1);

    const dailyKey = `deleted_${new Date().toISOString().split('T')[0]}`;
    const dailyData = await chrome.storage.local.get(dailyKey);
    const dailyCount = (dailyData[dailyKey] || 0) + 1;
    await chrome.storage.local.set({ [dailyKey]: dailyCount });
  }

  if (request.type === "TRIAL_INCREMENT") {
     const url = `${process.env.PLASMO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/increment_trial`;
     const key = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY;
     fetch(url, {
        method: 'POST',
        headers: {
           'apikey': key,
           'Authorization': `Bearer ${key}`,
           'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_fingerprint: request.fingerprint, p_amount: request.amount })
     }).catch(console.error);
  }

  if (request.type === "TELEMETRY") {
     const url = `${process.env.PLASMO_PUBLIC_SUPABASE_URL}/rest/v1/telemetry_events`;
     const key = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY;
     fetch(url, {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           event_type: request.error,
           details: request.details,
           created_at: new Date().toISOString()
        })
     }).catch(() => {});
  }
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
