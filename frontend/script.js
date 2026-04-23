const API_URL = 'http://localhost:5000/api/members';
const TRAINER_API_URL = 'http://localhost:5000/api/trainers';

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
    return JSON.parse(userStr);
  }
  return null;
}

// Logout function
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

// ==================== DASHBOARD FUNCTIONS ====================
async function loadDashboard() {
  try {
    const res = await fetch(`${API_URL}/stats`, {
      headers: getAuthHeaders()
    });
    
    if (res.status === 401) {
      logout();
      return;
    }
    
    const stats = await res.json();

    const totalMembersEl = document.getElementById('total-members');
    const activeTodayEl = document.getElementById('active-today');
    const estimatedRevenueEl = document.getElementById('estimated-revenue');
    
    if (totalMembersEl) totalMembersEl.textContent = stats.totalMembers || 0;
    if (activeTodayEl) activeTodayEl.textContent = stats.activeToday || 0;
    
    const revenue = Number(stats.estimatedRevenue) || 0;
    if (estimatedRevenueEl) estimatedRevenueEl.textContent = `₹${revenue.toLocaleString('en-IN')}`;
  } catch (e) { 
    console.error('Dashboard error:', e); 
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
    
    const members = await res.json();
    const tbody = document.querySelector('#members-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (members.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#777;">No members found. Add your first member!</td></tr>`;
      return;
    }

    members.slice(0, 8).forEach(m => {
      const photoHtml = m.photo && m.photo.startsWith('data:image') ? 
        `<img src="${m.photo}" class="member-photo" style="width:40px; height:40px; margin-right:10px;">` : 
        `<span class="avatar" style="width:40px; height:40px; font-size:1rem; margin-right:10px;">${m.name.charAt(0).toUpperCase()}</span>`;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div style="display: flex; align-items: center;">
            ${photoHtml}
            <div>
              <strong>${m.name}</strong><br>
              <small>${m.phone}</small>
            </div>
          </div>
         </td>
         <td>${m.plan}</td>
         <td>${new Date(m.joinDate).toLocaleDateString('en-IN')}</td>
         <td>${new Date(m.expiryDate).toLocaleDateString('en-IN')}</td>
         <td><span class="status ${m.status.toLowerCase()}">${m.status}</span></td>
         <td>
          <button class="delete-member-btn" onclick="deleteMember('${m._id}', '${m.name.replace(/'/g, "\\'")}')">
            🗑️ Delete
          </button>
         </td>
      `;
      tbody.appendChild(row);
    });
  } catch (e) { 
    console.error('Load members error:', e); 
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
    
    const members = await res.json();
    const tbody = document.querySelector('#all-members-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (members.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;">No members found. Add your first member!</td></tr>`;
      return;
    }

    members.forEach(m => {
      let healthBadges = '';
      if (m.healthConditions && m.healthConditions.length > 0) {
        healthBadges = m.healthConditions.map(h => 
          `<span class="health-badge">${h.condition} (${h.severity})</span>`
        ).join('');
      }
      
      const ageDisplay = m.age ? `${m.age} yrs` : 'N/A';
      const photoHtml = m.photo && m.photo.startsWith('data:image') ? 
        `<img src="${m.photo}" class="member-photo" alt="${m.name}">` : 
        `<div class="avatar" style="width:45px; height:45px; font-size:1.2rem; margin:0;">${m.name.charAt(0).toUpperCase()}</div>`;
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="text-align:center;">${photoHtml}</td>
        <td><strong>${m.name}</strong><br><small>Age: ${ageDisplay}</small></td>
        <td>${m.phone}<br><small>${m.email || ''}</small></td>
        <td>${m.plan}</td>
        <td>${new Date(m.expiryDate).toLocaleDateString('en-IN')}</td>
        <td>${healthBadges || '-'}</td>
        <td><span class="status ${m.status.toLowerCase()}">${m.status}</span></td>
        <td>
          <button class="small-btn" onclick="showMonthlyDue('${m._id}', '${m.name.replace(/'/g, "\\'")}')">💰 Due</button>
          <button class="delete-member-btn" onclick="deleteMember('${m._id}', '${m.name.replace(/'/g, "\\'")}')">🗑️ Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (e) { 
    console.error('Load all members error:', e); 
  }
}

// ==================== ATTENDANCE FUNCTIONS ====================
async function loadAttendance(selectedDate = null) {
  const dateInput = document.getElementById('attendance-date');
  if (!dateInput) return;
  
  const date = selectedDate || dateInput.value || new Date().toISOString().split('T')[0];
  dateInput.value = date;

  try {
    const statsRes = await fetch(`${API_URL}/attendance/stats/${date}`, {
      headers: getAuthHeaders()
    });
    
    if (statsRes.status === 401) {
      logout();
      return;
    }
    
    const stats = await statsRes.json();

    const totalActiveEl = document.getElementById('total-active');
    const presentCountEl = document.getElementById('present-count');
    const percentageEl = document.getElementById('attendance-percentage');
    
    if (totalActiveEl) totalActiveEl.textContent = stats.totalActive || 0;
    if (presentCountEl) presentCountEl.textContent = stats.presentCount || 0;
    if (percentageEl) percentageEl.textContent = (stats.attendancePercentage || 0) + '%';

    const res = await fetch(`${API_URL}/attendance/${date}`, {
      headers: getAuthHeaders()
    });
    const attendances = await res.json();

    const tbody = document.querySelector('#attendance-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const membersRes = await fetch(API_URL, {
      headers: getAuthHeaders()
    });
    let members = await membersRes.json();
    members = members.filter(m => m.status === 'Active' || m.status === 'Trial');

    if (members.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#777;">No active members found.</td></tr>`;
      return;
    }

    members.forEach(member => {
      const existing = attendances.find(a => a.memberId && (a.memberId._id || a.memberId) === member._id);
      const currentStatus = existing ? existing.status : 'Absent';
      const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="avatar">${initials}</span> <strong>${member.name}</strong></td>
        <td>${member.plan}</td>
        <td>${member.phone}</td>
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
  }
}

window.markAttendance = async function(memberId, date, status) {
  try {
    await fetch(`${API_URL}/attendance`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ memberId, date, status })
    });
    loadAttendance(date);
  } catch (err) {
    alert('Failed to mark attendance');
    console.error(err);
  }
};

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
      let members = await res.json();
      members = members.filter(m => m.status === 'Active' || m.status === 'Trial');

      for (let m of members) {
        await fetch(`${API_URL}/attendance`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ memberId: m._id, date, status: 'Present' })
        });
      }
      alert('All members marked Present!');
      loadAttendance(date);
    } catch (err) {
      alert('Error occurred');
      console.error(err);
    }
  });
}

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
      loadDashboard();
      loadMembers();
      loadAllMembers();
      if (document.getElementById('attendance-content') && document.getElementById('attendance-content').style.display === 'block') {
        loadAttendance();
      }
    } else {
      alert(`❌ Failed to delete`);
    }
  } catch (err) {
    alert('❌ Error deleting member. Please try again.');
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
    loadDashboard();
    loadMembers();
    loadAllMembers();
    if (document.getElementById('attendance-content') && document.getElementById('attendance-content').style.display === 'block') {
      loadAttendance();
    }
  } catch (err) {
    alert('❌ Error deleting members.');
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

    if (trainers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:60px;color:#777;">No trainers added yet. Click "Add New Trainer" to get started.</td></tr>`;
      return;
    }

    trainers.forEach(trainer => {
      const initials = trainer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <span class="avatar">${initials}</span>
          <strong>${trainer.name}</strong>
        </td>
        <td>${trainer.specialty}</td>
        <td>${trainer.phone}</td>
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
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:60px;color:#dc3545;">Error loading trainers. Please refresh the page.</td></tr>`;
    }
  }
}

// Edit Trainer
window.editTrainer = async function(id) {
  try {
    const res = await fetch(`${TRAINER_API_URL}/${id}`, {
      headers: getAuthHeaders()
    });
    const trainer = await res.json();
    
    const newName = prompt("Edit name:", trainer.name);
    if (!newName) return;
    const newPhone = prompt("Edit phone:", trainer.phone);
    if (!newPhone) return;
    const newSpecialty = prompt("Edit specialty:", trainer.specialty);
    if (!newSpecialty) return;
    const newStatus = prompt("Edit status (Active/Inactive):", trainer.status);
    
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
      loadTrainers();
    } else {
      alert("Error updating trainer");
    }
  } catch (err) {
    console.error('Edit error:', err);
    alert("Error editing trainer");
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
      loadTrainers();
    } else {
      alert("Error deleting trainer");
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert("Error deleting trainer");
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

  addTrainerBtn.addEventListener('click', () => {
    console.log('Add trainer button clicked');
    let modal = document.getElementById('add-trainer-modal');
    if (!modal) {
      const html = `
        <div id="add-trainer-modal" class="modal">
          <div class="modal-content">
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
              <div class="modal-buttons">
                <button type="button" id="cancel-trainer-btn" class="cancel-btn">Cancel</button>
                <button type="submit" class="submit-btn">Add Trainer</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      modal = document.getElementById('add-trainer-modal');
    }
    modal.style.display = 'flex';
  });

  // Handle form submission
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'add-trainer-form') {
      e.preventDefault();
      console.log('Trainer form submitted');
      
      const trainerData = {
        name: document.getElementById('trainer-name').value.trim(),
        phone: document.getElementById('trainer-phone').value.trim(),
        specialty: document.getElementById('trainer-specialty').value.trim(),
        status: document.getElementById('trainer-status').value
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
          document.getElementById('add-trainer-form').reset();
          loadTrainers();
        } else {
          const error = await res.json();
          alert('Failed to add trainer: ' + (error.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('Add trainer error:', err);
        alert('Error adding trainer');
      }
    }
  });

  // Cancel button handler
  document.addEventListener('click', (e) => {
    if (e.target.id === 'cancel-trainer-btn') {
      const modal = document.getElementById('add-trainer-modal');
      if (modal) modal.style.display = 'none';
    }
  });
}

// Add logout button and user info to sidebar
function addUserInterface() {
  const user = getCurrentUser();
  if (user && user.name) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      // Add user info at the top of sidebar
      const userInfo = document.createElement('div');
      userInfo.className = 'user-info';
      userInfo.innerHTML = `
        <div class="user-name">👤 ${user.name}</div>
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
      
      // Add logout button at bottom
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

// ==================== PAYMENT FUNCTIONS ====================
async function loadPaymentReminders() {
  try {
    const res = await fetch(`${API_URL}/payment-reminders`, {
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
        <div class="payment-reminder-card">
          <h4>⚠️ Payment Reminders</h4>
          <p><strong>${data.dueCount}</strong> members have pending payments</p>
          <button onclick="showDueMembers()" class="small-btn">View Details</button>
        </div>
      `;
    }
  } catch (err) {
    console.error('Payment reminders error:', err);
  }
}

async function showDueMembers() {
  try {
    const res = await fetch(`${API_URL}/payment-reminders`, {
      headers: getAuthHeaders()
    });
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
    const res = await fetch(`${API_URL}/monthly-due/${memberId}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to load');
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
  document.getElementById('payment-member-info').textContent = `${member.name} - ${member.plan}`;
  document.getElementById('payment-amount').textContent = `₹${amount.toLocaleString('en-IN')}`;
  
  const upiId = '8688631823-2@ybl';
  const upiUrl = `upi://pay?pa=${upiId}&pn=VR%20Fitness&am=${amount}&cu=INR`;
  document.getElementById('qr-code').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;

  paymentModal.style.display = 'flex';
  document.getElementById('payment-done-btn').onclick = () => {
    paymentModal.style.display = 'none';
    alert(`✅ Payment confirmed for ${member.name}!\nMembership activated successfully.`);
    loadDashboard();
  };
}

// ==================== CAMERA FUNCTIONALITY ====================
let currentStream = null;

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
    }
  });
}

if (capturePhotoBtn) {
  capturePhotoBtn.addEventListener('click', () => {
    if (cameraVideo && cameraCanvas) {
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
    }
  });
}

if (closeCameraBtn) {
  closeCameraBtn.addEventListener('click', () => {
    if (cameraModal) cameraModal.style.display = 'none';
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

// ==================== PLAN SELECTION ====================
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

// ==================== ADD MEMBER FORM ====================
const modal = document.getElementById('add-member-modal');
const form = document.getElementById('add-member-form');
const addMemberBtn = document.getElementById('add-member-btn');
const cancelBtn = document.getElementById('cancel-btn');

if (addMemberBtn) {
  addMemberBtn.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
    if (form) form.reset();
    const expiryInput = document.getElementById('expiryDate');
    if (expiryInput) {
      const today = new Date();
      today.setMonth(today.getMonth() + 1);
      expiryInput.value = today.toISOString().split('T')[0];
    }
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });
}

// Health conditions add button
document.addEventListener('DOMContentLoaded', () => {
  const addConditionBtn = document.getElementById('add-condition-btn');
  if (addConditionBtn) {
    addConditionBtn.addEventListener('click', () => {
      const container = document.getElementById('health-conditions-container');
      const newRow = document.createElement('div');
      newRow.className = 'condition-row';
      newRow.innerHTML = `
        <select class="condition-type" style="width: 35%;"><option value="">Select Condition</option><option value="Diabetes">Diabetes</option><option value="Asthma">Asthma</option><option value="High Blood Pressure">High Blood Pressure</option><option value="Heart Condition">Heart Condition</option><option value="Other">Other</option></select>
        <select class="condition-severity" style="width: 25%;"><option value="Mild">Mild</option><option value="Moderate">Moderate</option><option value="Severe">Severe</option></select>
        <input type="text" class="condition-notes" placeholder="Notes" style="width: 30%;">
        <button type="button" class="remove-condition" onclick="this.parentElement.remove()">❌</button>
      `;
      container.appendChild(newRow);
    });
  }
});

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
    
    const newMember = {
      name: document.getElementById('name')?.value.trim(),
      phone: document.getElementById('phone')?.value.trim(),
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
      plan: document.getElementById('plan')?.value,
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
        if (clearPhotoBtn) clearPhotoBtn.click();
        form.reset();
        showPaymentQR(addedMember);
        loadDashboard();
        loadMembers();
        loadAllMembers();
        loadPaymentReminders();
        alert(`✅ Member ${addedMember.name} added successfully!`);
      } else {
        const error = await res.json();
        alert('Error adding member: ' + (error.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Error adding member: ' + err.message);
    }
  });
}

// ==================== NAVIGATION ====================
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    const page = link.getAttribute('data-page');
    document.getElementById('page-title').textContent = page === 'dashboard' ? 'Management Dashboard' : page.charAt(0).toUpperCase() + page.slice(1);

    const sections = ['dashboard-content', 'members-content', 'plans-content', 'attendance-content', 'trainers-content', 'other-pages'];
    sections.forEach(section => {
      const el = document.getElementById(section);
      if (el) el.style.display = 'none';
    });

    if (page === 'dashboard') {
      document.getElementById('dashboard-content').style.display = 'block';
      loadDashboard();
      loadMembers();
      loadPaymentReminders();
    } else if (page === 'members') {
      document.getElementById('members-content').style.display = 'block';
      loadAllMembers();
    } else if (page === 'plans') {
      document.getElementById('plans-content').style.display = 'block';
    } else if (page === 'attendance') {
      document.getElementById('attendance-content').style.display = 'block';
      loadAttendance();
      const dateInput = document.getElementById('attendance-date');
      if (dateInput && !dateInput.hasListener) {
        dateInput.addEventListener('change', () => loadAttendance());
        dateInput.hasListener = true;
      }
    } else if (page === 'trainers') {
      document.getElementById('trainers-content').style.display = 'block';
      loadTrainers();
    } else {
      document.getElementById('other-pages').style.display = 'block';
    }
  });
});

// Delete all members button
document.getElementById('delete-all-members-btn')?.addEventListener('click', deleteAllMembers);

// Close modals when clicking outside
window.addEventListener('click', (e) => {
  if (e.target === document.getElementById('add-member-modal')) document.getElementById('add-member-modal').style.display = 'none';
  if (e.target === document.getElementById('payment-modal')) document.getElementById('payment-modal').style.display = 'none';
  if (e.target === document.getElementById('add-trainer-modal')) document.getElementById('add-trainer-modal').style.display = 'none';
  if (e.target === document.getElementById('camera-modal')) {
    document.getElementById('camera-modal').style.display = 'none';
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());
  }
});

// ==================== INITIALIZATION ====================
window.onload = () => {
  // Check authentication first
  if (!checkAuth()) return;
  
  console.log('App initializing...');
  addUserInterface();
  loadDashboard();
  loadMembers();
  loadTrainers();
  loadPaymentReminders();
  setupTrainerModal();
  const dateInput = document.getElementById('attendance-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
};