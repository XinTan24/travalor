// ========== 全局变量 ==========
let map = null;
let markers = [];
let scenicData = [];
let currentScenics = [];
let allScenics = [];
let visitedSet = new Set();
let currentUser = null;
let userHasInteracted = false;
let plannedTrips = {};
let currentUserData = null;
let userRatings = {};
let editingTripName = null;    // 当前正在编辑的行程名
let editingTripSearchKw = ''; // 行程编辑搜索关键词
let pendingMapLocation = null;
let pendingMapContext = null;

// 筛选条件
let filters = {
  province: '',
  city: '',
  category: '',
  level: '',
  activity: '',
  minRating: 0,
  keyword: ''
};

function getCategories() {
  return [...new Set(scenicData.map(s => s.category).filter(Boolean))].sort();
}

function getLevels() {
  return [...new Set(scenicData.map(s => s.level).filter(Boolean))].sort();
}

// 获取景区活动列表（优先使用自定义字段，否则按分类取默认值）
function getActivities(scenic) {
  if (Array.isArray(scenic.activities) && scenic.activities.length > 0) return scenic.activities;
  return DEFAULT_ACTIVITIES_BY_CATEGORY[scenic.category] || [];
}

// 获取活动所属大类
function getActivityCategory(actName) {
  for (const [cat, acts] of Object.entries(ACTIVITY_CATEGORIES)) {
    if (acts.includes(actName)) return cat;
  }
  return null;
}

// ========== 用户认证相关 ==========
async function saveUser(username, password) {
  await TravelDB.saveUser(username, password);
}

async function validateUser(username, password) {
  const user = await TravelDB.getUser(username);
  return !!user && user.password === password;
}

async function login(username, password) {
  if (await validateUser(username, password)) {
    currentUser = username;
    localStorage.setItem('current_5a_user', username);
    document.getElementById('currentUser').textContent = username;
    document.getElementById('userBar').style.display = 'block';
    document.getElementById('authModal').style.display = 'none';

    currentUserData = await TravelDB.getUserData(username);
    visitedSet = new Set(currentUserData.visited || []);
    plannedTrips = currentUserData.trips || {};
    userRatings = currentUserData.ratings || {};
    loadCustomScenics(currentUserData.customScenics || []);
    refreshProvinceSelect();
    applyRatingsToData();
    applyVisitedToData();

    currentScenics = scenicData.filter(s => isValidScenic(s));
    renderList();
    updateStats();
    renderTripList();
    return true;
  }
  return false;
}

async function register(username, password) {
  const exists = await TravelDB.getUser(username);
  if (exists) return false;
  await saveUser(username, password);
  return true;
}

window.logout = function() {
  currentUser = null;
  localStorage.removeItem('current_5a_user');
  document.getElementById('currentUser').textContent = '';
  document.getElementById('userBar').style.display = 'none';
  visitedSet.clear();
  plannedTrips = {};
  currentUserData = null;
  userRatings = {};
  scenicData.forEach(s => { s.userRating = 0; });

  // 清除地图路线
  if (window.currentRoutePointers && map) {
    map.remove(window.currentRoutePointers);
    window.currentRoutePointers = null;
  }
  // 清除地图标记
  if (markers.length > 0 && map) {
    map.remove(markers);
    markers = [];
  }
  // 切回列表模式
  const listContainer = document.getElementById('listContainer');
  const mapContainer = document.getElementById('mapContainer');
  const toggleBtn = document.getElementById('toggleView');
  if (mapContainer && mapContainer.style.visibility === 'visible') {
    listContainer.style.display = 'block';
    mapContainer.style.visibility = 'hidden';
    if (toggleBtn) toggleBtn.textContent = '切换到地图模式';
  }

  clearCustomScenicsFromData();
  applyVisitedToData();
  document.getElementById('authModal').style.display = 'flex';
  currentScenics = [];
  renderList();
  updateStats();
  renderTripList();
};

function applyRatingsToData() {
  Object.entries(userRatings).forEach(([id, rating]) => {
    const s = scenicData.find(sc => sc.id === id);
    if (s) s.userRating = rating;
  });
}

function saveRating(id, rating) {
  userRatings[id] = rating;
  const s = scenicData.find(sc => sc.id === id);
  if (s) s.userRating = rating;
  if (currentUser) {
    TravelDB.saveUserData(currentUser, { ratings: userRatings }).catch(console.error);
  }
}

function saveVisitedForUser(username) {
  if (!username) return;
  TravelDB.saveUserData(username, { visited: Array.from(visitedSet) }).catch(console.error);
}

function savePlannedTripsForUser(username, trips) {
  if (!username) return;
  TravelDB.saveUserData(username, { trips }).catch(console.error);
}

window.clearAllTrips = function() {
  if (!currentUser || !confirm('确定清空所有行程计划吗？')) return;
  plannedTrips = {};
  savePlannedTripsForUser(currentUser, plannedTrips);
  renderTripList();
  alert('所有行程已清空');
};

function toggleVisitStatus(scenic, isVisited) {
  if (isVisited) {
    visitedSet.add(scenic.id);
    scenic.visited = true;
  } else {
    visitedSet.delete(scenic.id);
    scenic.visited = false;
  }
  if (currentUser) {
    saveVisitedForUser(currentUser);
  }
  applyVisitedToData();
  renderList();
  createMapMarkers(false);
  updateStats();
  
  const btn = document.getElementById('markBtn');
  if (btn) {
    btn.textContent = isVisited ? '❌ 取消打卡' : '✅ 打卡完成';
    btn.style.backgroundColor = isVisited ? '#e74c3c' : '#2ecc71';
    btn.onclick = () => toggleVisitStatus(scenic, !isVisited);
  }
}

function quickToggleVisit(id) {
  const scenic = scenicData.find(s => s.id === id);
  if (!scenic) return;
  toggleVisitStatus(scenic, !scenic.visited);
}

function applyVisitedToData() {
  scenicData.forEach(scenic => {
    scenic.visited = visitedSet.has(scenic.id);
  });
}

function isValidScenic(scenic) {
  const lng = parseFloat(scenic.lng);
  const lat = parseFloat(scenic.lat);
  return !isNaN(lng) && !isNaN(lat) && lng !== 0 && lat !== 0;
}

// ========== 自定义地图标记样式 ==========
function createCustomMarkerContent(scenic) {
  const categoryIcons = {
    '自然风光': '🏔', '人文历史': '🏛', '博物馆': '🏛',
    '徒步路线': '🥾', '宗教文化': '⛩', '古镇': '🏘',
    '古迹': '🏰', '主题公园': '🎡', '自定义': '📌'
  };
  const icon = categoryIcons[scenic.category] || '📍';
  let pinColor;
  if (scenic.visited)              pinColor = '#27ae60';
  else if (scenic.level === '5A')  pinColor = '#e74c3c';
  else if (scenic.level === '4A')  pinColor = '#e67e22';
  else if (scenic.category === '徒步路线') pinColor = '#16a085';
  else if (scenic.isCustom)        pinColor = '#8e44ad';
  else                             pinColor = '#2980b9';

  return `<div class="custom-marker-wrap">
    <div class="custom-marker-label">${scenic.name}</div>
    <div class="custom-marker-pin" style="background:${pinColor}">
      <span>${icon}</span>
    </div>
  </div>`;
}

// ========== 弧线点计算（贝塞尔二次曲线） ==========
function computeArcPoints(p1, p2, segments, arcFactor) {
  segments = segments || 30;
  arcFactor = arcFactor || 0.25;
  const midLng = (p1.lng + p2.lng) / 2;
  const midLat = (p1.lat + p2.lat) / 2;
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-9) return [[p1.lng, p1.lat], [p2.lng, p2.lat]];
  const perpLng = midLng + (-dy / len) * len * arcFactor;
  const perpLat = midLat + (dx / len) * len * arcFactor;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (1 - t) * (1 - t) * p1.lng + 2 * (1 - t) * t * perpLng + t * t * p2.lng;
    const y = (1 - t) * (1 - t) * p1.lat + 2 * (1 - t) * t * perpLat + t * t * p2.lat;
    pts.push([x, y]);
  }
  return pts;
}

// ========== 含自定义起终点的路线规划 ==========
function buildRouteWithCustomEndpoints(scenicPts, customStart, customEnd) {
  let sorted;
  if (customStart) {
    const tmp = nearestNeighborSort(scenicPts, customStart, null);
    sorted = tmp.slice(1); // nearestNeighborSort 会把 customStart 放首位，去掉避免重复
  } else {
    sorted = nearestNeighborSort(scenicPts);
  }
  const result = [];
  if (customStart) result.push(Object.assign({}, customStart, { isCustomEndpoint: true }));
  result.push.apply(result, sorted);
  if (customEnd)   result.push(Object.assign({}, customEnd,   { isCustomEndpoint: true }));
  return result;
}

// ========== 省市区初始化 ==========
function refreshProvinceSelect() {
  const provinceSelect = document.getElementById('provinceSelect');
  const saved = provinceSelect.value;
  provinceSelect.innerHTML = '<option value="">请选择省份</option>';
  [...new Set(scenicData.map(s => s.province).filter(Boolean))].sort().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    provinceSelect.appendChild(opt);
  });
  if (saved && [...provinceSelect.options].some(o => o.value === saved)) {
    provinceSelect.value = saved;
  }
}

function initProvinceCity() {
  refreshProvinceSelect();
  document.getElementById('provinceSelect').addEventListener('change', onProvinceChange);
}

function onProvinceChange(e) {
  const province = e.target.value;
  const citySelect = document.getElementById('citySelect');
  citySelect.innerHTML = '<option value="">全部城市</option>';
  
  if (!province) {
    applyFilters();
    return;
  }
  
  const cities = [...new Set(scenicData.filter(s => s.province === province).map(s => s.city).filter(Boolean))].sort();
  cities.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    citySelect.appendChild(opt);
  });
  
  applyFilters();
}

// ========== 筛选器初始化 ==========
function initFilters() {
  const categorySelect = document.getElementById('categorySelect');
  categorySelect.innerHTML = '<option value="">所有分类</option>';
  getCategories().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });

  const levelSelect = document.getElementById('levelSelect');
  levelSelect.innerHTML = '<option value="">所有等级</option>';
  getLevels().forEach(l => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l;
    levelSelect.appendChild(opt);
  });

  // 活动筛选下拉（按大类分组）
  const activitySelect = document.getElementById('activitySelect');
  activitySelect.innerHTML = '<option value="">所有活动</option>';
  Object.entries(ACTIVITY_CATEGORIES).forEach(([cat, acts]) => {
    const group = document.createElement('optgroup');
    group.label = cat;
    acts.forEach(act => {
      const opt = document.createElement('option');
      opt.value = act;
      opt.textContent = act;
      group.appendChild(opt);
    });
    activitySelect.appendChild(group);
  });
  activitySelect.addEventListener('change', function(e) {
    filters.activity = e.target.value;
    window.applyFilters();
  });

  document.getElementById('ratingSelect').addEventListener('change', function(e) {
    filters.minRating = parseInt(e.target.value) || 0;
    window.applyFilters();
  });

  document.getElementById('citySelect').addEventListener('change', function(e) {
    filters.city = e.target.value;
    window.applyFilters();
  });
  
  document.getElementById('categorySelect').addEventListener('change', function(e) {
    filters.category = e.target.value;
    window.applyFilters();
  });
  
  document.getElementById('levelSelect').addEventListener('change', function(e) {
    filters.level = e.target.value;
    window.applyFilters();
  });
  
  document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      window.applyFilters();
    }
  });
  
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', window.applyFilters);
  }
}

window.applyFilters = function() {
  filters.province  = document.getElementById('provinceSelect').value;
  filters.city      = document.getElementById('citySelect').value;
  filters.category  = document.getElementById('categorySelect').value;
  filters.level     = document.getElementById('levelSelect').value;
  filters.activity  = document.getElementById('activitySelect').value;
  filters.minRating = parseInt(document.getElementById('ratingSelect').value) || 0;
  filters.keyword   = document.getElementById('searchInput').value.trim();

  currentScenics = scenicData.filter(scenic => {
    if (!isValidScenic(scenic)) return false;
    if (filters.province && scenic.province !== filters.province) return false;
    if (filters.city && scenic.city !== filters.city) return false;
    if (filters.category && scenic.category !== filters.category) return false;
    if (filters.level && scenic.level !== filters.level) return false;
    if (filters.activity && !getActivities(scenic).includes(filters.activity)) return false;
    if (filters.minRating > 0 && scenic.userRating > 0 && scenic.userRating < filters.minRating) return false;
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      return scenic.name.toLowerCase().includes(keyword) ||
             (scenic.intro && scenic.intro.toLowerCase().includes(keyword));
    }
    return true;
  });

  applyVisitedToData();
  renderList();
  
  // 如果地图模式是显示的，更新地图
  const mapContainer = document.getElementById('mapContainer');
  if (mapContainer.style.visibility === 'visible') {
    createMapMarkers(true);
  }
  
  updateStats();
};

// ========== 列表渲染 ==========
function renderList() {
  const container = document.getElementById('scenicList');
  container.innerHTML = '';
  
  if (currentScenics.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无符合条件的景点</div>';
    return;
  }
  
  currentScenics.forEach(scenic => {
    const div = document.createElement('div');
    div.className = 'scenic-item';
    div.style.borderLeft = scenic.visited ? '4px solid #2ecc71' : '4px solid #95a5a6';
    
    let categoryClass = '';
    switch(scenic.category) {
      case '自然风光': categoryClass = 'natural'; break;
      case '人文历史': categoryClass = 'cultural'; break;
      case '博物馆': categoryClass = 'museum'; break;
      case '徒步路线': categoryClass = 'hiking'; break;
      case '宗教文化': categoryClass = 'religious'; break;
      case '古镇': categoryClass = 'town'; break;
      default: categoryClass = '';
    }
    
    const levelClass = scenic.level === '5A' ? 'level5a' : (scenic.level === '4A' ? 'level4a' : '');
    const acts = getActivities(scenic);
    const actsHtml = acts.length
      ? `<div class="activities-row">${acts.map(a => `<span class="activity-tag">${a}</span>`).join('')}</div>`
      : '';
    div.innerHTML = `
      <h3>
        ${scenic.name}
        ${scenic.isCustom ? '<span class="custom-badge">📌 用户添加</span>' : ''}
        <span class="level-tag ${levelClass}">${scenic.level || '未评级'}</span>
        ${scenic.category ? `<span class="scenic-category ${categoryClass}">${scenic.category}</span>` : ''}
        ${scenic.userRating ? `<span class="rating-badge">⭐${scenic.userRating}</span>` : ''}
      </h3>
      <p>📍 ${scenic.province}${scenic.city} | 💰 ${scenic.ticket || '免费'}</p>
      <div class="features">✨ ${scenic.features || '暂无特色'}</div>
      ${actsHtml}
      ${scenic.category === '徒步路线' ? `
        <div class="hiking-info">
          <p>🚶 距离：${scenic.distance || '未知'} | 时长：${scenic.duration || '未知'} | 难度：${scenic.difficulty || '未知'}</p>
        </div>
      ` : `
        <p>⏱️ 建议时长：${scenic.duration || '1-2小时'}</p>
      `}
      <div class="button-group">
        <button class="detail-btn" onclick="showDetail('${scenic.id}')">查看详情</button>
        <button class="${scenic.visited ? 'uncheckin-btn' : 'checkin-btn'}" onclick="quickToggleVisit('${scenic.id}')">
          ${scenic.visited ? '取消打卡' : '打卡'}
        </button>
        <button class="trip-btn" onclick="quickAddToTrip('${scenic.id}')">➕ 行程</button>
        ${scenic.isCustom ? `<button class="edit-scenic-btn" onclick="openEditScenicModal('${scenic.id}')">✏️ 编辑</button>` : ''}
      </div>
    `;
    container.appendChild(div);
  });
}

// ========== 详情弹窗 ==========
function showDetail(id) {
  const scenic = scenicData.find(s => s.id == id);
  if (!scenic) return;

  document.getElementById('modalTitle').textContent = scenic.name;
  document.getElementById('modalLocation').textContent = `${scenic.province}${scenic.city}`;
  document.getElementById('modalTicket').textContent = scenic.ticket || '免费';
  document.getElementById('modalFeatures').textContent = scenic.features || '暂无';
  document.getElementById('modalRoute').textContent = scenic.route || '暂无推荐路线';
  document.getElementById('modalSeason').textContent = scenic.season || '四季皆宜';
  document.getElementById('modalDuration').textContent = scenic.duration || '1-2小时';
  document.getElementById('modalTips').textContent = scenic.tips || '无特殊提示';
  document.getElementById('modalIntro').textContent = scenic.intro || '暂无简介';

  const levelSpan = document.getElementById('modalLevel');
  levelSpan.textContent = scenic.level || '未评级';
  levelSpan.setAttribute('data-level', scenic.level || '');
  
  const categorySpan = document.getElementById('modalCategory');
  categorySpan.textContent = scenic.category || '未分类';

  const activitiesEl = document.getElementById('modalActivities');
  const acts = getActivities(scenic);
  activitiesEl.innerHTML = acts.length
    ? acts.map(a => {
        const cat = getActivityCategory(a);
        return `<span class="activity-tag" data-cat="${cat || ''}">${a}</span>`;
      }).join('')
    : '暂无';

  // 评分 UI
  const ratingDisplay = document.getElementById('ratingDisplay');
  const ratingBtnsEl = document.getElementById('ratingBtns');
  if (ratingDisplay && ratingBtnsEl) {
    const curRating = scenic.userRating || 0;
    ratingDisplay.textContent = curRating > 0 ? `${curRating} 分` : '未评分';
    ratingBtnsEl.innerHTML = '';
    for (let ri = 1; ri <= 10; ri++) {
      const btn = document.createElement('button');
      btn.className = 'rating-btn' + (ri <= curRating ? ' active' : '');
      btn.textContent = ri;
      btn.onclick = (function(score) {
        return function() {
          saveRating(scenic.id, score);
          scenic.userRating = score;
          ratingDisplay.textContent = `${score} 分`;
          ratingBtnsEl.querySelectorAll('.rating-btn').forEach((b, idx) => {
            b.classList.toggle('active', idx + 1 <= score);
          });
          renderList();
        };
      })(ri);
      ratingBtnsEl.appendChild(btn);
    }
  }

  const hikingInfo = document.getElementById('hikingInfo');
  if (scenic.category === '徒步路线') {
    hikingInfo.style.display = 'block';
    document.getElementById('modalDistance').textContent = scenic.distance || '未知';
    document.getElementById('modalHikingDuration').textContent = scenic.hikingDuration || scenic.duration || '未知';
    document.getElementById('modalDifficulty').textContent = scenic.difficulty || '未知';
  } else {
    hikingInfo.style.display = 'none';
  }

  const btn = document.getElementById('markBtn');
  if (scenic.visited) {
    btn.textContent = '❌ 取消打卡';
    btn.style.backgroundColor = '#e74c3c';
    btn.onclick = () => toggleVisitStatus(scenic, false);
  } else {
    btn.textContent = '✅ 打卡完成';
    btn.style.backgroundColor = '#2ecc71';
    btn.onclick = () => toggleVisitStatus(scenic, true);
  }

  const tripSection = document.getElementById('tripSection');
  tripSection.innerHTML = `
    <hr/>
    <h4>加入行程</h4>
    <select id="tripSelect" style="width: 28%; margin-right: 5px;"><option value="">选择已有行程</option></select>
    <input type="text" id="tripNameInput" placeholder="或输入新行程名称" style="width: 40%; margin-right: 5px;" />
    <button id="addToTripBtn" style="padding: 6px 12px; background: #3498db; color: white; border: none; border-radius: 4px;">加入行程</button>
    <div id="tripListDisplay" style="margin-top: 10px;"></div>
  `;

  // 填充下拉列表（如果有已有行程）
  const tripSelectEl = document.getElementById('tripSelect');
  if (tripSelectEl) {
    // 清理旧项（保留第一个提示项）
    tripSelectEl.innerHTML = '<option value="">选择已有行程</option>';
    Object.keys(plannedTrips || {}).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      tripSelectEl.appendChild(opt);
    });

    // 选中已有行程时把名字同步到输入框（可覆盖）
    tripSelectEl.addEventListener('change', function(e) {
      const val = e.target.value || '';
      const input = document.getElementById('tripNameInput');
      if (val) {
        input.value = val;
      }
    });
  }

  document.getElementById('addToTripBtn').onclick = () => {
    const selectEl = document.getElementById('tripSelect');
    const inputEl = document.getElementById('tripNameInput');
    const selected = selectEl ? selectEl.value.trim() : '';
    const typed = inputEl ? inputEl.value.trim() : '';
    const tripName = selected || typed;
    if (!tripName) {
      alert('请输入或选择行程名称！');
      return;
    }

    if (!plannedTrips[tripName]) {
      plannedTrips[tripName] = [];
    }

    if (!plannedTrips[tripName].includes(scenic.id)) {
      plannedTrips[tripName].push(scenic.id);
      savePlannedTripsForUser(currentUser, plannedTrips);
      showToast(`已加入行程「${tripName}」`);
      renderTripList();
      document.getElementById('modal').style.display = 'none';
    } else {
      alert('该景点已在行程中！');
    }

    renderTripListInModal(scenic.id);
  };

  renderTripListInModal(scenic.id);

  document.getElementById('modal').style.display = 'flex';
  window.currentModalScenic = scenic;
}

function renderTripListInModal(scenicId) {
  const listEl = document.getElementById('tripListDisplay');
  if (!listEl) return;

  const trips = Object.entries(plannedTrips)
    .filter(([name, ids]) => ids.includes(scenicId))
    .map(([name]) => name);
  
  listEl.innerHTML = trips.length > 0
    ? `<p>📋 已在行程：<strong>${trips.join(', ')}</strong></p>`
    : '<p>📋 尚未加入任何行程</p>';
}

// ========== 地图相关 ==========
window.toggleViewMode = function() {
  // 如果在路线分屏模式，先关闭
  const viewArea = document.getElementById('viewArea');
  if (viewArea && viewArea.classList.contains('split-view')) {
    window.closeRouteView();
    return;
  }

  const listContainer = document.getElementById('listContainer');
  const mapContainer = document.getElementById('mapContainer');
  const toggleBtn = document.getElementById('toggleView');
  
  if (listContainer.style.display !== 'none') {
    listContainer.style.display = 'none';
    mapContainer.style.visibility = 'visible';
    toggleBtn.textContent = '切换到列表模式';
    // 延迟一点创建地图，确保容器已经显示
    setTimeout(() => {
      createMapMarkers(true);
    }, 100);
  } else {
    listContainer.style.display = 'block';
    mapContainer.style.visibility = 'hidden';
    toggleBtn.textContent = '切换到地图模式';
  }
};

function createMapMarkers(shouldAutoFit = true) {
  // 检查地图容器是否存在
  const mapContainer = document.getElementById('mapContainer');
  if (!mapContainer) {
    console.error('地图容器不存在');
    return;
  }

  // 检查高德地图API是否加载
  if (typeof AMap === 'undefined') {
    console.error('高德地图API未加载');
    return;
  }

  // 过滤有效坐标的景点
  const validScenics = currentScenics.filter(isValidScenic);
  if (validScenics.length === 0) {
    console.log('没有有效的景点坐标');
    if (map) {
      // 如果没有景点，显示默认视图
      map.setCenter([120.1307, 30.2404]);
      map.setZoom(10);
    }
    return;
  }

  try {
    // 清除旧标记
    if (markers.length > 0 && map) {
      map.remove(markers);
      markers = [];
    }

    // 初始化地图（如果还没有）
    if (!map) {
      map = new AMap.Map('mapContainer', {
        zoom: 10,
        center: [120.1307, 30.2404],
        resizeEnable: true,
        viewMode: '2D'
      });
      
      console.log('地图初始化成功');
      
      // 添加控件
      map.addControl(new AMap.Scale());
      map.addControl(new AMap.ToolBar({
        position: 'RB'
      }));
      
      map.on('movestart', () => {
        userHasInteracted = true;
      });
      
      map.on('zoomchange', () => {
        userHasInteracted = true;
      });

      map.on('rightclick', (e) => {
        const lngLat = e && e.lnglat ? e.lnglat : null;
        if (!lngLat) return;
        const target = e && e.target;
        const targetName = target && (target.CLASS_NAME || target._className || target.className || '');
        if (targetName && targetName !== 'AMap.Map') {
          return;
        }
        pendingMapContext = {
          lng: lngLat.lng,
          lat: lngLat.lat,
          source: '地图任意点',
        };
        showMapContextMenu(lngLat.lng, lngLat.lat, e.originalEvent);
      });
    }

    console.log('创建标记，数量：', validScenics.length);

    // 创建自定义标记
    markers = validScenics.map(scenic => {
      const lng = parseFloat(scenic.lng);
      const lat = parseFloat(scenic.lat);

      const marker = new AMap.Marker({
        position: [lng, lat],
        content: createCustomMarkerContent(scenic),
        offset: new AMap.Pixel(-16, -40),
        zIndex: scenic.level === '5A' ? 120 : scenic.level === '4A' ? 110 : 100
      });

      marker.on('click', () => {
        map.setCenter([lng, lat]);
        map.setZoom(15);
        showDetail(scenic.id);
      });

      marker.on('rightclick', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (scenic.isCustom) {
          window.openEditScenicModal(scenic.id);
        }
      });

      return marker;
    });

    // 添加标记到地图
    map.add(markers);
    console.log('标记添加成功，数量：', markers.length);

    // 自动调整视野
    if (shouldAutoFit && !userHasInteracted) {
      if (markers.length === 1) {
        map.setCenter([validScenics[0].lng, validScenics[0].lat]);
        map.setZoom(12);
      } else {
        map.setFitView(markers);
      }
    }
  } catch (e) {
    console.error('地图操作失败：', e);
  }
}

// ========== 统计更新 ==========
function updateStats() {
  const total = currentScenics.length;
  const visited = currentScenics.filter(s => s.visited).length;
  const totalAll = scenicData.filter(isValidScenic).length;
  const visitedAll = visitedSet.size;
  
  document.getElementById('stats').innerHTML = `
    当前显示：<strong>${visited}/${total}</strong> 已打卡 | 
    总计：<strong>${visitedAll}/${totalAll}</strong> 已打卡
  `;
}

// ========== 行程列表 ==========
function renderTripList() {
  const container = document.getElementById('tripListContainer');
  if (!container) return;
  container.innerHTML = '';

  if (Object.keys(plannedTrips).length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.cssText = 'color:#aaa;font-size:13px;margin:6px 0;';
    emptyMsg.textContent = '暂无行程，快去景点详情页添加吧！';
    container.appendChild(emptyMsg);
  } else {
    for (const [name, ids] of Object.entries(plannedTrips)) {
      const count = ids.length;
      const isEditing = editingTripName === name;
      const div = document.createElement('div');
      div.style.cssText = `margin:8px 0;padding:8px 10px;background:${isEditing ? '#eaf4fb' : '#f8f9fa'};border-radius:5px;border:1px solid ${isEditing ? '#aed6f1' : '#eee'};`;

      // 按钮工厂
      const mkBtn = (label, bg, tip) => {
        const b = document.createElement('button');
        b.innerHTML = label; b.title = tip || '';
        b.style.cssText = `background:${bg};color:white;border:none;padding:3px 8px;border-radius:3px;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;`;
        return b;
      };

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;';

      const nameEl = document.createElement('strong');
      nameEl.style.cssText = 'flex:1;min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;';
      nameEl.title = name; nameEl.textContent = name;

      const countEl = document.createElement('span');
      countEl.style.cssText = 'color:#888;font-size:12px;white-space:nowrap;';
      countEl.textContent = `(${count}个景点)`;

      const prepBtn = mkBtn('📋 准备', '#8e44ad', '行程准备');
      prepBtn.onclick = () => window.openTripPrep(name);

      const routeBtn = mkBtn('🗺 路线', '#2ed573', '查看路线');
      routeBtn.onclick = () => viewTrip(name);

      const editBtn = mkBtn(isEditing ? '✕ 完成' : '✏ 编辑', isEditing ? '#e67e22' : '#3498db', '编辑景点');
      editBtn.onclick = () => window.toggleEditTrip(name);

      const delBtn = mkBtn('🗑', '#ff6b6b', '删除行程');
      delBtn.onclick = () => deleteTrip(name);

      header.append(nameEl, countEl, prepBtn, routeBtn, editBtn, delBtn);
      div.appendChild(header);

      if (isEditing) div.appendChild(createTripEditPanel(name));
      container.appendChild(div);
    }
  }

  // 新建行程行
  const newRow = document.createElement('div');
  newRow.style.cssText = 'margin-top:12px;display:flex;gap:6px;';
  const newInput = document.createElement('input');
  newInput.type = 'text'; newInput.id = 'newTripNameInput';
  newInput.placeholder = '输入新行程名称…';
  newInput.style.cssText = 'flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;outline:none;';
  newInput.onkeypress = (e) => { if (e.key === 'Enter') window.createNewTrip(); };
  const newBtn = document.createElement('button');
  newBtn.textContent = '+ 新建';
  newBtn.style.cssText = 'padding:6px 12px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;flex-shrink:0;';
  newBtn.onclick = () => window.createNewTrip();
  newRow.append(newInput, newBtn);
  container.appendChild(newRow);
}

// ===== 行程编辑面板 =====
function createTripEditPanel(name) {
  const panel = document.createElement('div');
  panel.style.cssText = 'margin-top:10px;padding:10px;background:white;border-radius:6px;border:1px solid #aed6f1;';

  const secLabel = document.createElement('div');
  secLabel.style.cssText = 'font-size:12px;font-weight:bold;color:#2471a3;margin-bottom:7px;';
  secLabel.textContent = '📍 当前景点（点 × 可移除）';
  panel.appendChild(secLabel);

  const spotsContainer = document.createElement('div');
  spotsContainer.id = 'tripEditCurrentSpots';
  spotsContainer.style.cssText = 'min-height:22px;margin-bottom:10px;line-height:1.8;';
  panel.appendChild(spotsContainer);

  const addLabel = document.createElement('div');
  addLabel.style.cssText = 'font-size:12px;color:#555;margin-bottom:5px;';
  addLabel.textContent = '搜索添加景点：';
  panel.appendChild(addLabel);

  const searchInput = document.createElement('input');
  searchInput.type = 'text'; searchInput.id = 'tripEditSearch';
  searchInput.placeholder = '输入景点名称、城市搜索…';
  searchInput.value = editingTripSearchKw;
  searchInput.style.cssText = 'width:100%;padding:6px 9px;border:1px solid #aed6f1;border-radius:4px;font-size:12px;box-sizing:border-box;margin-bottom:6px;outline:none;';
  searchInput.oninput = function () { window.searchForTripEdit(this.value); };
  panel.appendChild(searchInput);

  const resultsContainer = document.createElement('div');
  resultsContainer.id = 'tripEditResults';
  resultsContainer.style.cssText = 'max-height:170px;overflow-y:auto;border:1px solid #eee;border-radius:4px;';
  panel.appendChild(resultsContainer);

  renderTripEditSpots(name, spotsContainer);
  renderTripEditSearch(editingTripSearchKw, name, resultsContainer);
  return panel;
}

function renderTripEditSpots(name, container) {
  container.innerHTML = '';
  const ids = plannedTrips[name] || [];
  if (ids.length === 0) {
    container.innerHTML = '<span style="color:#aaa;font-size:12px;font-style:italic;">暂无景点</span>';
    return;
  }
  ids.forEach(id => {
    const s = scenicData.find(sc => sc.id === id);
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:2px 8px;margin:2px;background:#eaf4fb;border:1px solid #aed6f1;border-radius:12px;font-size:12px;color:#2471a3;';
    const nm = document.createElement('span');
    nm.textContent = s ? s.name : id;
    const rmBtn = document.createElement('button');
    rmBtn.textContent = '×'; rmBtn.title = '从行程中移除';
    rmBtn.style.cssText = 'background:none;border:none;color:#e74c3c;cursor:pointer;padding:0 1px;font-size:14px;line-height:1;font-weight:bold;';
    rmBtn.onclick = () => window.removeScenicFromTrip(id);
    chip.append(nm, rmBtn);
    container.appendChild(chip);
  });
}

function renderTripEditSearch(kw, name, container) {
  const currentIds = new Set(plannedTrips[name] || []);
  let candidates = scenicData.filter(s => isValidScenic(s) && !currentIds.has(s.id));
  if (kw && kw.trim()) {
    const lkw = kw.toLowerCase();
    candidates = candidates.filter(s =>
      s.name.toLowerCase().includes(lkw) ||
      (s.city && s.city.toLowerCase().includes(lkw)) ||
      (s.province && s.province.toLowerCase().includes(lkw))
    );
  }
  candidates = candidates.slice(0, 12);
  container.innerHTML = '';
  if (candidates.length === 0) {
    container.innerHTML = '<div style="padding:8px;color:#aaa;font-size:12px;text-align:center;">无匹配景点</div>';
    return;
  }
  candidates.forEach(s => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;padding:5px 8px;border-bottom:1px solid #f5f5f5;gap:6px;';
    const nmEl = document.createElement('span');
    nmEl.style.cssText = 'flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nmEl.textContent = s.name;
    const locEl = document.createElement('span');
    locEl.style.cssText = 'font-size:11px;color:#aaa;white-space:nowrap;';
    locEl.textContent = s.city || s.province || '';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ 添加';
    addBtn.style.cssText = 'padding:2px 8px;background:#27ae60;color:white;border:none;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0;';
    addBtn.onclick = () => window.addScenicToTripEdit(s.id);
    row.append(nmEl, locEl, addBtn);
    container.appendChild(row);
  });
}

window.searchForTripEdit = function (kw) {
  editingTripSearchKw = kw;
  const container = document.getElementById('tripEditResults');
  if (!container || !editingTripName) return;
  renderTripEditSearch(kw, editingTripName, container);
};

window.removeScenicFromTrip = function (scenicId) {
  if (!editingTripName || !plannedTrips[editingTripName]) return;
  plannedTrips[editingTripName] = plannedTrips[editingTripName].filter(id => id !== scenicId);
  savePlannedTripsForUser(currentUser, plannedTrips);
  renderTripList();
};

window.addScenicToTripEdit = function (scenicId) {
  if (!editingTripName) return;
  if (!plannedTrips[editingTripName]) plannedTrips[editingTripName] = [];
  if (plannedTrips[editingTripName].includes(scenicId)) return;
  plannedTrips[editingTripName].push(scenicId);
  savePlannedTripsForUser(currentUser, plannedTrips);
  const s = scenicData.find(sc => sc.id === scenicId);
  if (s) showToast(`「${s.name}」已添加`);
  renderTripList();
};

window.toggleEditTrip = function (name) {
  editingTripName = editingTripName === name ? null : name;
  editingTripSearchKw = '';
  renderTripList();
};

window.createNewTrip = function () {
  if (!currentUser) { alert('请先登录！'); return; }
  const input = document.getElementById('newTripNameInput');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  if (plannedTrips[name]) { alert(`行程「${name}」已存在！`); return; }
  plannedTrips[name] = [];
  savePlannedTripsForUser(currentUser, plannedTrips);
  if (input) input.value = '';
  renderTripList();
  showToast(`行程「${name}」已创建`);
};

function viewTrip(tripName) {
  const ids = plannedTrips[tripName];
  if (!ids || ids.length === 0) {
    alert('该行程为空！');
    return;
  }

  let points = ids.map(id => {
    const s = scenicData.find(s => s.id === id);
    return s && isValidScenic(s) ? { 
      id: s.id, 
      lat: parseFloat(s.lat), 
      lng: parseFloat(s.lng), 
      name: s.name 
    } : null;
  }).filter(Boolean);

  if (points.length === 0) {
    alert('无法获取行程中的景点坐标！');
    return;
  }

  // 切换到路线分屏视图
  const listContainer = document.getElementById('listContainer');
  const mapContainer  = document.getElementById('mapContainer');
  const routePanel    = document.getElementById('routeSidePanel');
  const viewArea      = document.getElementById('viewArea');
  const toggleBtn     = document.getElementById('toggleView');

  listContainer.style.display = 'none';
  mapContainer.style.visibility = 'visible';
  routePanel.style.display = 'block';
  viewArea.classList.add('split-view');
  toggleBtn.textContent = '切换到列表模式';
  userHasInteracted = false;

  createMapMarkers(false);

  // 绘制带箭头弧线路线
  function drawRoute(optimizedPoints) {
    setTimeout(function() {
      if (!map) return;
      if (window.currentRoutePointers) {
        map.remove(window.currentRoutePointers);
      }

      var allObjects = [];

      // 逐段绘制贝塞尔弧线
      for (var si = 0; si < optimizedPoints.length - 1; si++) {
        var arcPts = computeArcPoints(optimizedPoints[si], optimizedPoints[si + 1]);
        var polyline = new AMap.Polyline({
          path: arcPts.map(function(p) { return new AMap.LngLat(p[0], p[1]); }),
          isOutline: true,
          outlineColor: 'rgba(255,255,255,0.55)',
          borderWeight: 2,
          strokeColor: '#3366FF',
          strokeOpacity: 0.92,
          strokeWeight: 5,
          strokeStyle: 'solid',
          lineJoin: 'round',
          lineCap: 'round',
          showDir: true,
          zIndex: 50
        });
        allObjects.push(polyline);
      }

      // 编号标记（含景点名称）
      optimizedPoints.forEach(function(p, i) {
        var isFirst = i === 0;
        var isLast  = i === optimizedPoints.length - 1;
        var bg = '#e74c3c';
        var label = String(i + 1);
        if (isFirst && p.isCustomEndpoint) { bg = '#27ae60'; label = '起'; }
        if (isLast  && p.isCustomEndpoint) { bg = '#e67e22'; label = '终'; }
        var pName = p.name || '';
        var nameHtml = pName
          ? '<div style="display:inline-block;white-space:nowrap;background:rgba(30,39,46,0.85);color:white;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:8px;margin-bottom:3px;max-width:120px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,0.25);">' + pName + '</div><br>'
          : '';
        var numMarker = new AMap.Marker({
          position: [p.lng, p.lat],
          content: '<div style="text-align:center;">' + nameHtml +
            '<div style="background:' + bg + ';color:white;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);font-size:12px;">' + label + '</div>' +
            '</div>',
          offset: new AMap.Pixel(-13, pName ? -34 : -13),
          zIndex: 100,
          title: pName
        });
        allObjects.push(numMarker);
      });

      window.currentRoutePointers = allObjects;
      map.add(allObjects);
      map.setFitView(allObjects);
    }, 300);
  }

  // 初始绘制
  drawRoute(points);

  let totalDist = calculateTotalDistance(points);
  let customStart = null, customEnd = null;
  const scenicPts = [...points]; // 景点原始列表（不含自定义途经点）
  let customWaypoints = [];       // 自定义途经地点（酒店/车站等）
  let dragSrcIdx = null;          // 拖动排序用

  function refreshRouteDisplay() {
    totalDist = calculateTotalDistance(points);
    const dv = document.getElementById('distValue_rp');
    if (dv) dv.textContent = totalDist.toFixed(1) + ' km';
    const listEl = document.getElementById('routeList_rp');
    if (listEl) {
      listEl.innerHTML = '';
      points.forEach((p, idx) => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.idx = String(idx);
        li.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 2px;border-top:2px solid transparent;cursor:grab;transition:border-color 0.12s,opacity 0.12s;';
        const icon = p.isCustomEndpoint ? (idx === 0 ? '🟢' : '🔴') : p.isWaypoint ? '📌' : '📍';
        li.innerHTML = `<span style="color:#ccc;font-size:10px;user-select:none;flex-shrink:0;">⠿⠿</span><span>${icon} <strong>${idx + 1}.</strong> ${p.name || '自定义'}</span>`;
        li.addEventListener('dragstart', (e) => {
          dragSrcIdx = idx;
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => { li.style.opacity = '0.4'; }, 0);
        });
        li.addEventListener('dragend', () => { li.style.opacity = '1'; });
        li.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        li.addEventListener('dragenter', () => { li.style.borderTop = '2px solid #3498db'; });
        li.addEventListener('dragleave', () => { li.style.borderTop = '2px solid transparent'; });
        li.addEventListener('drop', (e) => {
          e.preventDefault();
          li.style.borderTop = '2px solid transparent';
          const dropIdx = parseInt(li.dataset.idx);
          if (dragSrcIdx === null || dragSrcIdx === dropIdx) return;
          const [moved] = points.splice(dragSrcIdx, 1);
          points.splice(dropIdx, 0, moved);
          dragSrcIdx = null;
          refreshRouteDisplay();
        });
        listEl.appendChild(li);
      });
    }
    drawRoute(points);
    renderCustomWaypointList_();
  }

  function renderCustomWaypointList_() {
    const el = document.getElementById('customWaypointList_rp');
    if (!el) return;
    el.innerHTML = '';
    if (customWaypoints.length === 0) {
      el.innerHTML = '<div style="font-size:11px;color:#aaa;padding:2px 0;">暂无途经地点</div>';
      return;
    }
    customWaypoints.forEach((wp, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 0;font-size:12px;';
      const nm = document.createElement('span'); nm.style.flex = '1';
      nm.textContent = '📌 ' + wp.name;
      const rm = document.createElement('button');
      rm.textContent = '×'; rm.title = '从路线移除';
      rm.style.cssText = 'background:none;border:none;color:#e74c3c;cursor:pointer;font-size:14px;padding:0;line-height:1;';
      rm.onclick = () => window.removeCustomWaypoint(i);
      row.append(nm, rm);
      el.appendChild(row);
    });
  }

  window.removeCustomWaypoint = function(idx) {
    const wp = customWaypoints[idx];
    customWaypoints.splice(idx, 1);
    points = points.filter(p => !(p.isWaypoint && p.lat === wp.lat && p.lng === wp.lng));
    refreshRouteDisplay();
  };

  // 填充路线侧边栏
  routePanel.innerHTML = `
    <div class="route-panel-header">
      <strong style="font-size:14px;color:#2c3e50;">🗺 ${tripName}</strong>
      <button onclick="closeRouteView()" class="route-close-btn">✕ 关闭</button>
    </div>
    <p style="font-size:12px;color:#7f8c8d;margin:0 0 10px 0;">总直线距离: <strong id="distValue_rp">${totalDist.toFixed(1)} km</strong></p>
    <div style="margin-bottom:8px;">
      <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
        <input type="checkbox" id="fixStartEnd_rp" style="margin:0;"> 固定自定义起点和终点
      </label>
    </div>
    <div id="customStartEndPanel_rp" style="display:none;margin-bottom:10px;">
      <div class="route-location-search">
        <label>📍 起点</label>
        <input type="text" id="startSearchInput_rp" placeholder="搜索起点名称…" autocomplete="off">
        <div id="startSuggestions_rp" class="search-suggestions" style="display:none;"></div>
        <div id="startSelectedTip_rp" style="font-size:11px;color:#27ae60;margin-top:3px;min-height:14px;"></div>
      </div>
      <div class="route-location-search">
        <label>🏁 终点</label>
        <input type="text" id="endSearchInput_rp" placeholder="搜索终点名称…" autocomplete="off">
        <div id="endSuggestions_rp" class="search-suggestions" style="display:none;"></div>
        <div id="endSelectedTip_rp" style="font-size:11px;color:#e67e22;margin-top:3px;min-height:14px;"></div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
      <button id="optimizeBtn_rp" style="padding:5px 10px;background:#27ae60;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">🗺 规划路线</button>
      <button id="clearRouteBtn_rp" style="padding:5px 10px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">🗑 清除路线</button>
    </div>
    <div style="margin-bottom:10px;padding:8px;background:#f8f9fa;border-radius:6px;border:1px solid #eee;">
      <div style="font-size:12px;font-weight:bold;color:#2471a3;margin-bottom:6px;">📌 添加途经地点（酒店/车站/机场等）</div>
      <div class="route-location-search">
        <input type="text" id="waypointSearchInput_rp" placeholder="搜索地点名称…" autocomplete="off">
        <div id="waypointSuggestions_rp" class="search-suggestions" style="display:none;"></div>
        <div id="waypointSelectedTip_rp" style="font-size:11px;color:#3498db;margin-top:3px;min-height:14px;"></div>
      </div>
      <button id="addWaypointBtn_rp" style="padding:4px 12px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-top:5px;">+ 加入路线</button>
      <div id="customWaypointList_rp" style="margin-top:6px;"></div>
    </div>
    <ul id="routeList_rp" style="margin:0;padding:0;color:#34495e;font-size:13px;list-style:none;" title="可拖动条目调整顺序">
      ${points.map((p, idx) => `<li><strong>${idx + 1}.</strong> ${p.name}</li>`).join('')}
    </ul>
  `;

  document.getElementById('fixStartEnd_rp').addEventListener('change', function () {
    document.getElementById('customStartEndPanel_rp').style.display = this.checked ? 'block' : 'none';
    if (!this.checked) {
      customStart = null; customEnd = null;
      ['startSearchInput_rp', 'endSearchInput_rp'].forEach(id => { document.getElementById(id).value = ''; });
      ['startSelectedTip_rp', 'endSelectedTip_rp'].forEach(id => { document.getElementById(id).textContent = ''; });
    }
  });

  function initLocSearch(inputId, suggestionsId, tipId, onSelect) {
    const input = document.getElementById(inputId);
    const sugEl = document.getElementById(suggestionsId);
    const tipEl = document.getElementById(tipId);
    if (!input) return;
    let debounce = null;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      const kw = this.value.trim();
      if (!kw) { sugEl.style.display = 'none'; return; }
      debounce = setTimeout(() => {
        new AMap.AutoComplete({ city: '' }).search(kw, function (status, result) {
          sugEl.innerHTML = '';
          if (status === 'complete' && result.tips && result.tips.length > 0) {
            result.tips.filter(t => t.location).slice(0, 8).forEach(tip => {
              const item = document.createElement('div');
              item.className = 'suggestion-item';
              item.textContent = tip.name + (tip.district ? '  ' + tip.district : '');
              item.onclick = () => {
                input.value = tip.name; sugEl.style.display = 'none';
                tipEl.textContent = '✔ 已选：' + tip.name;
                onSelect({ name: tip.name, lng: tip.location.lng, lat: tip.location.lat });
              };
              sugEl.appendChild(item);
            });
            sugEl.style.display = 'block';
          } else {
            sugEl.style.display = 'none';
          }
        });
      }, 300);
    });
    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !sugEl.contains(e.target)) sugEl.style.display = 'none';
    });
  }
  initLocSearch('startSearchInput_rp', 'startSuggestions_rp', 'startSelectedTip_rp', loc => { customStart = loc; });
  initLocSearch('endSearchInput_rp', 'endSuggestions_rp', 'endSelectedTip_rp', loc => { customEnd = loc; });

  let pendingWaypoint = null;
  initLocSearch('waypointSearchInput_rp', 'waypointSuggestions_rp', 'waypointSelectedTip_rp', loc => { pendingWaypoint = loc; });

  document.getElementById('addWaypointBtn_rp').onclick = () => {
    const tipEl = document.getElementById('waypointSelectedTip_rp');
    if (!pendingWaypoint) {
      if (tipEl) tipEl.textContent = '⚠ 请先搜索并选择一个地点';
      return;
    }
    const wp = { ...pendingWaypoint, isWaypoint: true };
    customWaypoints.push(wp);
    points.push(wp);
    pendingWaypoint = null;
    document.getElementById('waypointSearchInput_rp').value = '';
    if (tipEl) tipEl.textContent = '';
    refreshRouteDisplay();
  };

  document.getElementById('clearRouteBtn_rp').onclick = () => {
    if (window.currentRoutePointers && map) { map.remove(window.currentRoutePointers); window.currentRoutePointers = null; }
  };

  document.getElementById('optimizeBtn_rp').onclick = () => {
    const fixedSE = document.getElementById('fixStartEnd_rp').checked;
    const basePts = [...scenicPts, ...customWaypoints];
    let newPts = (fixedSE && (customStart || customEnd))
      ? buildRouteWithCustomEndpoints(basePts, customStart, customEnd)
      : optimizeRoute(basePts, fixedSE);
    points = newPts;
    refreshRouteDisplay();
  };

  renderCustomWaypointList_(); // 初始显示途经地点列表
}

window.closeRouteView = function () {
  const routePanel = document.getElementById('routeSidePanel');
  const viewArea   = document.getElementById('viewArea');
  if (routePanel) routePanel.style.display = 'none';
  if (viewArea)   viewArea.classList.remove('split-view');
  if (window.currentRoutePointers && map) {
    map.remove(window.currentRoutePointers);
    window.currentRoutePointers = null;
  }
  const listContainer = document.getElementById('listContainer');
  const mapContainer  = document.getElementById('mapContainer');
  const toggleBtn     = document.getElementById('toggleView');
  if (listContainer) listContainer.style.display = 'block';
  if (mapContainer)  mapContainer.style.visibility = 'hidden';
  if (toggleBtn)     toggleBtn.textContent = '切换到地图模式';
};

window.toggleTripPanel = function () {
  const body = document.getElementById('tripPanelBody');
  const btn  = document.getElementById('tripPanelToggle');
  if (!body || !btn) return;
  if (body.style.display === 'none') {
    body.style.display = 'block';
    btn.textContent = '▲ 收起';
  } else {
    body.style.display = 'none';
    btn.textContent = '▼ 展开';
  }
};

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function optimizeRoute(points, fixedStartEnd = false) {
  if (points.length <= 2) return points; // 不需要排序

  if (fixedStartEnd) {
    // 固定起点和终点，只排序中间的景点
    const start = points[0];
    const end = points[points.length - 1];
    const middle = points.slice(1, -1);
    
    // 使用最近邻算法排序中间景点
    const sortedMiddle = nearestNeighborSort(middle, start, end);
    return [start, ...sortedMiddle, end];
  } else {
    // 不固定起点和终点，找到最优起点
    let bestRoute = points;
    let minDistance = calculateTotalDistance(points);
    
    // 尝试每个景点作为起点
    for (let i = 0; i < points.length; i++) {
      const route = nearestNeighborSort(points, null, null, i);
      const distance = calculateTotalDistance(route);
      if (distance < minDistance) {
        minDistance = distance;
        bestRoute = route;
      }
    }
    return bestRoute;
  }
}

function nearestNeighborSort(points, startPoint = null, endPoint = null, startIndex = 0) {
  const remaining = [...points];
  const route = [];
  
  // 如果有固定起点，从指定索引开始
  if (startPoint) {
    route.push(startPoint);
  } else {
    route.push(remaining.splice(startIndex, 1)[0]);
  }
  
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const distance = haversineDistance(
        route[route.length - 1].lat, route[route.length - 1].lng,
        remaining[i].lat, remaining[i].lng
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }
    
    route.push(remaining.splice(nearestIndex, 1)[0]);
  }
  
  // 如果有固定终点，确保终点是最后一个
  if (endPoint && route[route.length - 1] !== endPoint) {
    // 如果终点不在最后，移除并添加到末尾
    const endIndex = route.findIndex(p => p.id === endPoint.id);
    if (endIndex !== -1) {
      route.splice(endIndex, 1);
      route.push(endPoint);
    }
  }
  
  return route;
}

function calculateTotalDistance(routePoints) {
  let totalDist = 0;
  for (let i = 0; i < routePoints.length - 1; i++) {
    totalDist += haversineDistance(
      routePoints[i].lat, routePoints[i].lng,
      routePoints[i + 1].lat, routePoints[i + 1].lng
    );
  }
  return totalDist;
}

function deleteTrip(tripName) {
  if (confirm(`确定删除行程「${tripName}」吗？`)) {
    delete plannedTrips[tripName];
    savePlannedTripsForUser(currentUser, plannedTrips);
    renderTripList();
  }
}

// ========== 认证辅助函数 ==========
async function handleAuth() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  const isRegister = document.getElementById('authTitle').textContent === '用户注册';
  
  if (!username || !password) {
    alert('请输入用户名和密码！');
    return;
  }
  
  if (isRegister) {
    if (await register(username, password)) {
      alert('注册成功，请登录！');
      toggleAuthMode();
    } else {
      alert('用户名已存在！');
    }
  } else {
    if (await login(username, password)) {
      document.getElementById('usernameInput').value = '';
      document.getElementById('passwordInput').value = '';
    } else {
      alert('用户名或密码错误！');
    }
  }
}

function toggleAuthMode() {
  const title = document.getElementById('authTitle');
  const btn = document.querySelector('#authModal .auth-btn');
  if (title.textContent === '用户登录') {
    title.textContent = '用户注册';
    btn.textContent = '注册';
  } else {
    title.textContent = '用户登录';
    btn.textContent = '登录';
  }
}

// ========== 页面初始化 ==========
document.addEventListener('DOMContentLoaded', async function () {
  console.log('DOM加载完成');

  const ctxMenu = document.getElementById('mapContextMenu');
  if (ctxMenu) {
    ctxMenu.addEventListener('click', (e) => e.stopPropagation());
    const addBtn = document.getElementById('ctxAddScenicBtn');
    const pointBtn = document.getElementById('ctxAddPointBtn');
    if (addBtn) addBtn.onclick = openMapContextScenicEditor;
    if (pointBtn) pointBtn.onclick = recordMapContextPoint;
  }
  const mapContainer = document.getElementById('mapContainer');
  if (mapContainer) {
    mapContainer.addEventListener('contextmenu', (e) => {
      if (!mapContainer || mapContainer.style.visibility !== 'visible') return;
      const isPoi = e.target && (e.target.closest('.amap-marker') || e.target.closest('.amap-icon') || e.target.closest('.amap-marker-label'));
      if (isPoi) return;
      e.preventDefault();
      const rect = mapContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lngLat = map && typeof map.containerToLngLat === 'function'
        ? map.containerToLngLat([x, y])
        : null;
      if (lngLat && typeof lngLat.lng === 'number' && typeof lngLat.lat === 'number') {
        pendingMapContext = { lng: lngLat.lng, lat: lngLat.lat, source: '地图任意点' };
        showMapContextMenu(lngLat.lng, lngLat.lat, e);
      }
    });
  }
  document.addEventListener('click', hideMapContextMenu);
  document.addEventListener('scroll', hideMapContextMenu, true);

  await TravelDB.init();
  scenicData = (await TravelDB.getAllScenics()).filter(s => !s.isCustom);

  initProvinceCity();
  initFilters();

  allScenics = scenicData.filter(isValidScenic);

  const savedUser = localStorage.getItem('current_5a_user');
  if (savedUser) {
    const savedUserRecord = await TravelDB.getUser(savedUser);
    if (savedUserRecord) {
      currentUser = savedUser;
      document.getElementById('currentUser').textContent = savedUser;
      document.getElementById('userBar').style.display = 'block';
      currentUserData = await TravelDB.getUserData(savedUser);
      visitedSet = new Set(currentUserData.visited || []);
      plannedTrips = currentUserData.trips || {};
      userRatings = currentUserData.ratings || {};
      loadCustomScenics(currentUserData.customScenics || []);
      refreshProvinceSelect();
      applyRatingsToData();
      applyVisitedToData();
      currentScenics = scenicData.filter(isValidScenic);
      renderList();
      updateStats();
    } else {
      localStorage.removeItem('current_5a_user');
      document.getElementById('authModal').style.display = 'flex';
      currentScenics = scenicData.filter(isValidScenic);
      renderList();
      updateStats();
    }
  } else {
    document.getElementById('authModal').style.display = 'flex';
    plannedTrips = {};
    currentScenics = scenicData.filter(isValidScenic);
    renderList();
    updateStats();
  }

  // 关闭模态框
  document.querySelectorAll('.close').forEach(el => {
    el.onclick = function() {
      this.closest('.modal').style.display = 'none';
    };
  });

  window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
      if (event.target.id === 'authModal' && !currentUser) return;
      event.target.style.display = 'none';
    }
  };

  renderTripList();
  
  // 登录注册按钮绑定
  const authBtn = document.querySelector('#authModal .auth-btn');
  if (authBtn) {
    authBtn.onclick = handleAuth;
  }
  
  const toggleAuth = document.querySelector('#authModal a');
  if (toggleAuth) {
    toggleAuth.onclick = function(e) {
      e.preventDefault();
      toggleAuthMode();
    };
  }

  // 密码框回车登录
  document.getElementById('passwordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleAuth();
  });
});

// ========== 快速加入行程（列表内直接操作） ==========
let quickTripTargetId = null;

window.quickAddToTrip = function(id) {
  if (!currentUser) { alert('请先登录！'); return; }
  quickTripTargetId = id;
  const scenic = scenicData.find(s => s.id === id);
  if (!scenic) return;

  const nameEl  = document.getElementById('quickTripScenicName');
  const btnsEl  = document.getElementById('quickTripBtns');
  const input   = document.getElementById('quickTripInput');

  nameEl.textContent = '景点：' + scenic.name;
  btnsEl.innerHTML = '';
  input.value = '';

  Object.keys(plannedTrips).forEach(name => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = 'padding:4px 10px;background:#eaf4fb;border:1px solid #aed6f1;border-radius:12px;font-size:12px;cursor:pointer;color:#2980b9;transition:background 0.2s;';
    btn.onmouseover = () => btn.style.background = '#d6eaf8';
    btn.onmouseout  = () => btn.style.background = '#eaf4fb';
    btn.onclick = () => { input.value = name; input.focus(); };
    btnsEl.appendChild(btn);
  });

  if (Object.keys(plannedTrips).length === 0) {
    btnsEl.innerHTML = '<span style="font-size:12px;color:#aaa;">暂无行程，请输入新行程名称</span>';
  }

  document.getElementById('quickTripOverlay').style.display  = 'block';
  document.getElementById('quickTripBackdrop').style.display = 'block';
  setTimeout(() => input.focus(), 50);
};

window.confirmQuickAddToTrip = function() {
  const tripName = document.getElementById('quickTripInput').value.trim();
  if (!tripName) { alert('请输入或选择行程名称！'); return; }
  if (!quickTripTargetId) return;
  const scenic = scenicData.find(s => s.id === quickTripTargetId);
  if (!scenic) return;

  if (!plannedTrips[tripName]) plannedTrips[tripName] = [];
  if (!plannedTrips[tripName].includes(quickTripTargetId)) {
    plannedTrips[tripName].push(quickTripTargetId);
    savePlannedTripsForUser(currentUser, plannedTrips);
    renderTripList();
    closeQuickTripOverlay();
    showToast(`「${scenic.name}」已加入行程「${tripName}」`);
  } else {
    closeQuickTripOverlay();
    showToast(`该景点已在行程「${tripName}」中`);
  }
};

window.closeQuickTripOverlay = function() {
  document.getElementById('quickTripOverlay').style.display  = 'none';
  document.getElementById('quickTripBackdrop').style.display = 'none';
  quickTripTargetId = null;
};

// Enter 键确认
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('quickTripOverlay').style.display === 'block') {
    window.confirmQuickAddToTrip();
  }
});

// ========== Toast 提示 ==========
function showToast(msg) {
  let toast = document.getElementById('toastMsg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastMsg';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// 全局暴露函数
window.showDetail = showDetail;
window.quickToggleVisit = quickToggleVisit;
window.deleteTrip = deleteTrip;
window.viewTrip = viewTrip;
window.handleAuth = handleAuth;
window.toggleAuthMode = toggleAuthMode;

window.openTripPrep = function(name) {
  if (!currentUser) { alert('请先登录！'); return; }
  window.open('trip-prep.html?trip=' + encodeURIComponent(name), '_blank');
};

function hideMapContextMenu() {
  const menu = document.getElementById('mapContextMenu');
  if (menu) menu.style.display = 'none';
  pendingMapContext = null;
}

function showMapContextMenu(lng, lat, originalEvent) {
  const menu = document.getElementById('mapContextMenu');
  if (!menu) return;
  const x = originalEvent && typeof originalEvent.clientX === 'number' ? originalEvent.clientX : window.innerWidth / 2;
  const y = originalEvent && typeof originalEvent.clientY === 'number' ? originalEvent.clientY : window.innerHeight / 2;
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 120) + 'px';
  menu.style.display = 'block';
  pendingMapContext = { lng, lat, source: '地图任意点' };
}

function openMapContextScenicEditor() {
  const ctx = pendingMapContext;
  if (!ctx) return;
  const prefill = { ...ctx };
  const finish = () => {
    hideMapContextMenu();
    window.openAddScenicModal(prefill);
  };

  if (typeof AMap !== 'undefined' && AMap.Geocoder) {
    const geocoder = new AMap.Geocoder();
    geocoder.getAddress([ctx.lng, ctx.lat], (status, result) => {
      if (status === 'complete' && result && result.regeocode) {
        const regeocode = result.regeocode;
        const comp = regeocode.addressComponent || {};
        prefill.address = regeocode.formattedAddress || '';
        prefill.province = comp.province || '';
        prefill.city = comp.city || comp.district || '';
        const poiName = (regeocode.pois && regeocode.pois[0] && regeocode.pois[0].name) || '';
        prefill.name = poiName || regeocode.formattedAddress || `自定义景点 ${ctx.lng.toFixed(5)}, ${ctx.lat.toFixed(5)}`;
      } else {
        prefill.name = `自定义景点 ${ctx.lng.toFixed(5)}, ${ctx.lat.toFixed(5)}`;
      }
      finish();
    });
  } else {
    prefill.name = `自定义景点 ${ctx.lng.toFixed(5)}, ${ctx.lat.toFixed(5)}`;
    finish();
  }
}

function recordMapContextPoint() {
  const ctx = pendingMapContext;
  if (!ctx) return;
  hideMapContextMenu();
  showToast(`已选中坐标：${ctx.lng.toFixed(5)}, ${ctx.lat.toFixed(5)}`);
}

// ========== 自定义景点数据库 ==========
function loadCustomScenics(customScenics) {
  // 先移除上一次加载的自定义景点
  clearCustomScenicsFromData();
  const raw = customScenics || [];

  // 按 id 去重
  const seen = new Set();
  const deduped = raw.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  if (deduped.length !== raw.length) {
    console.log(`[自定义景点] 去除重复条目 ${raw.length - deduped.length} 条`);
  }

  deduped.forEach(s => {
    s.activities = Array.isArray(s.activities) ? s.activities : (DEFAULT_ACTIVITIES_BY_CATEGORY[s.category] || []);
    s.visited = visitedSet.has(s.id);
    scenicData.push(s);
  });
  allScenics = scenicData.filter(isValidScenic);
}

function clearCustomScenicsFromData() {
  for (let i = scenicData.length - 1; i >= 0; i--) {
    if (scenicData[i].isCustom) scenicData.splice(i, 1);
  }
}

function saveCustomScenicToStorage(scenic) {
  const existing = (currentUserData && currentUserData.customScenics) || [];
  const next = existing.concat([scenic]);
  currentUserData = { ...(currentUserData || {}), username: currentUser, customScenics: next };
  TravelDB.saveUserData(currentUser, { customScenics: next }).catch(console.error);
}

function syncCustomScenicsToStorage(list) {
  currentUserData = { ...(currentUserData || {}), username: currentUser, customScenics: list };
  TravelDB.saveUserData(currentUser, { customScenics: list }).catch(console.error);
}

function getSelectedActivities() {
  const container = document.getElementById('asfActivities');
  if (!container) return [];
  return Array.from(container.querySelectorAll('.activity-chip[data-selected="true"]'))
    .map(c => c.dataset.value);
}

function setSelectedActivities(values) {
  const set = new Set(values || []);
  const container = document.getElementById('asfActivities');
  if (!container) return;
  container.querySelectorAll('.activity-chip').forEach(chip => {
    const sel = set.has(chip.dataset.value);
    chip.dataset.selected = String(sel);
    chip.classList.toggle('selected', sel);
  });
}

function initAddScenicActivityOptions() {
  const container = document.getElementById('asfActivities');
  if (!container) return;
  container.innerHTML = '';
  Object.entries(ACTIVITY_CATEGORIES).forEach(([cat, acts]) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'activity-picker-group';
    const labelEl = document.createElement('div');
    labelEl.className = 'activity-picker-group-label';
    labelEl.textContent = cat;
    groupDiv.appendChild(labelEl);
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'activity-picker-chips';
    acts.forEach(act => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'activity-chip';
      chip.textContent = act;
      chip.dataset.value = act;
      chip.dataset.selected = 'false';
      chip.addEventListener('click', function () {
        const nowSelected = this.dataset.selected !== 'true';
        this.dataset.selected = String(nowSelected);
        this.classList.toggle('selected', nowSelected);
      });
      chipsDiv.appendChild(chip);
    });
    groupDiv.appendChild(chipsDiv);
    container.appendChild(groupDiv);
  });
}

window.closeAddScenicModal = function() {
  document.getElementById('addScenicModal').style.display = 'none';
};

window.toggleActivityPicker = function() {
  const wrap = document.getElementById('asfActivitiesWrap');
  const btn  = document.getElementById('asfActivityToggle');
  if (!wrap) return;
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  btn.textContent = isOpen ? '\u25bc \u5c55\u5f00\u9009\u62e9' : '\u25b2 \u6536\u8d77';
};

window.confirmActivityPicker = function() {
  const sel = getSelectedActivities();
  const countEl  = document.getElementById('asfActivityCount');
  const wrap     = document.getElementById('asfActivitiesWrap');
  const btn      = document.getElementById('asfActivityToggle');
  if (countEl) countEl.textContent = sel.length > 0 ? `\u5df2\u9009 ${sel.length} \u4e2a\u6807\u7b7e` : '';
  if (wrap) wrap.style.display = 'none';
  if (btn)  btn.textContent = '\u25bc \u5c55\u5f00\u9009\u62e9';
};

let editingScenicId = null;

window.openAddScenicModal = function(prefill = {}) {
  if (!currentUser) { alert('请先登录后再添加景点！'); return; }
  editingScenicId = null;
  document.getElementById('addScenicModalTitle').textContent = '🗺️ 添加自定义景点';
  document.getElementById('addScenicSaveBtn').textContent = '✅ 保存景点';
  ['asfName','asfProvince','asfCity','asfTicket','asfFeatures','asfIntro','asfLng','asfLat','asfRating'].forEach(id => {
    document.getElementById(id).value = '';
  });
  initAddScenicActivityOptions();
  setSelectedActivities([]);
  document.getElementById('asfCategory').value = '自定义';
  if (prefill && typeof prefill === 'object') {
    if (prefill.name) document.getElementById('asfName').value = prefill.name;
    if (prefill.province) document.getElementById('asfProvince').value = prefill.province;
    if (prefill.city) document.getElementById('asfCity').value = prefill.city;
    if (typeof prefill.lng !== 'undefined') document.getElementById('asfLng').value = prefill.lng;
    if (typeof prefill.lat !== 'undefined') document.getElementById('asfLat').value = prefill.lat;
    if (prefill.address || prefill.source) {
      document.getElementById('addScenicSearchResults').innerHTML =
        `<div style="padding:6px;background:#eaf4fb;border-radius:4px;font-size:13px;color:#2980b9;">📍 来自${prefill.source || '地图'}：${prefill.address ? `${prefill.address}` : '已获取坐标，可直接补全信息后保存'}</div>`;
    }
  }
  document.getElementById('addScenicSearch').value = '';
  const addDelBtn = document.getElementById('deleteScenicBtn');
  if (addDelBtn) addDelBtn.style.display = 'none';
  document.getElementById('addScenicModal').style.display = 'flex';
};

window.openEditScenicModal = function(id) {
  const scenic = scenicData.find(s => s.id === id);
  if (!scenic || !scenic.isCustom) return;
  editingScenicId = id;
  document.getElementById('addScenicModalTitle').textContent = '✏️ 编辑景点';
  document.getElementById('addScenicSaveBtn').textContent = '✅ 保存修改';
  document.getElementById('asfName').value     = scenic.name || '';
  document.getElementById('asfProvince').value = scenic.province || '';
  document.getElementById('asfCity').value     = scenic.city || '';
  document.getElementById('asfCategory').value = scenic.category || '自定义';
  document.getElementById('asfTicket').value   = (scenic.ticket === '免费' ? '' : scenic.ticket) || '';
  document.getElementById('asfFeatures').value = scenic.features || '';
  document.getElementById('asfIntro').value    = scenic.intro || '';
  initAddScenicActivityOptions();
  setSelectedActivities(scenic.activities || getActivities(scenic));
  // reset picker collapse state, show selected count
  const _wrap1 = document.getElementById('asfActivitiesWrap');
  const _btn1  = document.getElementById('asfActivityToggle');
  const _cnt1  = document.getElementById('asfActivityCount');
  const _selActs = scenic.activities || getActivities(scenic);
  if (_wrap1) _wrap1.style.display = 'none';
  if (_btn1)  _btn1.textContent = '\u25bc \u5c55\u5f00\u9009\u62e9';
  if (_cnt1)  _cnt1.textContent = _selActs.length > 0 ? `\u5df2\u9009 ${_selActs.length} \u4e2a\u6807\u7b7e` : '';
  document.getElementById('asfRating').value   = scenic.userRating || '';
  document.getElementById('asfLng').value      = scenic.lng || '';
  document.getElementById('asfLat').value      = scenic.lat || '';
  document.getElementById('addScenicSearchResults').innerHTML =
    `<div style="padding:6px;background:#fef9e7;border-radius:4px;font-size:13px;color:#e67e22;">✏️ 正在编辑「${scenic.name}」，修改后点击保存</div>`;
  document.getElementById('addScenicSearch').value = '';
  const editDelBtn = document.getElementById('deleteScenicBtn');
  if (editDelBtn) editDelBtn.style.display = 'inline-block';
  document.getElementById('addScenicModal').style.display = 'flex';
};

window.searchAddScenic = function() {
  const keyword = document.getElementById('addScenicSearch').value.trim();
  if (!keyword) return;
  const resultsEl = document.getElementById('addScenicSearchResults');
  resultsEl.innerHTML = '<p style="color:#999;font-size:13px;padding:6px;">🔍 搜索中…</p>';

  const placeSearch = new AMap.PlaceSearch({ pageSize: 10, city: '' });
  placeSearch.search(keyword, function(status, result) {
    resultsEl.innerHTML = '';
    if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
      result.poiList.pois.forEach(poi => {
        const div = document.createElement('div');
        div.className = 'poi-result-item';
        div.innerHTML = `<strong>${poi.name}</strong> <span style="color:#999;font-size:12px;">${poi.cityname || ''}${poi.address ? ' · ' + poi.address : ''}</span>`;
        div.onclick = () => fillAddScenicForm(poi);
        resultsEl.appendChild(div);
      });
    } else {
      resultsEl.innerHTML = '<p style="color:#e74c3c;font-size:13px;padding:6px;">未找到相关结果，可手动填写信息</p>';
    }
  });
};

function fillAddScenicForm(poi) {
  document.getElementById('asfName').value     = poi.name || '';
  document.getElementById('asfTicket').value   = '';
  document.getElementById('asfFeatures').value = poi.type ? poi.type.split(';').slice(-1)[0] : '';
  const intro = [poi.name, poi.address, poi.tel ? '电话：' + poi.tel : ''].filter(Boolean).join(' | ');
  document.getElementById('asfIntro').value = intro;
  if (poi.location) {
    document.getElementById('asfLng').value = poi.location.lng;
    document.getElementById('asfLat').value = poi.location.lat;
  }

  // 省市：先用 PlaceSearch 直接返回的字段，再用逆地理编码补全
  const directProvince = poi.pname || '';
  const directCity     = poi.cityname || '';
  document.getElementById('asfProvince').value = directProvince;
  document.getElementById('asfCity').value     = directCity;

  if ((!directProvince || !directCity) && poi.location) {
    new AMap.Geocoder().getAddress(
      [poi.location.lng, poi.location.lat],
      function(status, result) {
        if (status === 'complete' && result.regeocode) {
          const comp = result.regeocode.addressComponent;
          if (!directProvince) document.getElementById('asfProvince').value = comp.province || '';
          if (!directCity)     document.getElementById('asfCity').value     = comp.city || comp.district || '';
        }
      }
    );
  }

  document.getElementById('addScenicSearchResults').innerHTML =
    `<div style="padding:6px;background:#eafaf1;border-radius:4px;font-size:13px;color:#27ae60;">✔ 已从网络获取「${poi.name}」信息，省市已自动填入，可编辑后保存</div>`;
}

function updateCustomScenicInStorage(id, updated) {
  const list = ((currentUserData && currentUserData.customScenics) || []).slice();
  const idx = list.findIndex(s => s.id === id);
  if (idx !== -1) {
    list[idx] = updated;
    syncCustomScenicsToStorage(list);
  }
}

window.deleteEditingScenic = function() {
  if (!editingScenicId) return;
  const scenic = scenicData.find(s => s.id === editingScenicId);
  if (!scenic || !scenic.isCustom) return;
  if (!confirm(`确定要删除自定义景点「${scenic.name}」吗？`)) return;

  scenicData = scenicData.filter(s => s.id !== editingScenicId);
  const next = ((currentUserData && currentUserData.customScenics) || []).filter(s => s.id !== editingScenicId);
  syncCustomScenicsToStorage(next);

  editingScenicId = null;
  closeAddScenicModal();
  window.applyFilters();
  if (map) {
    createMapMarkers(true);
  }
  showToast(`景点「${scenic.name}」已删除`);
};

window.saveCustomScenic = function() {
  const name = document.getElementById('asfName').value.trim();
  if (!name) { alert('请输入景点名称！'); return; }
  const lng = parseFloat(document.getElementById('asfLng').value);
  const lat = parseFloat(document.getElementById('asfLat').value);
  if (isNaN(lng) || isNaN(lat)) {
    alert('请先通过搜索获取坐标，或手动填写经纬度！');
    return;
  }
  const ratingInput = parseInt(document.getElementById('asfRating').value);
  const userRatingVal = (!isNaN(ratingInput) && ratingInput >= 0 && ratingInput <= 10) ? ratingInput : 0;
  const fields = {
    name,
    province: document.getElementById('asfProvince').value.trim(),
    city:     document.getElementById('asfCity').value.trim(),
    category: document.getElementById('asfCategory').value,
    activities: getSelectedActivities(),
    level:    '自定义',
    ticket:   document.getElementById('asfTicket').value.trim() || '免费',
    features: document.getElementById('asfFeatures').value.trim(),
    intro:    document.getElementById('asfIntro').value.trim(),
    lng:      String(lng),
    lat:      String(lat),
    owner:    currentUser,
    userRating: userRatingVal,
  };

  if (editingScenicId) {
    // 编辑模式：更新已有景点
    const idx = scenicData.findIndex(s => s.id === editingScenicId);
    if (idx !== -1) {
      Object.assign(scenicData[idx], fields);
      updateCustomScenicInStorage(editingScenicId, scenicData[idx]);
      TravelDB.upsertScenic(scenicData[idx]).catch(console.error);
    }
    editingScenicId = null;
    window.applyFilters();
    closeAddScenicModal();
    showToast(`景点「${name}」已更新！`);
  } else {
    // 新增模式：检查同名景点
    const sameName = scenicData.find(
      s => s.name === name && s.id !== editingScenicId
    );
    if (sameName) {
      if (sameName.isCustom) {
        // 已有同名自定义景点 → 自动切换为编辑模式合并
        if (!confirm(`自定义景点「${name}」已存在，是否覆盖更新？`)) return;
        const idx = scenicData.findIndex(s => s.id === sameName.id);
        if (idx !== -1) {
          Object.assign(scenicData[idx], fields);
          updateCustomScenicInStorage(sameName.id, scenicData[idx]);
          TravelDB.upsertScenic(scenicData[idx]).catch(console.error);
        }
        window.applyFilters();
        closeAddScenicModal();
        showToast(`景点「${name}」已合并更新！`);
        return;
      } else {
        // 已有同名系统景点 → 给出提示但仍允许添加（作为自定义补充）
        if (!confirm(`系统数据库中已有景点「${name}」，确定要添加同名自定义景点吗？`)) return;
      }
    }
    const newScenic = Object.assign({ id: 'custom_' + Date.now(), isCustom: true, visited: false }, fields);
    if (newScenic.userRating > 0) saveRating(newScenic.id, newScenic.userRating);
    saveCustomScenicToStorage(newScenic);
    scenicData.push(newScenic);
    TravelDB.upsertScenic(newScenic).catch(console.error);
    window.applyFilters();
    closeAddScenicModal();
    showToast(`景点「${name}」已成功添加！`);
  }
};
