// Durum, kalıcı kayıt ve aralıklı tekrar (SRS) mantığı
const KEY = 'dm_state_v1';
const PACKS_KEY = 'dm_custom_packs_v1';

export const todayStr = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const DAY = 86400000;

const defaults = () => ({
  xp: 0,
  streak: { count: 0, last: null },
  today: { date: todayStr(), done: 0, correct: 0, wrong: 0, bonusUsed: false, duels: 0, xp: 0 },
  settings: { dailyGoal: 25, apiKey: '', model: 'gemini-2.5-flash', haptics: true, duelsPerDay: 3 },
  srs: {},
  enabled: {},
  best: {},
  history: {} // tarih -> tamamlanan kart
});

let state = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw) return defaults();
    const d = defaults();
    return { ...d, ...raw, settings: { ...d.settings, ...raw.settings }, today: { ...d.today, ...raw.today } };
  } catch { return defaults(); }
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
export const S = () => { rollDay(); return state; };

function rollDay() {
  const t = todayStr();
  if (state.today.date !== t) {
    state.today = { date: t, done: 0, correct: 0, wrong: 0, bonusUsed: false, duels: 0, xp: 0 };
    save();
  }
}

// ---- Seviye ----
export function levelInfo(xp = state.xp) {
  let lvl = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = Math.round(need * 1.25); }
  return { lvl, into: xp - acc, need };
}
export function addXP(n) {
  rollDay();
  const before = levelInfo().lvl;
  state.xp += n; state.today.xp += n;
  save();
  return levelInfo().lvl > before;
}

// ---- Seri (streak) ----
export function markDayGoalDone() {
  const t = todayStr();
  if (state.streak.last === t) return false;
  const y = todayStr(new Date(Date.now() - DAY));
  state.streak.count = state.streak.last === y ? state.streak.count + 1 : 1;
  state.streak.last = t;
  save();
  return true;
}
export function streakAlive() {
  const t = todayStr(), y = todayStr(new Date(Date.now() - DAY));
  return state.streak.last === t || state.streak.last === y ? state.streak.count : 0;
}

// ---- SRS (SM-2'nin sadeleştirilmiş hali) ----
// grade: 0 = bilmedi, 1 = zor/atladı, 2 = bildi, 3 = çok kolay
export function review(key, grade) {
  const now = Date.now();
  const c = state.srs[key] || { reps: 0, ease: 2.5, interval: 0, due: now, lapses: 0, seen: 0 };
  c.seen++;
  if (grade === 0) {
    c.reps = 0; c.lapses++; c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60000; // 10 dk sonra
  } else if (grade === 1) {
    c.interval = Math.max(1, Math.round((c.interval || 1) * 1.2));
    c.ease = Math.max(1.3, c.ease - 0.15);
    c.reps++;
    c.due = now + (c.reps === 1 ? 0.5 : c.interval) * DAY;
  } else {
    c.reps++;
    if (c.reps === 1) c.interval = grade === 3 ? 3 : 1;
    else if (c.reps === 2) c.interval = grade === 3 ? 7 : 3;
    else c.interval = Math.round(c.interval * c.ease * (grade === 3 ? 1.3 : 1));
    c.ease = Math.min(3, c.ease + (grade === 3 ? 0.15 : 0.02));
    c.due = now + c.interval * DAY;
  }
  state.srs[key] = c;
  rollDay();
  if (state.today.done !== undefined) {
    state.history[todayStr()] = (state.history[todayStr()] || 0) + 1;
  }
  save();
  return c;
}
export const cardState = key => state.srs[key];

// ---- Ayarlar / yedek ----
export function setSetting(k, v) { state.settings[k] = v; save(); }
export function exportBackup() {
  return JSON.stringify({ state, packs: loadCustomPacks() }, null, 1);
}
export function importBackup(text) {
  const o = JSON.parse(text);
  if (!o.state) throw new Error('Geçersiz yedek dosyası');
  state = { ...defaults(), ...o.state };
  save();
  if (Array.isArray(o.packs)) saveCustomPacks(o.packs);
}
export function resetAll() { state = defaults(); save(); }

// ---- Kullanıcı paketleri ----
export function loadCustomPacks() {
  try { return JSON.parse(localStorage.getItem(PACKS_KEY)) || []; } catch { return []; }
}
export function saveCustomPacks(list) {
  localStorage.setItem(PACKS_KEY, JSON.stringify(list));
}
export function isEnabled(id) { return state.enabled[id] !== false; }
export function setEnabled(id, v) { state.enabled[id] = v; save(); }
