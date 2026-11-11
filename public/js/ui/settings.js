// Persistent settings + player profile (localStorage).
const DEFAULTS = {
  moveMode: 'gorilla', vrSize: 'gorilla', turnMode: 'snap', snapAngle: 45, vignette: false, armBoost: 1.0,
  mouseSens: 1, fov: 80, volMaster: 0.8, volMusic: 0.5, volSfx: 0.9, volVoice: 1,
  shadows: true, quality: 'med', showFps: false
};
const PROFILE_DEFAULTS = {
  name: '', role: 'civilian', cos: { color: '#ff9f1c', accent: '#ffffff', head: 0, body: 0, hat: 1, glasses: 0, back: 0 }
};

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ? { ...def, ...v, ...(def.cos ? { cos: { ...def.cos, ...(v.cos || {}) } } : {}) } : structuredClone(def); }
  catch { return structuredClone(def); }
}
export const settings = load('cc_settings', DEFAULTS);
// movement retune: the old default arm strength (1.15) felt too strong, move saved defaults to the new 1.0 once
if (!settings.moveV2) { if (Math.abs((settings.armBoost || 1) - 1.15) < 0.001) settings.armBoost = 1.0; settings.moveV2 = 1; try { localStorage.setItem('cc_settings', JSON.stringify(settings)); } catch {} }
export const profile = load('cc_profile', PROFILE_DEFAULTS);
const listeners = [];

export function saveSettings() { try { localStorage.setItem('cc_settings', JSON.stringify(settings)); } catch {} listeners.forEach(f => f(settings)); }
export function saveProfile() { try { localStorage.setItem('cc_profile', JSON.stringify(profile)); } catch {} }
export function onSettings(f) { listeners.push(f); }
export function setSetting(k, v) {
  if (typeof DEFAULTS[k] === 'number') v = Number(v);
  if (typeof DEFAULTS[k] === 'boolean') v = (v === true || v === 'true');
  settings[k] = v; saveSettings();
}
