// ==================== API CONFIG ====================
const BASE_URL = "https://gym-pro-mvyv.onrender.com/api";
const API_URL = `${BASE_URL}/members`;
const TRAINER_API_URL = `${BASE_URL}/trainers`;

// Helper function to get auth headers
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// Check if user is logged in
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// Get current user
function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      console.error('Error parsing user data:', e);
      return null;
    }
  }
  return null;
}

// Logout function
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

// Helper function to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== DASHBOARD FUNCTIONS ====================
async function loadDashboard() {
  try {
    let res;
    let stats;
    
    // Try /api/members/stats first (API_URL/stats)
    try {
      res = await fetch(`${API_URL}/stats`, {
        headers: getAuthHeaders()
      });
      
      if (res.ok) {
        stats = await res.json();
        console.log('Using /api/members/stats endpoint');
      } else {
        throw new Error('First endpoint failed');
      }
    } catch (err) {
      // Fallback to /api/stats (BASE_URL/stats)
      console.log('Trying fallback stats endpoint /api/stats...');
      res = await fetch(`${BASE_URL}/stats`, {
        headers: getAuthHeaders()
      });
      
      if (!res.ok) throw new Error('Both stats endpoints failed');
      stats = await res.json();
      console.log('Using /api/stats endpoint');
    }
    
    if (res.status === 401) {
      logout();
      return;
    }

    const totalMembersEl = document.getElementById('total-members');
    const activeTodayEl = document.getElementById('active-today');
    const estimatedRevenueEl = document.getElementById('estimated-revenue');
    
    if (totalMembersEl) totalMembersEl.textContent = stats.totalMembers || 0;
    if (activeTodayEl) activeTodayEl.textContent = stats.activeToday || 0;
    
    const revenue = Number(stats.estimatedRevenue) || 0;
    if (estimatedRevenueEl) estimatedRevenueEl.textContent = `₹${revenue.toLocaleString('en-IN')}`;
  } catch (e) { 
    console.error('Dashboard error:', e);
    const totalMembersEl = document.getElementById('total-members');
    const activeTodayEl = document.getElementById('active-today');
    const estimatedRevenueEl = document.getElementById('estimated-revenue');
    
    if (totalMembersEl) totalMembersEl.textContent = '0';
    if (activeTodayEl) activeTodayEl.textContent = '0';
    if (estimatedRevenueEl) estimatedRevenueEl.textContent = '₹0';
  }
}

// Load recent members for dashboard
async function loadMembers() {
  try {
    const res = await fetch(API_URL, {
      headers: getAuthHeaders()
    });
    
    if (res.status === 401) {
      logout();
      return;
    }
    
    if (!res.ok) throw new Error('Failed to load members');
    
    const members = await res.json();
    const tbody = document.querySelector('#members-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!members || members.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#777;">No members found. Add your first member!</td></tr>`;
      return;
    }

    members.slice(0, 8).forEach(m => {
      const photoHtml = m.photo && m.photo.startsWith('data:image') ? 
        `<img src="${m.photo}" class="member-photo" style="width:40px; height:40px; margin-right:10px; border-radius:50%; object-fit:cover;">` : 
        `<span class="avatar" style="width:40px; height:40px; font-size:1rem; margin-right:10px; display:inline-flex; align-items:center; justify-content:center; background:#7B61FF; color:white; border-radius:50%;">${m.name.charAt(0).toUpperCase()}</span>`;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div style="display: flex; align-items: center;">
            ${photoHtml}
            <div>
              <strong>${escapeHtml(m.name)}</strong><br>
              <small>${escapeHtml(m.phone)}</small>
            </div>
          </div>
         </td>
         <td>${escapeHtml(m.plan)}</td>
         <td>${new Date(m.joinDate).toLocaleDateString('en-IN')}</td>
         <td>${new Date(m.expiryDate).toLocaleDateString('en-IN')}</td>
         <td><span class="status ${(m.status || 'active').toLowerCase()}">${m.status || 'Active'}</span></td>
         <td>
          <button class="delete-member-btn" onclick="deleteMember('${m._id}', '${escapeHtml(m.name).replace(/'/g, "\\'")}')">
            🗑️ Delete
          </button>
         </td>
      `;
      tbody.appendChild(row);
    });
  } catch (e) { 
    console.error('Load members error:', e);
    const tbody = document.querySelector('#members-table tbody');
    if (tbody && tbody.innerHTML === '') {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#dc3545;">Error loading members. Please refresh the page.</td></tr>';
    }
  }
}

// Load all members for members page
async function loadAllMembers() {
  try {
    const res = await fetch(API_URL, {
      headers: getAuthHeaders()
    });
    
    if (res.status === 401) {
      logout();
      return;
    }
    
    if (!res.ok) throw new Error('Failed to load members');
    
    const members = await res.json();
    const tbody = document.querySelector('#all-members-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!members || members.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;">No members found. Add your first member!</td></tr>';
      return;
    }

    members.forEach(m => {
      let healthBadges = '';
      if (m.healthConditions && m.healthConditions.length > 0) {
        healthBadges = m.healthConditions.map(h => 
          `<span class="health-badge" style="display:inline-block; background:#f0f0f0; padding:2px 8px; margin:2px; border-radius:12px; font-size:12px;">${escapeHtml(h.condition)} (${escapeHtml(h.severity)})</span>`
        ).join('');
      }
      
      const ageDisplay = m.age ? `${m.age} yrs` : 'N/A';
      const photoHtml = m.photo && m.photo.startsWith('data:image') ? 
        `<img src="${m.photo}" class="member-photo" alt="${escapeHtml(m.name)}" style="width:45px; height:45px; border-radius:50%; object-fit:cover;">` : 
        `<div class="avatar" style="width:45px; height:45px; font-size:1.2rem; margin:0; display:inline-flex; align-items:center; justify-content:center; background:#7B61FF; color:white; border-radius:50%;">${m.name.charAt(0).toUpperCase()}</div>`;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="text-align:center;">${photoHtml}</td>
        <td><strong>${escapeHtml(m.name)}</strong><br><small>Age: ${ageDisplay}</small></td>
        <td>${escapeHtml(m.phone)}<br><small>${escapeHtml(m.email || '')}</small></td>
        <td>${escapeHtml(m.plan)}</td>
        <td>${new Date(m.expiryDate).toLocaleDateString('en-IN')}</td>
        <td>${healthBadges || '-'}</td>
        <td><span class="status ${(m.status || 'active').toLowerCase()}">${m.status || 'Active'}</span></td>
        <td>
          <button class="small-btn" onclick="showMonthlyDue('${m._id}', '${escapeHtml(m.name).replace(/'/g, "\\'")}')">💰 Due</button>
          <button class="delete-member-btn" onclick="deleteMember('${m._id}', '${escapeHtml(m.name).replace(/'/g, "\\'")}')">🗑️ Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (e) { 
    console.error('Load all members error:', e);
    const tbody = document.querySelector('#all-members-table tbody');
    if (tbody && tbody.innerHTML === '') {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#dc3545;">Error loading members. Please refresh the page.</td></tr>';
    }
  }
}

// ==================== ATTENDANCE FUNCTIONS ====================
async function loadAttendance(selectedDate = null) {
  const dateInput = document.getElementById('attendance-date');
  if (!dateInput) return;
  
  const date = selectedDate || dateInput.value || new Date().toISOString().split('T')[0];
  dateInput.value = date;

  try {
    const statsRes = await fetch(`${BASE_URL}/attendance/stats/${date}`, {
      headers: getAuthHeaders()
    });
    
    if (statsRes.status === 401) {
      logout();
      return;
    }
    
    if (!statsRes.ok) throw new Error('Failed to load attendance stats');
    
    const stats = await statsRes.json();

    const totalActiveEl = document.getElementById('total-active');
    const presentCountEl = document.getElementById('present-count');
    const percentageEl = document.getElementById('attendance-percentage');
    
    if (totalActiveEl) totalActiveEl.textContent = stats.totalActive || 0;
    if (presentCountEl) presentCountEl.textContent = stats.presentCount || 0;
    if (percentageEl) percentageEl.textContent = (stats.attendancePercentage || 0) + '%';

    const res = await fetch(`${BASE_URL}/attendance/${date}`, {
      headers: getAuthHeaders()
    });
    
    if (!res.ok) throw new Error('Failed to load attendance');
    
    const attendances = await res.json();

    const tbody = document.querySelector('#attendance-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const membersRes = await fetch(API_URL, {
      headers: getAuthHeaders()
    });
    
    if (!membersRes.ok) throw new Error('Failed to load members');
    
    let members = await membersRes.json();
    members = members.filter(m => m.status === 'Active' || m.status === 'Trial');

    if (members.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#777;">No active members found.</td></tr>';
      return;
    }

    members.forEach(member => {
      const existing = attendances.find(a => a.memberId && (a.memberId._id || a.memberId) === member._id);
      const currentStatus = existing ? existing.status : 'Absent';
      const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="avatar" style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#7B61FF; color:white; border-radius:50%; margin-right:8px;">${escapeHtml(initials)}</span> <strong>${escapeHtml(member.name)}</strong></td>
        <td>${escapeHtml(member.plan)}</td>
        <td>${escapeHtml(member.phone)}</td>
        <td><span class="status ${currentStatus === 'Present' ? 'status-present' : 'status-absent'}">${currentStatus}</span></td>
        <td>
          <button class="attendance-btn mark-present" onclick="markAttendance('${member._id}', '${date}', 'Present')">Present</button>
          <button class="attendance-btn mark-absent" onclick="markAttendance('${member._id}', '${date}', 'Absent')">Absent</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Attendance error:', err);
    const tbody = document.querySelector('#attendance-table tbody');
    if (tbody && tbody.innerHTML === '') {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#dc3545;">Error loading attendance data</td></tr>';
    }
  }
}

window.markAttendance = async function(memberId, date, status) {
  try {
    const res = await fetch(`${BASE_URL}/attendance`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ memberId, date, status })
    });
    
    if (!res.ok) throw new Error('Failed to mark attendance');
    
    await loadAttendance(date);
  } catch (err) {
    alert('Failed to mark attendance: ' + err.message);
    console.error(err);
  }
};

// ==================== DELETE MEMBER FUNCTIONS ====================
async function deleteMember(memberId, memberName) {
  const confirmDelete = confirm(`⚠️ Are you sure you want to delete "${memberName}"?\n\nThis action cannot be undone!`);
  if (!confirmDelete) return;
  
  try {
    const response = await fetch(`${API_URL}/${memberId}`, { 
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      alert(`✅ "${memberName}" has been deleted successfully!`);
      await loadDashboard();
      await loadMembers();
      await loadAllMembers();
      
      const attendanceContent = document.getElementById('attendance-content');
      if (attendanceContent && attendanceContent.style.display === 'block') {
        await loadAttendance();
      }
    } else {
      const error = await response.json();
      alert(`❌ Failed to delete: ${error.message || 'Unknown error'}`);
    }
  } catch (err) {
    alert('❌ Error deleting member. Please try again.');
    console.error(err);
  }
}

async function deleteAllMembers() {
  const confirmDelete = confirm(`⚠️⚠️⚠️ DANGER ZONE ⚠️⚠️⚠️\n\nAre you ABSOLUTELY sure you want to delete ALL members?\n\nType "DELETE ALL" to confirm:`);
  if (!confirmDelete) return;
  
  const verification = prompt('Type "DELETE ALL" to confirm deletion of all members:');
  if (verification !== 'DELETE ALL') {
    alert('Deletion cancelled.');
    return;
  }
  
  try {
    const res = await fetch(API_URL, {
      headers: getAuthHeaders()
    });
    
    if (!res.ok) throw new Error('Failed to load members');
    
    const allMembers = await res.json();
    let deletedCount = 0;
    
    for (const member of allMembers) {
      const response = await fetch(`${API_URL}/${member._id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (response.ok) deletedCount++;
    }
    
    alert(`✅ Successfully deleted ${deletedCount} members!`);
    await loadDashboard();
    await loadMembers();
    await loadAllMembers();
    
    const attendanceContent = document.getElementById('attendance-content');
    if (attendanceContent && attendanceContent.style.display === 'block') {
      await loadAttendance();
    }
  } catch (err) {
    alert('❌ Error deleting members: ' + err.message);
    console.error(err);
  }
}

// ==================== TRAINERS FUNCTIONS ====================

// Load trainers from MongoDB
async function loadTrainers() {
  try {
    console.log('Loading trainers...');
    const res = await fetch(TRAINER_API_URL, {
      headers: getAuthHeaders()
    });
    
    if (res.status === 401) {
      logout();
      return;
    }
    
    if (!res.ok) throw new Error('Failed to load trainers');
    const trainers = await res.json();
    console.log('Trainers loaded:', trainers.length);
    
    const tbody = document.querySelector('#trainers-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!trainers || trainers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:60px;color:#777;">No trainers added yet. Click "Add New Trainer" to get started.</td></tr>';
      return;
    }

    trainers.forEach(trainer => {
      const initials = trainer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <span class="avatar" style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#7B61FF; color:white; border-radius:50%; margin-right:8px;">${escapeHtml(initials)}</span>
          <strong>${escapeHtml(trainer.name)}</strong>
        </td>
        <td>${escapeHtml(trainer.specialty)}</td>
        <td>${escapeHtml(trainer.phone)}</td>
        <td>${new Date(trainer.joinDate).toLocaleDateString('en-IN')}</td>
        <td><span class="status ${trainer.status === 'Active' ? 'status-active' : 'status-inactive'}">${trainer.status}</span></td>
        <td>
          <button class="trainer-btn edit" onclick="editTrainer('${trainer._id}')">✏️ Edit</button>
          <button class="trainer-btn delete" onclick="deleteTrainer('${trainer._id}')">🗑️ Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Load trainers error:', err);
    const tbody = document.querySelector('#trainers-table tbody');
    if (tbody && tbody.innerHTML === '') {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:60px;color:#dc3545;">Error loading trainers. Please refresh the page.</td></tr>';
    }
  }
}

// Edit Trainer
window.editTrainer = async function(id) {
  try {
    const res = await fetch(`${TRAINER_API_URL}/${id}`, {
      headers: getAuthHeaders()
    });
    
    if (!res.ok) throw new Error('Failed to load trainer');
    
    const trainer = await res.json();
    
    const newName = prompt("Edit name:", trainer.name);
    if (!newName || !newName.trim()) return;
    
    const newPhone = prompt("Edit phone:", trainer.phone);
    if (!newPhone || !newPhone.trim()) return;
    
    const newSpecialty = prompt("Edit specialty:", trainer.specialty);
    if (!newSpecialty || !newSpecialty.trim()) return;
    
    const newStatus = prompt("Edit status (Active/Inactive):", trainer.status);
    if (!newStatus || !['Active', 'Inactive'].includes(newStatus)) {
      alert('Status must be either Active or Inactive');
      return;
    }
    
    const updateRes = await fetch(`${TRAINER_API_URL}/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name: newName.trim(),
        phone: newPhone.trim(),
        specialty: newSpecialty.trim(),
        status: newStatus === 'Active' ? 'Active' : 'Inactive'
      })
    });
    
    if (updateRes.ok) {
      alert("✅ Trainer updated successfully!");
      await loadTrainers();
    } else {
      const error = await updateRes.json();
      alert("Error updating trainer: " + (error.message || 'Unknown error'));
    }
  } catch (err) {
    console.error('Edit error:', err);
    alert("Error editing trainer: " + err.message);
  }
};

// Delete Trainer
window.deleteTrainer = async function(id) {
  if (!confirm("⚠️ Delete this trainer?\n\nThis action cannot be undone!")) return;
  
  try {
    const res = await fetch(`${TRAINER_API_URL}/${id}`, { 
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    
    if (res.ok) {
      alert("✅ Trainer deleted successfully!");
      await loadTrainers();
    } else {
      const error = await res.json();
      alert("Error deleting trainer: " + (error.message || 'Unknown error'));
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert("Error deleting trainer: " + err.message);
  }
};

// Setup Trainer Modal
function setupTrainerModal() {
  console.log('Setting up trainer modal...');
  
  const addTrainerBtn = document.getElementById('add-trainer-btn');
  if (!addTrainerBtn) {
    console.error('Add trainer button not found!');
    return;
  }

  // Remove existing listener to prevent duplicates
  const newAddTrainerBtn = addTrainerBtn.cloneNode(true);
  addTrainerBtn.parentNode.replaceChild(newAddTrainerBtn, addTrainerBtn);
  
  newAddTrainerBtn.addEventListener('click', () => {
    console.log('Add trainer button clicked');
    let modal = document.getElementById('add-trainer-modal');
    if (!modal) {
      const html = `
        <div id="add-trainer-modal" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); justify-content:center; align-items:center; z-index:1000;">
          <div class="modal-content" style="background:white; padding:30px; border-radius:12px; max-width:500px; width:90%;">
            <h2>Add New Trainer</h2>
            <form id="add-trainer-form">
              <div class="form-group">
                <label>Full Name *</label>
                <input type="text" id="trainer-name" required>
              </div>
              <div class="form-group">
                <label>Phone *</label>
                <input type="tel" id="trainer-phone" required>
              </div>
              <div class="form-group">
                <label>Specialty *</label>
                <input type="text" id="trainer-specialty" required>
              </div>
              <div class="form-group">
                <label>Status</label>
                <select id="trainer-status">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div class="modal-buttons" style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                <button type="button" id="cancel-trainer-btn" class="cancel-btn" style="padding:10px 20px; background:#6c757d; color:white; border:none; border-radius:6px; cursor:pointer;">Cancel</button>
                <button type="submit" class="submit-btn" style="padding:10px 20px; background:#7B61FF; color:white; border:none; border-radius:6px; cursor:pointer;">Add Trainer</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      modal = document.getElementById('add-trainer-modal');
    }
    modal.style.display = 'flex';
  });
}

// Handle trainer form submission
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'add-trainer-form') {
    e.preventDefault();
    console.log('Trainer form submitted');
    
    const nameInput = document.getElementById('trainer-name');
    const phoneInput = document.getElementById('trainer-phone');
    const specialtyInput = document.getElementById('trainer-specialty');
    const statusSelect = document.getElementById('trainer-status');
    
    if (!nameInput || !phoneInput || !specialtyInput) return;
    
    const trainerData = {
      name: nameInput.value.trim(),
      phone: phoneInput.value.trim(),
      specialty: specialtyInput.value.trim(),
      status: statusSelect ? statusSelect.value : 'Active'
    };
    
    if (!trainerData.name || !trainerData.phone || !trainerData.specialty) {
      alert('Please fill all fields');
      return;
    }
    
    if (!/^\d{10}$/.test(trainerData.phone)) {
      alert('Please enter a valid 10-digit phone number');
      return;
    }
    
    try {
      const res = await fetch(TRAINER_API_URL, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(trainerData)
      });
      
      if (res.ok) {
        alert('✅ Trainer added successfully!');
        const modal = document.getElementById('add-trainer-modal');
        if (modal) modal.style.display = 'none';
        
        // Reset form
        const form = document.getElementById('add-trainer-form');
        if (form) form.reset();
        
        await loadTrainers();
      } else {
        const error = await res.json();
        alert('Failed to add trainer: ' + (error.error || error.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Add trainer error:', err);
      alert('Error adding trainer: ' + err.message);
    }
  }
});

// Cancel button handler for trainer modal
document.addEventListener('click', (e) => {
  if (e.target.id === 'cancel-trainer-btn') {
    const modal = document.getElementById('add-trainer-modal');
    if (modal) modal.style.display = 'none';
  }
});

// Add logout button and user info to sidebar
function addUserInterface() {
  const user = getCurrentUser();
  if (user && user.name) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      // Check if user info already exists
      if (!sidebar.querySelector('.user-info')) {
        // Add user info at the top of sidebar
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        userInfo.innerHTML = `
          <div class="user-name">👤 ${escapeHtml(user.name)}</div>
          <div class="user-role">${user.role === 'admin' ? 'Administrator' : 'Staff Member'}</div>
        `;
        userInfo.style.cssText = `
          padding: 15px;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #7B61FF20, #7B61FF10);
          border-radius: 12px;
          text-align: center;
          border: 1px solid #7B61FF30;
        `;
        sidebar.insertBefore(userInfo, sidebar.firstChild);
      }
      
      // Add logout button at bottom if not exists
      if (!sidebar.querySelector('.logout-btn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.innerHTML = '🚪 Logout';
        logoutBtn.className = 'logout-btn';
        logoutBtn.style.cssText = `
          margin-top: 20px;
          width: 100%;
          padding: 12px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.3s;
        `;
        logoutBtn.onmouseover = () => logoutBtn.style.background = '#c82333';
        logoutBtn.onmouseout = () => logoutBtn.style.background = '#dc3545';
        logoutBtn.onclick = logout;
        sidebar.appendChild(logoutBtn);
      }
    }
  }
}

// ==================== PAYMENT FUNCTIONS ====================
async function loadPaymentReminders() {
  try {
    const res = await fetch(`${BASE_URL}/payment-reminders`, {
      headers: getAuthHeaders()
    });
    
    if (!res.ok) {
      const reminderContainer = document.getElementById('payment-reminders-container');
      if (reminderContainer) {
        reminderContainer.innerHTML = '<p style="text-align:center; color:#666;">Payment reminders feature coming soon</p>';
      }
      return;
    }
    
    const data = await res.json();
    const reminderContainer = document.getElementById('payment-reminders-container');
    if (!reminderContainer) return;
    
    if (data.dueCount === 0) {
      reminderContainer.innerHTML = '<p style="text-align:center; color:#4CAF50;">✅ No pending payments! All members are up to date.</p>';
    } else {
      reminderContainer.innerHTML = `
        <div class="payment-reminder-card" style="padding:15px; background:#fff3cd; border-left:4px solid #ffc107; border-radius:8px;">
          <h4 style="margin:0 0 10px 0;">⚠️ Payment Reminders</h4>
          <p><strong>${data.dueCount}</strong> members have pending payments</p>
          <button onclick="showDueMembers()" class="small-btn" style="padding:8px 16px; background:#7B61FF; color:white; border:none; border-radius:6px; cursor:pointer;">View Details</button>
        </div>
      `;
    }
  } catch (err) {
    console.error('Payment reminders error:', err);
  }
}

async function showDueMembers() {
  try {
    const res = await fetch(`${BASE_URL}/payment-reminders`, {
      headers: getAuthHeaders()
    });
    
    if (!res.ok) throw new Error('Failed to load payment data');
    
    const data = await res.json();
    let message = '📋 PENDING PAYMENTS:\n\n';
    if (data.dueMembers && data.dueMembers.length > 0) {
      data.dueMembers.forEach(m => {
        const dueDate = new Date(m.expiryDate).toLocaleDateString();
        message += `${m.name} - Due on ${dueDate}\n`;
      });
      alert(message);
    } else {
      alert('No pending payments!');
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Unable to load payment details');
  }
}

async function showMonthlyDue(memberId, memberName) {
  try {
    const res = await fetch(`${BASE_URL}/monthly-due/${memberId}`, {
      headers: getAuthHeaders()
    });
    
    if (!res.ok) throw new Error('Failed to load monthly due');
    
    const data = await res.json();
    const status = data.isOverdue ? '⚠️ OVERDUE' : '✅ Up to Date';
    alert(`📊 MONTHLY DUE SUMMARY\nMember: ${data.memberName}\nMonthly Amount: ₹${data.monthlyAmount}\nStatus: ${status}\nNext Due Date: ${new Date(data.nextDueDate).toLocaleDateString()}`);
  } catch (err) {
    console.error('Error:', err);
    alert('Monthly due calculation will be available soon');
  }
}

// ==================== PAYMENT MODAL ====================
function showPaymentQR(member) {
  const paymentModal = document.getElementById('payment-modal');
  if (!paymentModal) return;
  
  const amountMap = {
    '1 Month Strength': 1000, '1 Month Strength + Cardio': 1500,
    '3 Months Strength': 2700, '3 Months Strength + Cardio': 4000,
    '6 Months Strength': 5000, '6 Months Strength + Cardio': 7500,
    '1 Year Strength': 9000, '1 Year Strength + Cardio': 14000
  };

  const amount = amountMap[member.plan] || 1000;
  
  const memberInfoEl = document.getElementById('payment-member-info');
  const amountEl = document.getElementById('payment-amount');
  const qrCodeEl = document.getElementById('qr-code');
  
  if (memberInfoEl) memberInfoEl.textContent = `${member.name} - ${member.plan}`;
  if (amountEl) amountEl.textContent = `₹${amount.toLocaleString('en-IN')}`;
  
  const upiId = '8688631823-2@ybl';
  const upiUrl = `upi://pay?pa=${upiId}&pn=VR%20Fitness&am=${amount}&cu=INR`;
  if (qrCodeEl) {
    qrCodeEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;
  }

  paymentModal.style.display = 'flex';
  
  const paymentDoneBtn = document.getElementById('payment-done-btn');
  if (paymentDoneBtn) {
    paymentDoneBtn.onclick = () => {
      paymentModal.style.display = 'none';
      alert(`✅ Payment confirmed for ${member.name}!\nMembership activated successfully.`);
      loadDashboard();
    };
  }
}

// ==================== CAMERA FUNCTIONALITY ====================
let currentStream = null;

function setupCamera() {
  const openCameraBtn = document.getElementById('open-camera-btn');
  const cameraModal = document.getElementById('camera-modal');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const capturePhotoBtn = document.getElementById('capture-photo-btn');
  const closeCameraBtn = document.getElementById('close-camera-btn');
  const uploadPhotoBtn = document.getElementById('upload-photo-btn');
  const photoUpload = document.getElementById('photo-upload');
  const clearPhotoBtn = document.getElementById('clear-photo-btn');
  const memberPhotoPreview = document.getElementById('member-photo-preview');
  const photoDataInput = document.getElementById('photo-data');

  if (openCameraBtn) {
    openCameraBtn.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        currentStream = stream;
        if (cameraVideo) cameraVideo.srcObject = stream;
        if (cameraModal) cameraModal.style.display = 'flex';
      } catch (err) {
        alert('Unable to access camera. Please use Upload Photo option.');
        console.error(err);
      }
    });
  }

  if (capturePhotoBtn && cameraVideo && cameraCanvas) {
    capturePhotoBtn.addEventListener('click', () => {
      const context = cameraCanvas.getContext('2d');
      cameraCanvas.width = cameraVideo.videoWidth;
      cameraCanvas.height = cameraVideo.videoHeight;
      context.drawImage(cameraVideo, 0, 0);
      
      const photoData = cameraCanvas.toDataURL('image/jpeg', 0.7);
      if (memberPhotoPreview) memberPhotoPreview.src = photoData;
      if (photoDataInput) photoDataInput.value = photoData;
      if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-block';
      if (cameraModal) cameraModal.style.display = 'none';
      if (currentStream) currentStream.getTracks().forEach(track => track.stop());
    });
  }

  if (closeCameraBtn && cameraModal) {
    closeCameraBtn.addEventListener('click', () => {
      cameraModal.style.display = 'none';
      if (currentStream) currentStream.getTracks().forEach(track => track.stop());
    });
  }

  if (uploadPhotoBtn && photoUpload) {
    uploadPhotoBtn.addEventListener('click', () => photoUpload.click());
    photoUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (memberPhotoPreview) memberPhotoPreview.src = event.target.result;
          if (photoDataInput) photoDataInput.value = event.target.result;
          if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (clearPhotoBtn) {
    clearPhotoBtn.addEventListener('click', () => {
      if (memberPhotoPreview) memberPhotoPreview.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='%237B61FF'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
      if (photoDataInput) photoDataInput.value = '';
      if (clearPhotoBtn) clearPhotoBtn.style.display = 'none';
      if (photoUpload) photoUpload.value = '';
    });
  }
}

// ==================== PLAN SELECTION ====================
function setupPlanSelection() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('select-plan-btn')) {
      const planCard = e.target.closest('.plan-card');
      if (!planCard) return;
      
      const selectedPlanCode = planCard.getAttribute('data-plan');
      const modal = document.getElementById('add-member-modal');
      if (modal) modal.style.display = 'flex';
      
      const planSelect = document.getElementById('plan');
      if (planSelect) {
        const planMap = {
          '1M-Strength': '1 Month Strength',
          '1M-Strength-Cardio': '1 Month Strength + Cardio',
          '3M-Strength': '3 Months Strength',
          '3M-Strength-Cardio': '3 Months Strength + Cardio',
          '6M-Strength': '6 Months Strength',
          '6M-Strength-Cardio': '6 Months Strength + Cardio',
          '1Y-Strength': '1 Year Strength',
          '1Y-Strength-Cardio': '1 Year Strength + Cardio'
        };
        planSelect.value = planMap[selectedPlanCode] || selectedPlanCode;
      }

      const expiryInput = document.getElementById('expiryDate');
      if (expiryInput) {
        const today = new Date();
        if (selectedPlanCode.includes('1M')) today.setMonth(today.getMonth() + 1);
        else if (selectedPlanCode.includes('3M')) today.setMonth(today.getMonth() + 3);
        else if (selectedPlanCode.includes('6M')) today.setMonth(today.getMonth() + 6);
        else if (selectedPlanCode.includes('1Y')) today.setFullYear(today.getFullYear() + 1);
        expiryInput.value = today.toISOString().split('T')[0];
      }
    }
  });
}

// ==================== ADD MEMBER FORM ====================
function setupAddMemberForm() {
  const modal = document.getElementById('add-member-modal');
  const form = document.getElementById('add-member-form');
  const addMemberBtn = document.getElementById('add-member-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  if (addMemberBtn && modal) {
    addMemberBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      if (form) form.reset();
      const expiryInput = document.getElementById('expiryDate');
      if (expiryInput) {
        const today = new Date();
        today.setMonth(today.getMonth() + 1);
        expiryInput.value = today.toISOString().split('T')[0];
      }
    });
  }

  if (cancelBtn && modal) {
    cancelBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  // Health conditions add button
  const addConditionBtn = document.getElementById('add-condition-btn');
  if (addConditionBtn) {
    addConditionBtn.addEventListener('click', () => {
      const container = document.getElementById('health-conditions-container');
      if (!container) return;
      
      const newRow = document.createElement('div');
      newRow.className = 'condition-row';
      newRow.style.display = 'flex';
      newRow.style.gap = '10px';
      newRow.style.marginBottom = '10px';
      newRow.innerHTML = `
        <select class="condition-type" style="width: 35%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
          <option value="">Select Condition</option>
          <option value="Diabetes">Diabetes</option>
          <option value="Asthma">Asthma</option>
          <option value="High Blood Pressure">High Blood Pressure</option>
          <option value="Heart Condition">Heart Condition</option>
          <option value="Other">Other</option>
        </select>
        <select class="condition-severity" style="width: 25%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
          <option value="Mild">Mild</option>
          <option value="Moderate">Moderate</option>
          <option value="Severe">Severe</option>
        </select>
        <input type="text" class="condition-notes" placeholder="Notes" style="width: 30%; padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
        <button type="button" class="remove-condition" onclick="this.parentElement.remove()" style="background: #dc3545; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer;">❌</button>
      `;
      container.appendChild(newRow);
    });
  }

  // Form submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const healthConditions = [];
      document.querySelectorAll('.condition-row').forEach(row => {
        const condition = row.querySelector('.condition-type')?.value;
        if (condition) {
          healthConditions.push({
            condition: condition,
            severity: row.querySelector('.condition-severity')?.value || 'Mild',
            notes: row.querySelector('.condition-notes')?.value || ''
          });
        }
      });
      
      const nameInput = document.getElementById('name');
      const phoneInput = document.getElementById('phone');
      const planSelect = document.getElementById('plan');
      
      const newMember = {
        name: nameInput?.value.trim(),
        phone: phoneInput?.value.trim(),
        email: document.getElementById('email')?.value.trim(),
        age: parseInt(document.getElementById('age')?.value) || null,
        photo: document.getElementById('photo-data')?.value || '',
        healthConditions: healthConditions,
        medicalNotes: document.getElementById('medicalNotes')?.value.trim() || '',
        emergencyContact: {
          name: document.getElementById('emergency-name')?.value.trim() || '',
          phone: document.getElementById('emergency-phone')?.value.trim() || '',
          relationship: document.getElementById('emergency-relationship')?.value.trim() || ''
        },
        plan: planSelect?.value,
        expiryDate: document.getElementById('expiryDate')?.value,
        status: document.getElementById('status')?.value || 'Active'
      };

      if (!newMember.name || !newMember.phone || !newMember.plan) {
        alert('Please fill all required fields');
        return;
      }

      if (!/^\d{10}$/.test(newMember.phone)) {
        alert('Please enter a valid 10-digit phone number');
        return;
      }

      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(newMember)
        });

        if (res.ok) {
          const addedMember = await res.json();
          if (modal) modal.style.display = 'none';
          
          const clearPhotoBtn = document.getElementById('clear-photo-btn');
          if (clearPhotoBtn) clearPhotoBtn.click();
          
          form.reset();
          showPaymentQR(addedMember);
          await loadDashboard();
          await loadMembers();
          await loadAllMembers();
          await loadPaymentReminders();
          alert(`✅ Member ${addedMember.name} added successfully!`);
        } else {
          const error = await res.json();
          alert('Error adding member: ' + (error.message || error.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error adding member: ' + err.message);
        console.error(err);
      }
    });
  }
}

// Mark all present button
const markAllPresentBtn = document.getElementById('mark-all-present');
if (markAllPresentBtn) {
  markAllPresentBtn.addEventListener('click', async () => {
    const dateInput = document.getElementById('attendance-date');
    if (!dateInput) return;
    
    const date = dateInput.value;
    if (!confirm('Mark ALL active members as Present for ' + new Date(date).toLocaleDateString() + '?')) return;

    try {
      const res = await fetch(API_URL, {
        headers: getAuthHeaders()
      });
      
      if (!res.ok) throw new Error('Failed to load members');
      
      let members = await res.json();
      members = members.filter(m => m.status === 'Active' || m.status === 'Trial');

      let successCount = 0;
      for (let m of members) {
        const attendanceRes = await fetch(`${BASE_URL}/attendance`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ memberId: m._id, date, status: 'Present' })
        });
        if (attendanceRes.ok) successCount++;
      }
      
      alert(`${successCount} out of ${members.length} members marked Present!`);
      await loadAttendance(date);
    } catch (err) {
      alert('Error occurred: ' + err.message);
      console.error(err);
    }
  });
}

// ==================== NAVIGATION ====================
function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const page = link.getAttribute('data-page');
      const pageTitle = document.getElementById('page-title');
      if (pageTitle) {
        pageTitle.textContent = page === 'dashboard' ? 'Management Dashboard' : page.charAt(0).toUpperCase() + page.slice(1);
      }

      const sections = ['dashboard-content', 'members-content', 'plans-content', 'attendance-content', 'trainers-content', 'other-pages'];
      sections.forEach(section => {
        const el = document.getElementById(section);
        if (el) el.style.display = 'none';
      });

      if (page === 'dashboard') {
        const dashboardContent = document.getElementById('dashboard-content');
        if (dashboardContent) dashboardContent.style.display = 'block';
        await loadDashboard();
        await loadMembers();
        await loadPaymentReminders();
      } else if (page === 'members') {
        const membersContent = document.getElementById('members-content');
        if (membersContent) membersContent.style.display = 'block';
        await loadAllMembers();
      } else if (page === 'plans') {
        const plansContent = document.getElementById('plans-content');
        if (plansContent) plansContent.style.display = 'block';
      } else if (page === 'attendance') {
        const attendanceContent = document.getElementById('attendance-content');
        if (attendanceContent) attendanceContent.style.display = 'block';
        await loadAttendance();
        
        const dateInput = document.getElementById('attendance-date');
        if (dateInput && !dateInput.hasListener) {
          dateInput.addEventListener('change', () => loadAttendance());
          dateInput.hasListener = true;
        }
      } else if (page === 'trainers') {
        const trainersContent = document.getElementById('trainers-content');
        if (trainersContent) trainersContent.style.display = 'block';
        await loadTrainers();
      } else {
        const otherPages = document.getElementById('other-pages');
        if (otherPages) otherPages.style.display = 'block';
      }
    });
  });
}

// Delete all members button
const deleteAllMembersBtn = document.getElementById('delete-all-members-btn');
if (deleteAllMembersBtn) {
  deleteAllMembersBtn.addEventListener('click', deleteAllMembers);
}

// Close modals when clicking outside
window.addEventListener('click', (e) => {
  const addMemberModal = document.getElementById('add-member-modal');
  const paymentModal = document.getElementById('payment-modal');
  const addTrainerModal = document.getElementById('add-trainer-modal');
  const cameraModal = document.getElementById('camera-modal');
  
  if (e.target === addMemberModal && addMemberModal) addMemberModal.style.display = 'none';
  if (e.target === paymentModal && paymentModal) paymentModal.style.display = 'none';
  if (e.target === addTrainerModal && addTrainerModal) addTrainerModal.style.display = 'none';
  if (e.target === cameraModal && cameraModal) {
    cameraModal.style.display = 'none';
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());
  }
});

// ==================== INITIALIZATION ====================
window.onload = async () => {
  // Check authentication first
  if (!checkAuth()) return;
  
  console.log('App initializing...');
  
  // Setup all features
  addUserInterface();
  setupNavigation();
  setupTrainerModal();
  setupCamera();
  setupPlanSelection();
  setupAddMemberForm();
  
  // Load initial data
  await loadDashboard();
  await loadMembers();
  await loadTrainers();
  await loadPaymentReminders();
  
  // Set default attendance date
  const dateInput = document.getElementById('attendance-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
};
