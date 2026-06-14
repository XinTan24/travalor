'use strict';

const ADMIN_PASSWORD = 'travalor_admin_2024';

let allScenics = [];
let allUserDataArr = [];
let allUsersArr = [];

// ===== AUTH =====
function adminLogin() {
  const pwd = document.getElementById('adminPwd').value;
  if (pwd === ADMIN_PASSWORD) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadAdminData();
  } else {
    document.getElementById('loginErr').textContent = '密码错误，请重试';
    document.getElementById('adminPwd').value = '';
  }
}

// ===== LOAD DATA =====
async function loadAdminData() {
  try {
    const [storeScenics, allUD, allU] = await Promise.all([
      TravelDB.getAllScenics(),
      TravelDB.getAllUserData(),
      TravelDB.getAllUsers(),
    ]);
    allUserDataArr = allUD;
    allUsersArr = allU;

    // Merge custom scenics from user_data that are NOT already in the scenics store
    const storeIdSet = new Set(storeScenics.map(s => s.id));
    const extraCustom = [];
    allUD.forEach(ud => {
      (ud.customScenics || []).forEach(s => {
        if (!storeIdSet.has(s.id)) {
          extraCustom.push({ ...s, isCustom: true });
          storeIdSet.add(s.id);
        }
      });
    });
    allScenics = [...storeScenics, ...extraCustom];
  } catch (e) {
    console.error(e);
    allScenics = [];
  }
  renderStats();
  renderCustomScenics();
  renderUsers();
}

function renderStats() {
  const total    = allScenics.length;
  const custom   = allScenics.filter(s => s.isCustom).length;
  const official = total - custom;
  const withCoord = allScenics.filter(s => s.lat && s.lng).length;
  const userCount = allUsersArr.length;
  document.getElementById('statsRow').innerHTML = [
    ['总景点', total, '#2c3e50'],
    ['官方景点', official, '#27ae60'],
    ['自定义景点', custom, '#e74c3c'],
    ['有坐标', withCoord, '#3498db'],
    ['注册用户', userCount, '#8e44ad'],
  ].map(([label, val, color]) => `
    <div class="stat-box">
      <div class="stat-num" style="color:${color};">${val}</div>
      <div class="stat-label">${label}</div>
    </div>`).join('');
}

function renderCustomScenics() {
  const customs = allScenics.filter(s => s.isCustom);
  document.getElementById('customCount').textContent = customs.length;
  const el = document.getElementById('customScenicTable');
  if (customs.length === 0) {
    el.innerHTML = '<div class="empty-hint">暂无用户自定义景点</div>';
    return;
  }
  // Find which user each custom scenic belongs to
  const idToUser = {};
  allUserDataArr.forEach(ud => {
    (ud.customScenics || []).forEach(s => { idToUser[s.id] = ud.username; });
  });
  el.innerHTML = `<table>
    <thead><tr>
      <th>名称</th><th>分类</th><th>省/市</th><th>创建用户</th><th>坐标</th><th>操作</th>
    </tr></thead>
    <tbody>
      ${customs.map(s => `
        <tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.category || '—')}</td>
          <td>${esc((s.province || '') + (s.city ? ' / ' + s.city : ''))}</td>
          <td style="font-size:12px;color:#7f8c8d;">${esc(idToUser[s.id] || '—')}</td>
          <td style="font-size:11px;color:#7f8c8d;">${s.lat && s.lng ? s.lat.toFixed(4) + ', ' + s.lng.toFixed(4) : '无坐标'}</td>
          <td style="white-space:nowrap;display:flex;gap:5px;flex-wrap:wrap;">
            <button class="action-btn btn-edit" onclick="openEditModal('${esc(s.id)}')">✏ 编辑</button>
            <button class="action-btn btn-promote" onclick="promoteScenic('${esc(s.id)}')">⬆ 升级官方</button>
            <button class="action-btn btn-delete" onclick="deleteCustomScenic('${esc(s.id)}')">🗑 删除</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

// ===== USERS SECTION =====
function renderUsers() {
  const el = document.getElementById('usersTableContainer');
  if (!el) return;
  document.getElementById('userCount').textContent = allUsersArr.length;
  if (allUsersArr.length === 0) {
    el.innerHTML = '<div class="empty-hint">暂无注册用户</div>';
    return;
  }
  const udMap = {};
  allUserDataArr.forEach(ud => { udMap[ud.username] = ud; });
  el.innerHTML = `<table>
    <thead><tr>
      <th>用户名</th><th>已游览</th><th>行程数</th><th>评分数</th><th>自定义景点</th><th>准备计划</th>
    </tr></thead>
    <tbody>
      ${allUsersArr.map(u => {
        const ud = udMap[u.username] || {};
        const visited = (ud.visited || []).length;
        const trips   = Object.keys(ud.trips || {}).length;
        const ratings = Object.keys(ud.ratings || {}).length;
        const custom  = (ud.customScenics || []).length;
        const preps   = Object.keys(ud.tripPrep || {}).length;
        return `<tr>
          <td><strong>${esc(u.username)}</strong></td>
          <td>${visited}</td>
          <td>${trips}</td>
          <td>${ratings}</td>
          <td>${custom}</td>
          <td>${preps}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

// ===== ACTIONS =====
window.promoteScenic = async function(id) {
  const s = allScenics.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`将「${s.name}」升级为官方景点？`)) return;
  const promoted = { ...s, isCustom: false };
  try {
    await TravelDB.upsertScenic(promoted);
    const idx = allScenics.findIndex(x => x.id === id);
    if (idx >= 0) allScenics[idx] = promoted;
    renderStats(); renderCustomScenics();
    showMsg('✓ 已升级为官方景点');
  } catch (e) { showMsg('⚠ 操作失败: ' + e.message); }
};

window.deleteCustomScenic = async function(id) {
  const s = allScenics.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`确定删除「${s.name}」？此操作不可撤销。`)) return;
  try {
    await TravelDB.deleteScenic(id);
    allScenics = allScenics.filter(x => x.id !== id);
    // Also remove from user_data.customScenics
    for (const ud of allUserDataArr) {
      const cl = ud.customScenics || [];
      if (cl.some(x => x.id === id)) {
        ud.customScenics = cl.filter(x => x.id !== id);
        await TravelDB.saveUserData(ud.username, { customScenics: ud.customScenics });
      }
    }
    renderStats(); renderCustomScenics();
    showMsg('✓ 已删除');
  } catch (e) { showMsg('⚠ 删除失败: ' + e.message); }
};

// ===== EDIT MODAL =====
window.openEditModal = function(id) {
  const s = allScenics.find(x => x.id === id);
  if (!s) return;
  document.getElementById('editId').value = s.id;
  document.getElementById('editName').value = s.name || '';
  document.getElementById('editCategory').value = s.category || '自定义';
  document.getElementById('editProvince').value = s.province || '';
  document.getElementById('editCity').value = s.city || '';
  document.getElementById('editTicket').value = s.ticket || '';
  document.getElementById('editFeatures').value = s.features || '';
  document.getElementById('editIntro').value = s.intro || '';
  document.getElementById('editLat').value = s.lat || '';
  document.getElementById('editLng').value = s.lng || '';
  document.getElementById('editModal').style.display = 'flex';
};

window.closeEditModal = function() { document.getElementById('editModal').style.display = 'none'; };

window.saveEditModal = async function() {
  const id = document.getElementById('editId').value;
  const s  = allScenics.find(x => x.id === id);
  if (!s) return;
  const name = document.getElementById('editName').value.trim();
  if (!name) { alert('名称不能为空'); return; }
  const updated = {
    ...s, name,
    category: document.getElementById('editCategory').value,
    province: document.getElementById('editProvince').value.trim(),
    city:     document.getElementById('editCity').value.trim(),
    ticket:   document.getElementById('editTicket').value.trim(),
    features: document.getElementById('editFeatures').value.trim(),
    intro:    document.getElementById('editIntro').value.trim(),
    lat: parseFloat(document.getElementById('editLat').value) || s.lat,
    lng: parseFloat(document.getElementById('editLng').value) || s.lng,
  };
  try {
    await TravelDB.upsertScenic(updated);
    const idx = allScenics.findIndex(x => x.id === id);
    if (idx >= 0) allScenics[idx] = updated;
    closeEditModal();
    renderStats(); renderCustomScenics();
    filterAdmin(document.getElementById('adminSearch').value);
    showMsg('✓ 已保存');
  } catch (e) { showMsg('⚠ 保存失败: ' + e.message); }
};

// ===== GLOBAL SEARCH =====
window.filterAdmin = function(kw) {
  const el = document.getElementById('adminSearchResults');
  const q = (kw || '').trim().toLowerCase();
  if (!q) { el.innerHTML = ''; return; }
  const hits = allScenics.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.city || '').toLowerCase().includes(q) ||
    (s.province || '').toLowerCase().includes(q)
  ).slice(0, 30);
  if (hits.length === 0) { el.innerHTML = '<div class="empty-hint">未找到匹配景点</div>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>名称</th><th>类型</th><th>省/市</th><th>操作</th></tr></thead>
    <tbody>${hits.map(s => `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${s.isCustom ? '<span class="badge custom">自定义</span>' : '<span class="badge">官方</span>'}</td>
        <td>${esc((s.province || '') + (s.city ? ' / ' + s.city : ''))}</td>
        <td style="white-space:nowrap;display:flex;gap:5px;">
          <button class="action-btn btn-edit" onclick="openEditModal('${esc(s.id)}')">✏ 编辑</button>
          ${s.isCustom ? `<button class="action-btn btn-promote" onclick="promoteScenic('${esc(s.id)}')">⬆ 升级</button>
          <button class="action-btn btn-delete" onclick="deleteCustomScenic('${esc(s.id)}')">🗑 删除</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
};

// ===== HELPERS =====
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let msgTimer = null;
function showMsg(txt) {
  let el = document.getElementById('_adminMsg');
  if (!el) {
    el = document.createElement('div');
    el.id = '_adminMsg';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2c3e50;color:white;padding:8px 20px;border-radius:20px;font-size:13px;z-index:9999;transition:opacity 0.3s;';
    document.body.appendChild(el);
  }
  el.textContent = txt; el.style.opacity = '1';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
