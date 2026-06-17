/* ── Scroll-wheel fix ── */
document.addEventListener('wheel', () => {
  if (document.activeElement && ['number','text'].includes(document.activeElement.type))
    document.activeElement.blur();
}, { passive: true });

/* ── CONFIG ── */
const BASE        = 'https://gym-pro-mvyv.onrender.com/api';
const API         = `${BASE}/members`;
const TAPI        = `${BASE}/trainers`;
const PROFILE_API = `${BASE}/auth/profile`;

const DEFAULT_PLANS = [
  {name:'1 Month Strength',price:1000,months:1},
  {name:'1 Month Strength + Cardio',price:1500,months:1},
  {name:'3 Months Strength',price:2700,months:3},
  {name:'3 Months Strength + Cardio',price:4000,months:3},
  {name:'6 Months Strength',price:5000,months:6},
  {name:'6 Months Strength + Cardio',price:7500,months:6},
  {name:'1 Year Strength',price:9000,months:12},
  {name:'1 Year Strength + Cardio',price:14000,months:12}
];

/* ── In-memory state ── */
let gymPlans   = [...DEFAULT_PLANS];
let gymDisc    = [];
let gymCfg     = {}; 
let trainerMap = {}; 

let curPayMember = null;
let curPayMethod = null;
let curPayTotal  = 0;
let curStream    = null;

/* ── AUTH HELPERS ── */
const hdrs = () => ({ 'Content-Type':'application/json', 'Authorization':`Bearer ${localStorage.getItem('token')}` });
const checkAuth = () => { if (!localStorage.getItem('token')) { location.href='/login.html'; return false; } return true; };
function logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); location.href='/login.html'; }



/* ── PROFILE SYNC ── */
async function loadServerProfile() {
  try {
    const res = await fetch(`${BASE}/auth/me`, { headers: hdrs() });
    if (!res.ok) return;
    const user = await res.json();
    if (user.gymData && user.gymData !== '{}') {
      const d = typeof user.gymData === 'string' ? JSON.parse(user.gymData) : user.gymData;
      if (d.plans && d.plans.length) gymPlans = d.plans;
      if (d.cfg)  gymCfg  = d.cfg;
      if (d.disc) gymDisc = d.disc;
    }
    localStorage.setItem('gymProfile_cache', JSON.stringify({ plans: gymPlans, cfg: gymCfg, disc: gymDisc }));
    
    // Refresh UI elements after data loads
    populatePlanSelect();
    populatePlanSelect('ePlan');
    populatePlanSelect('payPlan');
    if (document.getElementById('page-plans')?.classList.contains('active')) loadPlans();
    if (document.getElementById('page-discounts')?.classList.contains('active')) renderDiscounts();
    if (document.getElementById('page-settings')?.classList.contains('active')) loadSettings();
  } catch(e) {
    const cached = localStorage.getItem('gymProfile_cache');
    if (cached) {
      try {
        const d = JSON.parse(cached);
        if (d.plans && d.plans.length) gymPlans = d.plans;
        if (d.cfg)  gymCfg  = d.cfg;
        if (d.disc) gymDisc = d.disc;
        populatePlanSelect();
        populatePlanSelect('ePlan');
        if (document.getElementById('page-plans')?.classList.contains('active')) loadPlans();
        if (document.getElementById('page-discounts')?.classList.contains('active')) renderDiscounts();
      } catch(_) {}
    }
  }
}

async function saveServerProfile() {
  const body = { gymData: JSON.stringify({ plans: gymPlans, cfg: gymCfg, disc: gymDisc }) };
  try {
    const res = await fetch(PROFILE_API, { method:'PATCH', headers: hdrs(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('save failed');
    localStorage.setItem('gymProfile_cache', JSON.stringify({ plans: gymPlans, cfg: gymCfg, disc: gymDisc }));
  } catch(e) {
    localStorage.setItem('gymProfile_cache', JSON.stringify({ plans: gymPlans, cfg: gymCfg, disc: gymDisc }));
  }
}

/* ── PLAN HELPERS ── */
const getPlanPrice  = n => (gymPlans.find(p=>p.name===n)||{}).price  || 0;
const getPlanMonths = n => (gymPlans.find(p=>p.name===n)||{}).months || 1;

/* ── TOAST & UTILS ── */
function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 3200);
}

const esc  = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// TIMEZONE FIX: Strictly parses YYYY-MM-DD as local date
const fmt = d => {
  if(!d) return '—';
  const p = d.split('T')[0].split('-');
  if(p.length===3) return new Date(p[0], p[1]-1, p[2]).toLocaleDateString('en-IN');
  return new Date(d).toLocaleDateString('en-IN');
};

const avClr = n => ['#5B4CFF','#0EA669','#E53E3E','#D97706','#0369A1','#7C3AED'][(n.charCodeAt(0)||0)%6];

function av(name) {
  const i = (name||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
  const bg = avClr(name);
  return `<div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,${bg},${bg}CC);display:inline-flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.13)">${esc(i)}</div>`;
}
function avImg(m) {
  if (m.photo?.startsWith('data:image')) return `<img src="${m.photo}" alt="${esc(m.name)}" style="width:52px;height:52px;border-radius:14px;object-fit:cover;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.13)">`;
  return av(m.name);
}
function badge(status) {
  const m = {Active:'b-active',Trial:'b-trial',Inactive:'b-inactive',Expired:'b-expired'};
  return `<span class="badge ${m[status]||'b-inactive'}">${esc(status)}</span>`;
}
function gBadge(g) {
  if (!g) return '<span style="font-size:.72rem;color:var(--tx3)">—</span>';
  const m = {Male:'b-male',Female:'b-female',Other:'b-other'};
  return `<span class="badge ${m[g]||'b-other'}">${esc(g)}</span>`;
}

// TIMEZONE FIX: Local Math
function expCell(expiryDate, status) {
  if (!expiryDate) return '—';
  const p = expiryDate.split('T')[0].split('-');
  const expDate = new Date(p[0], p[1]-1, p[2]);
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const days = Math.ceil((expDate - today) / 86400000);
  
  if (status !== 'Active' && status !== 'Trial') return `<span class="exp-txt g">${fmt(expiryDate)}</span>`;
  if (days <= 3) return `<div class="exp-cell"><div class="exp-dot r"></div><div><div class="exp-txt r">${fmt(expiryDate)}</div><div class="exp-txt r">${days<0?'Expired':days+'d left'}</div></div></div>`;
  if (days <= 5) return `<div class="exp-cell"><div class="exp-dot y"></div><div><div class="exp-txt y">${fmt(expiryDate)}</div><div class="exp-txt y">${days}d left</div></div></div>`;
  return `<div class="exp-cell"><div class="exp-dot g"></div><span class="exp-txt g">${fmt(expiryDate)}</span></div>`;
}

function sortByExpiry(members) {
  return [...members].sort((a,b) => {
    const aA = a.status==='Active'||a.status==='Trial';
    const bA = b.status==='Active'||b.status==='Trial';
    if (aA && !bA) return -1;
    if (!aA && bA) return 1;
    return new Date(a.expiryDate) - new Date(b.expiryDate);
  });
}

/* ═══════════════════════════════════════════════════════
   ANDROID WEBVIEW — External App Launchers
   window.open() fails in WebView for tel: whatsapp: etc.
   Must use location.href OR Android Intent URLs
   ═══════════════════════════════════════════════════════ */

function dialPhone(phone) {
  // In Android WebView: location.href triggers shouldOverrideUrlLoading
  // In browser: window.location.href also works for tel: links
  window.location.href = 'tel:' + String(phone).replace(/[^0-9+]/g,'');
}

function openWhatsApp(phone) {
  const clean = String(phone).replace(/[^0-9]/g, '');
  const num   = clean.startsWith('91') ? clean : '91' + clean;
  const url   = 'https://wa.me/' + num;
  // In Android WebView: use location.href (MainActivity intercepts it)
  // In browser: use window.open (opens WhatsApp web in new tab)
  const isAndroidWebView = /wv/.test(navigator.userAgent) ||
    (/Android/i.test(navigator.userAgent) && /Version\//.test(navigator.userAgent));
  if (isAndroidWebView) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

/* ── SIDEBAR & NAV ── */
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('overlay');
  const isOpen = sb.classList.contains('open');
  if (isOpen) {
    sb.classList.remove('open');
    ov.classList.remove('show');
        } else {
    sb.classList.add('open');
    ov.classList.add('show');
        }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}
function updateBNav(id) {
  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  if (id !== 'none') document.getElementById(`bn-${id}`)?.classList.add('active');
}

/* ── FIX: Add missing loadSubscriptionPage function ── */
function loadSubscriptionPage() {
  // Subscription page not implemented in UI, just redirect or show message
  console.log('Subscription page not implemented');
  toast('Subscription features coming soon', 'info');
}

function showPage(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(l => l.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  if (btn) btn.classList.add('active');
  const titles = {dashboard:'Dashboard',members:'Members',attendance:'Attendance',trainers:'Trainers',plans:'Plans',discounts:'Discounts',payments:'Payments',settings:'Settings',subscription:'Subscription'};
  document.getElementById('pageTitle').textContent = titles[page] || page;
  closeSidebar();
  const loaders = {dashboard:loadDashboard,members:loadAllMembers,attendance:loadAttendance,trainers:loadTrainers,plans:loadPlans,discounts:renderDiscounts,payments:loadPayments,settings:loadSettings,subscription:loadSubscriptionPage};
  if (loaders[page]) loaders[page]();
}

/* ── MODALS ── */
function getLocalTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ═══════════════════════════════════════════════════════
   MODAL SYSTEM — Android WebView fixes
   • Sets mbox height via window.innerHeight (not vh)
   • Locks body scroll when modal open
   • Prevents touch passthrough
   ═══════════════════════════════════════════════════════ */

function _setModalHeight(modalEl) {
  const mbox = modalEl.querySelector('.mbox');
  if (!mbox) return;
  // Use window.innerHeight (correct in Android WebView; 100vh is wrong)
  const vh = window.innerHeight;
  const maxH = Math.floor(vh * 0.91); // 91% of real viewport
  mbox.style.maxHeight = maxH + 'px';
  mbox.style.height    = 'auto';
}

const openModal = id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  _setModalHeight(el);


  if (id === 'addMemberModal') {
    const startInput = document.getElementById('mStart');
    if (startInput) { startInput.value = getLocalTodayStr(); onPlanChange(); }
  }

  // Scroll mbox to top on open
  const mbox = el.querySelector('.mbox');
  if (mbox) mbox.scrollTop = 0;
};

const closeModal = id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
};

// Re-calc on resize/orientation change
window.addEventListener('resize', () => {
  document.querySelectorAll('.modal.open').forEach(m => _setModalHeight(m));
});

// Close when tapping dark backdrop (not the mbox)
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    closeModal(e.target.id);
    if (e.target.id === 'cameraModal' && curStream) curStream.getTracks().forEach(t => t.stop());
  }
});

/* ── CAMERA ── */
function setupCamera() {
  const vid  = document.getElementById('camVideo'),
        can  = document.getElementById('camCanvas'),
        prev = document.getElementById('photoPreview'),
        pd   = document.getElementById('photoData'),
        clr  = document.getElementById('clearPhotoBtn');

  document.getElementById('openCamBtn').onclick = async () => {
    const camInput = document.getElementById('photoFile');
    camInput.setAttribute('capture', 'environment');
    camInput.setAttribute('accept', 'image/*');

    // Save the currently open modal ID before camera launches
    const openModalEl = document.querySelector('.modal.open');
    window._presCamModalId = openModalEl ? openModalEl.id : null;

    // Always use file input on Android (getUserMedia blocked in WebView)
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camInput.click();
      return;
    }
    try {
      curStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      vid.srcObject = curStream;
      openModal('cameraModal');
    } catch(e) {
      camInput.click();
    }
  };
  document.getElementById('captureBtn').onclick = () => {
    can.width = vid.videoWidth; can.height = vid.videoHeight;
    can.getContext('2d').drawImage(vid,0,0);
    const d = can.toDataURL('image/jpeg',.75);
    prev.src = d; pd.value = d; clr.style.display = 'inline-flex';
    closeModal('cameraModal');
    if (curStream) curStream.getTracks().forEach(t => t.stop());
  };
  document.getElementById('closeCamBtn').onclick = () => {
    closeModal('cameraModal');
    if (curStream) curStream.getTracks().forEach(t => t.stop());
  };
  document.getElementById('uploadBtn').onclick = () => document.getElementById('photoFile').click();
  document.getElementById('photoFile').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    prev.style.opacity = '0.5';
    const r = new FileReader();
    r.onload = ev => {
      const result = ev.target.result;
      if (!result) { prev.style.opacity='1'; return; }
      prev.src     = result;
      prev.style.opacity = '1';
      pd.value     = result;
      clr.style.display = 'inline-flex';
      // Restore the modal that was open before camera launched
      const modalId = window._presCamModalId ||
        (document.getElementById('editMemberModal') ? 'editMemberModal' : 'addMemberModal');
      const modal = document.getElementById(modalId);
      if (modal && !modal.classList.contains('open')) {
        modal.classList.add('open');
        _setModalHeight(modal);
        // Scroll to top of modal so user sees the photo
        const mbox = modal.querySelector('.mbox');
        if (mbox) setTimeout(() => { mbox.scrollTop = 0; }, 50);
      }
      window._presCamModalId = null;
    };
    r.onerror = () => { prev.style.opacity = '1'; toast('Photo error — try Upload', 'error'); };
    r.readAsDataURL(f);
    // Reset so same photo can be re-selected
    setTimeout(() => { e.target.value = ''; }, 400);
  };
  clr.onclick = resetPhoto;
}

function resetPhoto() {
  document.getElementById('photoPreview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%235B4CFF33'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
  document.getElementById('photoData').value = '';
  document.getElementById('clearPhotoBtn').style.display = 'none';
  document.getElementById('photoFile').value = '';
}

/* ── EDIT MEMBER PHOTO BUTTONS ── */
function setupEditPhoto() {
  const ePrev = document.getElementById('ePhotoPreview');
  const ePD   = document.getElementById('ePhotoData');
  const eClr  = document.getElementById('eClearPhotoBtn');
  const eFile = document.getElementById('ePhotoFile');

  document.getElementById('eUploadBtn').onclick = () => eFile.click();
  document.getElementById('eOpenCamBtn').onclick = async () => {
    eFile.setAttribute('capture', 'environment');
    eFile.setAttribute('accept', 'image/*');
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      eFile.click(); return;
    }
    try {
      curStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      document.getElementById('camVideo').srcObject = curStream;
      window._editPhotoMode = true;
      openModal('cameraModal');
    } catch(e) { eFile.click(); }
  };
  eFile.onchange = ev => {
    const f = ev.target.files[0];
    if (!f) return;
    ePrev.style.opacity = '0.5';
    const r = new FileReader();
    r.onload = e2 => {
      const result = e2.target.result;
      if (!result) { ePrev.style.opacity='1'; return; }
      ePrev.src = result;
      ePrev.style.opacity = '1';
      ePD.value = result;
      eClr.style.display = 'inline-flex';
      const modal = document.getElementById('editMemberModal');
      if (modal && !modal.classList.contains('open')) {
        modal.classList.add('open'); _setModalHeight(modal);
      }
    };
    r.onerror = () => { ePrev.style.opacity='1'; toast('Photo error','error'); };
    r.readAsDataURL(f);
    setTimeout(() => { ev.target.value=''; }, 400);
  };
  eClr.onclick = () => {
    ePrev.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%231A8C8C22'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    ePD.value = ''; eClr.style.display = 'none'; eFile.value = '';
  };
}

/* ── SMART PLAN SELECT (Includes Global Discounts!) ── */
function populatePlanSelect(selId='mPlan') {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = gymPlans.map(p => {
    let discPrice = p.price;
    for(const d of gymDisc){
      if(!d.validUntil || new Date(d.validUntil) >= new Date()){
        if(d.appliesTo === 'all' || d.planName === p.name){
          if(d.type === 'percentage') discPrice -= (p.price * d.value / 100);
          else discPrice -= d.value;
          break;
        }
      }
    }
    discPrice = Math.max(0, Math.round(discPrice));
    const txt = discPrice < p.price ? `₹${discPrice} (Sale!)` : `₹${p.price}`;
    return `<option value="${esc(p.name)}" data-price="${discPrice}" data-months="${p.months}">${esc(p.name)} — ${txt}</option>`;
  }).join('');
  if (cur) sel.value = cur;
  
  const dp = document.getElementById('discPlan');
  if (dp) dp.innerHTML = gymPlans.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  if (selId==='mPlan') recalcPrice();
  if (selId==='ePlan') recalcEditPrice();
}

function togglePT(detailId) {
  const chk = detailId === 'mPtDetails' ? document.getElementById('mPtEnabled') : 
              detailId === 'ePtDetails' ? document.getElementById('ePtEnabled') : 
              document.getElementById('payPtEnabled');
  if(document.getElementById(detailId)) {
    document.getElementById(detailId).style.display = chk.checked ? 'block' : 'none';
  }
}

function recalcPrice() {
  const sel = document.getElementById('mPlan');
  if (!sel || !sel.options[sel.selectedIndex]) return;
  const orig  = parseInt(sel.options[sel.selectedIndex].getAttribute('data-price')) || 0;
  const dType = document.querySelector('input[name="dType"]:checked')?.value || 'none';
  const raw   = (document.getElementById('dValue')?.value || '').replace(/,/g,'').trim();
  const dVal  = raw==='' ? 0 : (parseFloat(raw)||0);
  let final = orig;
  if (dType==='percentage' && dVal>0) final = Math.round(orig - orig*Math.min(dVal,100)/100);
  else if (dType==='fixed' && dVal>0)  final = Math.max(0, Math.round(orig-dVal));
  document.getElementById('origPrice').textContent  = `₹${orig.toLocaleString('en-IN')}`;
  document.getElementById('finalPrice').textContent = `₹${final.toLocaleString('en-IN')}`;
}

function recalcEditPrice() {
  const sel = document.getElementById('ePlan');
  if (!sel || !sel.options[sel.selectedIndex]) return;
  const orig  = parseInt(sel.options[sel.selectedIndex].getAttribute('data-price')) || 0;
  const dType = document.querySelector('input[name="edType"]:checked')?.value || 'none';
  const raw   = (document.getElementById('edValue')?.value || '').replace(/,/g,'').trim();
  const dVal  = raw==='' ? 0 : (parseFloat(raw)||0);
  let final = orig;
  if (dType==='percentage' && dVal>0) final = Math.round(orig - orig*Math.min(dVal,100)/100);
  else if (dType==='fixed' && dVal>0)  final = Math.max(0, Math.round(orig-dVal));
  document.getElementById('eOrigPrice').textContent  = `₹${orig.toLocaleString('en-IN')}`;
  document.getElementById('eFinalPrice').textContent = `₹${final.toLocaleString('en-IN')}`;
}

// TIMEZONE FIX: Uses strictly local dates
function onPlanChange() {
  const sel = document.getElementById('mPlan');
  if (!sel || !sel.options[sel.selectedIndex]) return;
  const months = parseInt(sel.options[sel.selectedIndex].getAttribute('data-months'))||1;
  
  const startInput = document.getElementById('mStart');
  let sd = new Date();
  if (startInput && startInput.value) {
    const p = startInput.value.split('-');
    sd = new Date(p[0], p[1]-1, p[2]);
  } else if (startInput) {
    startInput.value = getLocalTodayStr();
  }

  sd.setMonth(sd.getMonth() + months);
  document.getElementById('mExpiry').value = sd.getFullYear() + '-' + String(sd.getMonth()+1).padStart(2,'0') + '-' + String(sd.getDate()).padStart(2,'0');
  
  recalcPrice();
}

function addCondition(containerId) {
  const c = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'cond-row';
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;align-items:center';
  row.innerHTML = `
    <select class="cType" style="flex:1;min-width:120px;background:var(--card);border:1.5px solid var(--border2);border-radius:var(--r3);color:var(--tx);font-family:'Plus Jakarta Sans',sans-serif;font-size:.82rem;padding:8px 10px;min-height:38px">
      <option value="">Condition</option><option>Diabetes</option><option>Asthma</option><option>High Blood Pressure</option><option>Heart Condition</option><option>Knee Injury</option><option>Other</option>
    </select>
    <select class="cSev" style="flex:1;min-width:90px;background:var(--card);border:1.5px solid var(--border2);border-radius:var(--r3);color:var(--tx);font-family:'Plus Jakarta Sans',sans-serif;font-size:.82rem;padding:8px 10px;min-height:38px">
      <option>Mild</option><option>Moderate</option><option>Severe</option>
    </select>
    <input type="text" class="cNote" placeholder="Notes" style="flex:2;min-width:100px;background:var(--card);border:1.5px solid var(--border2);border-radius:var(--r3);color:var(--tx);font-family:'Plus Jakarta Sans',sans-serif;font-size:.82rem;padding:8px 10px;min-height:38px">
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(row);
}

/* ── DASHBOARD FILTERS ── */
let dashMembersCache = [];

function renderDashTable(membersList) {
  const tbody = document.getElementById('dashBody');
  if (!membersList.length) {
    tbody.innerHTML = '<tr><td colspan="2"><div class="empty"><p>No members found in this timeframe.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = membersList.map(m => {
    let expLabel = '\u2014', expColor = '#8AABAB';
    if (m.expiryDate) {
      const p   = m.expiryDate.split('T')[0].split('-');
      const exp = new Date(+p[0], +p[1]-1, +p[2]);
      const today = new Date(); today.setHours(0,0,0,0);
      const days  = Math.ceil((exp - today) / 86400000);
      expLabel = exp.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
      expColor = days <= 0 ? '#E74C3C' : days <= 5 ? '#F39C12' : '#27AE60';
    }
    const stClr = {Active:'#27AE60',Trial:'#2980B9',Inactive:'#95A5A6',Expired:'#E74C3C'};
    const stBg  = {Active:'#E8F8EF',Trial:'#E3F2FD',Inactive:'#F3F4F6',Expired:'#FEECEB'};
    const sc = stClr[m.status] || '#95A5A6';
    const sb = stBg[m.status]  || '#F3F4F6';
    const gc = {Male:'#1565C0',Female:'#AD1457',Other:'#6A1B9A'};
    const gb = {Male:'#E3F2FD',Female:'#FCE4EC',Other:'#F3E5F5'};
    const genderPill = m.gender
      ? `<span style="background:${gb[m.gender]||'#F3F4F6'};color:${gc[m.gender]||'#555'};padding:2px 9px;border-radius:20px;font-size:.62rem;font-weight:800">${esc(m.gender)}</span>`
      : '';
    return `<tr onclick="openEditMember('${m._id}')" style="cursor:pointer;border-bottom:1px solid #F0F5F5">
      <td style="padding:12px 8px 12px 12px;vertical-align:middle">
        <div style="display:flex;align-items:center;gap:14px">
          ${_memberAvatar(m)}
          <div style="min-width:0;display:flex;flex-direction:column;justify-content:center">
            <div style="font-weight:800;font-size:.92rem;color:#1A2E2E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px">${esc(m.name)}</div>
            <div style="font-size:.72rem;color:#8AABAB;margin-top:2px">${esc(m.phone||'')}</div>
            <div style="margin-top:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
              ${genderPill}
              <span style="font-size:.68rem;color:#4A6464;font-weight:600">${esc(m.plan||'')}</span>
            </div>
          </div>
        </div>
       </td>
      <td style="padding:12px 12px 12px 6px;vertical-align:middle;text-align:right;white-space:nowrap">
        <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;margin-bottom:5px">
          <span style="width:8px;height:8px;border-radius:50%;background:${expColor};flex-shrink:0"></span>
          <span style="font-size:.78rem;font-weight:700;color:#1A2E2E">${expLabel}</span>
        </div>
        <span style="background:${sb};color:${sc};padding:3px 10px;border-radius:20px;font-size:.65rem;font-weight:800">${esc(m.status||'')}</span>
       </td>
     </tr>`;
  }).join('');
}

function filterDash(days) {
  if (days === 'all') {
    renderDashTable(dashMembersCache.slice(0, 8));
    return;
  }
  const today = new Date();
  today.setHours(0,0,0,0);
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + days);
  targetDate.setHours(23,59,59,999);

  const filtered = dashMembersCache.filter(m => {
    if (m.status !== 'Active' && m.status !== 'Trial') return false;
    // Timezone fix for filters
    const p = m.expiryDate.split('T')[0].split('-');
    const exp = new Date(p[0], p[1]-1, p[2]);
    return exp >= today && exp <= targetDate;
  });
  renderDashTable(filtered);
}

async function loadDashboard() {
  try {
    const res = await fetch(API, {headers:hdrs()});
    if (res.status===401) { logout(); return; }
    const members = await res.json();
    const sorted  = sortByExpiry(members);

    document.getElementById('statTotal').textContent  = members.length;
    document.getElementById('statActive').textContent = members.filter(m=>m.status==='Active').length;

    let monthly=0, admission=0, pt=0, online=0, offline=0;
    members.forEach(m => {
      // Accumulate ALL payments from paymentHistory (plan + admission + PT over time)
      const hist = m.paymentHistory || [];
      if (hist.length > 0) {
        // Sum all payment history entries for this member
        hist.forEach(p => {
          const amt = p.amount || 0;
          monthly += amt; // total collected
          if (p.method === 'cash') offline += amt;
          else if (p.method === 'upi' || p.method === 'card') online += amt;
        });
      } else {
        // Fallback for members with no paymentHistory yet (old records)
        monthly += (m.planPrice > 0 ? m.planPrice : getPlanPrice(m.plan));
        if (!m.admissionWaived) monthly += (m.admissionFee || 0);
        if (m.ptEnabled) monthly += (m.ptFee || 0);
      }
      // Admission always tracked separately
      if (!m.admissionWaived) admission += (m.admissionFee || 0);
      if (m.ptEnabled) pt += (m.ptFee || 0);
    });
    // Monthly = plan fees only (total - admission - pt) for display
    const planOnly = Math.max(0, monthly - admission - pt);
    const total = monthly;
    const fmtR  = v => v >= 1000 ? `₹${(v/1000).toFixed(1)}k` : `₹${v}`;
    document.getElementById('statRev').textContent  = fmtR(Math.round(total));
    document.getElementById('revM').textContent     = `₹${Math.round(planOnly).toLocaleString('en-IN')}`;
    document.getElementById('revA').textContent     = `₹${Math.round(admission).toLocaleString('en-IN')}`;
    document.getElementById('revPT').textContent    = `₹${Math.round(pt).toLocaleString('en-IN')}`;
    const revOnlineEl  = document.getElementById('revOnline');
    const revCashEl    = document.getElementById('revCash');
    if (revOnlineEl) revOnlineEl.textContent = fmtR(Math.round(online));
    if (revCashEl)   revCashEl.textContent   = fmtR(Math.round(offline));
    const today = new Date();
    today.setHours(0,0,0,0);
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);
    in7Days.setHours(23,59,59,999);

    const due = members.filter(m => {
      if(m.status !== 'Active') return false;
      const p = m.expiryDate.split('T')[0].split('-');
      const exp = new Date(p[0], p[1]-1, p[2]);
      return exp <= in7Days;
    });

    const banner = document.getElementById('alertBanner');
    if (!due.length) {
      banner.className = 'banner green';
      banner.innerHTML = '<div class="banner-text"><h3>✅ All Good!</h3><p>No payments due this week</p></div>';
    } else {
      banner.className = 'banner amber';
      banner.innerHTML = `<div class="banner-text"><h3>⚠️ ${due.length} Payment${due.length>1?'s':''} Due</h3><p>Expiring within 7 days</p></div>
        <button class="btn btn-ghost btn-sm" onclick="showPage('payments',document.querySelector('[data-page=payments]'));updateBNav('none')">View →</button>`;
    }

    dashMembersCache = sorted;
    renderDashTable(sorted.slice(0,8));
    
  } catch(e) { toast('Error loading dashboard','error'); }
}

/* ── ALL MEMBERS ── */

// Master cache for search/filter
let _allMembersCache = [];
let _memberStatusFilter = 'all';
let _memberSearchQuery  = '';

function _avColor(name) {
  const colors = ['#1A8C8C','#27AE60','#E74C3C','#F39C12','#8E44AD','#2980B9','#D35400','#16A085'];
  return colors[(name||'?').charCodeAt(0) % colors.length];
}

function _memberAvatar(m) {
  if (m.photo && m.photo.startsWith('data:image')) {
    return `<img src="${m.photo}" alt="${esc(m.name)}" style="width:90px;height:90px;border-radius:16px;object-fit:cover;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.18);flex-shrink:0">`;
  }
  const initials = (m.name||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
  const bg = _avColor(m.name);
  return `<div style="width:90px;height:90px;border-radius:16px;background:linear-gradient(135deg,${bg},${bg}CC);display:flex;align-items:center;justify-content:center;font-size:1.9rem;font-weight:800;color:#fff;flex-shrink:0;border:3px solid rgba(255,255,255,.4);box-shadow:0 4px 14px rgba(0,0,0,.18)">${esc(initials)}</div>`;
}

function _getDueAmount(m) {
  // planPrice = final price after discount; 0 if paid/waived
  return m.planPrice || 0;
}

function _renderMemberCard(m, idx) {
  const due      = _getDueAmount(m);
  const dueColor = due > 0 ? '#E74C3C' : '#27AE60';
  const dueText  = due > 0 ? `Due Amount: ₹${due.toLocaleString('en-IN')}` : 'Due Amount: 0';

  // Expiry
  let expiryStr = '—';
  if (m.expiryDate) {
    const p   = m.expiryDate.split('T')[0].split('-');
    const exp = new Date(+p[0], +p[1]-1, +p[2]);
    expiryStr = exp.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'});
  }

  // Status color strip
  const stClr = {Active:'#27AE60',Trial:'#2980B9',Inactive:'#95A5A6',Expired:'#E74C3C'};
  const stripColor = stClr[m.status] || '#95A5A6';

  const safeName  = esc(m.name);
  const safePhone = esc(m.phone || '—');
  const safePlan  = esc(m.plan  || '—');
  const safeId    = esc(m._id);

  return `
  <div class="member-card-item" style="
    background:#fff; border-radius:14px; margin-bottom:10px;
    box-shadow:0 2px 10px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.04);
    overflow:hidden; border-left:4px solid ${stripColor};
    animation:pageIn .2s ${idx*0.04}s both;
  ">
    <!-- TOP ROW: Avatar + Info + Delete -->
    <div style="display:flex;align-items:stretch;gap:12px;padding:12px 12px 8px;position:relative">
      ${_memberAvatar(m)}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center">
        <!-- Name + M ID row -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px">
          <div>
            <span style="font-size:.85rem;font-weight:800;color:#1A2E2E">Name: </span>
            <span style="font-size:.85rem;font-weight:700;color:#1A2E2E">${safeName}</span>
          </div>
          <span style="font-size:.7rem;font-weight:700;color:#1A8C8C;white-space:nowrap">M ID ${idx+1}</span>
        </div>
        <!-- Mobile -->
        <div style="font-size:.78rem;color:#4A6464;margin-bottom:3px">
          <span style="font-weight:600">Mobile: </span>+91 - ${safePhone}
        </div>
        <!-- Plan Expiry + Amount Paid + Payment Date -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
          <div style="font-size:.75rem;color:#4A6464">
            <span style="font-weight:600">Plan Expiry: </span>
            <span style="font-weight:700;color:#1A2E2E">${expiryStr}</span>
          </div>
          <div style="font-size:.75rem;font-weight:800;color:#27AE60">Paid: ₹${(m.planPrice||0).toLocaleString('en-IN')}</div>
        </div>
        <div style="font-size:.72rem;color:#8AABAB;margin-top:2px">
          <span style="font-weight:600">Payment Date: </span>
          <span style="font-weight:700;color:#4A6464">${m.lastPaymentDate ? new Date(m.lastPaymentDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</span>
        </div>
      </div>
      <!-- Delete button -->
      <button onclick="event.stopPropagation();delMember('${safeId}','${safeName.replace(/'/g,"\\'")}')"
        style="position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;background:#FEECEB;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.75rem;color:#E74C3C;flex-shrink:0">
        🗑
      </button>
    </div>

    <!-- ACTION BUTTONS ROW (green gradient like reference) -->
    <div style="
      display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;
      padding:6px 8px;border-top:1px solid #F0F5F5;
      background:linear-gradient(90deg,#E8F8EF 0%,#fff 70%);
      gap:0;
    ">
      <button onclick="openEditMember('${safeId}')"
        style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:54px;padding:5px 8px;border:none;background:transparent;cursor:pointer;border-right:1px solid #F0F5F5;flex-shrink:0">
        <span style="font-size:1rem">🪪</span>
        <span style="font-size:.52rem;font-weight:700;color:#8AABAB">ID Card</span>
      </button>
      <button onclick="dialPhone('${esc(m.phone)}')"
        style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:54px;padding:5px 8px;border:none;background:transparent;cursor:pointer;border-right:1px solid #F0F5F5;flex-shrink:0">
        <span style="font-size:1rem">📞</span>
        <span style="font-size:.52rem;font-weight:700;color:#8AABAB">Call</span>
      </button>
      <button onclick="openWhatsApp('${esc(m.phone)}')"
        style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:54px;padding:5px 8px;border:none;background:transparent;cursor:pointer;border-right:1px solid #F0F5F5;flex-shrink:0">
        <span style="font-size:1rem">💬</span>
        <span style="font-size:.52rem;font-weight:700;color:#8AABAB">Whatsapp</span>
      </button>
      <button onclick="openMemberAttendance('${safeId}','${safeName}')"
        style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:58px;padding:5px 8px;border:none;background:transparent;cursor:pointer;border-right:1px solid #F0F5F5;flex-shrink:0">
        <span style="font-size:1rem">📅</span>
        <span style="font-size:.52rem;font-weight:700;color:#8AABAB">Attendance</span>
      </button>
      <button onclick="openPaymentFor({id:'${safeId}',name:'${safeName}',plan:'${safePlan}',expiryDate:'${m.expiryDate||''}',planPrice:${m.planPrice||0},ptEnabled:${!!m.ptEnabled},ptFee:${m.ptFee||0}})"
        style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:62px;padding:5px 8px;border:none;background:transparent;cursor:pointer;border-right:1px solid #F0F5F5;flex-shrink:0">
        <span style="font-size:1rem">🔄</span>
        <span style="font-size:.52rem;font-weight:700;color:#8AABAB">Renew Plan</span>
      </button>
      <button onclick="openEditMember('${safeId}')"
        style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:48px;padding:5px 8px;border:none;background:transparent;cursor:pointer;flex-shrink:0">
        <span style="font-size:1rem">✏️</span>
        <span style="font-size:.52rem;font-weight:700;color:#8AABAB">Edit</span>
      </button>
    </div>
  </div>`;
}

function _applyMembersFilters() {
  let list = _allMembersCache;
  if (_memberStatusFilter !== 'all')
    list = list.filter(m => m.status === _memberStatusFilter);
  if (_memberSearchQuery)
    list = list.filter(m =>
      (m.name||'').toLowerCase().includes(_memberSearchQuery) ||
      (m.phone||'').includes(_memberSearchQuery)
    );
  const wrap = document.getElementById('membersListWrap');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">😞</div><p>No members found</p></div>';
    return;
  }
  wrap.innerHTML = list.map((m,i) => _renderMemberCard(m, i)).join('');
}

// Called from HTML filter chips
function setMembersFilter(status, btn) {
  _memberStatusFilter = status;
  document.querySelectorAll('.member-filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _applyMembersFilters();
}

// Called from search input
function searchMembers(q) {
  _memberSearchQuery = (q||'').toLowerCase().trim();
  _applyMembersFilters();
}

async function loadAllMembers() {
  const wrap = document.getElementById('membersListWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Loading members…</p></div>';
  try {
    const res = await fetch(API, {headers:hdrs()});
    if (res.status===401) { logout(); return; }
    const members = await res.json();
    _allMembersCache = sortByExpiry(members);
    _applyMembersFilters();
  } catch(e) {
    wrap.innerHTML = '<div class="empty"><p style="color:#E74C3C">Error loading members</p></div>';
  }
}

async function delMember(id, name) {
  if (!confirm(`Delete "${name}"? Cannot undo.`)) return;
  try {
    const res = await fetch(`${API}/${id}`, {method:'DELETE',headers:hdrs()});
    if (res.ok) { toast(`${name} deleted`,'success'); loadAllMembers(); loadDashboard(); }
    else toast('Error deleting','error');
  } catch(e) { toast('Network error','error'); }
}

async function confirmDeleteAll() {
  const v = prompt('Type DELETE ALL to confirm removing every member:');
  if (v !== 'DELETE ALL') return;
  try {
    const members = await fetch(API,{headers:hdrs()}).then(r=>r.json());
    for (const m of members) await fetch(`${API}/${m._id}`,{method:'DELETE',headers:hdrs()});
    toast('All members deleted'); loadAllMembers(); loadDashboard();
  } catch(e) { toast('Error','error'); }
}

/* ── EDIT MEMBER ── */
async function openEditMember(id) {
  try {
    let member;
    try {
      const r = await fetch(`${API}/${id}`, {headers:hdrs()});
      if (r.ok) member = await r.json();
    } catch(_) {}
    if (!member) {
      const all = await fetch(API,{headers:hdrs()}).then(r=>r.json());
      member = all.find(m=>m._id===id);
    }
    if (!member) { toast('Member not found','error'); return; }

    document.getElementById('editMemberId').value = id;
    document.getElementById('eName').value   = member.name   || '';
    document.getElementById('ePhone').value  = member.phone  || '';
    document.getElementById('eEmail').value  = member.email  || '';
    document.getElementById('eAge').value    = member.age    || '';
    document.getElementById('eGender').value = member.gender || '';
    document.getElementById('eStatus').value = member.status || 'Active';

    populatePlanSelect('ePlan');
    document.getElementById('ePlan').value   = member.plan || '';
    recalcEditPrice();

    const dType = member.discountType || 'none';
    document.querySelectorAll('input[name="edType"]').forEach(r => r.checked = r.value===dType);
    document.getElementById('edValue').value  = member.discountValue  || '';
    document.getElementById('edReason').value = member.discountReason || '';
    recalcEditPrice();

    document.getElementById('eExpiry').value = member.expiryDate ? member.expiryDate.split('T')[0] : '';
    document.getElementById('eAdmFee').value  = member.admissionFee || '';
    document.getElementById('eWaive').value   = member.admissionWaived ? 'yes' : 'no';

    const ptEn = !!member.ptEnabled;
    document.getElementById('ePtEnabled').checked      = ptEn;
    document.getElementById('ePtDetails').style.display = ptEn ? 'block' : 'none';
    document.getElementById('ePtFee').value  = member.ptFee   || '';
    document.getElementById('ePtNotes').value= member.ptNotes || '';

    const ePtSel = document.getElementById('ePtTrainer');
    ePtSel.innerHTML = '<option value="">Select Trainer</option>' +
      Object.entries(trainerMap).map(([tid,tname]) => `<option value="${esc(tid)}">${esc(tname)}</option>`).join('');
    ePtSel.value = member.ptTrainer || '';

    document.getElementById('eEcName').value = member.emergencyContact?.name         || '';
    document.getElementById('eEcPhone').value= member.emergencyContact?.phone        || '';
    document.getElementById('eEcRel').value  = member.emergencyContact?.relationship || '';
    document.getElementById('eNotes').value = member.medicalNotes || '';

    // Populate edit photo preview
    const ePrev = document.getElementById('ePhotoPreview');
    const ePD   = document.getElementById('ePhotoData');
    const eClr  = document.getElementById('eClearPhotoBtn');
    if (member.photo && member.photo.startsWith('data:image')) {
      ePrev.src = member.photo;
      ePD.value = member.photo;
      eClr.style.display = 'inline-flex';
    } else {
      ePrev.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%231A8C8C22'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
      ePD.value = '';
      eClr.style.display = 'none';
    }

// Trigger the analytics in the background!
    renderMemberAttendanceStats(id);
    
    openModal('editMemberModal');
  } catch(e) { toast('Error loading member','error'); console.error(e); }
}

document.getElementById('editMemberForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id    = document.getElementById('editMemberId').value;
  const phone = document.getElementById('ePhone').value.trim();
  if (!/^\d{10}$/.test(phone)) { toast('Enter valid 10-digit phone','error'); return; }
  
  const sel       = document.getElementById('ePlan');
  const origPrice = parseInt(sel.options[sel.selectedIndex]?.getAttribute('data-price')) || getPlanPrice(sel.value);
  const dType     = document.querySelector('input[name="edType"]:checked')?.value || 'none';
  const rawDVal   = (document.getElementById('edValue').value||'').replace(/,/g,'').trim();
  const dVal      = rawDVal==='' ? 0 : (parseFloat(rawDVal)||0);
  let finalPrice  = origPrice;
  if (dType==='percentage' && dVal>0) finalPrice = Math.round(origPrice - origPrice*Math.min(dVal,100)/100);
  else if (dType==='fixed' && dVal>0)  finalPrice = Math.max(0, Math.round(origPrice-dVal));

  const admFee  = parseFloat(document.getElementById('eAdmFee').value||0) || 0;
  const admWaived = document.getElementById('eWaive').value==='yes';
  const ptEnabled = document.getElementById('ePtEnabled').checked;
  const ptFee   = parseFloat(document.getElementById('ePtFee').value||0) || 0;

  const data = {
    name:    document.getElementById('eName').value.trim(),
    phone,
    email:   document.getElementById('eEmail').value.trim(),
    age:     document.getElementById('eAge').value !== '' ? parseInt(document.getElementById('eAge').value,10) : null,
    gender:  document.getElementById('eGender').value,
    plan:    sel.value,
    planPrice:       finalPrice,
    discountType:    dType,
    discountValue:   dVal,
    discountReason:  document.getElementById('edReason').value.trim(),
    admissionFee:    admFee,
    admissionWaived: admWaived,
    ptEnabled,
    ptFee:     ptEnabled ? ptFee : 0,
    ptTrainer: ptEnabled ? document.getElementById('ePtTrainer').value : '',
    ptNotes:   ptEnabled ? document.getElementById('ePtNotes').value.trim() : '',
    expiryDate: document.getElementById('eExpiry').value, // Standard YYYY-MM-DD
    status:    document.getElementById('eStatus').value,
    emergencyContact: {
      name:         document.getElementById('eEcName').value.trim(),
      phone:        document.getElementById('eEcPhone').value.trim(),
      relationship: document.getElementById('eEcRel').value.trim()
    },
    medicalNotes: document.getElementById('eNotes').value.trim(),
    photo: document.getElementById('ePhotoData').value || ''
  };

  const btn = e.submitter; btn.disabled=true; btn.textContent='Saving…';
  try {
    const res = await fetch(`${API}/${id}`, {method:'PUT', headers:hdrs(), body:JSON.stringify(data)});
    if (res.ok) {
      closeModal('editMemberModal');
      toast(`${data.name} updated!`,'success');
      loadAllMembers(); loadDashboard();
    } else {
      const err = await res.json(); toast(err.error||'Could not update','error');
    }
  } catch(err) { toast('Network error','error'); }
  btn.disabled=false; btn.textContent='Save Changes';
});

/* ── ADD MEMBER SUBMIT ── */
document.getElementById('addMemberForm').addEventListener('submit', async e => {
  e.preventDefault();
  const phone=document.getElementById('mPhone').value.trim();
  if(!/^\d{10}$/.test(phone)){toast('Enter valid 10-digit phone','error');return;}
  const gender=document.getElementById('mGender').value;
  if(!gender){toast('Select gender','error');return;}

  const sel       = document.getElementById('mPlan');
  const origPrice = parseInt(sel.options[sel.selectedIndex].getAttribute('data-price'))||0;
  const dType     = document.querySelector('input[name="dType"]:checked')?.value||'none';
  const dVal      = parseFloat(document.getElementById('dValue').value)||0;
  let finalPrice  = origPrice;
  if(dType==='percentage'&&dVal>0) finalPrice=Math.round(origPrice-origPrice*Math.min(dVal,100)/100);
  else if(dType==='fixed'&&dVal>0) finalPrice=Math.max(0,Math.round(origPrice-dVal));

  const ageRaw = document.getElementById('mAge').value.trim();
  const age    = ageRaw!=='' ? parseInt(ageRaw,10) : null;
  const admFee    = parseFloat(document.getElementById('mAdmFee').value||0) || gymCfg.admissionFee || 0;
  const ptEnabled = document.getElementById('mPtEnabled').checked;
  const ptFee     = parseFloat(document.getElementById('mPtFee').value||0) || gymCfg.ptFee || 0;

  const conditions=[];
  document.querySelectorAll('#condContainer .cond-row').forEach(row=>{
    const cond=row.querySelector('.cType')?.value;
    if(cond) conditions.push({condition:cond,severity:row.querySelector('.cSev')?.value||'Mild',notes:row.querySelector('.cNote')?.value||''});
  });

  const data={
    name:    document.getElementById('mName').value.trim(),
    phone, email: document.getElementById('mEmail').value.trim(),
    age, gender,
    photo:   document.getElementById('photoData').value||'',
    plan:    sel.value,
    planPrice:       finalPrice,
    discountType:    dType,
    discountValue:   dVal,
    discountReason:  document.getElementById('dReason').value.trim(),
    admissionFee:    admFee,
    admissionWaived: document.getElementById('mWaive').value==='yes',
    ptEnabled,
    ptFee:     ptEnabled?ptFee:0,
    ptTrainer: ptEnabled?document.getElementById('mPtTrainer').value:'',
    ptNotes:   ptEnabled?document.getElementById('mPtNotes').value.trim():'',
    joinDate: document.getElementById('mStart').value, 
    expiryDate: document.getElementById('mExpiry').value,
    status:    document.getElementById('mStatus').value,
    emergencyContact:{name:document.getElementById('mEcName').value.trim(),phone:document.getElementById('mEcPhone').value.trim(),relationship:document.getElementById('mEcRel').value.trim()},
    healthConditions:conditions,
    medicalNotes: document.getElementById('mNotes').value.trim()
  };

  const btn=e.submitter; btn.disabled=true; btn.textContent='Adding…';
  try{
    const res=await fetch(API,{method:'POST',headers:hdrs(),body:JSON.stringify(data)});
    if(res.ok){
      const added=await res.json();
      closeModal('addMemberModal');
      e.target.reset();
      document.getElementById('condContainer').innerHTML='';
      document.getElementById('mPtEnabled').checked=false;
      document.getElementById('mPtDetails').style.display='none';
      resetPhoto(); 
      
      if(document.getElementById('mStart')) {
          document.getElementById('mStart').value = getLocalTodayStr();
      }
      onPlanChange();
      
      toast(`${added.name} added!`,'success');
      loadDashboard();
      loadAllMembers();

      // Open payment — if user cancels, member will be deleted
      openPaymentFor(added, true);
    }else{
      const err=await res.json(); toast(err.error||'Could not add member','error');
    }
  }catch(err){toast('Network error','error');}
  btn.disabled=false; btn.textContent='Add Member';
});

/* ══════════════════════════════════════════════════════
   ATTENDANCE — MongoDB primary, localStorage offline cache
   ══════════════════════════════════════════════════════ */

// In-memory attendance cache keyed by date: { date → { memberId → status } }
const _attCache = {};

function attKey(date) {
  try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return `att_${u._id||u.email||'x'}_${date}`; }
  catch(e) { return `att_${date}`; }
}

/* Fetch ALL attendance from MongoDB once per session and cache in memory */
let _attFetched = false;
let _attFetchPromise = null;

async function _ensureAttLoaded() {
  if (_attFetched) return;
  if (_attFetchPromise) return _attFetchPromise;
  _attFetchPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/attendance`, { headers: hdrs() });
      if (!res.ok) throw new Error('fetch failed');
      const all = await res.json();
      // Populate in-memory cache
      all.forEach(a => {
        const mid = typeof a.memberId === 'object' ? (a.memberId?._id || '') : (a.memberId || '');
        if (!mid || !a.date) return;
        if (!_attCache[a.date]) _attCache[a.date] = {};
        _attCache[a.date][mid] = a.status;
      });
      // Also write to localStorage for offline
      Object.keys(_attCache).forEach(d => {
        localStorage.setItem(attKey(d), JSON.stringify(_attCache[d]));
      });
      _attFetched = true;
    } catch(e) {
      // Offline: load from localStorage
      console.warn('Offline — loading attendance from localStorage');
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('att_')) {
          const datePart = k.split('_').pop(); // YYYY-MM-DD
          try {
            const obj = JSON.parse(localStorage.getItem(k) || '{}');
            if (datePart && datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
              _attCache[datePart] = obj;
            }
          } catch(_) {}
        }
      }
      _attFetched = true;
    }
    _attFetchPromise = null;
  })();
  return _attFetchPromise;
}

/* Invalidate cache so next load re-fetches */
function _invalidateAttCache() {
  _attFetched = false;
  _attFetchPromise = null;
}

async function loadAttendance() {
  const dateEl = document.getElementById('attDate');
  const date   = dateEl.value || getLocalTodayStr();
  dateEl.value = date;
  const tbody  = document.getElementById('attBody');
  tbody.innerHTML = '<tr><td colspan="2"><div class="empty"><div class="ei">⏳</div><p>Loading…</p></div><tr></tr>';

  try {
    // Step 1: Load members + attendance in parallel
    const [mRes] = await Promise.all([
      fetch(API, { headers: hdrs() }),
      _ensureAttLoaded()
    ]);
    if (mRes.status === 401) { logout(); return; }
    const members = await mRes.json();
    const active  = members.filter(m => m.status === 'Active' || m.status === 'Trial');

    // Step 2: Get today's attendance from in-memory cache
    const todayAtt = _attCache[date] || {};

    // Step 3: Render stats
    const pCount = Object.values(todayAtt).filter(s => s === 'Present').length;
    document.getElementById('attTotal').textContent   = active.length;
    document.getElementById('attPresent').textContent = pCount;
    document.getElementById('attPct').textContent     = active.length
      ? `${Math.min(100, Math.round(pCount / active.length * 100))}%` : '0%';

    if (!active.length) {
      tbody.innerHTML = '<tr><td colspan="2"><div class="empty"><p>No active members</p></div></td></tr>';
      return;
    }

    // Step 4: Render rows — 2-column mobile-optimised layout
    tbody.innerHTML = active.map(m => {
      const st  = todayAtt[m._id] || 'Absent';
      const isP = st === 'Present';
      return `<tr style="background:${isP ? '#F5FFFB' : '#fff'};border-bottom:1px solid #F0F5F5">
        <td style="padding:10px 6px 10px 12px;vertical-align:middle">
          <div style="display:flex;align-items:center;gap:12px">
            ${avImg(m)}
            <div style="min-width:0">
              <div style="font-weight:800;font-size:.9rem;color:#1A2E2E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</div>
              <div style="font-size:.72rem;color:#8AABAB;margin-top:1px">${esc(m.phone || '')}</div>
              <div style="font-size:.7rem;color:#4A6464;margin-top:2px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.plan || '')}</div>
            </div>
          </div>
         </td>
        <td style="padding:10px 12px 10px 4px;vertical-align:middle;text-align:right">
          <div id="ab-${m._id}" style="display:inline-block;padding:4px 11px;border-radius:20px;font-size:.72rem;font-weight:800;margin-bottom:6px;background:${isP?'#E8F8EF':'#FEECEB'};color:${isP?'#27AE60':'#E74C3C'}">${st}</div>
          <div style="display:flex;gap:5px;justify-content:flex-end">
            <button onclick="markAtt('${m._id}','${date}','Present')" style="padding:6px 12px;border-radius:20px;border:none;background:#E8F8EF;color:#27AE60;font-family:inherit;font-size:.78rem;font-weight:800;cursor:pointer;min-height:36px;-webkit-tap-highlight-color:transparent">✓ P</button>
            <button onclick="markAtt('${m._id}','${date}','Absent')"  style="padding:6px 12px;border-radius:20px;border:none;background:#FEECEB;color:#E74C3C;font-family:inherit;font-size:.78rem;font-weight:800;cursor:pointer;min-height:36px;-webkit-tap-highlight-color:transparent">✗ A</button>
          </div>
         </td>
       </tr>`;
    }).join('');

  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="2"><div class="empty"><p style="color:#E74C3C">Error loading. Check connection.</p></div></td></tr>';
    console.error('loadAttendance error:', e);
  }
}

/* ── MARK SINGLE ATTENDANCE — saves to MongoDB + cache ── */
async function markAtt(memberId, date, status) {
  // 1. Update UI instantly
  const badge = document.getElementById(`ab-${memberId}`);
  if (badge) {
    badge.textContent = status;
    badge.style.background = status === 'Present' ? '#E8F8EF' : '#FEECEB';
    badge.style.color       = status === 'Present' ? '#27AE60' : '#E74C3C';
    const row = badge.closest('tr');
    if (row) row.style.background = status === 'Present' ? '#F5FFFB' : '#fff';
  }

  // 2. Update in-memory cache
  if (!_attCache[date]) _attCache[date] = {};
  _attCache[date][memberId] = status;

  // 3. Write to localStorage for offline use
  localStorage.setItem(attKey(date), JSON.stringify(_attCache[date]));

  // 4. Update counters from cache
  const activeTotal = parseInt(document.getElementById('attTotal').textContent) || 0;
  const present = Object.values(_attCache[date]).filter(s => s === 'Present').length;
  document.getElementById('attPresent').textContent = present;
  document.getElementById('attPct').textContent = activeTotal
    ? `${Math.min(100, Math.round(present / activeTotal * 100))}%` : '0%';

  // 5. Persist to MongoDB
  try {
    const res = await fetch(`${BASE}/attendance`, {
      method: 'POST',
      headers: hdrs(),
      body: JSON.stringify({ memberId, date, status })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'DB save failed');
    }
  } catch (err) {
    console.error('Attendance DB Error:', err.message);
    // Keep UI green — data is in cache, will retry on reload
    toast('⚠️ Saved locally — sync pending', 'error');
  }
}

/* ── MARK ALL PRESENT ── */
async function markAllPresent() {
  const date = document.getElementById('attDate').value || getLocalTodayStr();
  if (!confirm(`Mark ALL active members Present for ${fmt(date)}?`)) return;
  try {
    const members = await fetch(API, { headers: hdrs() }).then(r => r.json());
    const active  = members.filter(m => m.status === 'Active' || m.status === 'Trial');
    // Sequential to avoid rate-limiting
    for (const m of active) {
      await markAtt(m._id, date, 'Present');
    }
    toast(`✅ ${active.length} members marked Present`, 'success');
    loadAttendance();
  } catch(e) { toast('Error marking attendance', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   MEMBER ATTENDANCE MODAL — opens from member card "Attendance" button
   Shows full calendar + monthly analysis for that specific member
   ═══════════════════════════════════════════════════════════ */
async function openMemberAttendance(memberId, memberName) {
  // Set modal title
  document.getElementById('memberAttTitle').textContent = '📅 ' + memberName;
  document.getElementById('memberAttSubtitle').textContent = 'Attendance Records & Analysis';
  openModal('memberAttModal');

  const calWrap  = document.getElementById('memberAttCal');
  const statWrap = document.getElementById('memberAttStat');
  calWrap.innerHTML  = '<div style="text-align:center;padding:20px;color:#8AABAB;font-size:.84rem">⏳ Loading…</div>';
  statWrap.innerHTML = '';

  await _ensureAttLoaded();

  // ── Collect all dates this member was present/absent ──
  const records = {}; // date → status
  Object.keys(_attCache).forEach(date => {
    const dayData = _attCache[date];
    if (dayData && dayData[memberId]) {
      records[date] = dayData[memberId];
    }
  });

  const allDates = Object.keys(records).sort();
  const totalPresent = allDates.filter(d => records[d] === 'Present').length;
  const totalMarked  = allDates.length;

  // ── Build month groups for calendar view ──
  const months = {}; // 'YYYY-MM' → [dates]
  allDates.forEach(d => {
    const key = d.slice(0,7);
    if (!months[key]) months[key] = [];
    months[key].push(d);
  });

  // Filter to LAST 3 MONTHS only for clean analysis
  const today3 = new Date(); today3.setHours(0,0,0,0);
  const threeMonthsAgo = new Date(today3);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoKey = threeMonthsAgo.getFullYear() + '-' + String(threeMonthsAgo.getMonth()+1).padStart(2,'0');

  const monthKeys = Object.keys(months)
    .filter(k => k >= threeMonthsAgoKey)
    .sort().reverse();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];
  const daysInMonth = (y,m) => new Date(y, m, 0).getDate();

  if (monthKeys.length === 0) {
    calWrap.innerHTML = `
      <div style="text-align:center;padding:28px 16px;background:#F0F5F5;border-radius:16px">
        <div style="font-size:2.5rem;margin-bottom:10px">📅</div>
        <div style="font-size:.92rem;font-weight:800;color:#4A6464">No records yet</div>
        <div style="font-size:.78rem;color:#8AABAB;margin-top:6px">Go to Attendance page → mark this member</div>
      </div>`;
    return;
  }

  // ── Summary banner ──
  const overallPct = totalMarked > 0 ? Math.round(totalPresent/totalMarked*100) : 0;
  const summClr = overallPct >= 70 ? '#27AE60' : overallPct >= 40 ? '#F39C12' : '#E74C3C';
  calWrap.innerHTML = `
    <div style="background:#1A8C8C;border-radius:16px;padding:16px;margin-bottom:16px;color:#fff;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:.7rem;opacity:.75;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Overall Attendance</div>
        <div style="font-size:1.8rem;font-weight:800;line-height:1">${totalPresent}<span style="font-size:.9rem;opacity:.7"> days</span></div>
        <div style="font-size:.75rem;opacity:.65;margin-top:4px">${monthKeys.length} month${monthKeys.length>1?'s':''} tracked</div>
      </div>
      <div style="text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;border:4px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;flex-direction:column;background:rgba(255,255,255,.12)">
          <div style="font-size:1.1rem;font-weight:800">${overallPct}%</div>
          <div style="font-size:.55rem;opacity:.7">RATE</div>
        </div>
      </div>
    </div>`;

  // ── Per-month calendar blocks ──
  let calHTML = calWrap.innerHTML;
  monthKeys.forEach(key => {
    const [y, m] = key.split('-');
    const label  = monthNames[parseInt(m)-1] + ' ' + y;
    const total  = daysInMonth(parseInt(y), parseInt(m));
    const presentDays = months[key].filter(d => records[d]==='Present').length;
    const absentDays  = months[key].filter(d => records[d]==='Absent').length;
    const isCurrent = key === todayStr.slice(0,7);
    const elapsed = isCurrent ? today.getDate() : total;
    const pct  = elapsed > 0 ? Math.round(presentDays/elapsed*100) : 0;
    const clr  = pct >= 70 ? '#27AE60' : pct >= 40 ? '#F39C12' : '#E74C3C';

    // Build mini calendar grid (7 cols = Mon–Sun)
    const firstDay = new Date(parseInt(y), parseInt(m)-1, 1).getDay(); // 0=Sun
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon-start

    let cells = '';
    // Day headers
    ['M','T','W','T','F','S','S'].forEach(d => {
      cells += `<div style="font-size:.58rem;font-weight:800;color:#8AABAB;text-align:center;padding:2px 0">${d}</div>`;
    });
    // Empty offset cells
    for (let i = 0; i < startOffset; i++) cells += '<div></div>';
    // Day cells
    for (let day = 1; day <= total; day++) {
      const dStr = y+'-'+m+'-'+String(day).padStart(2,'0');
      const st   = records[dStr];
      let bg = '#F0F5F5', clrD = '#C0C0C0';
      if (st === 'Present')  { bg = '#D4EDDA'; clrD = '#27AE60'; }
      else if (st === 'Absent') { bg = '#FEECEB'; clrD = '#E74C3C'; }
      const isToday = dStr === todayStr;
      cells += `<div style="aspect-ratio:1;border-radius:50%;background:${bg};
        display:flex;align-items:center;justify-content:center;
        font-size:.62rem;font-weight:${isToday?'800':'600'};color:${clrD};
        border:${isToday?'2px solid #1A8C8C':'1px solid transparent'};
        cursor:default">${day}</div>`;
    }

    calHTML += `
      <div style="background:#fff;border:1px solid #E0ECEC;border-radius:16px;padding:14px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <span style="font-size:.9rem;font-weight:800;color:#1A2E2E">${label}</span>
            ${isCurrent?'<span style="font-size:.65rem;background:#1A8C8C;color:#fff;padding:2px 7px;border-radius:10px;margin-left:6px">Current</span>':''}
          </div>
          <span style="font-size:.82rem;font-weight:800;color:${clr}">${pct}%</span>
        </div>
        <div style="height:6px;background:#E0ECEC;border-radius:10px;overflow:hidden;margin-bottom:10px">
          <div style="height:100%;width:${pct}%;background:${clr};border-radius:10px;transition:width .5s ease"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:10px">${cells}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span style="font-size:.7rem;font-weight:700;color:#27AE60;background:#E8F8EF;padding:3px 10px;border-radius:20px">✓ ${presentDays} Present</span>
          <span style="font-size:.7rem;font-weight:700;color:#E74C3C;background:#FEECEB;padding:3px 10px;border-radius:20px">✗ ${absentDays} Absent</span>
          <span style="font-size:.7rem;font-weight:700;color:#8AABAB;background:#F0F5F5;padding:3px 10px;border-radius:20px">○ ${total-presentDays-absentDays} Unmarked</span>
        </div>
      </div>`;
  });

  calWrap.innerHTML = calHTML;
}

/* ══════════════════════════════════════════════════════
   MEMBER ATTENDANCE ANALYTICS — uses in-memory _attCache
   Shows monthly bars + overall streak for performance
   ══════════════════════════════════════════════════════ */
async function renderMemberAttendanceStats(memberId) {
  const container = document.getElementById('eAttStats');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:16px;color:#8AABAB;font-size:.84rem;font-weight:600">⏳ Loading attendance data…</div>';

  try {
    // Ensure attendance is loaded from MongoDB
    await _ensureAttLoaded();

    // Build per-month counts from in-memory cache
    const monthlyStats = {}; // { 'YYYY-MM': count }
    let totalPresent = 0;

    Object.keys(_attCache).forEach(date => {
      const dayData = _attCache[date];
      if (!dayData) return;
      const status = dayData[memberId];
      if (status === 'Present') {
        const [y, m] = date.split('-');
        const key = `${y}-${m}`;
        monthlyStats[key] = (monthlyStats[key] || 0) + 1;
        totalPresent++;
      }
    });

    const today  = new Date();
    const curY   = today.getFullYear();
    const curM   = String(today.getMonth() + 1).padStart(2, '0');
    const curKey = `${curY}-${curM}`;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

    const keys = Object.keys(monthlyStats).sort().reverse();

    if (keys.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:20px;background:#F0F5F5;border-radius:14px">
          <div style="font-size:2rem;margin-bottom:8px">📅</div>
          <div style="font-size:.85rem;font-weight:700;color:#8AABAB">No attendance records yet</div>
          <div style="font-size:.75rem;color:#8AABAB;margin-top:4px">Mark them present in the Attendance page to track performance</div>
        </div>`;
      return;
    }

    // Summary card
    let html = `
      <div style="background:#1A8C8C;border-radius:14px;padding:14px 16px;margin-bottom:12px;color:#fff">
        <div style="font-size:.72rem;font-weight:700;opacity:.75;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Total Attendance</div>
        <div style="font-size:1.6rem;font-weight:800;line-height:1">${totalPresent} <span style="font-size:.85rem;opacity:.75">days present</span></div>
        <div style="font-size:.75rem;opacity:.65;margin-top:4px">Across ${keys.length} month${keys.length>1?'s':''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">`;

    keys.forEach(key => {
      const [y, m]    = key.split('-');
      const label     = `${monthNames[parseInt(m)-1]} ${y}`;
      const present   = monthlyStats[key];
      const isCurrent = key === curKey;

      if (isCurrent) {
        // Current month — show actual days, no percentage (month not over)
        const daysInCur = today.getDate(); // days elapsed
        const pct = daysInCur > 0 ? Math.round(present / daysInCur * 100) : 0;
        const clr = pct >= 70 ? '#27AE60' : pct >= 40 ? '#F39C12' : '#E74C3C';
        html += `
          <div style="background:#E8F7F7;border:1.5px solid #C8DEDE;border-radius:14px;padding:12px 14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:.85rem;font-weight:800;color:#1A8C8C">${label} <span style="font-size:.7rem;background:#1A8C8C;color:#fff;padding:2px 8px;border-radius:12px;margin-left:4px">Current</span></span>
              <span style="font-size:.82rem;font-weight:800;color:${clr}">${pct}%</span>
            </div>
            <div style="height:8px;background:#C8DEDE;border-radius:10px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${clr};border-radius:10px;transition:width .5s ease"></div>
            </div>
            <div style="font-size:.7rem;color:#4A6464;margin-top:6px;display:flex;justify-content:space-between">
              <span>${present} days present (of ${daysInCur} elapsed)</span>
              <span style="font-weight:700;color:${clr}">${pct>=70?'🟢 Great':pct>=40?'🟡 Average':'🔴 Needs Work'}</span>
            </div>
          </div>`;
      } else {
        // Past month — full percentage
        const total = daysInMonth(parseInt(y), parseInt(m));
        const pct   = Math.round(present / total * 100);
        const clr   = pct >= 70 ? '#27AE60' : pct >= 40 ? '#F39C12' : '#E74C3C';
        html += `
          <div style="background:#F0F5F5;border:1px solid #E0ECEC;border-radius:14px;padding:12px 14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:#4A6464">${label}</span>
              <span style="font-size:.82rem;font-weight:800;color:${clr}">${pct}%</span>
            </div>
            <div style="height:7px;background:#E0ECEC;border-radius:10px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${clr};border-radius:10px;transition:width .5s ease"></div>
            </div>
            <div style="font-size:.68rem;color:#8AABAB;margin-top:5px;display:flex;justify-content:space-between">
              <span>${present} of ${total} days</span>
              <span style="font-weight:700;color:${clr}">${pct>=70?'🟢 Great':pct>=40?'🟡 Average':'🔴 Needs Work'}</span>
            </div>
          </div>`;
      }
    });

    html += '</div>';
    container.innerHTML = html;

  } catch(e) {
    container.innerHTML = '<div style="text-align:center;padding:16px;color:#E74C3C;font-size:.84rem;font-weight:600">Failed to load stats. Check connection.</div>';
    console.error('renderMemberAttendanceStats error:', e);
  }
}
/* ══════════════════════════════════════════════
   TRAINERS — mobile card UI
   ══════════════════════════════════════════════ */
async function loadTrainers() {
  const wrap = document.getElementById('trainersListWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Loading trainers…</p></div>';
  try {
    // Add timeout so it doesn't hang forever on Render cold start
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15000); // 15s timeout
    const res = await fetch(TAPI, {headers:hdrs(), signal: controller.signal});
    clearTimeout(tid);
    if (res.status===401) { logout(); return; }
    const trainers = await res.json();
    trainerMap = {};
    trainers.forEach(t => { trainerMap[t._id] = t.name; });
    const opts = '<option value="">Select Trainer</option>' +
      trainers.filter(t=>t.status==='Active')
        .map(t=>`<option value="${esc(t._id)}">${esc(t.name)} — ${esc(t.specialty)}</option>`).join('');
    ['mPtTrainer','ePtTrainer','payPtTrainer'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = opts;
    });
    if (!trainers.length) {
      wrap.innerHTML = '<div class="empty"><div class="ei">💪</div><p>No trainers yet. Add your first trainer!</p></div>';
      return;
    }
    wrap.innerHTML = trainers.map((t, idx) => {
      const initials = (t.name||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
      const bg = ['#1A8C8C','#27AE60','#E74C3C','#F39C12','#8E44AD','#2980B9'][(t.name||'A').charCodeAt(0)%6];
      const isActive = t.status === 'Active';
      return `
      <div style="background:#fff;border-radius:16px;margin-bottom:10px;
        box-shadow:0 2px 10px rgba(0,0,0,.06);overflow:hidden;
        border-left:4px solid ${isActive?'#27AE60':'#95A5A6'};
        animation:pageIn .2s ${idx*0.05}s both">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 14px 10px">
          <div style="width:50px;height:50px;border-radius:50%;background:${bg};
            display:flex;align-items:center;justify-content:center;
            font-size:1.1rem;font-weight:800;color:#fff;flex-shrink:0">${esc(initials)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.9rem;font-weight:800;color:#1A2E2E;margin-bottom:2px">${esc(t.name)}</div>
            <div style="font-size:.75rem;color:#1A8C8C;font-weight:700;margin-bottom:3px">💪 ${esc(t.specialty)}</div>
            <div style="font-size:.72rem;color:#8AABAB">📱 ${esc(t.phone)}</div>
          </div>
          <span style="background:${isActive?'#E8F8EF':'#F3F4F6'};color:${isActive?'#27AE60':'#6B7280'};
            padding:3px 10px;border-radius:20px;font-size:.65rem;font-weight:800;flex-shrink:0">${esc(t.status)}</span>
        </div>
        <div style="display:flex;border-top:1px solid #F0F5F5;background:#F8FFFE">
          <button onclick="openEditTrainerModal('${esc(t._id)}')"
            style="flex:1;padding:10px;border:none;background:transparent;font-family:inherit;
              font-size:.78rem;font-weight:700;color:#1A8C8C;cursor:pointer;
              display:flex;align-items:center;justify-content:center;gap:5px;
              border-right:1px solid #F0F5F5;min-height:42px">✏️ Edit</button>
          <button onclick="dialPhone('${esc(t.phone)}')"
            style="flex:1;padding:10px;border:none;background:transparent;font-family:inherit;
              font-size:.78rem;font-weight:700;color:#27AE60;cursor:pointer;
              display:flex;align-items:center;justify-content:center;gap:5px;
              border-right:1px solid #F0F5F5;min-height:42px">📞 Call</button>
          <button onclick="delTrainer('${esc(t._id)}','${esc(t.name.replace(/'/g,"\'"))}')"
            style="flex:1;padding:10px;border:none;background:transparent;font-family:inherit;
              font-size:.78rem;font-weight:700;color:#E74C3C;cursor:pointer;
              display:flex;align-items:center;justify-content:center;gap:5px;min-height:42px">🗑 Delete</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    console.error('loadTrainers error:', e);
    wrap.innerHTML = `<div class="empty">
      <div class="ei">⚠️</div>
      <p style="color:#E74C3C;font-size:.82rem">Error loading trainers</p>
      <p style="color:#8AABAB;font-size:.72rem;margin-top:6px">${e.message||'Check connection'}</p>
      <button onclick="loadTrainers()" style="margin-top:12px;padding:10px 20px;background:#1A8C8C;
        color:#fff;border:none;border-radius:12px;font-family:inherit;font-size:.82rem;
        font-weight:700;cursor:pointer">🔄 Retry</button>
    </div>`;
  }
}

async function openEditTrainerModal(id) {
  try {
    const t = await fetch(`${TAPI}/${id}`,{headers:hdrs()}).then(r=>r.json());
    document.getElementById('etId').value        = id;
    document.getElementById('etName').value      = t.name;
    document.getElementById('etPhone').value     = t.phone;
    document.getElementById('etSpecialty').value = t.specialty;
    document.getElementById('etStatus').value    = t.status;
    openModal('editTrainerModal');
  } catch(e) { toast('Error loading trainer','error'); }
}

/* Edit trainer modal submit */
async function saveEditTrainer() {
  const id   = document.getElementById('etId').value;
  const name = document.getElementById('etName').value.trim();
  const phone= document.getElementById('etPhone').value.trim();
  const spec = document.getElementById('etSpecialty').value.trim();
  const stat = document.getElementById('etStatus').value;
  if (!name||!phone||!spec) { toast('Fill all fields','error'); return; }
  if (!/^\d{10}$/.test(phone)) { toast('Enter valid 10-digit phone','error'); return; }
  try {
    const res = await fetch(`${TAPI}/${id}`,{method:'PUT',headers:hdrs(),
      body:JSON.stringify({name,phone,specialty:spec,status:stat})});
    if (res.ok) { closeModal('editTrainerModal'); toast('Trainer updated ✅','success'); loadTrainers(); }
    else { const err=await res.json(); toast(err.error||'Update failed','error'); }
  } catch(e) { toast('Network error','error'); }
}

async function delTrainer(id,name) {
  if(!confirm(`Delete trainer "${name}"?`))return;
  try{
    const res=await fetch(`${TAPI}/${id}`,{method:'DELETE',headers:hdrs()});
    if(res.ok){toast('Deleted','success');loadTrainers();}else toast('Error','error');
  }catch(e){toast('Error','error');}
}

document.getElementById('addTrainerForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const phone=document.getElementById('tPhone').value.trim();
  if(!/^\d{10}$/.test(phone)){toast('Enter valid 10-digit phone','error');return;}
  const data={name:document.getElementById('tName').value.trim(),phone,specialty:document.getElementById('tSpecialty').value.trim(),status:document.getElementById('tStatus').value};
  const btn=e.submitter; btn.disabled=true; btn.textContent='Adding…';
  try{
    const res=await fetch(TAPI,{method:'POST',headers:hdrs(),body:JSON.stringify(data)});
    if(res.ok){closeModal('addTrainerModal');e.target.reset();toast('Trainer added!','success');loadTrainers();}
    else{const err=await res.json();toast(err.error||'Could not add trainer','error');}
  }catch(e){toast('Network error','error');}
  btn.disabled=false; btn.textContent='Add Trainer';
});

/* ══════════════════════════════════════════════
   PLANS — mobile card UI (full width rows)
   ══════════════════════════════════════════════ */
function loadPlans() {
  const wrap = document.getElementById('plansListWrap');
  if (!wrap) return;
  
  // Ensure we have plans (fallback to default if empty)
  if (!gymPlans.length) {
    gymPlans = [...DEFAULT_PLANS];
  }
  
  if (!gymPlans.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">💎</div><p>No plans yet. Add your first plan!</p></div>';
    return;
  }
  
  const plans = gymPlans.map(p => {
    let disc = p.price, discInfo = null;
    for (const d of gymDisc) {
      if (!d.validUntil || new Date(d.validUntil) >= new Date()) {
        if (d.appliesTo === 'all' || d.planName === p.name) {
          if (d.type === 'percentage') {
            disc = p.price - p.price * d.value / 100;
            discInfo = `${d.value}% OFF`;
          } else {
            disc = Math.max(0, p.price - d.value);
            discInfo = `₹${d.value} OFF`;
          }
          break;
        }
      }
    }
    return { ...p, disc: Math.round(disc), discInfo };
  });
  
  const durClr = m => m <= 1 ? '#1A8C8C' : m <= 3 ? '#27AE60' : m <= 6 ? '#F39C12' : '#8E44AD';
  
  wrap.innerHTML = plans.map((p, idx) => `
    <div style="background:#fff;border-radius:16px;margin-bottom:10px;
      box-shadow:0 2px 10px rgba(0,0,0,.06);overflow:hidden;
      border-left:4px solid ${durClr(p.months)};
      animation:pageIn .2s ${idx*0.05}s both">
      <div style="padding:14px 14px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:.88rem;font-weight:800;color:#1A2E2E;margin-bottom:5px;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="background:${durClr(p.months)}22;color:${durClr(p.months)};
              padding:3px 10px;border-radius:20px;font-size:.68rem;font-weight:800">
              ⏱ ${p.months} month${p.months>1?'s':''}
            </span>
            ${p.discInfo ? `<span style="background:#FEF9E7;color:#F39C12;
              padding:3px 10px;border-radius:20px;font-size:.68rem;font-weight:800">
              🏷️ ${p.discInfo}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${p.discInfo ? `<div style="font-size:.72rem;text-decoration:line-through;color:#8AABAB;font-weight:600">₹${p.price.toLocaleString('en-IN')}</div>` : ''}
          <div style="font-size:1.4rem;font-weight:800;color:${durClr(p.months)};line-height:1">
            ₹${p.disc.toLocaleString('en-IN')}
          </div>
          <div style="font-size:.6rem;color:#8AABAB;margin-top:2px">per plan</div>
        </div>
      </div>
      <div style="display:flex;border-top:1px solid #F0F5F5;background:#FAFFFE">
        <button onclick="selectPlan('${esc(p.name)}')"
          style="flex:1;padding:10px;border:none;background:transparent;
            font-family:inherit;font-size:.78rem;font-weight:700;color:#1A8C8C;
            cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;
            border-right:1px solid #F0F5F5;min-height:42px">
          ➕ Select
        </button>
        <button onclick="openEditPlan('${esc(p.name)}')"
          style="flex:1;padding:10px;border:none;background:transparent;
            font-family:inherit;font-size:.78rem;font-weight:700;color:#4A6464;
            cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;
            border-right:1px solid #F0F5F5;min-height:42px">
          ✏️ Edit
        </button>
        <button onclick="removePlan('${esc(p.name)}')"
          style="flex:1;padding:10px;border:none;background:transparent;
            font-family:inherit;font-size:.78rem;font-weight:700;color:#E74C3C;
            cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;
            min-height:42px">
          🗑 Remove
        </button>
      </div>
    </div>`).join('');
}

function selectPlan(name) {
  populatePlanSelect('mPlan');
  document.getElementById('mPlan').value = name;
  recalcPrice(); onPlanChange();
  openModal('addMemberModal');
}

function addGymPlan() {
  const name   = document.getElementById('newPlanName').value.trim();
  const price  = parseFloat(document.getElementById('newPlanPrice').value);
  const months = parseInt(document.getElementById('newPlanMonths').value);
  if(!name||!price||!months){toast('Fill all fields','error');return;}
  if(gymPlans.find(p=>p.name===name)){toast('Plan already exists','error');return;}
  gymPlans.push({name,price,months});
  saveServerProfile();
  closeModal('addPlanModal');
  ['newPlanName','newPlanPrice','newPlanMonths'].forEach(id=>document.getElementById(id).value='');
  populatePlanSelect(); loadPlans(); toast('Plan added!','success');
}

function openEditPlan(name) {
  const plan = gymPlans.find(p=>p.name===name);
  if (!plan) return;
  document.getElementById('editPlanOrigName').value = name;
  document.getElementById('editPlanName').value     = plan.name;
  document.getElementById('editPlanPrice').value    = plan.price;
  document.getElementById('editPlanMonths').value   = plan.months;
  openModal('editPlanModal');
}

function saveEditPlan() {
  const origName = document.getElementById('editPlanOrigName').value;
  const newName  = document.getElementById('editPlanName').value.trim();
  const price    = parseFloat(document.getElementById('editPlanPrice').value);
  const months   = parseInt(document.getElementById('editPlanMonths').value);
  if (!newName||!price||!months) { toast('Fill all fields','error'); return; }
  const idx = gymPlans.findIndex(p=>p.name===origName);
  if (newName!==origName && gymPlans.find(p=>p.name===newName)) { toast('Another plan with this name exists','error'); return; }
  gymPlans[idx] = {name:newName, price, months};
  saveServerProfile();
  closeModal('editPlanModal');
  populatePlanSelect(); loadPlans(); toast('Plan updated!','success');
}

function removePlan(name) {
  if(!confirm(`Remove plan "${name}"?`))return;
  gymPlans = gymPlans.filter(p=>p.name!==name);
  saveServerProfile(); populatePlanSelect(); loadPlans(); toast('Plan removed');
}

/* ══════════════════════════════════════════════
   DISCOUNTS — mobile card UI
   ══════════════════════════════════════════════ */
function renderDiscounts() {
  const wrap = document.getElementById('discTable');
  if (!wrap) return;
  
  if (!gymDisc.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">🏷️</div><p>No discounts yet. Add one!</p></div>';
    return;
  }
  
  wrap.innerHTML = gymDisc.map((d, i) => {
    const expired = d.validUntil && new Date(d.validUntil) < new Date();
    const valStr  = d.type === 'percentage' ? `${d.value}% OFF` : `₹${d.value.toLocaleString('en-IN')} OFF`;
    return `
    <div style="background:#fff;border-radius:16px;margin-bottom:10px;
      box-shadow:0 2px 10px rgba(0,0,0,.06);overflow:hidden;
      border-left:4px solid ${expired ? '#95A5A6' : '#F39C12'}">
      <div style="padding:14px;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:.88rem;font-weight:800;color:#1A2E2E;margin-bottom:5px">${esc(d.name)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span style="background:#FEF9E7;color:#F39C12;padding:3px 10px;
              border-radius:20px;font-size:.7rem;font-weight:800">${valStr}</span>
            <span style="background:#F0F5F5;color:#4A6464;padding:3px 10px;
              border-radius:20px;font-size:.68rem;font-weight:700">
              ${d.appliesTo === 'all' ? 'All Plans' : esc(d.planName || '')}
            </span>
            ${d.validUntil ? `<span style="background:${expired ? '#FEECEB' : '#E8F8EF'};color:${expired ? '#E74C3C' : '#27AE60'};
              padding:3px 10px;border-radius:20px;font-size:.68rem;font-weight:700">
              ${expired ? 'Expired' : 'Until'}: ${fmt(d.validUntil)}</span>` : ''}
          </div>
        </div>
        <button onclick="removeDiscount(${i})"
          style="width:36px;height:36px;border-radius:50%;background:#FEECEB;border:none;
            cursor:pointer;display:flex;align-items:center;justify-content:center;
            font-size:.85rem;color:#E74C3C;flex-shrink:0">
          🗑
        </button>
      </div>
    </div>`;
  }).join('');
}

function toggleDiscPlan() {
  document.getElementById('discPlanGroup').style.display=document.getElementById('discApplies').value==='specific'?'block':'none';
}

function addDiscount() {
  const name=document.getElementById('discName').value.trim();
  const val=parseFloat(document.getElementById('discVal').value);
  if(!name||!val||val<=0){toast('Fill all required fields','error');return;}
  const type=document.getElementById('discType').value;
  if(type==='percentage'&&val>100){toast('Percentage cannot exceed 100%','error');return;}
  const appliesTo=document.getElementById('discApplies').value;
  gymDisc.push({name,type,value:val,appliesTo,planName:appliesTo==='specific'?document.getElementById('discPlan').value:null,validUntil:document.getElementById('discExpiry').value||null});
  saveServerProfile();
  closeModal('addDiscountModal'); renderDiscounts(); toast('Discount added','success');
}

function removeDiscount(i) {
  if(!confirm('Remove this discount?'))return;
  gymDisc.splice(i,1); saveServerProfile(); renderDiscounts(); toast('Discount removed');
}

/* ── SMART PAYMENTS / RENEWALS ── */
async function loadPayments() {
  const container = document.getElementById('payList');
  try {
    const res = await fetch(API,{headers:hdrs()});
    if(res.status===401){logout();return;}
    const members = await res.json();
    const today   = new Date();
    today.setHours(0,0,0,0);
    
    const in14Days = new Date(today);
    in14Days.setDate(today.getDate() + 14);
    in14Days.setHours(23,59,59,999);

    const due = members.filter(m => {
      if(m.status !== 'Active') return false;
      const p = m.expiryDate.split('T')[0].split('-');
      const exp = new Date(p[0], p[1]-1, p[2]);
      return exp <= in14Days;
    });

    due.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    if(!due.length){container.innerHTML='<div class="empty"><div class="ei">✅</div><p>No payments due in 14 days!</p></div>';return;}
    container.innerHTML=due.map(m=>{
      const p = m.expiryDate.split('T')[0].split('-');
      const expDate = new Date(p[0], p[1]-1, p[2]);
      const d = Math.ceil((expDate - today)/86400000);
      return `<div class="pay-row">
        <div style="display:flex;align-items:center;gap:12px">${avImg(m)}<div><div style="font-weight:700;font-size:.85rem">${esc(m.name)}</div><div style="font-size:.72rem;color:var(--tx3)">${esc(m.plan)}</div><div style="font-size:.7rem;color:var(--tx3)">Exp: ${fmt(m.expiryDate)}</div></div></div>
        <span class="badge ${d<0?'b-inactive':'b-trial'}">${d<0?'Overdue':d+'d'}</span>
        <button class="btn btn-success btn-sm" onclick='openPaymentFor(${JSON.stringify(m).replace(/'/g,"&#39;")})'>Renew</button>
      </div>`;
    }).join('');
  }catch(e){container.innerHTML='<div class="empty"><p style="color:var(--gr)">Error</p></div>';}
}

function openPaymentFor(m, isNew = false) {
  curPayMember = {id: m._id || m.id, name: m.name, expiryDate: m.expiryDate, isNew: isNew, originalData: m};

  const mhdr = document.querySelector('#paymentModal .mhdr .mtitle');
  if(mhdr) mhdr.textContent = isNew ? '💳 Complete Payment' : '💳 Renew Plan';

  if (isNew) {
    document.getElementById('payPlan').parentElement.style.display = 'none';
    document.getElementById('payPtEnabled').closest('.pt-box').style.display = 'none';
    const payDatesRow = document.getElementById('payDatesRow');
    if (payDatesRow) payDatesRow.style.display = 'none';
  } else {
    document.getElementById('payPlan').parentElement.style.display = 'block';
    document.getElementById('payPtEnabled').closest('.pt-box').style.display = 'block';

    // Show & init renewal date fields
    const payDatesRow = document.getElementById('payDatesRow');
    if (payDatesRow) payDatesRow.style.display = 'block';
    const startEl  = document.getElementById('payStartDate');
    const expiryEl = document.getElementById('payExpiryDate');
    if (startEl)  startEl.value  = '';
    if (expiryEl) expiryEl.value = '';
    // Default payment date to today
    const payDateEl = document.getElementById('payPaymentDate');
    if (payDateEl) payDateEl.value = getLocalTodayStr();

    populatePlanSelect('payPlan');
    document.getElementById('payPlan').value = m.plan || gymPlans[0].name;

    const ptEn = !!m.ptEnabled;
    document.getElementById('payPtEnabled').checked = ptEn;
    document.getElementById('payPtDetails').style.display = ptEn ? 'block' : 'none';
    document.getElementById('payPtFee').value = m.ptFee || gymCfg.ptFee || 0;

    document.getElementById('payPtTrainer').innerHTML = document.getElementById('ePtTrainer').innerHTML || '<option value="">Select Trainer</option>';
    document.getElementById('payPtTrainer').value = m.ptTrainer || '';

    updateRenewalDates();
  }

  recalcPayment();

  // Reset payment method UI
  curPayMethod = null;
  ['Upi','Cash','Card'].forEach(m => {
    const btn = document.getElementById(`pm${m}`);
    if (!btn) return;
    btn.style.borderColor = '#E0ECEC';
    btn.style.background  = '#fff';
    btn.style.color       = '#4A6464';
  });
  ['payUpiPanel','payCashPanel','payCardPanel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const confirmBtn = document.getElementById('confirmPayBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '.5';
    confirmBtn.textContent = 'Select a payment method above';
  }

  openModal('paymentModal');
}

function updateRenewalDates() {
  const startEl  = document.getElementById('payStartDate');
  const expiryEl = document.getElementById('payExpiryDate');
  if (!startEl || !expiryEl) return;
  if (!startEl.value) {
    // Default start: today (or member's current expiry if future)
    const today = new Date();
    today.setHours(0,0,0,0);
    let startDefault = today;
    if (curPayMember && curPayMember.expiryDate) {
      const p = curPayMember.expiryDate.split('T')[0].split('-');
      const d = new Date(+p[0], +p[1]-1, +p[2]);
      if (d > today) startDefault = d;
    }
    startEl.value = startDefault.toISOString().split('T')[0];
  }
  updateRenewalExpiry();
}

function updateRenewalExpiry() {
  const startEl  = document.getElementById('payStartDate');
  const expiryEl = document.getElementById('payExpiryDate');
  if (!startEl || !expiryEl || !startEl.value) return;
  const planSel = document.getElementById('payPlan');
  const planName = planSel ? planSel.value : '';
  const months = getPlanMonths(planName);
  const p = startEl.value.split('-');
  const d = new Date(+p[0], +p[1]-1, +p[2]);
  d.setMonth(d.getMonth() + months);
  expiryEl.value = d.toISOString().split('T')[0];
}

function selectPayMethod(method) {
  curPayMethod = method;

  // Style active button
  ['upi','cash','card'].forEach(m => {
    const btn = document.getElementById(`pm${m.charAt(0).toUpperCase()+m.slice(1)}`);
    if (!btn) return;
    if (m === method) {
      btn.style.borderColor = '#1A8C8C';
      btn.style.background  = '#F0FAFA';
      btn.style.color       = '#1A8C8C';
    } else {
      btn.style.borderColor = '#E0ECEC';
      btn.style.background  = '#fff';
      btn.style.color       = '#4A6464';
    }
  });

  // Show/hide panels
  document.getElementById('payUpiPanel').style.display  = method === 'upi'  ? 'block' : 'none';
  document.getElementById('payCashPanel').style.display = method === 'cash' ? 'block' : 'none';
  document.getElementById('payCardPanel').style.display = method === 'card' ? 'block' : 'none';

  // Enable confirm button
  const btn = document.getElementById('confirmPayBtn');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
    const labels = { upi:'✅ Confirm UPI Payment', cash:'✅ Confirm Cash Received', card:'✅ Confirm Card Payment' };
    btn.textContent = labels[method] || '✅ Confirm Payment';
  }
}

function recalcPayment() {
  if(!curPayMember) return;
  const isNew = curPayMember.isNew;
  const m = curPayMember.originalData;
  
  let planName, planAmt, ptAmt, admAmt;
  
  if (isNew) {
    planName = m.plan;
    planAmt = m.planPrice; 
    ptAmt = m.ptEnabled ? (m.ptFee || 0) : 0;
    admAmt = m.admissionWaived ? 0 : (m.admissionFee || 0);
  } else {
    const planSel = document.getElementById('payPlan');
    planName = planSel.value;
    const origAmt = parseInt(planSel.options[planSel.selectedIndex]?.getAttribute('data-price')) || getPlanPrice(planName);
    // Apply renewal discount
    const rdType   = document.querySelector('input[name="payDType"]:checked')?.value || 'none';
    const rdRawVal = (document.getElementById('payDValue')?.value || '').replace(/,/g,'').trim();
    const rdVal    = rdRawVal === '' ? 0 : (parseFloat(rdRawVal) || 0);
    if (rdType === 'percentage' && rdVal > 0) planAmt = Math.round(origAmt - origAmt * Math.min(rdVal,100) / 100);
    else if (rdType === 'fixed' && rdVal > 0) planAmt = Math.max(0, Math.round(origAmt - rdVal));
    else planAmt = origAmt;
    const isPt = document.getElementById('payPtEnabled').checked;
    ptAmt = isPt ? (parseFloat(document.getElementById('payPtFee').value)||0) : 0;
    admAmt = 0;
  }

  const total = planAmt + ptAmt + admAmt;

  let rows = `
    <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2);font-size:.82rem">Member</span><strong style="font-size:.82rem">${esc(curPayMember.name)}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--tx2);font-size:.82rem">Plan Fee (${esc(planName)})</span><span style="font-size:.85rem;font-weight:700">₹${Math.round(planAmt).toLocaleString('en-IN')}</span></div>`;
  
  if(admAmt > 0) rows += `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--tx2);font-size:.82rem">🎟️ Admission</span><span style="font-size:.85rem;font-weight:700">₹${Math.round(admAmt).toLocaleString('en-IN')}</span></div>`;
  if(ptAmt > 0) rows += `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--tx2);font-size:.82rem">💪 PT Fee</span><span style="font-size:.85rem;font-weight:700">₹${Math.round(ptAmt).toLocaleString('en-IN')}</span></div>`;
  
  rows += `<div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1.5px solid var(--border);margin-top:6px"><span style="font-weight:800;font-size:.88rem">Total</span><strong style="color:var(--g);font-size:1.05rem">₹${total.toLocaleString('en-IN')}</strong></div>`;

  document.getElementById('payInfo').innerHTML = `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r3);padding:12px;margin-bottom:.6rem">${rows}</div>`;

  // Rebuild UPI QR whenever total changes
  const upiId = gymCfg.upiId || 'your-upi@bank';
  const upiName = gymCfg.upiName || 'GymPro';
  const dispUpi = document.getElementById('dispUpi');
  const payQR   = document.getElementById('payQR');
  if (dispUpi) dispUpi.textContent = upiId;
  if (payQR) {
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${total}&cu=INR`;
    payQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=158x158&data=${encodeURIComponent(upiUrl)}`;
  }

  // Store total for confirmPayment
  curPayTotal = total;
}

async function cancelPayment() {
  if (curPayMember && curPayMember.isNew) {
    // Member was saved to DB — delete them since payment was not completed
    const id   = curPayMember.id;
    const name = curPayMember.name;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE', headers: hdrs() });
      toast(`❌ Cancelled — ${name} not added`, 'error');
      loadAllMembers();
      loadDashboard();
    } catch(e) {
      toast('Could not remove member — please delete manually', 'error');
    }
  }
  curPayMember = null;
  curPayMethod = null;
  closeModal('paymentModal');
}

async function confirmPayment() {
  if (!curPayMember) return;
  if (!curPayMethod) { toast('Please select a payment method','error'); return; }

  const method = curPayMethod;
  const total  = curPayTotal || 0;

  if (curPayMember.isNew) {
    const payEntry = {
      amount: total,
      date: new Date(),
      method: method,
      receiptNo: 'REC-' + Date.now()
    };
    const btn = document.getElementById('confirmPayBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
    try {
      await fetch(`${API}/${curPayMember.id}`, {
        method: 'PUT', headers: hdrs(),
        body: JSON.stringify({
          paymentHistory: [payEntry],
          lastPaymentDate: new Date()
        })
      });
      const methodLabel = { upi:'📱 UPI', cash:'💵 Cash', card:'💳 Card' }[method] || method;
      toast(`✅ Member added — ${methodLabel} payment confirmed!`, 'success');
    } catch(e) {
      toast('Member added but payment record failed', 'error');
    }
    closeModal('paymentModal');
    curPayMember = null; curPayMethod = null;
    loadDashboard(); loadAllMembers();
    return;
  }

  // Renewal — read plan + discount
  const planName    = document.getElementById('payPlan').value;
  const planSel     = document.getElementById('payPlan');
  const origPlanAmt = parseInt(planSel.options[planSel.selectedIndex]?.getAttribute('data-price')) || getPlanPrice(planName);
  const isPt        = document.getElementById('payPtEnabled').checked;
  const ptAmt       = isPt ? (parseFloat(document.getElementById('payPtFee').value)||0) : 0;
  const ptTrainer   = isPt ? document.getElementById('payPtTrainer').value : '';

  // Renewal discount
  const rdType   = document.querySelector('input[name="payDType"]:checked')?.value || 'none';
  const rdRawVal = (document.getElementById('payDValue')?.value || '').replace(/,/g,'').trim();
  const rdVal    = rdRawVal === '' ? 0 : (parseFloat(rdRawVal) || 0);
  let planAmt = origPlanAmt;
  if (rdType === 'percentage' && rdVal > 0) planAmt = Math.round(origPlanAmt - origPlanAmt * Math.min(rdVal,100) / 100);
  else if (rdType === 'fixed' && rdVal > 0) planAmt = Math.max(0, Math.round(origPlanAmt - rdVal));

  // Use the date fields set by the user
  const expiryDateEl  = document.getElementById('payExpiryDate');
  const payDateEl     = document.getElementById('payRenewalPayDate');
  const chosenPayDate = payDateEl && payDateEl.value ? new Date(payDateEl.value) : new Date();

  const newExpiry = expiryDateEl && expiryDateEl.value ? expiryDateEl.value : (() => {
    let baseDate = new Date();
    baseDate.setHours(0,0,0,0);
    if (curPayMember.expiryDate) {
      const p = curPayMember.expiryDate.split('T')[0].split('-');
      const d = new Date(+p[0], +p[1]-1, +p[2]);
      if (d > new Date()) baseDate = d;
    }
    baseDate.setMonth(baseDate.getMonth() + getPlanMonths(planName));
    return baseDate.toISOString().split('T')[0];
  })();

  const payEntry = {
    amount:    planAmt + ptAmt,  // only plan + PT for renewal (no admission)
    date:      chosenPayDate,
    method:    method,
    receiptNo: 'REC-' + Date.now()
  };

  const btn = document.getElementById('confirmPayBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

  try {
    // PUT core renewal fields — never overwrite admissionFee/admissionWaived
    const res = await fetch(`${API}/${curPayMember.id}`, {
      method: 'PUT', headers: hdrs(),
      body: JSON.stringify({
        plan: planName, planPrice: planAmt,
        ptEnabled: isPt, ptFee: ptAmt, ptTrainer,
        expiryDate: newExpiry, status: 'Active',
        lastPaymentDate: chosenPayDate,
        discountType: rdType, discountValue: rdVal
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error || err.message || `Server error ${res.status}`);
    }

    // Append to paymentHistory
    try {
      const ctrl   = new AbortController();
      const tid    = setTimeout(()=>ctrl.abort(), 5000);
      const memRes = await fetch(`${API}/${curPayMember.id}`, { headers: hdrs(), signal: ctrl.signal });
      clearTimeout(tid);
      const mem    = memRes.ok ? await memRes.json() : {};
      const history = [...(mem.paymentHistory || []), payEntry];
      await fetch(`${API}/${curPayMember.id}`, {
        method: 'PUT', headers: hdrs(),
        body: JSON.stringify({ paymentHistory: history })
      });
    } catch(e2) { /* non-critical */ }

    const methodLabel   = { upi:'📱 UPI', cash:'💵 Cash', card:'💳 Card' }[method] || method;
    const expiryDisplay = new Date(newExpiry + 'T00:00:00').toLocaleDateString('en-IN');
    toast(`✅ ${methodLabel} — Renewed until ${expiryDisplay}`, 'success');
    closeModal('paymentModal');
    curPayMember = null; curPayMethod = null;
    loadDashboard(); loadPayments(); loadAllMembers();
  } catch(e) {
    toast(`❌ ${e.message || 'Network error — check connection'}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirm Payment'; }
  }
}

/* ── SETTINGS ── */
function loadSettings() {
  const upiIdEl = document.getElementById('sUpiId');
  const upiNameEl = document.getElementById('sUpiName');
  const admFeeEl = document.getElementById('sAdmFee');
  const ptFeeEl = document.getElementById('sPtFee');
  
  if (upiIdEl) upiIdEl.value = gymCfg.upiId || '';
  if (upiNameEl) upiNameEl.value = gymCfg.upiName || '';
  if (admFeeEl) admFeeEl.value = gymCfg.admissionFee != null ? gymCfg.admissionFee : '';
  if (ptFeeEl) ptFeeEl.value = gymCfg.ptFee != null ? gymCfg.ptFee : '';
}

async function saveSettings() {
  const upiId = document.getElementById('sUpiId')?.value.trim() || '';
  const upiName = document.getElementById('sUpiName')?.value.trim() || '';
  const admissionFee = parseFloat(document.getElementById('sAdmFee')?.value) || 0;
  const ptFee = parseFloat(document.getElementById('sPtFee')?.value) || 0;
  
  gymCfg.upiId = upiId;
  gymCfg.upiName = upiName;
  gymCfg.admissionFee = admissionFee;
  gymCfg.ptFee = ptFee;
  
  await saveServerProfile();
  toast('Settings saved & synced!', 'success');
}

/* ── INIT & OFFLINE LOGIC ── */
window.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) return;
  setupCamera();
  setupEditPhoto();

  // Attach instant input listeners for real-time calculation
  ['dValue', 'mPlan'].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).addEventListener('input', recalcPrice);
  });
  if(document.getElementById('mStart')) document.getElementById('mStart').addEventListener('input', onPlanChange);
  ['edValue', 'ePlan'].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).addEventListener('input', recalcEditPrice);
  });

  document.getElementById('topDate').textContent =
    new Date().toLocaleDateString('en-IN',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
  
  document.getElementById('attDate').value = getLocalTodayStr();
  
  if(document.getElementById('mStart')) {
    document.getElementById('mStart').value = getLocalTodayStr();
  }

  await loadServerProfile();

  if (gymCfg.admissionFee) document.getElementById('mAdmFee').value = gymCfg.admissionFee;

  try {
    const u = JSON.parse(localStorage.getItem('user')||'{}');
    if (u.name) document.getElementById('sbUser').innerHTML =
      `<div class="u-name">👤 ${esc(u.name)}</div><div class="u-role">${u.role==='admin'?'Administrator':'Staff Member'}</div>`;
  } catch(e){}

  // populatePlanSelect AFTER server profile loaded (gymPlans now has custom plans)
  populatePlanSelect();
  populatePlanSelect('ePlan');
  recalcPrice();
  loadDashboard();
  // If user lands directly on plans/discounts page (rare), refresh them
  loadPlans();

  // Warm up the Render server (free tier sleeps after 15 min)
  // Do a lightweight health-check ping first so Render wakes up
  fetch(`${BASE}/health`, {headers:hdrs()}).catch(()=>{});

  // Pre-load trainers into dropdowns (with timeout)
  (async () => {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 20000);
      const res  = await fetch(TAPI, {headers:hdrs(), signal:ctrl.signal});
      clearTimeout(tid);
      if (!res.ok) return;
      const trainers = await res.json();
      trainerMap = {};
      trainers.forEach(t => { trainerMap[t._id] = t.name; });
      const opts = '<option value="">Select Trainer</option>' +
        trainers.filter(t=>t.status==='Active')
          .map(t=>`<option value="${esc(t._id)}">${esc(t.name)} — ${esc(t.specialty)}</option>`).join('');
      ['mPtTrainer','ePtTrainer','payPtTrainer'].forEach(id=>{
        const el=document.getElementById(id); if(el) el.innerHTML=opts;
      });
    } catch(e) { console.log('Trainer pre-load:', e.message); }
  })();
  
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });
  }
});

// Offline Detection Listeners
window.addEventListener('online', () => {
  document.getElementById('offline-banner').style.display = 'none';
  loadDashboard();
  loadAllMembers();
});

window.addEventListener('offline', () => {
  document.getElementById('offline-banner').style.display = 'block';
});

if (!navigator.onLine) {
  document.getElementById('offline-banner').style.display = 'block';
}
