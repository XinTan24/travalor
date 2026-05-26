// ========== 全局变量 ==========
let map = null;
let markers = [];
let currentScenics = [];
let allScenics = [];
let visitedSet = new Set();
let currentUser = null;
let userHasInteracted = false;
let plannedTrips = {};
let currentTripName = null;

// 筛选条件
let filters = {
  province: '',
  city: '',
  category: '',
  level: '',
  keyword: ''
};

// 从scenicData动态获取分类/等级
const categories = [...new Set(scenicData.map(s => s.category))].sort();
const levels = [...new Set(scenicData.map(s => s.level))].sort();

// ========== 用户认证相关 ==========
const USERS_KEY = '5a_users';

function saveUser(username, password) {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  users[username] = password;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function validateUser(username, password) {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  return users[username] === password;
}

function login(username, password) {
  if (validateUser(username, password)) {
    currentUser = username;
    localStorage.setItem('current_5a_user', username);
    document.getElementById('currentUser').textContent = username;
    document.getElementById('userBar').style.display = 'block';
    document.getElementById('authModal').style.display = 'none';
    
    visitedSet = loadVisitedForUser(username);
    plannedTrips = loadPlannedTripsForUser(username);
    applyVisitedToData();
    
    currentScenics = scenicData.filter(s => isValidScenic(s));
    renderList();
    updateStats();
    return true;
  }
  return false;
}

function register(username, password) {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  if (users[username]) return false;
  saveUser(username, password);
  return true;
}

window.logout = function() {
  currentUser = null;
  localStorage.removeItem('current_5a_user');
  document.getElementById('currentUser').textContent = '';
  document.getElementById('userBar').style.display = 'none';
  visitedSet.clear();
  plannedTrips = {};
  document.getElementById('authModal').style.display = 'flex';
  currentScenics = [];
  renderList();
  updateStats();
};

function loadVisitedForUser(username) {
  const key = `visited_${username}`;
  const data = localStorage.getItem(key);
  return new Set(data ? JSON.parse(data) : []);
}

function saveVisitedForUser(username) {
  const key = `visited_${username}`;
  localStorage.setItem(key, JSON.stringify(Array.from(visitedSet)));
}

function loadPlannedTripsForUser(username) {
  const key = `trips_${username}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : {};
}

function savePlannedTripsForUser(username, trips) {
  const key = `trips_${username}`;
  localStorage.setItem(key, JSON.stringify(trips));
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

// ========== 省市区初始化 ==========
function initProvinceCity() {
  const provinceSelect = document.getElementById('provinceSelect');
  const citySelect = document.getElementById('citySelect');
  
  const provinces = [...new Set(scenicData.map(s => s.province).filter(Boolean))].sort();
  
  provinces.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    provinceSelect.appendChild(opt);
  });
  
  provinceSelect.addEventListener('change', onProvinceChange);
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
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });

  const levelSelect = document.getElementById('levelSelect');
  levels.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l;
    levelSelect.appendChild(opt);
  });

  document.getElementById('provinceSelect').addEventListener('change', function(e) {
    filters.province = e.target.value;
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
  filters.province = document.getElementById('provinceSelect').value;
  filters.city = document.getElementById('citySelect').value;
  filters.category = document.getElementById('categorySelect').value;
  filters.level = document.getElementById('levelSelect').value;
  filters.keyword = document.getElementById('searchInput').value.trim();

  currentScenics = scenicData.filter(scenic => {
    if (!isValidScenic(scenic)) return false;
    if (filters.province && scenic.province !== filters.province) return false;
    if (filters.city && scenic.city !== filters.city) return false;
    if (filters.category && scenic.category !== filters.category) return false;
    if (filters.level && scenic.level !== filters.level) return false;
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
    
    div.innerHTML = `
      <h3>
        ${scenic.name}
        <span class="level-tag ${levelClass}">${scenic.level || '未评级'}</span>
        ${scenic.category ? `<span class="scenic-category ${categoryClass}">${scenic.category}</span>` : ''}
      </h3>
      <p>📍 ${scenic.province}${scenic.city} | 💰 ${scenic.ticket || '免费'}</p>
      <div class="features">✨ ${scenic.features || '暂无特色'}</div>
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
    if (scenic.visited) {
      alert('已打卡景点不能加入待打卡行程！');
      return;
    }

    if (!plannedTrips[tripName]) {
      plannedTrips[tripName] = [];
    }

    if (!plannedTrips[tripName].includes(scenic.id)) {
      plannedTrips[tripName].push(scenic.id);
      savePlannedTripsForUser(currentUser, plannedTrips);
      alert(`已加入行程「${tripName}」`);
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
    }

    console.log('创建标记，数量：', validScenics.length);

    // 创建标记
    markers = validScenics.map(scenic => {
      const lng = parseFloat(scenic.lng);
      const lat = parseFloat(scenic.lat);

      // 根据状态选择图标
      let iconUrl;
      if (scenic.visited) {
        iconUrl = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png';
      } else {
        if (scenic.level === '5A') {
          iconUrl = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png';
        } else if (scenic.level === '4A') {
          iconUrl = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_orange.png';
        } else if (scenic.category === '徒步路线') {
          iconUrl = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_green.png';
        } else {
          iconUrl = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_purple.png';
        }
      }

      const marker = new AMap.Marker({
        position: [lng, lat],
        title: scenic.name,
        label: {
          content: scenic.name,
          direction: 'top'
        },
        icon: iconUrl
      });

      marker.on('click', () => {
        map.setCenter([lng, lat]);
        map.setZoom(15);
        showDetail(scenic.id);
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
    container.innerHTML = '<p>暂无行程，快去景点详情页添加吧！</p>';
    return;
  }

  for (const [name, ids] of Object.entries(plannedTrips)) {
    const count = ids.length;
    const div = document.createElement('div');
    div.style.margin = '8px 0';
    div.style.padding = '8px';
    div.style.background = '#f8f9fa';
    div.style.borderRadius = '3px';
    div.innerHTML = `
      <strong>${name}</strong> (${count}个景点)
      <button onclick="viewTrip('${name}')" style="margin-left: 10px; background: #2ed573; color: white; border: none; padding: 3px 8px; border-radius: 3px;">查看路线</button>
      <button onclick="deleteTrip('${name}')" style="margin-left: 5px; background: #ff6b6b; color: white; border: none; padding: 3px 8px; border-radius: 3px;">删除</button>
    `;
    container.appendChild(div);
  }
}

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

  // 切换到地图模式
  const listContainer = document.getElementById('listContainer');
  const mapContainer = document.getElementById('mapContainer');
  const toggleBtn = document.getElementById('toggleView');
  
  if (listContainer.style.display !== 'none') {
    listContainer.style.display = 'none';
    mapContainer.style.visibility = 'visible';
    toggleBtn.textContent = '切换到列表模式';
  }
  
  // 初始化地图（如果没有的话）
  createMapMarkers(false);

  // 绘制路线的函数
  function drawRoute(optimizedPoints) {
    setTimeout(() => {
      if (!map) return;
      
      // 清除之前的路线
      if (window.currentRoutePointers) {
        map.remove(window.currentRoutePointers);
      }

      const path = optimizedPoints.map(p => new AMap.LngLat(p.lng, p.lat));
      
      const polyline = new AMap.Polyline({
        path: path,
        isOutline: true,
        outlineColor: '#ffffff',
        borderWeight: 2,
        strokeColor: "#3366FF", 
        strokeOpacity: 0.9,
        strokeWeight: 6,
        strokeStyle: "solid",
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 50,
        showDir: true
      });

      const routeMarkers = optimizedPoints.map((p, i) => {
        return new AMap.Marker({
          position: [p.lng, p.lat],
          content: `<div style="background:#e74c3c;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:bold;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);font-size:12px;">${i + 1}</div>`,
          offset: new AMap.Pixel(-12, -12),
          zIndex: 100,
          title: p.name
        });
      });

      window.currentRoutePointers = [polyline, ...routeMarkers];
      map.add(window.currentRoutePointers);
      map.setFitView(window.currentRoutePointers);
    }, 300);
  }

  // 初始绘制
  drawRoute(points);

  // 计算总距离
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

  let totalDist = calculateTotalDistance(points);

  // 更新左侧列表显示路线
  renderTripList();
  setTimeout(() => {
    const list = document.getElementById('tripListContainer').children;
    for (let i = 0; i < list.length; i++) {
      const strongEl = list[i].querySelector('strong');
      if (strongEl && strongEl.textContent === tripName) {
        const detailDiv = document.createElement('div');
        detailDiv.style.marginTop = '10px';
        detailDiv.style.padding = '10px';
        detailDiv.style.background = '#eaf2f8';
        detailDiv.style.borderRadius = '5px';
        detailDiv.style.borderLeft = '4px solid #3498db';
        
        detailDiv.innerHTML = `
          <p style="margin:0 0 8px 0; color:#2c3e50; font-size:14px;"><strong>📍 路线详情 (总直线距离: ${totalDist.toFixed(1)} km)</strong></p>
          <div style="margin-bottom: 10px;">
            <label style="display: flex; align-items: center; gap: 5px; font-size: 13px;">
              <input type="checkbox" id="fixStartEnd_${tripName}" style="margin: 0;">
              固定起点和终点
            </label>
          </div>
          <button id="optimizeBtn_${tripName}" style="padding: 6px 12px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; margin-bottom: 10px;">重新规划路线</button>
          <ul style="margin:0; padding-left:20px; color:#34495e; font-size:13px; line-height: 1.6;" id="routeList_${tripName}">
            ${points.map((p, idx) => `<li><strong>${idx + 1}.</strong> ${p.name}</li>`).join('')}
          </ul>
        `;
        list[i].appendChild(detailDiv);

        // 绑定重新规划按钮事件
        document.getElementById(`optimizeBtn_${tripName}`).onclick = () => {
          const fixedStartEnd = document.getElementById(`fixStartEnd_${tripName}`).checked;
          const optimizedPoints = optimizeRoute(points, fixedStartEnd);
          points = optimizedPoints; // 更新本地 points
          totalDist = calculateTotalDistance(points);
          
          // 更新距离显示
          const distanceEl = detailDiv.querySelector('strong');
          distanceEl.textContent = `📍 路线详情 (总直线距离: ${totalDist.toFixed(1)} km)`;
          
          // 更新列表
          const routeListEl = document.getElementById(`routeList_${tripName}`);
          routeListEl.innerHTML = points.map((p, idx) => `<li><strong>${idx + 1}.</strong> ${p.name}</li>`).join('');
          
          // 重新绘制地图
          drawRoute(points);
        };
        
        break;
      }
    }
  }, 50);
}

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
function handleAuth() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  const isRegister = document.getElementById('authTitle').textContent === '用户注册';
  
  if (!username || !password) {
    alert('请输入用户名和密码！');
    return;
  }
  
  if (isRegister) {
    if (register(username, password)) {
      alert('注册成功，请登录！');
      toggleAuthMode();
    } else {
      alert('用户名已存在！');
    }
  } else {
    if (login(username, password)) {
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
document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM加载完成');
  
  initProvinceCity();
  initFilters();
  
  allScenics = scenicData.filter(isValidScenic);

  const savedUser = localStorage.getItem('current_5a_user');
  if (savedUser) {
    currentUser = savedUser;
    document.getElementById('currentUser').textContent = savedUser;
    document.getElementById('userBar').style.display = 'block';
    visitedSet = loadVisitedForUser(savedUser);
    plannedTrips = loadPlannedTripsForUser(savedUser);
    applyVisitedToData();
    
    currentScenics = scenicData.filter(isValidScenic);
    renderList();
    updateStats();
  } else {
    document.getElementById('authModal').style.display = 'flex';
    plannedTrips = {};
  }

  // 关闭模态框
  document.querySelectorAll('.close').forEach(el => {
    el.onclick = function() {
      this.closest('.modal').style.display = 'none';
    };
  });

  window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
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
});

// 全局暴露函数
window.showDetail = showDetail;
window.quickToggleVisit = quickToggleVisit;
window.deleteTrip = deleteTrip;
window.viewTrip = viewTrip;
window.handleAuth = handleAuth;
window.toggleAuthMode = toggleAuthMode;