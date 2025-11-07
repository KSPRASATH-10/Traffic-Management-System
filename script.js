// API Base URL
const API_BASE_URL = 'http://localhost:5000/api';

// Current user data
let currentUser = null;

// ==================== AUTHENTICATION FUNCTIONS ====================

async function checkAuthentication() {
    // Skip auth check on login page and root
    const currentPath = window.location.pathname;
    console.log('Current path:', currentPath);
    
    if (currentPath === '/' || currentPath === '/login.html' || currentPath.includes('login.html')) {
        console.log('Skipping auth check for login page');
        return Promise.resolve();
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/check`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            // Not authenticated, redirect to login
            console.log('Not authenticated (status:', response.status, '), redirecting to login...');
            window.location.href = '/login.html';
            return Promise.reject('Not authenticated');
        }
        
        const data = await response.json();
        currentUser = data.user;
        console.log('Authenticated as:', currentUser);
        
        // Update UI with user info
        updateUserUI();
        return Promise.resolve();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
        return Promise.reject(error);
    }
}

function updateUserUI() {
    // Add user info to navbar
    const navbar = document.querySelector('.nav-container');
    if (navbar && currentUser) {
        // Remove existing user info if present
        const existingUserInfo = document.querySelector('.user-info');
        if (existingUserInfo) {
            existingUserInfo.remove();
        }
        
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        userInfo.style.cssText = 'display: flex; align-items: center; gap: 1rem; color: white;';
        
        const roleBadge = currentUser.role === 'admin' ? 
            '<span style="background: #10b981; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.875rem;">Admin</span>' :
            '<span style="background: #3b82f6; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.875rem;">Officer</span>';
        
        userInfo.innerHTML = `
            <span style="font-weight: 500;">${currentUser.name}</span>
            ${roleBadge}
            <button onclick="logout()" class="btn btn-small" style="background: #ef4444; color: white; padding: 0.5rem 1rem;">Logout</button>
        `;
        
        navbar.appendChild(userInfo);
        
        // Hide delete buttons for non-admin users
        if (currentUser.role !== 'admin') {
            hideDeleteButtons();
        }
    }
}

function hideDeleteButtons() {
    // This will be called after tables are loaded
    setTimeout(() => {
        const deleteButtons = document.querySelectorAll('.btn-danger');
        deleteButtons.forEach(btn => {
            if (btn.textContent === 'Delete') {
                btn.style.display = 'none';
            }
        });
    }, 500);
}

async function logout() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/login.html';
    }
}

// Utility Functions
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 3000);
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount) {
    return `₹${parseFloat(amount).toLocaleString('en-IN')}`;
}

// ==================== DASHBOARD FUNCTIONS ====================

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        document.getElementById('total-violations').textContent = data.total_violations || 0;
        document.getElementById('total-incidents').textContent = data.active_incidents || 0;
        document.getElementById('parking-zones').textContent = data.parking_zones || 0;
        document.getElementById('total-fines').textContent = formatCurrency(data.total_fines || 0);
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        handleAuthError(error);
    }
}

async function loadRecentViolations() {
    try {
        const response = await fetch(`${API_BASE_URL}/violations?limit=5`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        const container = document.getElementById('recent-violations');
        
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center">No violations found</p>';
            return;
        }
        
        container.innerHTML = data.map(v => `
            <div class="data-item">
                <h4>${v.vehicle_number} - ${v.violation_type}</h4>
                <p>${v.location} | ${formatCurrency(v.fine_amount)} | ${formatDate(v.date)}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading recent violations:', error);
        document.getElementById('recent-violations').innerHTML = '<p class="text-center">Error loading data</p>';
    }
}

async function loadActiveIncidents() {
    try {
        const response = await fetch(`${API_BASE_URL}/incidents?status=Active&limit=5`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        const container = document.getElementById('active-incidents');
        
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center">No active incidents</p>';
            return;
        }
        
        container.innerHTML = data.map(i => `
            <div class="data-item">
                <h4>${i.incident_type} - ${i.severity}</h4>
                <p>${i.location} | Reported by ${i.reported_by} | ${formatDate(i.date)}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading active incidents:', error);
        document.getElementById('active-incidents').innerHTML = '<p class="text-center">Error loading data</p>';
    }
}

// ==================== VIOLATIONS FUNCTIONS ====================

document.addEventListener('DOMContentLoaded', function() {
    const violationForm = document.getElementById('violation-form');
    if (violationForm) {
        violationForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                vehicle_number: document.getElementById('vehicle_number').value.toUpperCase(),
                violation_type: document.getElementById('violation_type').value,
                location: document.getElementById('location').value,
                fine_amount: parseFloat(document.getElementById('fine_amount').value),
                officer_name: document.getElementById('officer_name').value,
                status: document.getElementById('status').value,
                description: document.getElementById('description').value
            };
            
            try {
                const response = await fetch(`${API_BASE_URL}/violations`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert('Violation added successfully!', 'success');
                    violationForm.reset();
                    loadViolations();
                } else {
                    showAlert(result.error || 'Failed to add violation', 'error');
                    handleAuthError(response);
                }
            } catch (error) {
                console.error('Error adding violation:', error);
                showAlert('Error adding violation', 'error');
            }
        });
    }
});

let allViolations = [];

async function loadViolations() {
    try {
        const response = await fetch(`${API_BASE_URL}/violations`, {
            credentials: 'include'
        });
        const data = await response.json();
        allViolations = data;
        
        displayViolations(data);
        
        // Hide delete buttons for non-admin
        if (currentUser && currentUser.role !== 'admin') {
            hideDeleteButtons();
        }
    } catch (error) {
        console.error('Error loading violations:', error);
        document.getElementById('violations-tbody').innerHTML = 
            '<tr><td colspan="8" class="text-center">Error loading violations</td></tr>';
    }
}

function displayViolations(violations) {
    const tbody = document.getElementById('violations-tbody');
    
    if (violations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No violations found</td></tr>';
        return;
    }
    
    tbody.innerHTML = violations.map(v => `
        <tr>
            <td><strong>${v.vehicle_number}</strong></td>
            <td>${v.violation_type}</td>
            <td>${v.location}</td>
            <td>${formatCurrency(v.fine_amount)}</td>
            <td>${v.officer_name}</td>
            <td>${formatDate(v.date)}</td>
            <td><span class="status-badge status-${v.status.toLowerCase()}">${v.status}</span></td>
            <td>
                <button class="btn btn-small btn-primary" onclick="editViolation('${v._id}', '${v.status}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteViolation('${v._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function searchViolations(query) {
    const filtered = allViolations.filter(v => 
        v.vehicle_number.toLowerCase().includes(query.toLowerCase())
    );
    displayViolations(filtered);
}

function editViolation(id, currentStatus) {
    const modal = document.getElementById('edit-modal');
    document.getElementById('edit_id').value = id;
    document.getElementById('edit_status').value = currentStatus;
    modal.classList.add('show');
}

document.addEventListener('DOMContentLoaded', function() {
    const editForm = document.getElementById('edit-violation-form');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const id = document.getElementById('edit_id').value;
            const status = document.getElementById('edit_status').value;
            
            try {
                const response = await fetch(`${API_BASE_URL}/violations/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({ status })
                });
                
                if (response.ok) {
                    showAlert('Violation updated successfully!', 'success');
                    closeModal('edit-modal');
                    loadViolations();
                } else {
                    showAlert('Failed to update violation', 'error');
                    handleAuthError(response);
                }
            } catch (error) {
                console.error('Error updating violation:', error);
                showAlert('Error updating violation', 'error');
            }
        });
    }
});

async function deleteViolation(id) {
    if (currentUser && currentUser.role !== 'admin') {
        showAlert('Only admins can delete violations', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this violation?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/violations/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showAlert('Violation deleted successfully!', 'success');
            loadViolations();
        } else {
            const data = await response.json();
            showAlert(data.message || 'Failed to delete violation', 'error');
            handleAuthError(response);
        }
    } catch (error) {
        console.error('Error deleting violation:', error);
        showAlert('Error deleting violation', 'error');
    }
}

// Similar authentication handling for incidents and parking...
// (Continuing with incidents functions)

document.addEventListener('DOMContentLoaded', function() {
    const incidentForm = document.getElementById('incident-form');
    if (incidentForm) {
        incidentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                incident_type: document.getElementById('incident_type').value,
                severity: document.getElementById('severity').value,
                location: document.getElementById('incident_location').value,
                reported_by: document.getElementById('reported_by').value,
                description: document.getElementById('incident_description').value,
                status: document.getElementById('incident_status').value,
                vehicles_involved: parseInt(document.getElementById('vehicles_involved').value) || 0
            };
            
            try {
                const response = await fetch(`${API_BASE_URL}/incidents`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert('Incident reported successfully!', 'success');
                    incidentForm.reset();
                    loadIncidents();
                } else {
                    showAlert(result.error || 'Failed to report incident', 'error');
                    handleAuthError(response);
                }
            } catch (error) {
                console.error('Error reporting incident:', error);
                showAlert('Error reporting incident', 'error');
            }
        });
    }
});

let allIncidents = [];

async function loadIncidents() {
    try {
        const response = await fetch(`${API_BASE_URL}/incidents`, {
            credentials: 'include'
        });
        const data = await response.json();
        allIncidents = data;
        
        displayIncidents(data);
        
        if (currentUser && currentUser.role !== 'admin') {
            hideDeleteButtons();
        }
    } catch (error) {
        console.error('Error loading incidents:', error);
        document.getElementById('incidents-tbody').innerHTML = 
            '<tr><td colspan="7" class="text-center">Error loading incidents</td></tr>';
    }
}

function displayIncidents(incidents) {
    const tbody = document.getElementById('incidents-tbody');
    
    if (incidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No incidents found</td></tr>';
        return;
    }
    
    tbody.innerHTML = incidents.map(i => `
        <tr>
            <td>${i.incident_type}</td>
            <td>${i.location}</td>
            <td><span class="status-badge severity-${i.severity.toLowerCase()}">${i.severity}</span></td>
            <td>${i.reported_by}</td>
            <td>${formatDate(i.date)}</td>
            <td><span class="status-badge status-${i.status.toLowerCase().replace(' ', '-')}">${i.status}</span></td>
            <td>
                <button class="btn btn-small btn-primary" onclick="editIncident('${i._id}', '${i.status}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteIncident('${i._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function filterIncidents() {
    const statusFilter = document.getElementById('filter-status').value;
    const severityFilter = document.getElementById('filter-severity').value;
    
    let filtered = allIncidents;
    
    if (statusFilter) {
        filtered = filtered.filter(i => i.status === statusFilter);
    }
    
    if (severityFilter) {
        filtered = filtered.filter(i => i.severity === severityFilter);
    }
    
    displayIncidents(filtered);
}

function editIncident(id, currentStatus) {
    const modal = document.getElementById('incident-modal');
    document.getElementById('incident_edit_id').value = id;
    document.getElementById('incident_edit_status').value = currentStatus;
    modal.classList.add('show');
}

document.addEventListener('DOMContentLoaded', function() {
    const editForm = document.getElementById('edit-incident-form');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const id = document.getElementById('incident_edit_id').value;
            const status = document.getElementById('incident_edit_status').value;
            
            try {
                const response = await fetch(`${API_BASE_URL}/incidents/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({ status })
                });
                
                if (response.ok) {
                    showAlert('Incident updated successfully!', 'success');
                    closeModal('incident-modal');
                    loadIncidents();
                } else {
                    showAlert('Failed to update incident', 'error');
                    handleAuthError(response);
                }
            } catch (error) {
                console.error('Error updating incident:', error);
                showAlert('Error updating incident', 'error');
            }
        });
    }
});

async function deleteIncident(id) {
    if (currentUser && currentUser.role !== 'admin') {
        showAlert('Only admins can delete incidents', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this incident?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/incidents/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showAlert('Incident deleted successfully!', 'success');
            loadIncidents();
        } else {
            const data = await response.json();
            showAlert(data.message || 'Failed to delete incident', 'error');
            handleAuthError(response);
        }
    } catch (error) {
        console.error('Error deleting incident:', error);
        showAlert('Error deleting incident', 'error');
    }
}

// ==================== PARKING FUNCTIONS ====================

document.addEventListener('DOMContentLoaded', function() {
    const parkingForm = document.getElementById('parking-form');
    if (parkingForm) {
        parkingForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const totalSlots = parseInt(document.getElementById('total_slots').value);
            const occupiedSlots = parseInt(document.getElementById('occupied_slots').value);
            
            if (occupiedSlots > totalSlots) {
                showAlert('Occupied slots cannot exceed total slots', 'error');
                return;
            }
            
            const formData = {
                zone_name: document.getElementById('zone_name').value,
                location: document.getElementById('zone_location').value,
                total_slots: totalSlots,
                occupied_slots: occupiedSlots,
                available_slots: totalSlots - occupiedSlots,
                hourly_rate: parseFloat(document.getElementById('hourly_rate').value),
                zone_type: document.getElementById('zone_type').value,
                description: document.getElementById('parking_description').value
            };
            
            try {
                const response = await fetch(`${API_BASE_URL}/parking`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert('Parking zone added successfully!', 'success');
                    parkingForm.reset();
                    loadParkingZones();
                } else {
                    showAlert(result.error || 'Failed to add parking zone', 'error');
                    handleAuthError(response);
                }
            } catch (error) {
                console.error('Error adding parking zone:', error);
                showAlert('Error adding parking zone', 'error');
            }
        });
    }
});

let allParkingZones = [];

async function loadParkingZones() {
    try {
        const response = await fetch(`${API_BASE_URL}/parking`, {
            credentials: 'include'
        });
        const data = await response.json();
        allParkingZones = data;
        
        displayParkingZones(data);
        
        if (currentUser && currentUser.role !== 'admin') {
            setTimeout(() => {
                const deleteButtons = document.querySelectorAll('.btn-danger');
                deleteButtons.forEach(btn => {
                    if (btn.textContent === 'Delete') {
                        btn.style.display = 'none';
                    }
                });
            }, 100);
        }
    } catch (error) {
        console.error('Error loading parking zones:', error);
        document.getElementById('parking-grid').innerHTML = 
            '<p class="text-center">Error loading parking zones</p>';
    }
}

function displayParkingZones(zones) {
    const grid = document.getElementById('parking-grid');
    
    if (zones.length === 0) {
        grid.innerHTML = '<p class="text-center">No parking zones found</p>';
        return;
    }
    
    grid.innerHTML = zones.map(z => {
        const occupancyRate = (z.occupied_slots / z.total_slots) * 100;
        let fillClass = '';
        if (occupancyRate >= 90) fillClass = 'full';
        else if (occupancyRate >= 70) fillClass = 'almost-full';
        
        return `
            <div class="parking-card">
                <div class="parking-header">
                    <h3>${z.zone_name}</h3>
                    <span class="parking-type">${z.zone_type}</span>
                </div>
                <div class="parking-info">
                    <p><strong>Location:</strong> ${z.location}</p>
                    <p><strong>Rate:</strong> ${formatCurrency(z.hourly_rate)}/hour</p>
                    <p><strong>Available:</strong> ${z.available_slots} / ${z.total_slots}</p>
                </div>
                <div class="parking-slots">
                    <div class="slot-bar">
                        <div class="slot-fill ${fillClass}" style="width: ${occupancyRate}%"></div>
                    </div>
                    <span>${occupancyRate.toFixed(0)}%</span>
                </div>
                <div class="parking-actions">
                    <button class="btn btn-small btn-primary" onclick="editParkingZone('${z._id}', ${z.occupied_slots}, ${z.total_slots})">Update</button>
                    <button class="btn btn-small btn-danger" onclick="deleteParkingZone('${z._id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function filterParkingZones() {
    const typeFilter = document.getElementById('filter-zone-type').value;
    
    let filtered = allParkingZones;
    
    if (typeFilter) {
        filtered = filtered.filter(z => z.zone_type === typeFilter);
    }
    
    displayParkingZones(filtered);
}

function editParkingZone(id, occupiedSlots, totalSlots) {
    const modal = document.getElementById('parking-modal');
    document.getElementById('parking_edit_id').value = id;
    document.getElementById('edit_occupied_slots').value = occupiedSlots;
    document.getElementById('edit_total_slots').value = totalSlots;
    modal.classList.add('show');
}

document.addEventListener('DOMContentLoaded', function() {
    const editForm = document.getElementById('edit-parking-form');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const id = document.getElementById('parking_edit_id').value;
            const occupiedSlots = parseInt(document.getElementById('edit_occupied_slots').value);
            const totalSlots = parseInt(document.getElementById('edit_total_slots').value);
            
            if (occupiedSlots > totalSlots) {
                showAlert('Occupied slots cannot exceed total slots', 'error');
                return;
            }
            
            const updateData = {
                occupied_slots: occupiedSlots,
                total_slots: totalSlots,
                available_slots: totalSlots - occupiedSlots
            };
            
            try {
                const response = await fetch(`${API_BASE_URL}/parking/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(updateData)
                });
                
                if (response.ok) {
                    showAlert('Parking zone updated successfully!', 'success');
                    closeModal('parking-modal');
                    loadParkingZones();
                } else {
                    showAlert('Failed to update parking zone', 'error');
                    handleAuthError(response);
                }
            } catch (error) {
                console.error('Error updating parking zone:', error);
                showAlert('Error updating parking zone', 'error');
            }
        });
    }
});

async function deleteParkingZone(id) {
    if (currentUser && currentUser.role !== 'admin') {
        showAlert('Only admins can delete parking zones', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this parking zone?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/parking/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showAlert('Parking zone deleted successfully!', 'success');
            loadParkingZones();
        } else {
            const data = await response.json();
            showAlert(data.message || 'Failed to delete parking zone', 'error');
            handleAuthError(response);
        }
    } catch (error) {
        console.error('Error deleting parking zone:', error);
        showAlert('Error deleting parking zone', 'error');
    }
}

// ==================== ANALYTICS FUNCTIONS ====================

let charts = {};

async function loadAnalytics() {
    try {
        const response = await fetch(`${API_BASE_URL}/analytics`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        document.getElementById('analytics-violations').textContent = data.total_violations || 0;
        document.getElementById('analytics-fines').textContent = formatCurrency(data.total_fines || 0);
        document.getElementById('analytics-incidents').textContent = data.active_incidents || 0;
        document.getElementById('analytics-parking').textContent = data.total_parking_zones || 0;
        document.getElementById('analytics-avg-fine').textContent = formatCurrency(data.avg_fine || 0);
        document.getElementById('analytics-capacity').textContent = data.total_parking_capacity || 0;
        
        createViolationsChart(data.violations_by_type);
        createStatusChart(data.violation_status);
        createSeverityChart(data.incidents_by_severity);
        createFineChart(data.monthly_fines);
        createParkingChart(data.parking_occupancy);
        createIncidentTrendChart(data.incident_trends);
        
    } catch (error) {
        console.error('Error loading analytics:', error);
        showAlert('Error loading analytics data', 'error');
    }
}

// Chart functions remain the same as before...
function createViolationsChart(data) {
    const ctx = document.getElementById('violations-chart');
    if (!ctx) return;
    
    if (charts.violations) charts.violations.destroy();
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    charts.violations = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
                label: 'Number of Violations',
                data: values.length > 0 ? values : [0],
                backgroundColor: '#3b82f6',
                borderColor: '#2563eb',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function createStatusChart(data) {
    const ctx = document.getElementById('status-chart');
    if (!ctx) return;
    
    if (charts.status) charts.status.destroy();
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
                data: values.length > 0 ? values : [1],
                backgroundColor: labels.length > 0 ? ['#fbbf24', '#10b981', '#ef4444'] : ['#e5e7eb'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createSeverityChart(data) {
    const ctx = document.getElementById('severity-chart');
    if (!ctx) return;
    
    if (charts.severity) charts.severity.destroy();
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    charts.severity = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
                data: values.length > 0 ? values : [1],
                backgroundColor: labels.length > 0 ? ['#10b981', '#fbbf24', '#f97316', '#ef4444'] : ['#e5e7eb'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createFineChart(data) {
    const ctx = document.getElementById('fine-chart');
    if (!ctx) return;
    
    if (charts.fine) charts.fine.destroy();
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    charts.fine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
                label: 'Fine Amount (₹)',
                data: values.length > 0 ? values : [0],
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: '#3b82f6',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function createParkingChart(data) {
    const ctx = document.getElementById('parking-chart');
    if (!ctx) return;
    
    if (charts.parking) charts.parking.destroy();
    
    const zones = Object.keys(data);
    const occupied = zones.map(z => data[z].occupied);
    const available = zones.map(z => data[z].available);
    
    charts.parking = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: zones.length > 0 ? zones : ['No Data'],
            datasets: [
                {
                    label: 'Occupied',
                    data: occupied.length > 0 ? occupied : [0],
                    backgroundColor: '#ef4444'
                },
                {
                    label: 'Available',
                    data: available.length > 0 ? available : [0],
                    backgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true
                }
            }
        }
    });
}

function createIncidentTrendChart(data) {
    const ctx = document.getElementById('incident-trend-chart');
    if (!ctx) return;
    
    if (charts.incidentTrend) charts.incidentTrend.destroy();
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    charts.incidentTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
                label: 'Number of Incidents',
                data: values.length > 0 ? values : [0],
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: '#ef4444',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// ==================== MODAL FUNCTIONS ====================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            modals.forEach(modal => {
                if (modal.classList.contains('show')) {
                    modal.classList.remove('show');
                }
            });
        }
    });
});

// ==================== ERROR HANDLING ====================

function handleAuthError(response) {
    if (response.status === 401) {
        showAlert('Session expired. Please login again.', 'error');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 2000);
    } else if (response.status === 403) {
        showAlert('You do not have permission to perform this action.', 'error');
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname;
    
    // Skip authentication check on login page
    if (currentPage.includes('login.html') || currentPage === '/' || currentPage === '') {
        console.log('On login page, skipping auth check');
        return;
    }
    
    // Check authentication first
    checkAuthentication().then(() => {
        console.log('Authentication successful, loading page data');
        
        if (currentPage.includes('index.html')) {
            loadDashboardStats();
            loadRecentViolations();
            loadActiveIncidents();
        }
        
        if (currentPage.includes('violations.html')) {
            loadViolations();
            
            const searchInput = document.getElementById('search-violations');
            if (searchInput) {
                searchInput.addEventListener('input', function(e) {
                    searchViolations(e.target.value);
                });
            }
        }
        
        if (currentPage.includes('incidents.html')) {
            loadIncidents();
            
            const statusFilter = document.getElementById('filter-status');
            const severityFilter = document.getElementById('filter-severity');
            
            if (statusFilter) {
                statusFilter.addEventListener('change', filterIncidents);
            }
            if (severityFilter) {
                severityFilter.addEventListener('change', filterIncidents);
            }
        }
        
        if (currentPage.includes('parking.html')) {
            loadParkingZones();
            
            const zoneTypeFilter = document.getElementById('filter-zone-type');
            if (zoneTypeFilter) {
                zoneTypeFilter.addEventListener('change', filterParkingZones);
            }
        }
        
        if (currentPage.includes('analytics.html')) {
            if (typeof Chart !== 'undefined') {
                loadAnalytics();
            } else {
                console.error('Chart.js not loaded');
            }
        }
    }).catch(error => {
        console.error('Authentication failed:', error);
    });
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    if (event.reason && event.reason.message) {
        showAlert('Network error: ' + event.reason.message, 'error');
    }
});

console.log('%c Traffic Management System ', 'background: #2563eb; color: #ffffff; font-size: 20px; padding: 10px;');
console.log('%c Version 1.0.0 with Authentication ', 'background: #10b981; color: #ffffff; font-size: 14px; padding: 5px;');
console.log('%c API Base URL: ' + API_BASE_URL, 'color: #3b82f6; font-size: 12px;');