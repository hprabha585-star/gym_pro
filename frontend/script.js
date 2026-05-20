/* ── Scroll-wheel fix ── */
document.addEventListener('wheel', () => {
  if (document.activeElement && ['number','text'].includes(document.activeElement.type))
    document.activeElement.blur();
}, { passive: true });

/* ── CONFIG ── */
const BASE = 'https://gym-pro-mvyv.onrender.com/api';
const API  = `${BASE}/members`;
const TAPI = `${BASE}/trainers`;
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
    if (user.gymData) {
      const d = typeof user.gymData === 'string' ? JSON.parse(user.gymData) : user.gymData;
      if (d.plans && d.plans.length) gymPlans = d.plans;
      if (d.cfg)  gymCfg  = d.cfg;
      if (d.disc) gymDisc = d.disc;
    }
    localStorage.setItem('gymProfile_cache', JSON.stringify({ plans: gymPlans, cfg: gymCfg, disc: gymDisc }));
  } catch(e) {
    const cached = localStorage.getItem('gymProfile_cache');
    if (cached) {
      try {
        const d = JSON.parse(cached);
        if (d.plans && d.plans.length) gymPlans = d.plans;
        if (d.cfg)  gymCfg  = d.cfg;
        if (d.disc) gymDisc = d.disc;
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

const esc = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const fmt = d => {
  if(!d) return '—';
  const p = d.split('T')[0].split('-');
  if(p.length===3) return new Date(p[0], p[1]-1, p[2]).toLocaleDateString('en-IN');
  return new Date(d).toLocaleDateString('en-IN');
};

const avClr = n => ['#1A8C8C','#27AE60','#E74C3C','#F39C12','#3498DB','#7C3AED'][(n.charCodeAt(0)||0)%6];

function av(name) {
  const i = (name||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
  return `<div class="av" style="background:${avClr(name)}">${esc(i)}</div>`;
}
function avImg(m) {
  if (m.photo?.startsWith('data:image'))
    return `<img src="${m.photo}" alt="${esc(m.name)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0">`;
  return av(m.name);
}
function badge(status) {
  const map = {Active:'b-active',Trial:'b-trial',Inactive:'b-inactive',Expired:'b-expired'};
  return `<span class="badge ${map[status]||'b-inactive'}">${esc(status)}</span>`;
}
function gBadge(g) {
  if (!g) return '<span style="font-size:.72rem;color:var(--tx3)">—</span>';
  const map = {Male:'b-male',Female:'b-female',Other:'b-other'};
  return `<span class="badge ${map[g]||'b-other'}">${esc(g)}</span>`;
}

function expCell(expiryDate, status) {
  if (!expiryDate) return '—';
  const p = expiryDate.split('T')[0].split('-');
  const expDate = new Date(p[0], p[1]-1, p[2]);
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.ceil((expDate - today) / 86400000);
  if (status !== 'Active' && status !== 'Trial') return `<span class="exp-txt g">${fmt(expiryDate)}</span>`;
  if (days <= 3)  return `<div class="exp-cell"><div class="exp-dot r"></div><div><div class="exp-txt r">${fmt(expiryDate)}</div><div class="exp-txt r">${days<0?'Expired':days+'d left'}</div></div></div>`;
  if (days <= 5)  return `<div class="exp-cell"><div class="exp-dot y"></div><div><div class="exp-txt y">${fmt(expiryDate)}</div><div class="exp-txt y">${days}d left</div></div></div>`;
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

/* ── SIDEBAR & NAV ── */
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlay').classList.toggle('show'); }
function closeSidebar()  { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }
function updateBNav(id) {
  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  if (id !== 'none') document.getElementById(`bn-${id}`)?.classList.add('active');
}
function showPage(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(l => l.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  if (btn) btn.classList.add('active');
  const titles = {dashboard:'Dashboard',members:'Members',attendance:'Attendance',trainers:'Trainers',plans:'Plans',discounts:'Discounts',payments:'Payments',settings:'Settings'};
  document.getElementById('pageTitle').textContent = titles[page] || page;
  closeSidebar();
  const loaders = {dashboard:loadDashboard,members:loadAllMembers,attendance:loadAttendance,trainers:loadTrainers,plans:loadPlans,discounts:renderDiscounts,payments:loadPayments,settings:loadSettings};
  if (loaders[page]) loaders[page]();
}

/* ── MODALS ── */
function getLocalTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

const openModal = id => {
  document.getElementById(id).classList.add('open');
  if (id === 'addMemberModal') {
    const startInput = document.getElementById('mStart');
    if (startInput) { startInput.value = getLocalTodayStr(); onPlanChange(); }
  }
};
const closeModal = id => document.getElementById(id).classList.remove('open');

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
    try {
      curStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      vid.srcObject = curStream; openModal('cameraModal');
    } catch(e) { toast('Camera unavailable — use Upload','error'); }
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
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { prev.src = ev.target.result; pd.value = ev.target.result; clr.style.display = 'inline-flex'; };
    r.readAsDataURL(f);
  };
  clr.onclick = resetPhoto;
}

function resetPhoto() {
  document.getElementById('photoPreview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%231A8C8C22'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
  document.getElementById('photoData').value = '';
  document.getElementById('clearPhotoBtn').style.display = 'none';
  document.getElementById('photoFile').value = '';
}

/* ── PLAN SELECT ── */
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
  if(document.getElementById(detailId))
    document.getElementById(detailId).style.display = chk.checked ? 'block' : 'none';
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
    <select class="cType" style="flex:1;min-width:120px;background:var(--card);border:2px solid var(--border);border-radius:12px;color:var(--tx);font-family:'DM Sans',sans-serif;font-size:.82rem;padding:8px 10px;min-height:40px">
      <option value="">Condition</option><option>Diabetes</option><option>Asthma</option><option>High Blood Pressure</option><option>Heart Condition</option><option>Knee Injury</option><option>Other</option>
    </select>
    <select class="cSev" style="flex:1;min-width:90px;background:var(--card);border:2px solid var(--border);border-radius:12px;color:var(--tx);font-family:'DM Sans',sans-serif;font-size:.82rem;padding:8px 10px;min-height:40px">
      <option>Mild</option><option>Moderate</option><option>Severe</option>
    </select>
    <input type="text" class="cNote" placeholder="Notes" style="flex:2;min-width:100px;background:var(--card);border:2px solid var(--border);border-radius:12px;color:var(--tx);font-family:'DM Sans',sans-serif;font-size:.82rem;padding:8px 10px;min-height:40px">
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(row);
}

/* ── DASHBOARD ── */
let dashMembersCache = [];

function renderDashTable(membersList) {
  const tbody = document.getElementById('dashBody');
  if (!membersList.length) {
    tbody.innerHTML='<tr><td colspan="5"><div class="empty"><p>No members in this timeframe.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = membersList.map(m => `<tr onclick="openEditMember('${m._id}')" style="cursor:pointer">
    <td><div style="display:flex;align-items:center;gap:8px">${avImg(m)}<div><div style="font-weight:700;font-size:.82rem">${esc(m.name)}</div><div style="font-size:.7rem;color:var(--tx3)">${esc(m.phone)}</div></div></div></td>
    <td style="font-size:.75rem;color:var(--tx2)">${esc(m.plan)}</td>
    <td>${gBadge(m.gender)}</td>
    <td>${expCell(m.expiryDate,m.status)}</td>
    <td>${badge(m.status)}</td>
  </tr>`).join('');
}

function filterDash(days) {
  if (days === 'all') { renderDashTable(dashMembersCache.slice(0,8)); return; }
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(today); target.setDate(today.getDate() + days); target.setHours(23,59,59,999);
  const filtered = dashMembersCache.filter(m => {
    if (m.status !== 'Active' && m.status !== 'Trial') return false;
    const p = m.expiryDate.split('T')[0].split('-');
    const exp = new Date(p[0], p[1]-1, p[2]);
    return exp >= today && exp <= target;
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

    let monthly=0, admission=0, pt=0;
    members.forEach(m => {
      monthly   += (m.planPrice > 0 ? m.planPrice : getPlanPrice(m.plan));
      if (!m.admissionWaived) admission += (m.admissionFee||0);
      if (m.ptEnabled)        pt        += (m.ptFee||0);
    });
    const total = monthly + admission + pt;
    const fmtR  = v => v>=1000 ? `₹${(v/1000).toFixed(1)}k` : `₹${v}`;
    document.getElementById('statRev').textContent = fmtR(Math.round(total));
    document.getElementById('revM').textContent   = `₹${Math.round(monthly).toLocaleString('en-IN')}`;
    document.getElementById('revA').textContent   = `₹${Math.round(admission).toLocaleString('en-IN')}`;
    document.getElementById('revPT').textContent  = `₹${Math.round(pt).toLocaleString('en-IN')}`;

    const today = new Date(); today.setHours(0,0,0,0);
    const in7   = new Date(today); in7.setDate(today.getDate()+7); in7.setHours(23,59,59,999);
    const due = members.filter(m => {
      if(m.status !== 'Active') return false;
      const p = m.expiryDate.split('T')[0].split('-');
      return new Date(p[0], p[1]-1, p[2]) <= in7;
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

/* ── ALL MEMBERS — Card Layout ── */
async function loadAllMembers() {
  const container = document.getElementById('membersCardContainer');
  if (!container) return;
  container.innerHTML = `<div class="empty"><div class="ei">⏳</div><p>Loading members…</p></div>`;
  try {
    const res = await fetch(API, {headers:hdrs()});
    if (res.status===401) { logout(); return; }
    const members = await res.json();
    if (!members.length) {
      container.innerHTML = '<div class="empty"><div class="ei">👥</div><p>No members yet. Add your first member!</p></div>';
      return;
    }
    const sorted = sortByExpiry(members);
    container.innerHTML = sorted.map(m => buildMemberCard(m)).join('');
  } catch(e) {
    container.innerHTML = '<div class="empty"><p style="color:var(--red)">Error loading members</p></div>';
  }
}

function buildMemberCard(m) {
  // Avatar
  const avatarContent = m.photo?.startsWith('data:image')
    ? `<img src="${m.photo}" alt="${esc(m.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : `<span style="font-size:1.15rem;font-weight:800;color:#fff">${esc((m.name||'?').split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2))}</span>`;

  // Expiry color
  const p = (m.expiryDate||'').split('T')[0].split('-');
  const expDate = p.length===3 ? new Date(p[0], p[1]-1, p[2]) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const daysLeft = expDate ? Math.ceil((expDate - today) / 86400000) : 999;
  const expColor = daysLeft <= 3 ? 'var(--red)' : daysLeft <= 7 ? 'var(--amber)' : 'var(--tx2)';

  // Due amount
  const due = m.planPrice || 0;
  const dueColor = due > 0 ? 'var(--red)' : 'var(--green2)';

  // Short ID (last 4 chars)
  const mid = (m._id||'').slice(-4).toUpperCase();

  const tName = m.ptEnabled && m.ptTrainer ? (trainerMap[m.ptTrainer] || '') : '';

  return `
  <div class="mc-card">
    <!-- TOP: Avatar + Info + Delete -->
    <div class="mc-top">
      <div class="mc-av" style="background:${avClr(m.name)}">${avatarContent}</div>
      <div class="mc-info">
        <div class="mc-row">
          <div>
            <div class="mc-field-label">Name:</div>
            <div class="mc-name">${esc(m.name)}</div>
          </div>
          <div style="text-align:right">
            <div class="mc-field-label">M ID</div>
            <div class="mc-mid">${mid}</div>
          </div>
        </div>
        <div class="mc-row" style="margin-top:4px">
          <div>
            <div class="mc-field-label">Mobile:</div>
            <div class="mc-phone">+91 - ${esc(m.phone)}</div>
          </div>
          <div style="text-align:right">
            <div class="mc-field-label" style="color:var(--teal)">Due Amount:</div>
            <div style="font-size:.82rem;font-weight:800;color:${dueColor}">${due > 0 ? due.toLocaleString('en-IN') : '0'}</div>
          </div>
        </div>
        <div style="margin-top:4px;font-size:.72rem;color:var(--tx2)">
          Plan Expiry: <span style="font-weight:700;color:${expColor}">${fmt(m.expiryDate)}</span>
          ${tName ? `&nbsp;|&nbsp; PT: <span style="font-weight:700;color:var(--teal)">${esc(tName)}</span>` : ''}
        </div>
      </div>
      <button class="mc-del-btn" onclick="event.stopPropagation();delMember('${m._id}','${esc(m.name.replace(/'/g,"\\'"))}')">🗑</button>
    </div>

    <!-- ACTION STRIP -->
    <div class="mc-actions">
      <div class="mc-actions-inner">
        <button class="mc-act" onclick="openEditMember('${m._id}')">
          <span class="mc-act-icon">🪪</span>
          <span class="mc-act-label">ID Card</span>
        </button>
        <button class="mc-act" onclick="window.location.href='tel:+91${esc(m.phone)}'">
          <span class="mc-act-icon">📞</span>
          <span class="mc-act-label">Call</span>
        </button>
        <button class="mc-act" onclick="window.open('https://wa.me/91${esc(m.phone)}','_blank')">
          <span class="mc-act-icon">💬</span>
          <span class="mc-act-label">Whatsapp</span>
        </button>
        <button class="mc-act" onclick="showPage('attendance',document.querySelector('[data-page=attendance]'));updateBNav('attendance')">
          <span class="mc-act-icon">📅</span>
          <span class="mc-act-label">Attendance</span>
        </button>
        <button class="mc-act" onclick="openPaymentFor(${JSON.stringify(m).replace(/"/g,'&quot;')})">
          <span class="mc-act-icon">🔄</span>
          <span class="mc-act-label">Renew Plan</span>
        </button>
        <button class="mc-act" onclick="openEditMember('${m._id}')">
          <span class="mc-act-icon">✏️</span>
          <span class="mc-act-label">Edit</span>
        </button>
      </div>
      <!-- Green diagonal corner accent -->
      <div class="mc-corner"></div>
    </div>
  </div>`;
}

/* Client-side search & filter for member cards */
let _allMembersData = [];
let _memberFilter   = 'all';

async function loadAllMembersWithFilter() {
  const container = document.getElementById('membersCardContainer');
  if (!container) return;
  container.innerHTML = `<div class="empty"><div class="ei">⏳</div><p>Loading…</p></div>`;
  try {
    const res = await fetch(API, {headers:hdrs()});
    if (res.status===401) { logout(); return; }
    _allMembersData = await res.json();
    renderFilteredCards();
  } catch(e) {
    container.innerHTML = '<div class="empty"><p style="color:var(--red)">Error loading members</p></div>';
  }
}

// Override loadAllMembers to use card layout
const loadAllMembers = loadAllMembersWithFilter;

function renderFilteredCards() {
  const container = document.getElementById('membersCardContainer');
  if (!container) return;
  const q = (document.getElementById('memberSearch')?.value || '').toLowerCase().trim();
  let list = _allMembersData;
  if (_memberFilter !== 'all') list = list.filter(m => m.status === _memberFilter);
  if (q) list = list.filter(m => m.name.toLowerCase().includes(q) || m.phone.includes(q));
  list = sortByExpiry(list);
  if (!list.length) {
    container.innerHTML = '<div class="empty"><div class="ei">👥</div><p>No members found</p></div>';
    return;
  }
  container.innerHTML = list.map(m => buildMemberCard(m)).join('');
}

function filterMembersUI(query) { renderFilteredCards(); }
function setMemberFilterUI(filter, el) {
  _memberFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderFilteredCards();
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
    document.getElementById('ePlan').value = member.plan || '';
    recalcEditPrice();

    const dType = member.discountType || 'none';
    document.querySelectorAll('input[name="edType"]').forEach(r => r.checked = r.value===dType);
    document.getElementById('edValue').value  = member.discountValue  || '';
    document.getElementById('edReason').value = member.discountReason || '';
    recalcEditPrice();

    document.getElementById('eExpiry').value  = member.expiryDate ? member.expiryDate.split('T')[0] : '';
    document.getElementById('eAdmFee').value  = member.admissionFee || '';
    document.getElementById('eWaive').value   = member.admissionWaived ? 'yes' : 'no';

    const ptEn = !!member.ptEnabled;
    document.getElementById('ePtEnabled').checked       = ptEn;
    document.getElementById('ePtDetails').style.display = ptEn ? 'block' : 'none';
    document.getElementById('ePtFee').value   = member.ptFee   || '';
    document.getElementById('ePtNotes').value = member.ptNotes || '';

    const ePtSel = document.getElementById('ePtTrainer');
    ePtSel.innerHTML = '<option value="">Select Trainer</option>' +
      Object.entries(trainerMap).map(([tid,tname]) => `<option value="${esc(tid)}">${esc(tname)}</option>`).join('');
    ePtSel.value = member.ptTrainer || '';

    document.getElementById('eEcName').value  = member.emergencyContact?.name         || '';
    document.getElementById('eEcPhone').value = member.emergencyContact?.phone        || '';
    document.getElementById('eEcRel').value   = member.emergencyContact?.relationship || '';
    document.getElementById('eNotes').value   = member.medicalNotes || '';

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

  const admFee    = parseFloat(document.getElementById('eAdmFee').value||0) || 0;
  const admWaived = document.getElementById('eWaive').value==='yes';
  const ptEnabled = document.getElementById('ePtEnabled').checked;
  const ptFee     = parseFloat(document.getElementById('ePtFee').value||0) || 0;

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
    expiryDate: document.getElementById('eExpiry').value,
    status:    document.getElementById('eStatus').value,
    emergencyContact: {
      name:         document.getElementById('eEcName').value.trim(),
      phone:        document.getElementById('eEcPhone').value.trim(),
      relationship: document.getElementById('eEcRel').value.trim()
    },
    medicalNotes: document.getElementById('eNotes').value.trim()
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

/* ── ADD MEMBER ── */
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
      if(document.getElementById('mStart')) document.getElementById('mStart').value = getLocalTodayStr();
      onPlanChange();
      toast(`${added.name} added!`,'success');
      loadDashboard();
      openPaymentFor(added, true);
    }else{
      const err=await res.json(); toast(err.error||'Could not add member','error');
    }
  }catch(err){toast('Network error','error');}
  btn.disabled=false; btn.textContent='Add Member';
});

/* ── ATTENDANCE — Loads from MongoDB ── */
function attKey(date) {
  try { const u=JSON.parse(localStorage.getItem('user')||'{}'); return `att_${u._id||u.email||'x'}_${date}`; }
  catch(e) { return `att_${date}`; }
}

async function loadAttendance() {
  const dateEl = document.getElementById('attDate');
  const date   = dateEl.value || getLocalTodayStr();
  dateEl.value = date;
  const tbody  = document.getElementById('attBody');
  tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="ei">⏳</div><p>Loading…</p></div></td></tr>`;

  try {
    // Fetch all members
    const mRes = await fetch(API, {headers:hdrs()});
    if (mRes.status===401) { logout(); return; }
    const members = await mRes.json();
    const active  = members.filter(m => m.status==='Active'||m.status==='Trial');

    // ── FETCH attendance from MongoDB for this date ──
    let saved = {};
    try {
      const aRes = await fetch(`${BASE}/attendance`, {headers:hdrs()});
      if (aRes.ok) {
        const allAtt = await aRes.json();
        // Filter records for this specific date
        allAtt.forEach(rec => {
          if (rec.date === date) {
            const mId = rec.memberId?._id || rec.memberId;
            if (mId) saved[mId] = rec.status;
          }
        });
        // Merge with localStorage as fallback for any missing
        let local = {};
        try { local = JSON.parse(localStorage.getItem(attKey(date))||'{}'); } catch(_) {}
        Object.keys(local).forEach(k => { if (!saved[k]) saved[k] = local[k]; });
      }
    } catch(_) {
      // Fallback to localStorage only
      try { saved = JSON.parse(localStorage.getItem(attKey(date))||'{}'); } catch(e) {}
    }

    const pCount = Object.values(saved).filter(s=>s==='Present').length;
    document.getElementById('attTotal').textContent   = active.length;
    document.getElementById('attPresent').textContent = pCount;
    document.getElementById('attPct').textContent     = active.length ? `${Math.min(100,Math.round(pCount/active.length*100))}%` : '0%';

    if (!active.length) {
      tbody.innerHTML='<tr><td colspan="5"><div class="empty"><p>No active members</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = active.map(m => {
      const st = saved[m._id] || 'Absent';
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:7px">${avImg(m)}<span style="font-weight:700;font-size:.82rem">${esc(m.name)}</span></div></td>
        <td style="font-size:.75rem;color:var(--tx2)">${esc(m.plan)}</td>
        <td style="font-size:.78rem">${esc(m.phone)}</td>
        <td><span id="ab-${m._id}" class="badge ${st==='Present'?'b-present':'b-absent'}">${st}</span></td>
        <td style="white-space:nowrap">
          <button class="att-btn-p" onclick="markAtt('${m._id}','${date}','Present')">✓ P</button>
          <button class="att-btn-a" onclick="markAtt('${m._id}','${date}','Absent')">✗ A</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML='<tr><td colspan="5"><div class="empty"><p style="color:var(--red)">Error loading attendance</p></div></td></tr>';
  }
}

/* ── MARK ATTENDANCE — saves to MongoDB + localStorage ── */
async function markAtt(memberId, date, status) {
  // 1. Instant UI update
  const b = document.getElementById(`ab-${memberId}`);
  if (b) { b.textContent = status; b.className = `badge ${status === 'Present' ? 'b-present' : 'b-absent'}`; }

  // 2. Save to localStorage fallback
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(attKey(date))||'{}'); } catch(e) {}
  saved[memberId] = status;
  localStorage.setItem(attKey(date), JSON.stringify(saved));

  // 3. Update counters
  const total = parseInt(document.getElementById('attTotal').textContent)||0;
  const present = Object.values(saved).filter(s=>s==='Present').length;
  document.getElementById('attPresent').textContent = present;
  document.getElementById('attPct').textContent = total ? `${Math.min(100,Math.round(present/total*100))}%` : '0%';

  // 4. Save to MongoDB
  try {
    const res = await fetch(`${BASE}/attendance`, {
      method: 'POST',
      headers: hdrs(),
      body: JSON.stringify({ memberId, date, status })
    });
    if (!res.ok) throw new Error('DB save failed');
  } catch (error) {
    console.error('Attendance Sync Error:', error);
    toast('Saved locally (sync error)', 'error');
  }
}

async function markAllPresent() {
  const date = document.getElementById('attDate').value || getLocalTodayStr();
  if (!confirm(`Mark ALL active members Present for ${fmt(date)}?`)) return;
  try {
    const members = await fetch(API,{headers:hdrs()}).then(r=>r.json());
    const active  = members.filter(m=>m.status==='Active'||m.status==='Trial');
    for (const m of active) await markAtt(m._id, date, 'Present');
    toast(`${active.length} members marked Present`,'success');
    loadAttendance();
  } catch(e) { toast('Error','error'); }
}

/* ── ATTENDANCE ANALYTICS (inside edit member modal) ── */
async function renderMemberAttendanceStats(memberId) {
  const container = document.getElementById('eAttStats');
  if(!container) return;
  container.innerHTML = '<div class="sync-note" style="text-align:center">⏳ Analyzing attendance…</div>';
  try {
    const res = await fetch(`${BASE}/attendance`, {headers:hdrs()});
    if (!res.ok) throw new Error('fetch failed');
    const allAtt = await res.json();

    const memberAtt = allAtt.filter(a =>
      ((a.memberId?._id === memberId) || a.memberId === memberId) && a.status === 'Present'
    );

    const monthlyStats = {};
    memberAtt.forEach(record => {
      const [y, mo] = record.date.split('-');
      const key = `${y}-${mo}`;
      monthlyStats[key] = (monthlyStats[key]||0) + 1;
    });

    const today = new Date();
    const curKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate();
    const keys = Object.keys(monthlyStats).sort().reverse();

    if (!keys.length) {
      container.innerHTML = '<div class="sync-note" style="text-align:center">No attendance records yet. Start marking to see stats!</div>';
      return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:10px">';
    keys.forEach(key => {
      const [y, mo] = key.split('-');
      const monthName = `${monthNames[parseInt(mo)-1]} ${y}`;
      const presentDays = monthlyStats[key];

      if (key === curKey) {
        html += `<div style="background:var(--teal-light);padding:12px 16px;border-radius:14px;display:flex;justify-content:space-between;align-items:center;border:1.5px solid var(--border2)">
          <span style="font-size:.9rem;font-weight:800;color:var(--teal)">${monthName} (Current)</span>
          <span style="background:var(--teal);color:#fff;padding:6px 12px;border-radius:20px;font-size:.8rem;font-weight:800">${presentDays} Days Attended</span>
        </div>`;
      } else {
        const totalDays = getDaysInMonth(parseInt(y), parseInt(mo));
        const pct = Math.round((presentDays / totalDays) * 100);
        const barClr = pct < 40 ? 'var(--red)' : pct < 70 ? 'var(--amber)' : 'var(--green2)';
        html += `<div style="background:var(--bg);padding:12px 16px;border-radius:14px;border:1px solid var(--border2)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:.85rem;font-weight:700;color:var(--tx2)">${monthName}</span>
            <span style="font-size:.85rem;font-weight:800;color:${barClr}">${pct}% Attended</span>
          </div>
          <div style="height:8px;background:var(--border2);border-radius:10px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${barClr};border-radius:10px;transition:width .5s ease"></div>
          </div>
          <div style="font-size:.7rem;color:var(--tx3);margin-top:6px;text-align:right">${presentDays} out of ${totalDays} days</div>
        </div>`;
      }
    });
    html += '</div>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div class="sync-note" style="color:var(--red);text-align:center">Failed to load stats.</div>';
  }
}

/* ── TRAINERS ── */
async function loadTrainers() {
  const tbody = document.getElementById('trainersBody');
  try {
    const res = await fetch(TAPI,{headers:hdrs()});
    if (res.status===401){logout();return;}
    const trainers = await res.json();
    trainerMap = {};
    trainers.forEach(t => { trainerMap[t._id] = t.name; });
    if (!trainers.length) { tbody.innerHTML='<tr><td colspan="5"><div class="empty"><div class="ei">💪</div><p>No trainers yet</p></div></td></tr>'; return; }
    tbody.innerHTML = trainers.map(t=>`<tr>
      <td><div style="display:flex;align-items:center;gap:7px">${av(t.name)}<span style="font-weight:700;font-size:.82rem">${esc(t.name)}</span></div></td>
      <td style="font-size:.78rem;color:var(--tx2)">${esc(t.specialty)}</td>
      <td style="font-size:.78rem">${esc(t.phone)}</td>
      <td>${badge(t.status)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editTrainer('${esc(t._id)}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="delTrainer('${esc(t._id)}','${esc(t.name.replace(/'/g,"\\'"))}')">Del</button>
      </td>
    </tr>`).join('');
    const opts = '<option value="">Select Trainer</option>'+
      trainers.filter(t=>t.status==='Active').map(t=>`<option value="${esc(t._id)}">${esc(t.name)} — ${esc(t.specialty)}</option>`).join('');
    document.getElementById('mPtTrainer').innerHTML = opts;
    document.getElementById('ePtTrainer').innerHTML = opts;
    if(document.getElementById('payPtTrainer')) document.getElementById('payPtTrainer').innerHTML = opts;
  } catch(e) { tbody.innerHTML='<tr><td colspan="5"><div class="empty"><p style="color:var(--red)">Error loading</p></div></td></tr>'; }
}

async function editTrainer(id) {
  try {
    const t  = await fetch(`${TAPI}/${id}`,{headers:hdrs()}).then(r=>r.json());
    const n  = prompt('Name:',t.name);     if(!n) return;
    const p  = prompt('Phone:',t.phone);   if(!p) return;
    const s  = prompt('Specialty:',t.specialty); if(!s) return;
    const st = prompt('Status (Active/Inactive):',t.status);
    if(!['Active','Inactive'].includes(st)){toast('Invalid status','error');return;}
    const res=await fetch(`${TAPI}/${id}`,{method:'PUT',headers:hdrs(),body:JSON.stringify({name:n.trim(),phone:p.trim(),specialty:s.trim(),status:st})});
    if(res.ok){toast('Trainer updated','success');loadTrainers();}else toast('Update failed','error');
  }catch(e){toast('Error','error');}
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

/* ── PLANS ── */
function loadPlans() {
  const grid = document.getElementById('plansGrid');
  if (!gymPlans.length) { grid.innerHTML='<div class="empty"><div class="ei">💎</div><p>No plans yet</p></div>'; return; }
  const plans = gymPlans.map(p => {
    let disc=p.price,discInfo=null;
    for(const d of gymDisc){
      if(!d.validUntil||new Date(d.validUntil)>=new Date()){
        if(d.appliesTo==='all'||d.planName===p.name){
          if(d.type==='percentage'){disc=p.price-p.price*d.value/100;discInfo=`${d.value}% OFF`;}
          else{disc=Math.max(0,p.price-d.value);discInfo=`₹${d.value} OFF`;}
          break;
        }
      }
    }
    return{...p,disc:Math.round(disc),discInfo};
  });
  grid.innerHTML = plans.map(p=>`
    <div class="plan-card">
      ${p.discInfo?`<div class="plan-disc">${p.discInfo}</div>`:''}
      <h3>${esc(p.name)}</h3>
      <div class="plan-dur">${p.months} month${p.months>1?'s':''}</div>
      ${p.discInfo?`<div class="plan-orig">₹${p.price.toLocaleString('en-IN')}</div>`:''}
      <div class="plan-price">₹${p.disc.toLocaleString('en-IN')}</div>
      <div style="display:flex;gap:5px;margin-top:.6rem">
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="selectPlan('${esc(p.name)}')">Select</button>
        <button class="btn btn-edit btn-sm" onclick="openEditPlan('${esc(p.name)}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="removePlan('${esc(p.name)}')">🗑</button>
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
  saveServerProfile(); closeModal('addPlanModal');
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
  saveServerProfile(); closeModal('editPlanModal');
  populatePlanSelect(); loadPlans(); toast('Plan updated!','success');
}

function removePlan(name) {
  if(!confirm(`Remove plan "${name}"?`))return;
  gymPlans = gymPlans.filter(p=>p.name!==name);
  saveServerProfile(); populatePlanSelect(); loadPlans(); toast('Plan removed');
}

/* ── DISCOUNTS ── */
function renderDiscounts() {
  const c = document.getElementById('discTable');
  if (!gymDisc.length) { c.innerHTML='<div class="empty"><div class="ei">🏷️</div><p>No discounts yet</p></div>'; return; }
  c.innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr><th>Name</th><th>Applies</th><th>Type</th><th>Value</th><th>Until</th><th></th></tr></thead>
    <tbody>${gymDisc.map((d,i)=>`<tr>
      <td><strong style="font-size:.82rem">${esc(d.name)}</strong></td>
      <td style="font-size:.78rem">${d.appliesTo==='all'?'All':esc(d.planName)}</td>
      <td style="font-size:.78rem">${d.type==='percentage'?'%':'₹'}</td>
      <td style="font-size:.82rem;font-weight:700">${d.type==='percentage'?`${d.value}%`:`₹${d.value.toLocaleString('en-IN')}`}</td>
      <td style="font-size:.75rem">${d.validUntil?fmt(d.validUntil):'—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removeDiscount(${i})">Del</button></td>
    </tr>`).join('')}</tbody></table></div>`;
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
  saveServerProfile(); closeModal('addDiscountModal'); renderDiscounts(); toast('Discount added','success');
}

function removeDiscount(i) {
  if(!confirm('Remove this discount?'))return;
  gymDisc.splice(i,1); saveServerProfile(); renderDiscounts(); toast('Discount removed');
}

/* ── PAYMENTS ── */
async function loadPayments() {
  const container = document.getElementById('payList');
  try {
    const res = await fetch(API,{headers:hdrs()});
    if(res.status===401){logout();return;}
    const members = await res.json();
    const today   = new Date(); today.setHours(0,0,0,0);
    const in14    = new Date(today); in14.setDate(today.getDate()+14); in14.setHours(23,59,59,999);
    const due = members.filter(m => {
      if(m.status !== 'Active') return false;
      const p = m.expiryDate.split('T')[0].split('-');
      return new Date(p[0], p[1]-1, p[2]) <= in14;
    });
    due.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    if(!due.length){container.innerHTML='<div class="empty"><div class="ei">✅</div><p>No payments due in 14 days!</p></div>';return;}
    container.innerHTML=due.map(m=>{
      const p = m.expiryDate.split('T')[0].split('-');
      const d = Math.ceil((new Date(p[0], p[1]-1, p[2]) - today)/86400000);
      return `<div class="pay-row">
        <div style="display:flex;align-items:center;gap:8px">${avImg(m)}<div><div style="font-weight:700;font-size:.85rem">${esc(m.name)}</div><div style="font-size:.72rem;color:var(--tx3)">${esc(m.plan)}</div><div style="font-size:.7rem;color:var(--tx3)">Exp: ${fmt(m.expiryDate)}</div></div></div>
        <span class="badge ${d<0?'b-inactive':'b-trial'}">${d<0?'Overdue':d+'d'}</span>
        <button class="btn btn-success btn-sm" onclick='openPaymentFor(${JSON.stringify(m).replace(/'/g,"&#39;")})'>Renew</button>
      </div>`;
    }).join('');
  }catch(e){container.innerHTML='<div class="empty"><p style="color:var(--red)">Error</p></div>';}
}

function openPaymentFor(m, isNew = false) {
  curPayMember = {id: m._id, name: m.name, expiryDate: m.expiryDate, isNew, originalData: m};
  const mhdr = document.querySelector('#paymentModal .mhdr .mtitle');
  if(mhdr) mhdr.textContent = isNew ? '💳 Complete Payment' : '💳 Renew Plan';
  if (isNew) {
    document.getElementById('payPlan').parentElement.style.display = 'none';
    document.getElementById('payPtEnabled').closest('.pt-box').style.display = 'none';
  } else {
    document.getElementById('payPlan').parentElement.style.display = 'block';
    document.getElementById('payPtEnabled').closest('.pt-box').style.display = 'block';
    populatePlanSelect('payPlan');
    document.getElementById('payPlan').value = m.plan || gymPlans[0].name;
    const ptEn = !!m.ptEnabled;
    document.getElementById('payPtEnabled').checked = ptEn;
    document.getElementById('payPtDetails').style.display = ptEn ? 'block' : 'none';
    document.getElementById('payPtFee').value = m.ptFee || gymCfg.ptFee || 0;
    document.getElementById('payPtTrainer').innerHTML = document.getElementById('ePtTrainer').innerHTML || '<option value="">Select Trainer</option>';
    document.getElementById('payPtTrainer').value = m.ptTrainer || '';
  }
  recalcPayment();
  openModal('paymentModal');
}

function recalcPayment() {
  if(!curPayMember) return;
  const isNew = curPayMember.isNew;
  const m = curPayMember.originalData;
  let planName, planAmt, ptAmt, admAmt;
  if (isNew) {
    planName = m.plan; planAmt = m.planPrice;
    ptAmt = m.ptEnabled ? (m.ptFee||0) : 0;
    admAmt = m.admissionWaived ? 0 : (m.admissionFee||0);
  } else {
    const planSel = document.getElementById('payPlan');
    planName = planSel.value;
    planAmt  = parseInt(planSel.options[planSel.selectedIndex]?.getAttribute('data-price')) || getPlanPrice(planName);
    const isPt = document.getElementById('payPtEnabled').checked;
    ptAmt = isPt ? (parseFloat(document.getElementById('payPtFee').value)||0) : 0;
    admAmt = 0;
  }
  const total = planAmt + ptAmt + admAmt;
  let rows = `
    <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="color:var(--tx2);font-size:.82rem">Member</span><strong style="font-size:.82rem">${esc(curPayMember.name)}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--tx2);font-size:.82rem">Plan Fee (${esc(planName)})</span><span style="font-size:.85rem;font-weight:700">₹${Math.round(planAmt).toLocaleString('en-IN')}</span></div>`;
  if(admAmt > 0) rows += `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--tx2);font-size:.82rem">🎟️ Admission</span><span style="font-size:.85rem;font-weight:700">₹${Math.round(admAmt).toLocaleString('en-IN')}</span></div>`;
  if(ptAmt > 0)  rows += `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--tx2);font-size:.82rem">💪 PT Fee</span><span style="font-size:.85rem;font-weight:700">₹${Math.round(ptAmt).toLocaleString('en-IN')}</span></div>`;
  rows += `<div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1.5px solid var(--border);margin-top:6px"><span style="font-weight:800;font-size:.88rem">Total</span><strong style="color:var(--green2);font-size:1.05rem">₹${total.toLocaleString('en-IN')}</strong></div>`;
  document.getElementById('payInfo').innerHTML = `<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:.6rem">${rows}</div>`;
  const upiId = gymCfg.upiId || 'your-upi@bank';
  const upiName = gymCfg.upiName || 'GymPro';
  document.getElementById('dispUpi').textContent = upiId;
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${total}&cu=INR`;
  document.getElementById('payQR').src = `https://api.qrserver.com/v1/create-qr-code/?size=158x158&data=${encodeURIComponent(upiUrl)}`;
}

async function confirmPayment() {
  if(!curPayMember) return;
  if (curPayMember.isNew) { toast('✅ Payment Confirmed!','success'); closeModal('paymentModal'); curPayMember=null; return; }
  const planName = document.getElementById('payPlan').value;
  const planAmt  = getPlanPrice(planName);
  const months   = getPlanMonths(planName);
  const isPt     = document.getElementById('payPtEnabled').checked;
  const ptAmt    = isPt ? (parseFloat(document.getElementById('payPtFee').value)||0) : 0;
  const ptTrainer= isPt ? document.getElementById('payPtTrainer').value : '';
  let baseDate = new Date(); baseDate.setHours(0,0,0,0);
  if (curPayMember.expiryDate) {
    const p = curPayMember.expiryDate.split('T')[0].split('-');
    const d = new Date(p[0], p[1]-1, p[2]);
    if (d > new Date()) baseDate = d;
  }
  baseDate.setMonth(baseDate.getMonth() + months);
  const newExpiry = baseDate.getFullYear() + '-' + String(baseDate.getMonth()+1).padStart(2,'0') + '-' + String(baseDate.getDate()).padStart(2,'0');
  const payload = { plan:planName, planPrice:planAmt, ptEnabled:isPt, ptFee:ptAmt, ptTrainer, expiryDate:newExpiry, status:'Active' };
  const btn = document.getElementById('confirmPayBtn');
  if(btn) { btn.disabled=true; btn.textContent='Processing…'; }
  try {
    await fetch(`${API}/${curPayMember.id}`,{method:'PUT',headers:hdrs(),body:JSON.stringify(payload)});
    toast(`✅ Renewed to ${baseDate.toLocaleDateString('en-IN')}`, 'success');
    closeModal('paymentModal'); curPayMember=null;
    loadDashboard(); loadPayments(); loadAllMembers();
  } catch(e) { toast('Network error','error'); }
  if(btn) { btn.disabled=false; btn.textContent='✅ Confirm Payment'; }
}

/* ── SETTINGS ── */
function loadSettings() {
  document.getElementById('sUpiId').value   = gymCfg.upiId    || '';
  document.getElementById('sUpiName').value = gymCfg.upiName  || '';
  document.getElementById('sAdmFee').value  = gymCfg.admissionFee != null ? gymCfg.admissionFee : '';
  document.getElementById('sPtFee').value   = gymCfg.ptFee    != null ? gymCfg.ptFee    : '';
}

async function saveSettings() {
  gymCfg.upiId        = document.getElementById('sUpiId').value.trim();
  gymCfg.upiName      = document.getElementById('sUpiName').value.trim();
  gymCfg.admissionFee = parseFloat(document.getElementById('sAdmFee').value)||0;
  gymCfg.ptFee        = parseFloat(document.getElementById('sPtFee').value)||0;
  await saveServerProfile();
  toast('Settings saved & synced!','success');
}

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) return;
  setupCamera();

  ['dValue','mPlan'].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).addEventListener('input', recalcPrice);
  });
  if(document.getElementById('mStart')) document.getElementById('mStart').addEventListener('input', onPlanChange);
  ['edValue','ePlan'].forEach(id => {
    if(document.getElementById(id)) document.getElementById(id).addEventListener('input', recalcEditPrice);
  });

  document.getElementById('topDate').textContent =
    new Date().toLocaleDateString('en-IN',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
  document.getElementById('attDate').value = getLocalTodayStr();
  if(document.getElementById('mStart')) document.getElementById('mStart').value = getLocalTodayStr();

  await loadServerProfile();
  if (gymCfg.admissionFee) document.getElementById('mAdmFee').value = gymCfg.admissionFee;

  try {
    const u = JSON.parse(localStorage.getItem('user')||'{}');
    if (u.name) document.getElementById('sbUser').innerHTML =
      `<div class="u-name">👤 ${esc(u.name)}</div><div class="u-role">${u.role==='admin'?'Administrator':'Staff Member'}</div>`;
  } catch(e){}

  populatePlanSelect();
  recalcPrice();
  loadDashboard();

  fetch(TAPI,{headers:hdrs()}).then(r=>r.json()).then(trainers=>{
    trainerMap = {};
    trainers.forEach(t=>{trainerMap[t._id]=t.name;});
    const opts = '<option value="">Select Trainer</option>'+
      trainers.filter(t=>t.status==='Active').map(t=>`<option value="${esc(t._id)}">${esc(t.name)} — ${esc(t.specialty)}</option>`).join('');
    document.getElementById('mPtTrainer').innerHTML = opts;
    document.getElementById('ePtTrainer').innerHTML = opts;
    if(document.getElementById('payPtTrainer')) document.getElementById('payPtTrainer').innerHTML = opts;
  }).catch(()=>{});

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
  }
});

window.addEventListener('online',  () => { document.getElementById('offline-banner').style.display='none'; loadDashboard(); });
window.addEventListener('offline', () => { document.getElementById('offline-banner').style.display='block'; });
if (!navigator.onLine) document.getElementById('offline-banner').style.display = 'block';
