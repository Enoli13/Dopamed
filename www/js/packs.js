// Paket yükleme, doğrulama ve oturum kuyruğu oluşturma
import { loadCustomPacks, saveCustomPacks, isEnabled, cardState, S } from './store.js';

let builtin = [];
let all = [];

export async function loadPacks() {
  builtin = [];
  try {
    const idx = await (await fetch('packs/index.json')).json();
    for (const f of idx.packs) {
      try {
        const p = normalizePack(await (await fetch('packs/' + f)).json());
        p.builtin = true;
        builtin.push(p);
      } catch (e) { console.warn('Paket okunamadı', f, e); }
    }
  } catch (e) { console.warn('index.json yok', e); }
  refresh();
}
function refresh() {
  const custom = loadCustomPacks().map(p => { try { return normalizePack(p); } catch { return null; } }).filter(Boolean);
  const ids = new Set(custom.map(p => p.id));
  all = [...builtin.filter(p => !ids.has(p.id)), ...custom];
}
export const packs = () => all;
export const enabledPacks = () => all.filter(p => isEnabled(p.id));
export const packById = id => all.find(p => p.id === id);

const slug = s => (s || 'paket').toLowerCase()
  .replace(/[çc]/g, 'c').replace(/[ğg]/g, 'g').replace(/[ıi]/g, 'i').replace(/[öo]/g, 'o').replace(/[şs]/g, 's').replace(/[üu]/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'paket';

// Gelen JSON'u (elle, Gemini'den ya da başka yerden) güvenli forma sokar
export function normalizePack(p) {
  if (!p || typeof p !== 'object') throw new Error('Paket bir JSON nesnesi olmalı');
  if (!Array.isArray(p.cards) || !p.cards.length) throw new Error('Pakette "cards" listesi yok');
  const out = {
    id: p.id ? slug(p.id) : slug(p.title) + '-' + Date.now().toString(36),
    title: String(p.title || 'İsimsiz paket'),
    course: String(p.course || ''),
    emoji: String(p.emoji || '📚'),
    demo: !!p.demo,
    topics: [],
    cards: []
  };
  const topicMap = new Map();
  for (const t of (p.topics || [])) {
    if (!t) continue;
    const id = slug(t.id || t.name);
    if (!topicMap.has(id)) topicMap.set(id, { id, name: String(t.name || t.id), examHits: Number(t.examHits) || 0 });
  }
  const ensureTopic = name => {
    if (!name) name = 'Genel';
    const id = slug(name);
    if (!topicMap.has(id)) {
      const byName = [...topicMap.values()].find(t => slug(t.name) === id);
      if (byName) return byName.id;
      topicMap.set(id, { id, name: String(name), examHits: 0 });
    }
    return id;
  };
  const seen = new Set();
  p.cards.forEach((c, i) => {
    if (!c) return;
    const type = ['info', 'mcq', 'tf'].includes(c.type) ? c.type : (c.options ? 'mcq' : ('statement' in c ? 'tf' : 'info'));
    let id = String(c.id || 'c' + (i + 1));
    while (seen.has(id)) id += '_';
    seen.add(id);
    const card = {
      id, type,
      topic: ensureTopic(c.topic),
      hook: String(c.hook || ''),
      emoji: c.emoji ? String(c.emoji) : '',
      exam: c.exam ? String(c.exam) : '',
      explain: c.explain ? String(c.explain) : ''
    };
    if (type === 'info') {
      card.body = String(c.body || '');
      if (c.mnemonic) card.mnemonic = String(c.mnemonic);
      if (!card.hook && !card.body) return;
    } else if (type === 'mcq') {
      const opts = (c.options || []).map(String).filter(Boolean);
      const ans = Number(c.answer);
      if (opts.length < 2 || !(ans >= 0 && ans < opts.length)) return;
      card.question = String(c.question || '');
      card.options = opts; card.answer = ans;
    } else {
      card.statement = String(c.statement || '');
      card.answer = c.answer === true || c.answer === 'true' || c.answer === 'D' || c.answer === 'Doğru';
      if (!card.statement) return;
    }
    if (c.aiAnswer) card.aiAnswer = true;
    out.cards.push(card);
  });
  if (!out.cards.length) throw new Error('Geçerli kart bulunamadı');
  // Çıkmış soru sayısından konu "hoca radarı" puanı türet (verilmemişse)
  const examCount = {};
  out.cards.forEach(c => { if (c.exam) examCount[c.topic] = (examCount[c.topic] || 0) + 1; });
  out.topics = [...topicMap.values()].map(t => ({ ...t, examHits: Math.max(t.examHits, examCount[t.id] || 0) }));
  return out;
}

export function addCustomPack(pack, mergeIntoId) {
  const list = loadCustomPacks();
  if (mergeIntoId) {
    const target = list.find(p => p.id === mergeIntoId) || packById(mergeIntoId);
    if (target) {
      const toRaw = pk => pk.cards.map(c => ({ ...c, topic: (pk.topics.find(t => t.id === c.topic) || {}).name || c.topic }));
      const merged = { ...JSON.parse(JSON.stringify(target)), cards: toRaw(target) };
      delete merged.builtin;
      const ids = new Set(merged.cards.map(c => c.id));
      for (const c of toRaw(pack)) {
        let id = c.id; while (ids.has(id)) id = id + 'x';
        ids.add(id); merged.cards.push({ ...c, id });
      }
      merged.topics = [...target.topics, ...pack.topics];
      const norm = normalizePack(merged);
      norm.id = merged.id;
      const i = list.findIndex(p => p.id === norm.id);
      if (i >= 0) list[i] = norm; else list.push(norm);
      saveCustomPacks(list); refresh();
      return norm;
    }
  }
  while (list.some(p => p.id === pack.id) || builtin.some(p => p.id === pack.id)) pack.id += '-2';
  list.push(pack);
  saveCustomPacks(list); refresh();
  return pack;
}
export function deleteCustomPack(id) {
  saveCustomPacks(loadCustomPacks().filter(p => p.id !== id));
  refresh();
}

export const keyOf = (pack, card) => pack.id + ':' + card.id;
const topicOf = (pack, card) => pack.topics.find(t => t.id === card.topic);

// İstatistik: kaç kart görüldü / "öğrenildi" (aralık >= 3 gün)
export function packStats(pack) {
  let seen = 0, learned = 0, due = 0;
  const now = Date.now();
  for (const c of pack.cards) {
    const s = cardState(keyOf(pack, c));
    if (s) { seen++; if (s.interval >= 3) learned++; if (s.due <= now) due++; }
  }
  return { total: pack.cards.length, seen, learned, due };
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Günlük tur: önce vadesi gelen tekrarlar, sonra yeni kartlar (paket sırasıyla), karışık dizilir.
export function buildSession(n) {
  const now = Date.now();
  const due = [], fresh = [];
  for (const p of enabledPacks()) {
    p.cards.forEach((c, idx) => {
      const s = cardState(keyOf(p, c));
      const item = { pack: p, card: c, order: idx };
      if (!s) fresh.push(item);
      else if (s.due <= now) due.push({ ...item, due: s.due, hot: (topicOf(p, c)?.examHits || 0) });
    });
  }
  due.sort((a, b) => a.due - b.due);
  const nDue = Math.min(due.length, Math.ceil(n * 0.6));
  const reviews = shuffle(due.slice(0, nDue));
  // Yeni kartlarda: paket içi sırayı koru, paketler arasında dönüşümlü al
  const byPack = new Map();
  fresh.forEach(f => { if (!byPack.has(f.pack.id)) byPack.set(f.pack.id, []); byPack.get(f.pack.id).push(f); });
  const lanes = [...byPack.values()];
  const news = [];
  while (news.length < n - reviews.length && lanes.some(l => l.length)) {
    for (const l of lanes) if (l.length && news.length < n - reviews.length) news.push(l.shift());
  }
  // Tekrar kalanları da ekle (yeni kart bittiyse)
  let rest = due.slice(nDue);
  while (news.length + reviews.length < n && rest.length) reviews.push(rest.shift());
  // Harmanla: yaklaşık her 2 yeni karta 1 tekrar
  const out = [];
  let i = 0, j = 0;
  while (i < news.length || j < reviews.length) {
    if (i < news.length) out.push({ ...news[i++], isNew: true });
    if (i < news.length && Math.random() < 0.5) out.push({ ...news[i++], isNew: true });
    if (j < reviews.length) out.push({ ...reviews[j++], isNew: false });
  }
  // Değişken ödül: ~%12 "altın kart" (2x XP) — ama sınırlı, sonsuz değil
  out.forEach(x => { x.golden = Math.random() < 0.12; });
  return out.slice(0, n);
}

// Düello: soru kartları, çıkmış sorular ve "hocanın favorisi" konular öncelikli
export function buildDuel(packId, n = 10) {
  const pool = [];
  const src = packId ? [packById(packId)].filter(Boolean) : enabledPacks();
  for (const p of src) for (const c of p.cards) {
    if (c.type === 'info') continue;
    const hot = topicOf(p, c)?.examHits || 0;
    const w = 1 + (c.exam ? 3 : 0) + Math.min(hot, 5) * 0.6 + ((cardState(keyOf(p, c))?.lapses || 0) * 1.5);
    pool.push({ pack: p, card: c, w });
  }
  const out = [];
  while (out.length < n && pool.length) {
    const tot = pool.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * tot, k = 0;
    while (r > pool[k].w) { r -= pool[k].w; k++; }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

export const duelPoolSize = packId => (packId ? [packById(packId)] : enabledPacks()).filter(Boolean)
  .reduce((s, p) => s + p.cards.filter(c => c.type !== 'info').length, 0);

export function radar(pack) {
  return [...pack.topics].sort((a, b) => b.examHits - a.examHits);
}

export function dueCount() {
  const now = Date.now(); let n = 0, fresh = 0;
  for (const p of enabledPacks()) for (const c of p.cards) {
    const s = cardState(keyOf(p, c));
    if (!s) fresh++; else if (s.due <= now) n++;
  }
  return { due: n, fresh };
}
export { S };
