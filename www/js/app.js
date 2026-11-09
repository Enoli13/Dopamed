import { S, save, addXP, levelInfo, markDayGoalDone, streakAlive, review, setSetting, exportBackup, importBackup, resetAll, setEnabled, isEnabled } from './store.js';
import { loadPacks, packs, enabledPacks, packById, buildSession, buildDuel, duelPoolSize, keyOf, packStats, radar, dueCount, normalizePack, addCustomPack, deleteCustomPack } from './packs.js';
import { generateFromPdf, buildPrompt } from './ai.js';
import { buzz, toast, floatXP, confetti } from './fx.js';

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');

// ---------- yardımcılar ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const hue = str => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const topicName = (p, c) => p.topics.find(t => t.id === c.topic)?.name || '';
const topicHits = (p, c) => p.topics.find(t => t.id === c.topic)?.examHits || 0;
const go = h => { location.hash = h; };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
}

function hud() {
  const st = S(); const L = levelInfo();
  return `<div class="hud">
    <span class="pill">🔥 ${streakAlive()}</span>
    <span class="pill">Lv ${L.lvl} <i class="mini"><b style="width:${Math.round(L.into / L.need * 100)}%"></b></i></span>
    <span class="pill">⚡ ${st.xp}</span>
  </div>`;
}

// ---------- yönlendirme ----------
const routes = { home: viewHome, feed: viewFeed, duel: viewDuel, packs: viewPacks, settings: viewSettings, ai: viewAI };
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const [name, arg] = (location.hash.slice(1) || 'home').split('/');
  const fn = routes[name] || viewHome;
  const immersive = name === 'feed' || (name === 'duel' && arg === 'play');
  tabs.style.display = immersive ? 'none' : '';
  tabs.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
  app.scrollTop = 0;
  fn(arg);
}
window.addEventListener('hashchange', route);

// ---------- ANA SAYFA ----------
function viewHome() {
  const st = S(); const goal = st.settings.dailyGoal; const done = st.today.done;
  const { due, fresh } = dueCount();
  const hour = new Date().getHours();
  const noPacks = !enabledPacks().length;
  const finished = done >= goal || (done > 0 && !due && !fresh);
  const pct = Math.min(100, Math.round(done / goal * 100));
  app.innerHTML = `
  ${hud()}
  <section class="hero">
    <div class="ring" style="--p:${pct}"><div><b>${done}</b><small>/ ${goal}</small></div></div>
    <h1>${finished ? 'Bugünlük beyin doldu ✅' : done ? 'Kaldığın yerden devam' : 'Bugünün turu hazır'}</h1>
    <p class="muted">${noPacks ? 'Önce bir paket ekle ya da etkinleştir.' : `${due} tekrar bekliyor · ${fresh} yeni kart`}</p>
    ${hour >= 0 && hour < 5 ? `<p class="night">🌙 Gece yarısı öğrendiğini beynine uyku yazar. Kısa tut, sonra yat.</p>` : ''}
    ${noPacks ? `<a class="btn big" href="#packs">📦 Paketlere git</a>` :
      !finished ? `<a class="btn big glow" href="#feed">▶ ${done ? 'Devam et' : 'Başla'} (${goal - done} kart)</a>` :
      !st.today.bonusUsed ? `<button class="btn big alt" id="bonus">⚡ +10 bonus tur (günde 1)</button>
        <p class="muted small">Ya da bırak, yarın ${due} tekrar + yeni kartlar gelecek.</p>` :
      `<p class="done-msg">Akış yarına kadar kilitli. Sonsuz kaydırma yok, söz verdik. 🔒</p>`}
  </section>
  <section class="grid2">
    <a class="tile" href="#duel"><span>⚔️</span><b>Çıkmış Soru Düellosu</b><small>${Math.max(0, st.settings.duelsPerDay - st.today.duels)} hak kaldı</small></a>
    <a class="tile" href="#packs"><span>🎯</span><b>Hoca Radarı</b><small>En çok sorulan konular</small></a>
  </section>
  <section class="card week">${weekStrip()}</section>`;
  const b = document.getElementById('bonus');
  if (b) b.onclick = () => { st.today.bonusUsed = true; st.today.bonusPending = true; save(); go('feed'); };
}
function weekStrip() {
  const h = S().history; const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const n = h[k] || 0;
    days.push(`<div class="day"><i style="height:${Math.min(100, n / S().settings.dailyGoal * 100)}%"></i><small>${['Pz','Pt','Sa','Ça','Pe','Cu','Ct'][d.getDay()]}</small></div>`);
  }
  return `<h3>Son 7 gün</h3><div class="days">${days.join('')}</div>`;
}

// ---------- AKIŞ (Shorts tarzı) ----------
function viewFeed() {
  const st = S(); const goal = st.settings.dailyGoal;
  let target, isBonus = false;
  if (st.today.done < goal) target = goal - st.today.done;
  else if (st.today.bonusPending) { target = 10; isBonus = true; }
  else { go('home'); return; }
  const session = buildSession(target);
  if (!session.length) {
    app.innerHTML = `<div class="empty"><h2>Kart kalmadı 🎉</h2><p>Etkin paketlerdeki tüm kartları gördün ve tekrar zamanı gelen yok. Yeni paket ekle ya da yarın gel.</p><a class="btn" href="#packs">Paketler</a> <a class="btn alt" href="#home">Ana sayfa</a></div>`;
    if (isBonus) { st.today.bonusPending = false; save(); }
    return;
  }
  let completed = 0, combo = 0, finishedFlag = false;
  const total = session.length;
  app.innerHTML = `
  <div class="feedtop">
    <a href="#home" class="x">✕</a>
    <div class="prog"><b id="pbar"></b></div>
    <span class="combo" id="combo"></span>
  </div>
  <div class="feed" id="feed"></div>`;
  const feed = document.getElementById('feed');
  const pbar = document.getElementById('pbar');
  const comboEl = document.getElementById('combo');
  const updateTop = () => {
    pbar.style.width = Math.round(completed / total * 100) + '%';
    comboEl.textContent = combo >= 2 ? `🔥 x${combo}` : '';
    comboEl.classList.toggle('hot', combo >= 5);
  };
  updateTop();

  const items = session.map(x => ({ ...x }));
  items.forEach(it => feed.appendChild(renderCard(it)));
  const endSlide = document.createElement('div');
  endSlide.className = 'slide end';
  feed.appendChild(endSlide);

  function complete(it, grade, xp) {
    if (it.completed) return;
    it.completed = true;
    review(keyOf(it.pack, it.card), grade);
    if (!it.requeued) {
      completed++;
      if (isBonus) {} else st.today.done++;
    }
    if (xp > 0) {
      const mult = (it.golden ? 2 : 1) * (1 + Math.min(2, Math.floor(combo / 3) * 0.5));
      const gain = Math.round(xp * mult);
      if (addXP(gain)) { confetti(120); toast(`🆙 Seviye ${levelInfo().lvl}!`); buzz([30, 40, 30, 40, 60]); }
      floatXP(it.el, `+${gain} XP${it.golden ? ' ✨' : ''}`);
    }
    save();
    updateTop();
    if (completed >= total && !finishedFlag) finish();
  }

  function requeue(it) {
    const copy = { ...it, requeued: true, completed: false, golden: false, isNew: false };
    const el = renderCard(copy);
    items.push(copy);
    const slides = [...feed.children];
    const idx = slides.indexOf(it.el);
    const before = slides[Math.min(idx + 4, slides.length - 1)];
    feed.insertBefore(el, before);
  }

  function renderCard(it) {
    const { pack, card } = it;
    const el = document.createElement('div');
    el.className = 'slide' + (it.golden ? ' golden' : '');
    const h = hue(card.topic + pack.id);
    el.style.setProperty('--h', h);
    it.el = el;
    const tags = `<div class="tags">
      <span class="tag">${esc(pack.emoji)} ${esc(topicName(pack, card))}</span>
      ${topicHits(pack, card) >= 2 ? '<span class="tag hot">📌 Hocanın favorisi</span>' : ''}
      ${it.isNew ? '<span class="tag">🆕</span>' : '<span class="tag">🔁 tekrar</span>'}
      ${it.golden ? '<span class="tag gold">✨ 2x XP</span>' : ''}
    </div>`;
    if (card.type === 'info') {
      el.innerHTML = `${tags}
        <div class="body">
          ${card.emoji ? `<div class="emoji">${esc(card.emoji)}</div>` : ''}
          <h2 class="hook">${md(card.hook)}</h2>
          <p class="txt">${md(card.body)}</p>
          ${card.mnemonic ? `<p class="mnemo">🧠 ${md(card.mnemonic)}</p>` : ''}
        </div>
        <div class="acts"><button class="btn ghost" data-g="0">🤔 Tekrar göster</button><button class="btn" data-g="2">🔥 Kaptım</button></div>`;
      el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
        const g = +b.dataset.g;
        el.querySelector('.acts').innerHTML = g ? '<span class="ok">Kaydedildi ✓ Kaydır ↓</span>' : '<span class="muted">Birazdan tekrar gelecek ↓</span>';
        buzz(15);
        complete(it, g, g ? 5 : 1);
        if (!g && !it.requeued) requeue(it);
        next(el);
      });
    } else {
      const isMcq = card.type === 'mcq';
      const opts = isMcq ? card.options : ['Doğru', 'Yanlış'];
      const correctIdx = isMcq ? card.answer : (card.answer ? 0 : 1);
      el.innerHTML = `${tags}
        <div class="body">
          ${card.exam ? `<div class="exam">📜 ${esc(card.exam)}</div>` : ''}
          ${card.hook ? `<p class="hook small">${md(card.hook)}</p>` : ''}
          <h2 class="q">${md(isMcq ? card.question : card.statement)}</h2>
          <div class="opts ${isMcq ? '' : 'tf'}">${opts.map((o, i) => `<button class="opt" data-i="${i}"><b>${isMcq ? 'ABCDE'[i] || i + 1 : (i ? '✗' : '✓')}</b> ${md(o)}</button>`).join('')}</div>
          <div class="explain" hidden></div>
        </div>`;
      el.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if (it.completed) return;
        const i = +b.dataset.i, ok = i === correctIdx;
        el.querySelectorAll('.opt').forEach((x, k) => { x.disabled = true; if (k === correctIdx) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        const ex = el.querySelector('.explain');
        ex.hidden = false;
        ex.innerHTML = `<b>${ok ? pick(['Tam isabet! 🎯', 'Hoca bile şaşırdı 😎', 'Beyin: açık ✅', 'Net. 🔥']) : pick(['Az kaldı, bu kart geri gelecek 🔁', 'Tuzağa düştün, artık düşmezsin 💪', 'Not alındı, tekrar gelecek 📌'])}</b>
          ${card.explain ? `<p>${md(card.explain)}</p>` : ''}${card.aiAnswer ? '<p class="small muted">⚠️ Cevap anahtarı PDF\'te yoktu, yapay zekâ belirledi. Şüphen varsa kontrol et.</p>' : ''}
          <p class="small muted">Kaydır ↓</p>`;
        if (ok) { combo++; st.today.correct++; buzz(25); if (combo && combo % 5 === 0) { confetti(60); toast(`🔥 ${combo} combo!`); } }
        else { combo = 0; st.today.wrong++; buzz([60, 40, 60]); el.classList.add('shake'); }
        complete(it, ok ? 2 : 0, ok ? 10 : 0);
        if (!ok && !it.requeued) requeue(it);
      });
    }
    return el;
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function next(el) {
    setTimeout(() => { const n = el.nextElementSibling; if (n) feed.scrollTo({ top: n.offsetTop, behavior: 'smooth' }); }, 450);
  }

  // Cevaplanmadan geçilen kartlar: "atlandı" olarak işaretlenir (XP yok)
  let active = null;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const prev = active; active = e.target;
      if (prev && prev !== active) {
        const it = items.find(x => x.el === prev);
        if (it && !it.completed) {
          if (it.card.type === 'info') complete(it, 2, 2); // okuyup geçti: kısa ödül
          else { combo = 0; updateTop(); complete(it, 1, 0); }
        }
      }
    });
  }, { root: feed, threshold: 0.6 });
  const mo = new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { if (n.classList?.contains('slide')) io.observe(n); })));
  mo.observe(feed, { childList: true });
  [...feed.children].forEach(n => io.observe(n));

  function finish() {
    finishedFlag = true;
    if (isBonus) { st.today.bonusPending = false; save(); }
    const streakUp = !isBonus && markDayGoalDone();
    confetti(160); buzz([40, 50, 40, 50, 120]);
    endSlide.innerHTML = `<div class="body center">
      <div class="emoji">${isBonus ? '⚡' : '🏁'}</div>
      <h2 class="hook">${isBonus ? 'Bonus tur tamam!' : 'Günlük hedef tamam!'}</h2>
      <p class="txt">${st.today.correct} doğru · ${st.today.wrong} yanlış · bugün +${st.today.xp} XP</p>
      ${streakUp ? `<p class="big-streak">🔥 ${streakAlive()} günlük seri</p>` : ''}
      <p class="muted">Beynin şimdi bunları uykuda kalıcı hafızaya yazacak. Uygulamayı kapat, gerçekten. 🧠</p>
      <a class="btn big" href="#home">Ana sayfa</a>
    </div>`;
  }
  cleanup = () => { io.disconnect(); mo.disconnect(); };
}

// ---------- DÜELLO ----------
function viewDuel(arg) {
  if (arg === 'play') return playDuel();
  const st = S();
  const left = Math.max(0, st.settings.duelsPerDay - st.today.duels);
  const list = enabledPacks();
  app.innerHTML = `${hud()}
  <h1 class="title">⚔️ Çıkmış Soru Düellosu</h1>
  <p class="muted">10 soru · soru başına 15 sn · hızlı ve seri cevap = daha çok puan. Rakibin: kendi rekorun.</p>
  <p class="pill wide">Bugün kalan hak: <b>${left}</b> / ${st.settings.duelsPerDay}</p>
  <div class="list">
    ${[{ id: '', title: 'Tüm etkin paketler', emoji: '🌀' }, ...list].map(p => {
      const n = duelPoolSize(p.id || null);
      const best = st.best[p.id || '_all'] || 0;
      return `<button class="row" data-p="${esc(p.id)}" ${!left || n < 3 ? 'disabled' : ''}>
        <span class="e">${esc(p.emoji)}</span><span class="t"><b>${esc(p.title)}</b><small>${n} soru · rekor ${best}</small></span><span>▶</span></button>`;
    }).join('')}
  </div>
  ${!left ? '<p class="done-msg">Bugünlük düello hakkın bitti. Yarın tekrar dolacak ⏳</p>' : ''}`;
  app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { sessionStorage.setItem('duelPack', b.dataset.p); go('duel/play'); });
}

function playDuel() {
  const st = S();
  if (st.today.duels >= st.settings.duelsPerDay) { go('duel'); return; }
  const packId = sessionStorage.getItem('duelPack') || '';
  const qs = buildDuel(packId || null, 10);
  if (qs.length < 3) { go('duel'); return; }
  st.today.duels++; save();
  const bestKey = packId || '_all';
  const best = st.best[bestKey] || 0;
  let i = 0, score = 0, combo = 0, right = 0, timer = null, raf = null;
  const wrongs = [];
  const LIMIT = 15000;

  function show() {
    if (i >= qs.length) return end();
    const { pack, card } = qs[i];
    const isMcq = card.type === 'mcq';
    const opts = isMcq ? card.options : ['Doğru', 'Yanlış'];
    const correctIdx = isMcq ? card.answer : (card.answer ? 0 : 1);
    app.innerHTML = `
    <div class="duel" style="--h:${hue(card.topic + pack.id)}">
      <div class="feedtop"><a href="#duel" class="x">✕</a><div class="prog"><b style="width:${i / qs.length * 100}%"></b></div><span class="combo">${combo >= 2 ? '🔥x' + combo : ''}</span></div>
      <div class="scores"><div><small>Sen</small><b id="sc">${score}</b></div><div class="vs">VS</div><div><small>Rekorun</small><b>${best}</b></div></div>
      <div class="timer"><b id="tb"></b></div>
      <div class="body">
        ${card.exam ? `<div class="exam">📜 ${esc(card.exam)}</div>` : `<div class="exam soft">${esc(topicName(pack, card))}</div>`}
        <h2 class="q">${md(isMcq ? card.question : card.statement)}</h2>
        <div class="opts ${isMcq ? '' : 'tf'}">${opts.map((o, k) => `<button class="opt" data-i="${k}"><b>${isMcq ? 'ABCDE'[k] || k + 1 : (k ? '✗' : '✓')}</b> ${md(o)}</button>`).join('')}</div>
        <div class="explain" hidden></div>
      </div>
    </div>`;
    const tb = document.getElementById('tb');
    const t0 = performance.now();
    const tick = () => {
      const left = Math.max(0, LIMIT - (performance.now() - t0));
      tb.style.width = (left / LIMIT * 100) + '%';
      tb.classList.toggle('low', left < 4000);
      if (left <= 0) return answer(-1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let answered = false;
    function answer(k) {
      if (answered) return; answered = true;
      cancelAnimationFrame(raf);
      const left = Math.max(0, LIMIT - (performance.now() - t0));
      const ok = k === correctIdx;
      app.querySelectorAll('.opt').forEach((x, j) => { x.disabled = true; if (j === correctIdx) x.classList.add('right'); if (j === k && !ok) x.classList.add('wrong'); });
      if (ok) {
        combo++; right++;
        const pts = Math.round((100 + left / LIMIT * 100) * (1 + Math.min(1, (combo - 1) * 0.25)));
        score += pts; document.getElementById('sc').textContent = score;
        floatXP(app.querySelector('.opt.right'), '+' + pts);
        buzz(25);
        timer = setTimeout(() => { i++; show(); }, 800);
      } else {
        combo = 0; buzz([60, 40, 60]);
        wrongs.push(qs[i]);
        review(keyOf(pack, card), 0); // yanlışlar akışa geri gelsin
        const ex = app.querySelector('.explain');
        ex.hidden = false;
        ex.innerHTML = `<b>${k < 0 ? '⏰ Süre bitti' : '❌ Yanlış'}</b>${card.explain ? `<p>${md(card.explain)}</p>` : ''}<button class="btn" id="nx">Devam →</button>`;
        document.getElementById('nx').onclick = () => { i++; show(); };
      }
    }
    app.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(+b.dataset.i));
  }

  function end() {
    const newRec = score > best;
    if (newRec) { st.best[bestKey] = score; }
    const lvUp = addXP(Math.round(score / 20));
    save();
    if (newRec || lvUp) confetti(160);
    buzz(newRec ? [40, 50, 40, 50, 150] : 40);
    app.innerHTML = `${hud()}
    <section class="hero">
      <div class="emoji">${newRec ? '🏆' : right >= qs.length * 0.7 ? '💪' : '📚'}</div>
      <h1>${newRec ? 'YENİ REKOR!' : 'Düello bitti'}</h1>
      <p class="score">${score}</p>
      <p class="muted">${right}/${qs.length} doğru · +${Math.round(score / 20)} XP${best && !newRec ? ` · rekora ${best - score} puan kaldı` : ''}</p>
      ${wrongs.length ? `<p class="small">Yanlış yaptığın ${wrongs.length} soru tekrar listene eklendi 🔁</p>` : ''}
      <a class="btn big" href="#duel">Tamam</a>
    </section>
    ${wrongs.length ? `<div class="list">${wrongs.map(({ pack, card }) => `<div class="card"><b>${md(card.type === 'mcq' ? card.question : card.statement)}</b>
      <p class="ok">✓ ${md(card.type === 'mcq' ? card.options[card.answer] : (card.answer ? 'Doğru' : 'Yanlış'))}</p>${card.explain ? `<p class="small muted">${md(card.explain)}</p>` : ''}</div>`).join('')}</div>` : ''}`;
  }
  show();
  cleanup = () => { cancelAnimationFrame(raf); clearTimeout(timer); };
}

// ---------- PAKETLER ----------
function viewPacks() {
  const list = packs();
  app.innerHTML = `${hud()}
  <h1 class="title">📦 Paketler</h1>
  <div class="actions">
    <a class="btn" href="#ai">📄 PDF'den üret (AI)</a>
    <label class="btn alt">📥 JSON içe aktar<input type="file" accept=".json,application/json" id="imp" hidden></label>
    <button class="btn ghost" id="paste">📋 JSON yapıştır</button>
  </div>
  <details class="card"><summary>🆓 API anahtarı olmadan ücretsiz yöntem</summary>
    <p class="small">1) Aşağıdaki komutu kopyala. 2) gemini.google.com'u aç, PDF'ini ekle, komutu yapıştır. 3) Çıkan JSON'u bir .json dosyasına kaydet (ya da kopyala) ve buraya içe aktar.</p>
    <div class="actions"><button class="btn ghost" id="cp1">Konu PDF komutu</button><button class="btn ghost" id="cp2">Çıkmış soru komutu</button></div>
  </details>
  <div class="list">${list.map(packCard).join('') || '<p class="muted">Henüz paket yok.</p>'}</div>`;
  document.getElementById('cp1').onclick = async () => toast(await copyText(buildPrompt('topic')) ? 'Kopyalandı ✓' : 'Kopyalanamadı');
  document.getElementById('cp2').onclick = async () => toast(await copyText(buildPrompt('exam')) ? 'Kopyalandı ✓' : 'Kopyalanamadı');
  document.getElementById('paste').onclick = () => pasteDialog();
  document.getElementById('imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { importPackText(await f.text()); } catch (err) { toast('❌ ' + esc(err.message), 3500); }
  };
  app.querySelectorAll('[data-tog]').forEach(c => c.onchange = () => { setEnabled(c.dataset.tog, c.checked); });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (confirm('Bu paketi silmek istiyor musun? (İlerleme kaydın silinmez)')) { deleteCustomPack(b.dataset.del); viewPacks(); }
  });
  app.querySelectorAll('[data-exp]').forEach(b => b.onclick = async () => {
    const p = packById(b.dataset.exp); const c = { ...p }; delete c.builtin;
    toast(await copyText(JSON.stringify(c)) ? 'Paket JSON panoya kopyalandı ✓' : 'Kopyalanamadı');
  });
  app.querySelectorAll('[data-duel]').forEach(b => b.onclick = () => { sessionStorage.setItem('duelPack', b.dataset.duel); go('duel'); });
  app.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { sessionStorage.setItem('aiMerge', b.dataset.more); go('ai'); });
}
function packCard(p) {
  const s = packStats(p);
  const r = radar(p).filter(t => t.examHits > 0);
  const max = Math.max(1, ...r.map(t => t.examHits));
  return `<div class="card pack">
    <div class="ph"><span class="e">${esc(p.emoji)}</span><div><b>${esc(p.title)}</b>${p.demo ? ' <span class="tag">demo</span>' : ''}<small>${esc(p.course)} · ${s.total} kart</small></div>
      <label class="sw"><input type="checkbox" data-tog="${esc(p.id)}" ${isEnabled(p.id) ? 'checked' : ''}><i></i></label></div>
    <div class="bar"><b style="width:${s.learned / s.total * 100}%"></b><i style="width:${s.seen / s.total * 100}%"></i></div>
    <small class="muted">${s.learned} öğrenildi · ${s.seen} görüldü · ${s.due} tekrar bekliyor</small>
    <details><summary>🎯 Hoca radarı</summary>
      ${r.length ? r.map(t => `<div class="rad"><span>${esc(t.name)}</span><i><b style="width:${t.examHits / max * 100}%"></b></i><small>${t.examHits}</small></div>`).join('')
        : '<p class="small muted">Bu pakete çıkmış soru PDF\'i eklenince en çok sorulan konular burada sıralanır.</p>'}
    </details>
    <div class="actions">
      <button class="btn ghost sm" data-duel="${esc(p.id)}">⚔️ Düello</button>
      <button class="btn ghost sm" data-more="${esc(p.id)}">➕ PDF ekle</button>
      <button class="btn ghost sm" data-exp="${esc(p.id)}">📤 JSON</button>
      ${p.builtin ? '' : `<button class="btn ghost sm danger" data-del="${esc(p.id)}">🗑</button>`}
    </div>
  </div>`;
}
function importPackText(text) {
  let o = JSON.parse(text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, ''));
  const arr = Array.isArray(o) ? o : [o];
  for (const x of arr) {
    const p = normalizePack(x);
    addCustomPack(p);
    toast(`✅ "${esc(p.title)}" eklendi (${p.cards.length} kart)`, 2500);
  }
  viewPacks();
}
function pasteDialog() {
  const d = document.createElement('div');
  d.className = 'modal';
  d.innerHTML = `<div class="card"><h3>JSON'u yapıştır</h3><textarea id="pt" rows="10" placeholder='{"title": ..., "cards": [...]}'></textarea>
    <div class="actions"><button class="btn" id="ok">Ekle</button><button class="btn ghost" id="cn">Vazgeç</button></div></div>`;
  document.body.appendChild(d);
  d.querySelector('#cn').onclick = () => d.remove();
  d.querySelector('#ok').onclick = () => {
    try { importPackText(d.querySelector('#pt').value); d.remove(); } catch (e) { toast('❌ ' + esc(e.message), 3500); }
  };
}

// ---------- PDF -> AI ----------
function viewAI() {
  const st = S();
  const mergeId = sessionStorage.getItem('aiMerge') || '';
  sessionStorage.removeItem('aiMerge');
  const custom = packs();
  app.innerHTML = `${hud()}
  <h1 class="title">📄 PDF'den paket üret</h1>
  ${!st.settings.apiKey ? `<div class="card warn">Bunun için ücretsiz bir Gemini API anahtarı lazım. <a href="#settings">Ayarlar</a>'dan ekle. Anahtar istemiyorsan Paketler sayfasındaki 🆓 yöntemi kullan.</div>` : ''}
  <div class="card form">
    <label>PDF dosyaları<input type="file" id="pdf" accept="application/pdf" multiple></label>
    <div class="seg">
      <label><input type="radio" name="kind" value="topic" checked><span>📘 Konu PDF / slayt</span></label>
      <label><input type="radio" name="kind" value="exam"><span>📜 Çıkmış sorular</span></label>
    </div>
    <label>Nereye eklensin?
      <select id="target"><option value="">➕ Yeni paket</option>${custom.map(p => `<option value="${esc(p.id)}" ${p.id === mergeId ? 'selected' : ''}>${esc(p.emoji)} ${esc(p.title)}</option>`).join('')}</select>
    </label>
    <div id="newfields">
      <label>Paket adı<input id="title" placeholder="ör. Hücre zarı ve taşıma"></label>
      <label>Ders<input id="course" placeholder="ör. Tıbbi Biyoloji"></label>
    </div>
    <button class="btn big glow" id="gen">✨ Üret</button>
    <p class="status muted" id="status"></p>
  </div>
  <p class="small muted">İpucu: Uzun PDF'leri bölüm bölüm ekle (aynı pakete). Mevcut pakete eklerken yapay zekâ var olan kartları tekrar etmemeye çalışır. Konu PDF'ini önce, çıkmış soruları sonra eklersen hoca radarı dolar.</p>`;
  const target = document.getElementById('target');
  const nf = document.getElementById('newfields');
  const sync = () => nf.style.display = target.value ? 'none' : '';
  target.onchange = sync; sync();
  const status = document.getElementById('status');
  document.getElementById('gen').onclick = async e => {
    const files = [...document.getElementById('pdf').files];
    if (!files.length) return toast('Önce PDF seç');
    const btn = e.target; btn.disabled = true;
    const kind = app.querySelector('input[name=kind]:checked').value;
    const tgt = target.value ? packById(target.value) : null;
    try {
      const pack = await generateFromPdf({
        files, kind,
        title: tgt ? tgt.title : document.getElementById('title').value.trim(),
        course: tgt ? tgt.course : document.getElementById('course').value.trim(),
        existingHooks: tgt ? tgt.cards.map(c => c.hook || c.question || c.statement).filter(Boolean) : [],
        onStatus: s => status.textContent = s
      });
      const saved = addCustomPack(pack, tgt ? tgt.id : null);
      confetti(120); buzz([40, 50, 80]);
      status.innerHTML = `✅ ${pack.cards.length} kart eklendi → <b>${esc(saved.title)}</b>`;
      toast(`✅ ${pack.cards.length} kart hazır!`, 2500);
      btn.textContent = '✨ Aynı PDF\'ten daha fazla üret';
      target.innerHTML = packs().map(p => `<option value="${esc(p.id)}" ${p.id === saved.id ? 'selected' : ''}>${esc(p.emoji)} ${esc(p.title)}</option>`).join('');
      sync();
    } catch (err) {
      status.textContent = '❌ ' + err.message;
    } finally { btn.disabled = false; }
  };
}

// ---------- AYARLAR ----------
function viewSettings() {
  const st = S(); const s = st.settings;
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
  app.innerHTML = `${hud()}
  <h1 class="title">⚙️ Ayarlar</h1>
  <div class="card form">
    <label>Günlük hedef: <b id="gv">${s.dailyGoal}</b> kart<input type="range" id="goal" min="10" max="80" step="5" value="${s.dailyGoal}"></label>
    <label>Günlük düello hakkı: <b id="dv">${s.duelsPerDay}</b><input type="range" id="duels" min="1" max="10" value="${s.duelsPerDay}"></label>
    <label class="row2"><span>Titreşim</span><span class="sw"><input type="checkbox" id="hap" ${s.haptics ? 'checked' : ''}><i></i></span></label>
  </div>
  <div class="card form">
    <h3>🤖 Yapay zekâ (isteğe bağlı)</h3>
    <p class="small muted">Ücretsiz anahtar: aistudio.google.com/apikey adresinden Google hesabınla 1 dakikada alınır. Anahtar sadece bu telefonda saklanır.</p>
    <label>Gemini API anahtarı<input id="key" type="password" value="${esc(s.apiKey)}" placeholder="AIza…"></label>
    <label>Model<input id="model" list="models" value="${esc(s.model)}"><datalist id="models">${models.map(m => `<option value="${m}">`).join('')}</datalist></label>
    <button class="btn" id="savekey">Kaydet</button>
  </div>
  <div class="card form">
    <h3>💾 Yedek</h3>
    <div class="actions"><button class="btn ghost" id="bk">Yedeği panoya kopyala</button><button class="btn ghost" id="rs">Yedekten geri yükle</button></div>
    <button class="btn ghost danger" id="wipe">İlerlemeyi sıfırla</button>
  </div>
  <p class="small muted center">Dopamed · reklamsız, ücretsiz, açık kaynak</p>`;
  const goal = document.getElementById('goal'), duels = document.getElementById('duels');
  goal.oninput = () => { document.getElementById('gv').textContent = goal.value; setSetting('dailyGoal', +goal.value); };
  duels.oninput = () => { document.getElementById('dv').textContent = duels.value; setSetting('duelsPerDay', +duels.value); };
  document.getElementById('hap').onchange = e => setSetting('haptics', e.target.checked);
  document.getElementById('savekey').onclick = () => {
    setSetting('apiKey', document.getElementById('key').value.trim());
    setSetting('model', document.getElementById('model').value.trim() || 'gemini-2.5-flash');
    toast('Kaydedildi ✓');
  };
  document.getElementById('bk').onclick = async () => toast(await copyText(exportBackup()) ? 'Yedek panoda ✓ Bir yere yapıştırıp sakla' : 'Kopyalanamadı', 2500);
  document.getElementById('rs').onclick = () => {
    const d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = `<div class="card"><h3>Yedeği yapıştır</h3><textarea rows="8" id="bt"></textarea><div class="actions"><button class="btn" id="ok">Geri yükle</button><button class="btn ghost" id="cn">Vazgeç</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector('#cn').onclick = () => d.remove();
    d.querySelector('#ok').onclick = async () => {
      try { importBackup(d.querySelector('#bt').value); d.remove(); await loadPacks(); toast('Geri yüklendi ✓'); viewSettings(); }
      catch (e) { toast('❌ ' + esc(e.message)); }
    };
  };
  document.getElementById('wipe').onclick = () => { if (confirm('Tüm XP, seri ve tekrar geçmişi silinsin mi?')) { resetAll(); toast('Sıfırlandı'); viewSettings(); } };
}

// ---------- başlat ----------
(async () => {
  await loadPacks();
  route();
})();
