const $ = s => document.querySelector(s);
let state = { data: null, user: null, activeMenu: 'dashboard' };

async function api(url, opt = {}) {
  const headers = { ...(opt.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(opt.headers || {}) };
  const r = await fetch(url, { ...opt, headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || 'Terjadi kesalahan');
  return d;
}
function toast(msg) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(toast._timer); toast._timer = setTimeout(() => el.style.display = 'none', 2800);
}
function escapeHtml(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
}
function fmtDate(v) { return v ? new Date(v).toLocaleString('id-ID') : 'Belum diatur'; }
function localDateTime(v) {
  return v ? new Date(v).toLocaleString('sv-SE', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).slice(0,16) : '';
}

function showLogin() {
  $('#adminApp').innerHTML = `<div class="wrap narrow"><div class="card admin-login">
    <div class="eyebrow">SUPERADMIN / ADMIN</div><h1>Login Admin</h1>
    <p class="muted">Halaman ini terpisah dari login pemilih.</p>
    <form class="form" id="adminLoginForm">
      <input id="adminIdentity" placeholder="Username admin" autocomplete="username" required>
      <input id="adminPassword" type="password" placeholder="Password" autocomplete="current-password" required>
      <button class="primary" type="submit">Masuk ke Panel Admin</button>
    </form>
  </div></div>`;
  $('#adminLoginForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const d = await api('/api/admin/login', { method:'POST', body:JSON.stringify({identity:$('#adminIdentity').value,password:$('#adminPassword').value}) });
      state.user = d.user; state.activeMenu = 'dashboard'; await renderPanel(); toast('Login admin berhasil');
    } catch (e) { toast(e.message); }
  };
}

async function refreshData() {
  state.data = await api('/api/election');
  return state.data;
}

async function renderPanel() {
  const d = await refreshData();
  $('#adminApp').innerHTML = `<div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="sidebar-title">MENU ADMIN</div>
      <button class="side-item" data-menu="dashboard">▦ <span>Dashboard</span></button>
      <button class="side-item" data-menu="settings">⚙ <span>Pengaturan Pemilihan</span></button>
      <button class="side-item" data-menu="school-logo">▣ <span>Logo Sekolah</span></button>
      <button class="side-item" data-menu="backgrounds">▤ <span>Background Utama</span></button>
      <button class="side-item" data-menu="candidates">◉ <span>Kandidat</span></button>
      <button class="side-item" data-menu="users">♙ <span>Data Pemilih</span></button>
      <button class="side-item" data-menu="import">⇅ <span>Import / Export</span></button>
      <button class="side-item danger-side" data-menu="reset">↻ <span>Reset Pemilihan</span></button>
      <div class="sidebar-bottom"><small>Login sebagai</small><b>${escapeHtml(state.user.name)}</b><span>${escapeHtml(state.user.role)}</span><button id="logout">Logout</button></div>
    </aside>
    <section class="admin-content">
      <div class="admin-content-head"><div><div class="eyebrow">ADMIN PANEL</div><h1>WeVote!</h1></div><div class="admin-mobile-user">${escapeHtml(state.user.name)}</div></div>
      <div id="adminView"></div>
    </section>
  </div>`;

  document.querySelectorAll('.side-item').forEach(btn => btn.onclick = () => showMenu(btn.dataset.menu));
  $('#logout').onclick = async () => { await api('/api/logout',{method:'POST'}); state.user=null; showLogin(); };
  showMenu(state.activeMenu);
}

async function showMenu(menu) {
  state.activeMenu = menu;
  document.querySelectorAll('.side-item').forEach(b => b.classList.toggle('active', b.dataset.menu === menu));
  const view = $('#adminView');
  if (!view) return;
  if (menu === 'dashboard') return renderDashboard(view);
  if (menu === 'settings') return renderSettings(view);
  if (menu === 'school-logo') return renderSchoolLogo(view);
  if (menu === 'backgrounds') return renderBackgrounds(view);
  if (menu === 'candidates') return renderCandidatesView(view);
  if (menu === 'users') return renderUsers(view);
  if (menu === 'import') return renderImport(view);
  if (menu === 'reset') return renderReset(view);
}

function renderDashboard(view) {
  const d = state.data, s = d.settings;
  const start = s.start_at ? new Date(s.start_at) : null;
  const end = start && s.duration_minutes ? new Date(start.getTime() + Number(s.duration_minutes)*60000) : null;
  let status = 'Belum diatur';
  if (start && new Date() < start) status = 'Menunggu dimulai';
  else if (start && end && new Date() < end) status = 'Sedang berlangsung';
  else if (start && end) status = 'Selesai';
  view.innerHTML = `<div class="view-title"><div><h2>Dashboard</h2><p class="muted">Ringkasan kondisi pemilihan saat ini.</p></div></div>
    <div class="admin-stats">
      <div class="card stat-card"><span>Kandidat aktif</span><b>${d.candidates.length}</b></div>
      <div class="card stat-card"><span>Suara masuk</span><b>${d.voteCount}</b></div>
      <div class="card stat-card"><span>Status</span><b class="stat-small">${status}</b></div>
      <div class="card stat-card"><span>Jenis</span><b class="stat-small">${s.election_type==='osis'?'Ketua OSIS':'Ketua MPK'}</b></div>
    </div>
    <div class="admin-two-col">
      <section class="card"><h3>Detail Pemilihan</h3><div class="detail-list">
        <div><span>Sekolah</span><b>${escapeHtml(s.school_name)}</b></div>
        <div><span>Lokasi</span><b>${escapeHtml(s.location || '-')}</b></div>
        <div><span>Mulai</span><b>${fmtDate(s.start_at)}</b></div>
        <div><span>Durasi</span><b>${Number(s.duration_minutes)||0} menit</b></div>
      </div></section>
      <section class="card"><h3>Akses cepat</h3><div class="quick-grid">
        <button class="quick-btn" data-go="settings">⚙<span>Atur pemilihan</span></button>
        <button class="quick-btn" data-go="candidates">◉<span>Kelola kandidat</span></button>
        <button class="quick-btn" data-go="users">♙<span>Lihat pemilih</span></button>
        <button class="quick-btn" data-go="import">⇅<span>Import / Export</span></button>
      </div></section>
    </div>`;
  view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => showMenu(b.dataset.go));
}

function renderSettings(view) {
  const s = state.data.settings;
  view.innerHTML = `<div class="view-title"><div><h2>Pengaturan Pemilihan</h2><p class="muted">Atur identitas sekolah, jenis, lokasi, waktu mulai, dan durasi.</p></div></div>
    <section class="card compact-card"><form class="form settings-form" id="settings">
      <label>Nama sekolah<input id="school" value="${escapeHtml(s.school_name)}" required></label>
      <label>Jenis pemilihan<select id="etype"><option value="osis" ${s.election_type==='osis'?'selected':''}>Ketua OSIS</option><option value="mpk" ${s.election_type==='mpk'?'selected':''}>Ketua MPK</option></select></label>
      <label>Lokasi<input id="location" value="${escapeHtml(s.location || '')}" placeholder="Contoh: Aula Sekolah"></label>
      <label>Tanggal & jam mulai<input id="start" type="datetime-local" value="${localDateTime(s.start_at)}"></label>
      <label>Durasi pemilihan (menit)<input id="duration" type="number" min="1" value="${Number(s.duration_minutes)||''}" required></label>
      <div class="form-actions"><button class="primary">Simpan Pengaturan</button></div>
    </form></section>`;
  $('#settings').onsubmit = async e => { e.preventDefault(); try {
    await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({school_name:$('#school').value,election_type:$('#etype').value,location:$('#location').value,start_at:$('#start').value?new Date($('#start').value).toISOString():null,duration_minutes:$('#duration').value,logo_url:state.data.settings.logo_url||''})});
    toast('Pengaturan tersimpan'); await refreshData(); renderSettings(view);
  } catch(e){toast(e.message)} };
}

function renderSchoolLogo(view) {
  const logo = state.data.settings.logo_url || 'https://placehold.co/300x300?text=Logo';
  view.innerHTML = `<div class="view-title"><div><h2>Logo Sekolah</h2><p class="muted">Upload logo sekolah dari komputer. Logo akan tampil di halaman utama.</p></div></div>
    <section class="card logo-setting-card">
      <div class="logo-preview-wrap"><img id="schoolLogoPreview" src="${escapeHtml(logo)}" alt="Preview logo sekolah"></div>
      <form class="form" id="schoolLogoForm">
        <label>Pilih logo<input id="schoolLogoFile" type="file" accept="image/jpeg,image/png,image/webp" required></label>
        <small class="muted">Format JPG, PNG, atau WebP. Ukuran maksimal 8 MB.</small>
        <button class="primary">Simpan Logo Sekolah</button>
      </form>
    </section>`;
  $('#schoolLogoFile').addEventListener('change', async e => { const file=e.target.files?.[0]; if(!file)return; try { $('#schoolLogoPreview').src=await compressImage(file); } catch(err){ toast(err.message); e.target.value=''; } });
  $('#schoolLogoForm').onsubmit=async e=>{e.preventDefault(); const file=$('#schoolLogoFile').files?.[0]; if(!file){toast('Pilih logo terlebih dahulu.');return;} try { const logo_url=await compressImage(file); await api('/api/admin/settings/logo',{method:'PUT',body:JSON.stringify({logo_url})}); toast('Logo sekolah berhasil diperbarui'); await refreshData(); renderSchoolLogo(view); } catch(err){toast(err.message)} };
}

function renderBackgrounds(view) {
  const s = state.data.settings;
  const defaults = ['/assets/bg-school.svg','/assets/bg-vote.svg','/assets/bg-community.svg'];
  const current = [s.background_1, s.background_2, s.background_3];
  view.innerHTML = `<div class="view-title"><div><h2>Background Halaman Utama</h2><p class="muted">Atur hingga 3 gambar yang berganti otomatis setiap 10 detik. Jika dikosongkan, background bawaan WeVote digunakan.</p></div></div>
    <section class="card background-setting-card">
      <div class="background-grid">
        ${[0,1,2].map(i => `<div class="background-item">
          <div class="background-preview"><img id="bgPreview${i}" src="${escapeHtml(current[i] || defaults[i])}" alt="Preview background ${i+1}"></div>
          <div class="background-meta"><b>Background ${i+1}</b><span class="muted">Gambar ${i+1} dari slideshow halaman utama</span></div>
          <input id="bgFile${i}" type="file" accept="image/jpeg,image/png,image/webp">
        </div>`).join('')}
      </div>
      <div class="background-actions">
        <button class="primary" id="saveBackgrounds">Simpan Background</button>
        <button id="resetBackgrounds">Gunakan Background Bawaan</button>
      </div>
      <p class="muted background-note">Format: JPG, PNG, WebP. Maksimal 8 MB per file. Gambar akan dikompres otomatis agar lebih ringan.</p>
    </section>`;

  [0,1,2].forEach(i => {
    $(`#bgFile${i}`).addEventListener('change', async e => {
      const file=e.target.files?.[0]; if(!file)return;
      try { $(`#bgPreview${i}`).src=await compressBackground(file); }
      catch(err){ toast(err.message); e.target.value=''; }
    });
  });

  $('#saveBackgrounds').onclick = async () => {
    try {
      const next = [...current];
      for(let i=0;i<3;i++) {
        const file=$(`#bgFile${i}`).files?.[0];
        if(file) next[i]=await compressBackground(file);
      }
      await api('/api/admin/settings/backgrounds',{method:'PUT',body:JSON.stringify({background_1:next[0]||'',background_2:next[1]||'',background_3:next[2]||''})});
      toast('Background halaman utama berhasil disimpan');
      await refreshData();
      renderBackgrounds(view);
    } catch(e){ toast(e.message); }
  };

  $('#resetBackgrounds').onclick = async () => {
    if(!confirm('Kembalikan semua background ke background bawaan WeVote?')) return;
    try {
      await api('/api/admin/settings/backgrounds',{method:'PUT',body:JSON.stringify({background_1:'',background_2:'',background_3:''})});
      toast('Background bawaan dipulihkan');
      await refreshData();
      renderBackgrounds(view);
    } catch(e){ toast(e.message); }
  };
}

function compressBackground(file) {
  return new Promise((resolve,reject)=>{
    if(file.size>8*1024*1024) return reject(new Error('Ukuran background maksimal 8 MB.'));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Background gagal dibaca.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Format background tidak dapat dibaca.'));
      img.onload=()=>{
        const max=1600, scale=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        const out=canvas.toDataURL('image/jpeg',.72);
        if(out.length>2_600_000) return reject(new Error('Background masih terlalu besar setelah dikompresi. Pilih gambar yang lebih sederhana.'));
        resolve(out);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderCandidatesView(view) {
  const cs = state.data.candidates;
  view.innerHTML = `<div class="view-title"><div><h2>Kandidat</h2><p class="muted">Tambah, edit nama, foto, visi, dan misi kandidat.</p></div><button class="primary" id="addCandidate">+ Tambah Kandidat</button></div>
    <div id="adminCandidates" class="candidate-admin-grid"></div>`;
  renderCandidates(cs);
  $('#addCandidate').onclick = () => candidateForm();
}
function renderCandidates(cs) {
  const target = $('#adminCandidates');
  if (!target) return;
  target.innerHTML = cs.length ? cs.map(c => `<div class="candidate-admin card">
    <img src="${escapeHtml(c.photo_url || 'https://placehold.co/240x240?text=Foto')}" alt="Foto kandidat">
    <div class="candidate-admin-info"><div class="candidate-number">Kandidat ${escapeHtml(c.sort_order)}</div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.vision || 'Belum ada visi.')}</p></div>
    <div class="row candidate-actions"><button onclick="candidateForm(${c.id})">Edit</button><button onclick="deleteCandidate(${c.id})">Hapus</button></div>
  </div>`).join('') : '<div class="card empty">Belum ada kandidat aktif.</div>';
}

function candidateForm(id) {
  const c = id ? state.data.candidates.find(x => x.id === id) : null;
  const data = c || {name:'',photo_url:'',vision:'',mission:''};
  $('#adminApp').insertAdjacentHTML('beforeend', `<div class="modal" id="candidateModal"><div class="modalbox">
    <div class="row space-between"><h2>${id?'Edit':'Tambah'} Kandidat</h2><button id="closeCandidate">✕</button></div>
    <form class="form" id="candidateForm">
      <label>Nama kandidat<input id="cn" value="${escapeHtml(data.name)}" required></label>
      <label>Foto kandidat<input id="photoFile" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <small class="muted">Pilih foto langsung dari PC. Foto akan dikompres otomatis sebelum disimpan.</small>
      <img id="photoPreview" class="modal-photo" src="${escapeHtml(data.photo_url || 'https://placehold.co/500x300?text=Preview')}" alt="Preview foto">
      <label>Visi<textarea id="cv" placeholder="Visi kandidat">${escapeHtml(data.vision)}</textarea></label>
      <label>Misi<textarea id="cm" placeholder="Misi kandidat">${escapeHtml(data.mission)}</textarea></label>
      <button class="primary">Simpan Kandidat</button>
    </form>
  </div></div>`);
  const modal = $('#candidateModal');
  $('#closeCandidate').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  $('#photoFile').addEventListener('change', async e => { const file=e.target.files?.[0]; if(!file)return; try{$('#photoPreview').src=await compressImage(file)}catch(err){toast(err.message);e.target.value='';} });
  $('#candidateForm').onsubmit = async e => { e.preventDefault(); try {
    let photoUrl=data.photo_url||''; const file=$('#photoFile').files?.[0]; if(file) photoUrl=await compressImage(file);
    await api(id?`/api/admin/candidates/${id}`:'/api/admin/candidates',{method:id?'PUT':'POST',body:JSON.stringify({name:$('#cn').value,photo_url:photoUrl,vision:$('#cv').value,mission:$('#cm').value})});
    modal.remove(); toast('Kandidat tersimpan'); await refreshData(); renderCandidatesView($('#adminView'));
  } catch(e){toast(e.message)} };
}
function compressImage(file) {
  return new Promise((resolve,reject)=>{ if(file.size>8*1024*1024)return reject(new Error('Ukuran foto maksimal 8 MB.')); const reader=new FileReader(); reader.onerror=()=>reject(new Error('Foto gagal dibaca.')); reader.onload=()=>{const img=new Image(); img.onerror=()=>reject(new Error('Format foto tidak dapat dibaca.')); img.onload=()=>{const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.82));};img.src=reader.result;};reader.readAsDataURL(file); });
}
window.candidateForm=candidateForm;
window.deleteCandidate=async id=>{if(!confirm('Nonaktifkan kandidat ini?'))return;try{await api(`/api/admin/candidates/${id}`,{method:'DELETE'});toast('Kandidat dihapus');await refreshData();renderCandidatesView($('#adminView'));}catch(e){toast(e.message)}};

async function renderUsers(view) {
  view.innerHTML = `<div class="view-title"><div><h2>Data Pemilih</h2><p class="muted">Lihat akun pemilih dan status apakah sudah memberikan suara.</p></div><button id="refreshUsers">↻ Muat ulang</button></div><div class="card table-card"><div class="table-tools"><input id="userSearch" placeholder="Cari NIS/NIP atau nama..."><span id="userCount" class="muted"></span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>No.</th><th>User / NIS / NIP</th><th>Password</th><th>Nama Pemilih</th><th>Jenis</th><th>Status Memilih</th></tr></thead><tbody id="usersBody"></tbody></table></div></div>`;
  try { const users=await api('/api/admin/users'); state.users=users; drawUsers(users); } catch(e){toast(e.message);}
  $('#refreshUsers').onclick=()=>renderUsers(view);
  $('#userSearch').oninput=e=>drawUsers(state.users.filter(u=>(u.identity+' '+u.full_name+' '+u.voter_type).toLowerCase().includes(e.target.value.toLowerCase())));
}
function drawUsers(users) {
  const body=$('#usersBody'); if(!body)return;
  $('#userCount').textContent=`${users.length} pemilih`;
  body.innerHTML=users.length?users.map((u,i)=>`<tr><td>${i+1}</td><td><b>${escapeHtml(u.identity)}</b></td><td><span class="password-mask">••••••••</span><small class="password-note">Tidak dapat ditampilkan</small></td><td>${escapeHtml(u.full_name)}</td><td>${u.voter_type==='siswa'?'Siswa':'Pegawai'}</td><td><span class="status ${u.voted?'success':''}">${u.voted?'✓ Sudah memilih':'Belum memilih'}</span></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Belum ada data pemilih.</td></tr>';
}

function renderImport(view) {
  view.innerHTML = `<div class="view-title"><div><h2>Import / Export Data Pemilih</h2><p class="muted">Kelola banyak akun pemilih menggunakan file CSV.</p></div></div>
    <div class="admin-two-col">
      <section class="card import-card"><div class="icon-box">⇩</div><h3>Export Data Pemilih</h3><p class="muted">Unduh daftar pemilih beserta nama, jenis, dan status memilih. Password tidak diekspor dalam bentuk asli karena disimpan sebagai hash.</p><button class="primary" id="exportUsers">Export CSV</button></section>
      <section class="card import-card"><div class="icon-box">⇧</div><h3>Import Data Pemilih</h3><p class="muted">Pilih file CSV sesuai template. Baris baru wajib memiliki password. Untuk akun lama, password boleh dikosongkan agar password lama tetap digunakan.</p><input id="importFile" type="file" accept=".csv,text/csv"><button class="primary" id="importUsers">Import CSV</button></section>
    </div>
    <section class="card"><div class="row space-between"><div><h3>Template CSV</h3><p class="muted">Kolom: identity, password, full_name, voter_type. Gunakan <b>siswa</b> atau <b>pegawai</b>.</p></div><button id="downloadTemplate">Download Template</button></div><div class="csv-preview"><code>identity,password,full_name,voter_type<br>20260002,123456,Budi Santoso,siswa<br>198001010002,123456,Siti Aminah,pegawai</code></div></section>
    <section class="card notice"><b>Catatan keamanan password</b><p class="muted">Password pemilih disimpan menggunakan hash bcrypt. Karena itu password asli tidak bisa dibaca kembali dari database maupun dari menu Data Pemilih. File export juga sengaja tidak membawa password asli.</p></section>`;
  $('#downloadTemplate').onclick=downloadTemplate;
  $('#exportUsers').onclick=exportUsers;
  $('#importUsers').onclick=importUsers;
}
function csvCell(v=''){ const s=String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function downloadFile(name, content) { const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url); }
function downloadTemplate(){ downloadFile('template_data_pemilih_wevote.csv','identity,password,full_name,voter_type\n20260002,123456,Budi Santoso,siswa\n198001010002,123456,Siti Aminah,pegawai\n'); toast('Template berhasil dibuat'); }
async function exportUsers(){ try { const users=await api('/api/admin/users'); const rows=[['identity','password','full_name','voter_type','status_memilih'],...users.map(u=>[u.identity,'',u.full_name,u.voter_type,u.voted?'sudah_memilih':'belum_memilih'])]; downloadFile('data_pemilih_wevote.csv','\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\n')); toast('Data pemilih berhasil diexport'); } catch(e){toast(e.message)} }
async function importUsers(){
  const file=$('#importFile')?.files?.[0]; if(!file){toast('Pilih file CSV terlebih dahulu.');return;}
  if(file.size>5*1024*1024){toast('Ukuran CSV maksimal 5 MB.');return;}
  try { const csv=await file.text(); const result=await api('/api/admin/users/import',{method:'POST',body:JSON.stringify({csv})}); toast(`Import selesai: ${result.inserted} baru, ${result.updated} diperbarui, ${result.skipped} dilewati.`); await showMenu('users'); }
  catch(e){toast(e.message)}
}

function renderReset(view){
  view.innerHTML=`<div class="view-title"><div><h2>Reset Pemilihan</h2><p class="muted">Gunakan hanya jika ingin menyiapkan pemilihan dari awal.</p></div></div>
    <section class="card danger-zone large-danger"><div class="icon-box">!</div><h3>Reset seluruh pemilihan</h3><p>Proses ini akan <b>menghapus seluruh suara</b>, menonaktifkan semua kandidat, dan mengosongkan waktu mulai, durasi, serta lokasi pemilihan.</p><p class="muted">Data akun pemilih tidak ikut dihapus.</p><button id="resetElection">Reset Pemilihan</button></section>`;
  $('#resetElection').onclick=async()=>{if(!confirm('Yakin reset? Semua suara akan dihapus dan kandidat dinonaktifkan.'))return;try{await api('/api/admin/reset',{method:'POST'});toast('Pemilihan berhasil direset');await refreshData();showMenu('dashboard');}catch(e){toast(e.message)}};
}

$('#backHome').onclick=()=>location.href='/';
$('#theme').onclick=()=>{document.body.classList.toggle('dark');localStorage.theme=document.body.classList.contains('dark')?'dark':'light';};
if(localStorage.theme==='dark')document.body.classList.add('dark');
api('/api/session').then(async d=>{if(d.user&&['admin','superadmin'].includes(d.user.role)){state.user=d.user;await renderPanel();}else showLogin();}).catch(showLogin);
