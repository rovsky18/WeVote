const $ = s => document.querySelector(s);
let state = { data: null, user: null, page: 'home' };
let timerId = null;
let backgroundId = null;
let parallaxBound = false;
let renderToken = 0;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function withLoader(task) {
  const overlay = $('#loadingOverlay');
  const started = performance.now();
  overlay?.classList.add('show');
  overlay?.setAttribute('aria-hidden', 'false');
  try { return await task(); }
  finally {
    const remain = Math.max(0, 320 - (performance.now() - started));
    if (remain) await sleep(remain);
    overlay?.classList.remove('show');
    overlay?.setAttribute('aria-hidden', 'true');
  }
}

async function api(url, opt = {}) {
  return withLoader(async () => {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }, ...opt });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Terjadi kesalahan');
    return d;
  });
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.style.display = 'none', 2500);
}

function clearTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

function fmtDate(v) { return v ? new Date(v).toLocaleString('id-ID') : '-'; }
function escapeHtml(v = '') { return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }

function timerHTML(target, label) {
  return `<div class="timer-wrap"><div class="timer" data-target="${escapeHtml(target || '')}">
    <div class="unit"><strong>00</strong><span>HARI</span></div>
    <div class="unit"><strong>00</strong><span>JAM</span></div>
    <div class="unit"><strong>00</strong><span>MENIT</span></div>
    <div class="unit"><strong>00</strong><span>DETIK</span></div>
  </div><div class="eyebrow timer-label">${label}</div></div>`;
}

function startTimer(target, onFinish) {
  clearTimer();
  const el = document.querySelector('.timer');
  if (!el) return;
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return;
  const tick = () => {
    if (state.page !== 'home' || !document.body.contains(el)) { clearTimer(); return; }
    const diff = targetMs - Date.now();
    const sec = Math.max(0, Math.floor(diff / 1000));
    const vals = [Math.floor(sec / 86400), Math.floor(sec % 86400 / 3600), Math.floor(sec % 3600 / 60), sec % 60];
    el.querySelectorAll('strong').forEach((n, i) => {
      const next = String(vals[i]).padStart(2, '0');
      if (n.textContent !== next) { n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick'); n.textContent = next; }
    });
    if (diff <= 0) { clearTimer(); onFinish(); }
  };
  tick();
  timerId = setInterval(tick, 1000);
}

async function renderApp(html, token = ++renderToken) {
  if (token !== renderToken) return;
  const app = $('#app');
  const old = app.querySelector('.page-view');
  if (old) {
    old.classList.add('page-exit');
    await sleep(170);
    if (token !== renderToken) return;
  }
  app.innerHTML = `<div class="page-view">${html}</div>`;
}

function candidateCards(candidates, active) {
  if (!candidates.length) return `<div class="empty-candidates card">Belum ada kandidat yang ditambahkan.</div>`;
  return candidates.map((c, i) => `<article class="card candidate parallax-card" data-parallax-index="${i}">
    <div class="candidate-photo-wrap"><img src="${escapeHtml(c.photo_url || 'https://placehold.co/500x500?text=Kandidat')}" alt="Foto ${escapeHtml(c.name)}"></div>
    <div class="candidate-content"><span class="candidate-number">KANDIDAT ${i + 1}</span><h3>${escapeHtml(c.name)}</h3>
    <p>${escapeHtml(c.vision || 'Visi belum diisi.')}</p>
    <button class="primary" data-candidate-detail="${c.id}">Lihat Visi Misi</button>
    ${active && state.user?.role === 'voter' ? `<button data-vote="${c.id}">Pilih Kandidat</button>` : ''}</div>
  </article>`).join('');
}

function electionDetails(s, showType = true) {
  return `<div class="election-details">
    ${showType ? `<span class="status type-detail">${s.election_type === 'osis' ? 'Pemilihan Ketua OSIS' : 'Pemilihan Ketua MPK'}</span>` : ''}
    <span class="status detail-icon"><span class="detail-icon-symbol location-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"></path><circle cx="12" cy="9" r="2.2"></circle></svg></span>${escapeHtml(s.location || '-')}</span>
    <span class="status detail-icon"><span class="detail-icon-symbol clock-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.5 2"></path></svg></span>${escapeHtml(fmtDate(s.start_at))}</span>
  </div>`;
}

function scrollCue() {
  return `<button class="scroll-cue" data-scroll-candidates aria-label="Lihat daftar kandidat"><span>Lihat kandidat</span><i>↓</i></button>`;
}

async function loadHome() {
  state.page = 'home';
  clearTimer();
  const token = ++renderToken;
  try { state.data = await api('/api/election'); }
  catch (e) { await renderApp(`<div class="wrap"><div class="card notice"><h2>WeVote belum dapat memuat data</h2><p>${escapeHtml(e.message)}</p></div></div>`, token); return; }

  const s = state.data.settings;
  rotateBackgrounds([s.background_1, s.background_2, s.background_3]);
  $('#schoolName').textContent = s.school_name || 'WeVote!';
  const schoolLogo = $('#schoolLogo');
  if (schoolLogo) { schoolLogo.src = s.logo_url || 'https://placehold.co/80x80?text=Logo'; schoolLogo.style.display = 'block'; }
  const start = s.start_at ? new Date(s.start_at) : null;
  const end = start && Number(s.duration_minutes) > 0 ? new Date(start.getTime() + Number(s.duration_minutes) * 60000) : null;
  let html = '';
  let timerTarget = null;

  if (!start || !end) {
    html = `<section class="hero-stage compact-stage"><div class="hero-copy"><div class="eyebrow">${s.election_type === 'osis' ? 'PEMILIHAN KETUA OSIS' : 'PEMILIHAN KETUA MPK'}</div><h1>WeVote<span>!</span></h1><p>Waktu pemilihan belum diatur. Silakan hubungi administrator.</p></div></section>`;
  } else if (Date.now() < start.getTime()) {
    html = `<section class="hero-stage"><div class="hero-copy"><div class="eyebrow">${s.election_type === 'osis' ? 'PEMILIHAN KETUA OSIS' : 'PEMILIHAN KETUA MPK'}</div><h1>WeVote<span>!</span></h1><p class="hero-school">${escapeHtml(s.school_name)}</p>${electionDetails(s, false)}${timerHTML(s.start_at, 'Menuju dimulainya pemilihan')}${scrollCue()}</div></section>
      <section id="candidateSection" class="candidate-section"><div class="section-heading"><div class="eyebrow">CALON PEMIMPIN</div><h2>Daftar Kandidat</h2><p>Kenali kandidat dan visi misi sebelum pemilihan dimulai.</p></div><div class="grid candidate-grid">${candidateCards(state.data.candidates, false)}</div></section>`;
    timerTarget = s.start_at;
  } else if (Date.now() < end.getTime()) {
    const voted = state.user?.role === 'voter' ? await api('/api/my-vote').then(x => x.voted).catch(() => false) : false;
    html = `<section class="hero-stage active-stage"><div class="hero-copy"><div class="eyebrow">${s.election_type === 'osis' ? 'PEMILIHAN KETUA OSIS' : 'PEMILIHAN KETUA MPK'}</div><h1>Waktunya <span>Memilih.</span></h1><p class="hero-school">${escapeHtml(s.school_name)}</p>${electionDetails(s)}${timerHTML(end.toISOString(), 'Waktu pemilihan tersisa')}${voted ? '<div class="status success vote-state">✓ Anda sudah memilih</div>' : ''}${scrollCue()}</div></section>
      <section id="candidateSection" class="candidate-section live-candidates"><div class="section-heading"><div class="eyebrow">PILIHAN ANDA</div><h2>Daftar Kandidat</h2><p>Pertimbangkan visi dan misi setiap kandidat sebelum menentukan pilihan.</p></div><div class="grid candidate-grid">${candidateCards(state.data.candidates, !voted)}</div></section>`;
    timerTarget = end.toISOString();
  } else {
    html = `<section class="hero-stage result-stage"><div class="hero-copy"><div class="eyebrow">PEMILIHAN SELESAI</div><h1>Terima kasih.</h1><p>Rangkaian pemilihan telah berakhir. Hasil pemilihan dapat dilihat setelah proses selesai.</p><button class="primary result-hero-btn" id="resultsBtn">Lihat Hasil Pemilihan</button></div></section>`;
  }

  await renderApp(html, token);
  if (token !== renderToken) return;
  $('#resultsBtn')?.addEventListener('click', showResults);
  document.querySelectorAll('[data-candidate-detail]').forEach(btn => btn.addEventListener('click', () => candidateModal(Number(btn.dataset.candidateDetail))));
  document.querySelectorAll('[data-vote]').forEach(btn => btn.addEventListener('click', () => vote(Number(btn.dataset.vote))));
  document.querySelector('[data-scroll-candidates]')?.addEventListener('click', () => scrollToCandidates());
  bindHomeSnap();
  bindParallax();
  if (timerTarget) startTimer(timerTarget, loadHome);
}

function candidateModal(id) {
  const c = state.data?.candidates.find(x => x.id === id);
  if (!c) return;
  const modal = document.createElement('div'); modal.className = 'modal'; modal.id = 'candidateModal';
  modal.innerHTML = `<div class="modalbox" role="dialog" aria-modal="true"><div class="row space-between"><h2>${escapeHtml(c.name)}</h2><button class="modal-close" aria-label="Tutup">✕</button></div><img src="${escapeHtml(c.photo_url || 'https://placehold.co/500x300?text=Kandidat')}" alt="Foto ${escapeHtml(c.name)}" class="modal-photo"><h3>Visi</h3><p>${escapeHtml(c.vision || '-')}</p><h3>Misi</h3><p>${escapeHtml(c.mission || '-')}</p></div>`;
  document.body.appendChild(modal); requestAnimationFrame(() => modal.classList.add('show'));
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); });
  modal.querySelector('.modal-close').addEventListener('click', () => closeModal(modal));
}
function closeModal(modal) { modal.classList.remove('show'); setTimeout(() => modal.remove(), 180); }

async function vote(id) {
  if (!confirm('Yakin memilih kandidat ini? Pilihan tidak dapat dibatalkan.')) return;
  try { await api('/api/vote', { method:'POST', body:JSON.stringify({ candidateId:id }) }); toast('Suara berhasil direkam. Terima kasih!'); await loadHome(); }
  catch (e) { toast(e.message); }
}

async function showResults() {
  state.page = 'results'; clearTimer(); const token = ++renderToken;
  try {
    const d = await api('/api/election');
    const start = d.settings.start_at ? new Date(d.settings.start_at) : null;
    const end = start && Number(d.settings.duration_minutes) > 0 ? new Date(start.getTime() + Number(d.settings.duration_minutes) * 60000) : null;
    if (!end || Date.now() < end.getTime()) { toast('Hasil belum tersedia.'); return loadHome(); }
    const total = d.results.reduce((a,b) => a + Number(b.votes), 0);
    await renderApp(`<section class="results-page"><div class="card results-card"><div class="results-head"><div><div class="eyebrow">HASIL PEMILIHAN</div><h1>${d.settings.election_type === 'osis' ? 'Ketua OSIS' : 'Ketua MPK'}</h1><p>Total suara: ${total}</p></div><button id="backHome">Kembali</button></div><div class="result"><canvas id="chart" width="420" height="300"></canvas></div>${d.results.map(x => `<div class="result-row"><div class="row space-between"><b>${escapeHtml(x.name)}</b><span>${Number(x.votes)} suara</span></div><div class="bar"><i style="width:${total ? Number(x.votes) / total * 100 : 0}%"></i></div></div>`).join('')}</div></section>`, token);
    if (token !== renderToken) return;
    $('#backHome').addEventListener('click', loadHome); drawPie(d.results, total);
  } catch (e) { toast(e.message); await loadHome(); }
}

function drawPie(rows, total) {
  const c = $('#chart'); if (!c) return;
  const ctx = c.getContext('2d'); const cx = c.width/2, cy = c.height/2, r = Math.min(c.width,c.height)*.35; let angle = -Math.PI/2;
  rows.forEach((x,i) => { const slice = total ? Number(x.votes)/total*Math.PI*2 : 0; ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+slice);ctx.closePath();ctx.fillStyle=`hsl(${220+i*65} 70% 55%)`;ctx.fill();angle+=slice; });
  ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--card');ctx.beginPath();ctx.arc(cx,cy,r*.43,0,Math.PI*2);ctx.fill();
}

function loginModal() {
  if ($('#loginModal')) return;
  const modal=document.createElement('div'); modal.className='modal';modal.id='loginModal';
  modal.innerHTML=`<div class="modalbox" role="dialog" aria-modal="true"><div class="row space-between"><h2>Login Pemilih</h2><button class="modal-close">✕</button></div><p class="muted">Login hanya untuk siswa dan pegawai.</p><form class="form" id="loginForm"><select id="voterType"><option value="siswa">Siswa — NIS</option><option value="pegawai">Pegawai — NIP</option></select><input id="identity" placeholder="Masukkan NIS / NIP" autocomplete="username" required><input id="password" type="password" placeholder="Password" autocomplete="current-password" required><button class="primary">Masuk</button></form></div>`;
  document.body.appendChild(modal);requestAnimationFrame(()=>modal.classList.add('show')); modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});modal.querySelector('.modal-close').addEventListener('click',()=>closeModal(modal));
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/login',{method:'POST',body:JSON.stringify({identity:$('#identity').value,password:$('#password').value,voterType:$('#voterType').value})});state.user=d.user;updateLoginButton();closeModal(modal);toast('Login berhasil');await loadHome();}catch(e){toast(e.message)}});
}

async function simplePage(title, text) {
  state.page='simple';clearTimer();const token=++renderToken;
  await renderApp(`<section class="simple-page"><div class="card simple-card"><div class="eyebrow">WEVOTE</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></div></section>`,token);
}

let homeSnapBound = false;
let homeSnapLock = false;

function scrollToCandidates() {
  const section = document.querySelector('#candidateSection');
  if (!section) return;
  const header = document.querySelector('header');
  const offset = header ? header.getBoundingClientRect().height : 0;
  const top = window.scrollY + section.getBoundingClientRect().top - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function bindHomeSnap() {
  if (homeSnapBound) return;
  homeSnapBound = true;
  window.addEventListener('wheel', e => {
    const hero = document.querySelector('.hero-stage');
    const candidates = document.querySelector('#candidateSection');
    if (!hero || !candidates || homeSnapLock || Math.abs(e.deltaY) < 8) return;
    const header = document.querySelector('header');
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const candidateTop = window.scrollY + candidates.getBoundingClientRect().top - headerH;
    const nearHeroTop = window.scrollY < 90;
    if (e.deltaY > 0 && nearHeroTop) {
      e.preventDefault();
      homeSnapLock = true;
      scrollToCandidates();
      window.setTimeout(() => { homeSnapLock = false; }, 700);
    }
  }, { passive:false });
}

function bindParallax() {
  if (parallaxBound) return;
  parallaxBound = true;
  const update = () => {
    const y = window.scrollY || 0;
    document.documentElement.style.setProperty('--scroll-y', `${y}px`);
    document.querySelectorAll('.parallax-card').forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height/2;
      const offset = Math.max(-18, Math.min(18, (window.innerHeight/2 - center) * 0.035));
      el.style.setProperty('--parallax', `${offset + (i % 2 ? -2 : 2)}px`);
    });
  };
  window.addEventListener('scroll', update, { passive:true });
  window.addEventListener('resize', update);
  update();
}

function rotateBackgrounds(backgrounds = []) {
  const layers=[...document.querySelectorAll('.bg-layer')]; if(!layers.length) return;
  const defaults=['/assets/bg-school.svg','/assets/bg-vote.svg','/assets/bg-community.svg'];
  const urls=layers.map((_,i)=>backgrounds[i] || defaults[i]);
  layers.forEach((l,i)=>{ l.style.backgroundImage=`url(\"${String(urls[i]).replace(/\"/g,'\\\"')}\")`; l.classList.toggle('active',i===0); });
  let active=0;
  clearInterval(backgroundId);
  backgroundId=setInterval(()=>{layers[active].classList.remove('active');active=(active+1)%layers.length;layers[active].classList.add('active');},10000);
}

// Navigasi SPA: perpindahan halaman dianimasikan tanpa reload.
document.querySelectorAll('nav button[data-page]').forEach(btn=>btn.addEventListener('click',async()=>{const page=btn.dataset.page;if(page==='home')await loadHome();else if(page==='vision')await simplePage('Visi Misi Sekolah','Tempat untuk menampilkan visi dan misi sekolah.');else if(page==='about')await simplePage('About Web','WeVote adalah prototype sistem pemilihan digital sekolah yang transparan dan responsif.');else await simplePage('Contact Pembuat','Whatsapp : 082214059967');}));

function updateLoginButton(){const btn=$('#loginBtn');if(btn)btn.textContent=state.user?'Logout':'Login Pemilih';}

$('#loginBtn').addEventListener('click',async()=>{if(state.user){try{await api('/api/logout',{method:'POST'});state.user=null;updateLoginButton();toast('Logout berhasil');await loadHome();}catch(e){toast(e.message)}}else loginModal();});
$('#theme').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.theme=document.body.classList.contains('dark')?'dark':'light';});
if(localStorage.theme==='dark')document.body.classList.add('dark');

rotateBackgrounds(); bindParallax();
api('/api/session').then(async x=>{state.user=x.user;updateLoginButton();await loadHome();}).catch(()=>{state.user=null;updateLoginButton();loadHome();});
