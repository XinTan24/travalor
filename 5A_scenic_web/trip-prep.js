// ========== 行程准备页 trip-prep.js ==========

const GEAR_SUGGESTIONS = {
  '服装': ['速干衣', '冲锋衣', '保暖内衣', '防晒外套', '帽子', '太阳镜', '手套', '羽绒服', '换洗内裤', '袜子×3'],
  '徒步装备': ['登山杖', '登山靴', '徒步鞋', '护膝', '登山包', '防水袋', '绑腿', '地图/指南针'],
  '露营装备': ['帐篷', '睡袋', '防潮垫', '天幕', '营地灯', '炉头', '气罐', '炊具套装', '折叠椅', '折叠桌'],
  '电子设备': ['充电宝', '相机', 'GoPro', '头灯/手电筒', '手机', '数据线', '插座转换器', '蓝牙音箱'],
  '个人护理': ['洗漱包', '防晒霜', '防蚊喷雾', '急救包', '备用药物', '纸巾', '湿纸巾', '护目镜'],
  '证件财物': ['身份证', '信用卡/现金', '医保卡', '旅行保险凭证', '护照(出境需要)'],
  '餐饮': ['水壶/保温杯', '零食', '能量棒', '饭盒', '筷子/叉子', '垃圾袋'],
};

let tripName = '';
let currentUser = '';
let scenicDataMap = {};
let prepMap = null;
let prepMapObjects = [];
let pendingHotelLocation = null;

let prepData = {
  members: [],
  transport: [],
  scenicTickets: [],
  hotels: [],
  gear: [],
  items: [],
  shopping: [],
  todos: [],
  tripStartDate: '',
  tripEndDate: '',
  routePlanOrder: {},
  customRoutePoints: [],
};

function genId() {
  return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

window.goBack = function () {
  if (window.opener && !window.opener.closed) {
    window.close();
  } else {
    window.location.href = 'index.html';
  }
};

// ========== INIT ==========
async function init() {
  const params = new URLSearchParams(window.location.search);
  tripName = decodeURIComponent(params.get('trip') || '');
  currentUser = localStorage.getItem('current_5a_user');

  if (!tripName || !currentUser) {
    alert('请先登录并从主页进入行程准备页。');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('tripNameDisplay').textContent = '📋 ' + tripName;

  await TravelDB.init();

  const allScenics = await TravelDB.getAllScenics();
  allScenics.forEach(s => { scenicDataMap[s.id] = s; });

  const userData = await TravelDB.getUserData(currentUser);
  const tripIds = (userData.trips || {})[tripName] || [];
  document.getElementById('tripMeta').textContent =
    tripIds.length + ' 个景点 · 用户: ' + currentUser;

  const savedPrep = (userData.tripPrep || {})[tripName];
  if (savedPrep) {
    prepData = Object.assign({
      members: [], transport: [], scenicTickets: [],
      hotels: [], gear: [], items: [], shopping: [], todos: [],
      tripStartDate: '', tripEndDate: '', routePlanOrder: {}, customRoutePoints: [],
    }, savedPrep);
    prepData.routePlanOrder = prepData.routePlanOrder || {};
    prepData.customRoutePoints = prepData.customRoutePoints || [];
  }

  // 自动从行程景点生成门票条目（仅首次）
  if (prepData.scenicTickets.length === 0 && tripIds.length > 0) {
    prepData.scenicTickets = tripIds.map(id => {
      const s = scenicDataMap[id];
      return {
        id: genId(), scenicId: id,
        name: s ? s.name : id,
        price: s ? (s.ticket || '免费') : '待确认',
        count: 1, checked: false,
        visitDate: '', visitTime: '',
      };
    });
  }

  // 确保自定义景点也能参与当天路线搜索
  Object.values(scenicDataMap).forEach(s => {
    if (s && s.id) scenicDataMap[s.id] = s;
  });

  renderAll();
  initGearSuggestions();
  if (typeof AMap !== 'undefined') {
    initAtdbSearch();
    initHotelLocationSearch();
  }
}

function renderAll() {
  renderMembers();
  renderTransport();
  renderScenicTickets();
  renderHotels();
  renderGear();
  renderItems();
  renderShopping();
  renderTodos();
  updateProgress();
  renderTripDates();
  renderRoutePlan();
}

function renderTripDates() {
  const s = document.getElementById('tripStartDate');
  const e = document.getElementById('tripEndDate');
  if (s) s.value = prepData.tripStartDate || '';
  if (e) e.value = prepData.tripEndDate || '';
}

// ========== MEMBERS ==========
function renderMembers() {
  const el = document.getElementById('membersList');
  el.innerHTML = '';
  prepData.members.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'prep-item';
    div.innerHTML = `
      <div class="member-avatar">${m.name.charAt(0).toUpperCase()}</div>
      <span class="item-name">${escHtml(m.name)}</span>
      <button class="delete-btn" onclick="removeMember(${i})">×</button>
    `;
    el.appendChild(div);
  });
}

window.addMember = function () {
  const input = document.getElementById('memberInput');
  const name = input.value.trim();
  if (!name) return;
  prepData.members.push({ id: genId(), name });
  input.value = '';
  renderMembers();
  autoSave();
};

window.removeMember = function (i) {
  prepData.members.splice(i, 1);
  renderMembers();
  autoSave();
};

// ========== TRANSPORT ==========
function renderTransport() {
  const el = document.getElementById('transportList');
  el.innerHTML = '';
  prepData.transport.forEach((t, i) => {
    const hasTime = t.departDate || t.arriveDate;
    const timeStr = hasTime
      ? `${t.departDate || ''} ${t.departTime || ''} → ${t.arriveDate || ''} ${t.arriveTime || ''}`.replace(/\s+/g, ' ').trim()
      : '';
    const stationStr = [t.departStation || '', t.arriveStation || ''].filter(Boolean).join(' → ');
    const div = document.createElement('div');
    div.className = 'prep-item' + (t.checked ? ' checked' : '');
    div.innerHTML = `
      <input type="checkbox" ${t.checked ? 'checked' : ''} onchange="toggleTransport(${i})">
      <span class="item-name">${escHtml(t.name)}</span>
      ${t.price ? `<span class="item-price">¥${escHtml(t.price)}</span>` : ''}
      ${stationStr ? `<span class="item-date">📍 ${escHtml(stationStr)}</span>` : ''}
      ${timeStr ? `<span class="item-date">🕐 ${escHtml(timeStr)}</span>` : ''}
      <button class="delete-btn" onclick="removeTransport(${i})">×</button>
    `;
    el.appendChild(div);
  });
}

window.addTransport = function () {
  const name         = document.getElementById('transportInput').value.trim();
  const price        = document.getElementById('transportPrice').value.trim();
  const departStation = document.getElementById('transportDepartStation').value.trim();
  const departDate   = document.getElementById('transportDepartDate').value;
  const departTime   = document.getElementById('transportDepartTime').value;
  const arriveStation = document.getElementById('transportArriveStation').value.trim();
  const arriveDate   = document.getElementById('transportArriveDate').value;
  const arriveTime   = document.getElementById('transportArriveTime').value;
  if (!name) return;
  prepData.transport.push({ id: genId(), name, price, departStation, departDate, departTime, arriveStation, arriveDate, arriveTime, checked: false });
  ['transportInput','transportPrice','transportDepartStation','transportDepartDate','transportDepartTime','transportArriveStation','transportArriveDate','transportArriveTime']
    .forEach(id => { document.getElementById(id).value = ''; });
  renderTransport();
  updateProgress();
  autoSave();
};

window.quickAddTransport = function (name) {
  if (prepData.transport.find(t => t.name === name)) return;
  prepData.transport.push({ id: genId(), name, price: '', checked: false });
  renderTransport();
  updateProgress();
  autoSave();
};

window.toggleTransport = function (i) {
  prepData.transport[i].checked = !prepData.transport[i].checked;
  renderTransport();
  updateProgress();
  autoSave();
};

window.removeTransport = function (i) {
  prepData.transport.splice(i, 1);
  renderTransport();
  updateProgress();
  autoSave();
};

// ========== SCENIC TICKETS ==========
function renderScenicTickets() {
  const el = document.getElementById('scenicTicketList');
  el.innerHTML = '';
  prepData.scenicTickets.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'prep-item' + (t.checked ? ' checked' : '');
    const showAddBtn = !t.scenicId || !scenicDataMap[t.scenicId];
    div.innerHTML = `
      <input type="checkbox" ${t.checked ? 'checked' : ''} onchange="toggleScenicTicket(${i})">
      <span class="item-name">${escHtml(t.name)}</span>
      <span class="item-price">${escHtml(String(t.price))}</span>
      ${t.visitDate ? `<span class="item-date">📅 ${escHtml(t.visitDate)}${t.visitTime ? ' ' + escHtml(t.visitTime) : ''}</span>` : ''}
      <span class="item-count">×<input type="number" min="1" value="${t.count || 1}"
        onchange="updateTicketCount(${i}, this.value)"
        style="width:38px;padding:1px 4px;border:1px solid #ddd;border-radius:3px;font-size:12px;"></span>
      ${showAddBtn ? `<button class="add-db-btn" onclick="openAddToDbModal(${JSON.stringify(t.name)})">➕景点库</button>` : ''}
      <button class="delete-btn" onclick="removeScenicTicket(${i})">×</button>
    `;
    el.appendChild(div);
  });
}

window.addScenicTicket = function () {
  const name      = document.getElementById('scenicTicketInput').value.trim();
  const priceVal  = document.getElementById('scenicTicketPrice').value.trim();
  const visitDate = document.getElementById('scenicTicketVisitDate').value;
  const visitTime = document.getElementById('scenicTicketVisitTime').value;
  if (!name) return;
  prepData.scenicTickets.push({ id: genId(), name, scenicId: null,
    price: priceVal ? priceVal + '元' : '待确认', count: 1, checked: false, visitDate, visitTime });
  ['scenicTicketInput','scenicTicketPrice','scenicTicketVisitDate','scenicTicketVisitTime']
    .forEach(id => { document.getElementById(id).value = ''; });
  renderScenicTickets();
  updateProgress();
  renderRoutePlan();
  autoSave();
};

window.toggleScenicTicket = function (i) {
  prepData.scenicTickets[i].checked = !prepData.scenicTickets[i].checked;
  renderScenicTickets();
  updateProgress();
  autoSave();
};

window.updateTicketCount = function (i, val) {
  prepData.scenicTickets[i].count = parseInt(val) || 1;
  autoSave();
};

window.removeScenicTicket = function (i) {
  prepData.scenicTickets.splice(i, 1);
  renderScenicTickets();
  updateProgress();
  autoSave();
};

// ========== HOTELS ==========
function renderHotels() {
  const el = document.getElementById('hotelList');
  el.innerHTML = '';
  prepData.hotels.forEach((h, i) => {
    const div = document.createElement('div');
    div.className = 'prep-item' + (h.checked ? ' checked' : '');
    const checkInStr = h.checkIn ? `${h.checkIn}${h.checkInTime ? ' ' + h.checkInTime : ''}` : '';
    const checkOutStr = h.checkOut ? `${h.checkOut}${h.checkOutTime ? ' ' + h.checkOutTime : ''}` : '';
    div.innerHTML = `
      <input type="checkbox" ${h.checked ? 'checked' : ''} onchange="toggleHotel(${i})">
      <span class="item-name">${escHtml(h.name)}</span>      ${h.price ? `<span class="item-price">¥${escHtml(String(h.price))}</span>` : ''}      ${(h.checkIn || h.checkOut) ? `<span class="item-date">${h.checkIn || '?'} → ${h.checkOut || '?'}</span>` : ''}
      <button class="delete-btn" onclick="removeHotel(${i})">×</button>
    `;
    if (checkInStr || checkOutStr) {
      div.innerHTML = `
        <input type="checkbox" ${h.checked ? 'checked' : ''} onchange="toggleHotel(${i})">
        <span class="item-name">${escHtml(h.name)}</span>
        ${h.price ? `<span class="item-price">¥${escHtml(String(h.price))}</span>` : ''}
        ${(checkInStr || checkOutStr) ? `<span class="item-date">📅 ${escHtml(checkInStr || '?')} → ${escHtml(checkOutStr || '?')}</span>` : ''}
        <button class="delete-btn" onclick="removeHotel(${i})">×</button>
      `;
    }
    el.appendChild(div);
  });
}

window.addHotel = function () {
  const name     = document.getElementById('hotelInput').value.trim();
  const checkIn  = document.getElementById('hotelCheckIn').value;
  const checkInTime = document.getElementById('hotelCheckInTime').value;
  const checkOut = document.getElementById('hotelCheckOut').value;
  const checkOutTime = document.getElementById('hotelCheckOutTime').value;
  const price    = document.getElementById('hotelPrice').value.trim();
  const address  = pendingHotelLocation ? pendingHotelLocation.name : '';
  const lat      = pendingHotelLocation ? pendingHotelLocation.lat  : null;
  const lng      = pendingHotelLocation ? pendingHotelLocation.lng  : null;
  if (!name) return;
  prepData.hotels.push({ id: genId(), name, checkIn, checkInTime, checkOut, checkOutTime, price, address, lat, lng, checked: false });
  ['hotelInput','hotelPrice','hotelCheckIn','hotelCheckInTime','hotelCheckOut','hotelCheckOutTime'].forEach(id => { document.getElementById(id).value = ''; });
  pendingHotelLocation = null;
  const tip = document.getElementById('hotelAddressTip');
  const si  = document.getElementById('hotelAddressSearch');
  if (tip) tip.textContent = '';
  if (si)  si.value = '';
  renderHotels();
  updateProgress();
  autoSave();
};

window.toggleHotel = function (i) {
  prepData.hotels[i].checked = !prepData.hotels[i].checked;
  renderHotels();
  updateProgress();
  autoSave();
};

window.removeHotel = function (i) {
  prepData.hotels.splice(i, 1);
  renderHotels();
  updateProgress();
  autoSave();
};

// ========== GEAR ==========
let activeGearCat = Object.keys(GEAR_SUGGESTIONS)[0];

function initGearSuggestions() {
  const tabs = document.getElementById('gearCategoryTabs');
  tabs.innerHTML = '';
  Object.keys(GEAR_SUGGESTIONS).forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.className = 'gear-cat-tab' + (cat === activeGearCat ? ' active' : '');
    btn.onclick = () => {
      activeGearCat = cat;
      tabs.querySelectorAll('.gear-cat-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      renderGearChips();
    };
    tabs.appendChild(btn);
  });
  renderGearChips();
}

function renderGearChips() {
  const chips = document.getElementById('gearSuggestionChips');
  const items = GEAR_SUGGESTIONS[activeGearCat] || [];
  const added = new Set(prepData.gear.map(g => g.name));
  chips.innerHTML = '';
  items.forEach(item => {
    const btn = document.createElement('button');
    const isAdded = added.has(item);
    btn.className = 'gear-chip' + (isAdded ? ' added' : '');
    btn.textContent = (isAdded ? '✓ ' : '+ ') + item;
    btn.onclick = () => {
      if (!added.has(item)) {
        prepData.gear.push({ id: genId(), name: item, category: activeGearCat, checked: false });
        added.add(item);
        btn.className = 'gear-chip added';
        btn.textContent = '✓ ' + item;
        renderGear();
        updateProgress();
        autoSave();
      }
    };
    chips.appendChild(btn);
  });
}

function renderGear() {
  const el = document.getElementById('gearList');
  const grouped = {};
  prepData.gear.forEach((g, i) => {
    if (!grouped[g.category]) grouped[g.category] = [];
    grouped[g.category].push({ ...g, idx: i });
  });
  el.innerHTML = '';
  Object.entries(grouped).forEach(([cat, items]) => {
    const catDiv = document.createElement('div');
    catDiv.className = 'gear-category-group';
    catDiv.innerHTML = `<div class="gear-cat-label">${cat}</div>`;
    items.forEach(g => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'prep-item' + (g.checked ? ' checked' : '');
      itemDiv.innerHTML = `
        <input type="checkbox" ${g.checked ? 'checked' : ''} onchange="toggleGear(${g.idx})">
        <span class="item-name">${escHtml(g.name)}</span>
        <button class="delete-btn" onclick="removeGear(${g.idx})">×</button>
      `;
      catDiv.appendChild(itemDiv);
    });
    el.appendChild(catDiv);
  });
  renderGearChips();
}

window.addGear = function () {
  const name = document.getElementById('gearInput').value.trim();
  const cat = document.getElementById('gearCategory').value;
  if (!name) return;
  prepData.gear.push({ id: genId(), name, category: cat, checked: false });
  document.getElementById('gearInput').value = '';
  renderGear();
  updateProgress();
  autoSave();
};

window.toggleGear = function (i) {
  prepData.gear[i].checked = !prepData.gear[i].checked;
  renderGear();
  updateProgress();
  autoSave();
};

window.removeGear = function (i) {
  prepData.gear.splice(i, 1);
  renderGear();
  updateProgress();
  autoSave();
};

// ========== ITEMS ==========
function renderItems() {
  const el = document.getElementById('itemsList');
  el.innerHTML = '';
  prepData.items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'prep-item' + (item.checked ? ' checked' : '');
    div.innerHTML = `
      <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleItem(${i})">
      <span class="item-name">${escHtml(item.name)}</span>
      <button class="delete-btn" onclick="removeItem(${i})">×</button>
    `;
    el.appendChild(div);
  });
}

window.addItem = function () {
  const name = document.getElementById('itemInput').value.trim();
  if (!name) return;
  prepData.items.push({ id: genId(), name, checked: false });
  document.getElementById('itemInput').value = '';
  renderItems();
  updateProgress();
  autoSave();
};

window.toggleItem = function (i) {
  prepData.items[i].checked = !prepData.items[i].checked;
  renderItems();
  updateProgress();
  autoSave();
};

window.removeItem = function (i) {
  prepData.items.splice(i, 1);
  renderItems();
  updateProgress();
  autoSave();
};

// ========== SHOPPING ==========
function renderShopping() {
  const el = document.getElementById('shoppingList');
  el.innerHTML = '';
  prepData.shopping.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'prep-item' + (item.checked ? ' checked' : '');
    div.innerHTML = `
      <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleShopping(${i})">
      <span class="item-name">${escHtml(item.name)}</span>
      ${item.price ? `<span class="item-price">预算 ¥${escHtml(String(item.price))}</span>` : ''}
      <button class="delete-btn" onclick="removeShopping(${i})">×</button>
    `;
    el.appendChild(div);
  });
}

window.addShopping = function () {
  const name = document.getElementById('shoppingInput').value.trim();
  const price = document.getElementById('shoppingPrice').value.trim();
  if (!name) return;
  prepData.shopping.push({ id: genId(), name, price, checked: false });
  document.getElementById('shoppingInput').value = '';
  document.getElementById('shoppingPrice').value = '';
  renderShopping();
  updateProgress();
  autoSave();
};

window.toggleShopping = function (i) {
  prepData.shopping[i].checked = !prepData.shopping[i].checked;
  renderShopping();
  updateProgress();
  autoSave();
};

window.removeShopping = function (i) {
  prepData.shopping.splice(i, 1);
  renderShopping();
  updateProgress();
  autoSave();
};

// ========== TODOS ==========
function renderTodos() {
  const el = document.getElementById('todosList');
  el.innerHTML = '';
  prepData.todos.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'prep-item' + (item.checked ? ' checked' : '');
    div.innerHTML = `
      <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleTodo(${i})">
      <span class="item-name">${escHtml(item.text)}</span>
      <button class="delete-btn" onclick="removeTodo(${i})">×</button>
    `;
    el.appendChild(div);
  });
}

window.addTodo = function () {
  const text = document.getElementById('todoInput').value.trim();
  if (!text) return;
  prepData.todos.push({ id: genId(), text, checked: false });
  document.getElementById('todoInput').value = '';
  renderTodos();
  updateProgress();
  autoSave();
};

window.quickAddTodo = function (text) {
  if (prepData.todos.find(t => t.text === text)) return;
  prepData.todos.push({ id: genId(), text, checked: false });
  renderTodos();
  updateProgress();
  autoSave();
};

window.toggleTodo = function (i) {
  prepData.todos[i].checked = !prepData.todos[i].checked;
  renderTodos();
  updateProgress();
  autoSave();
};

window.removeTodo = function (i) {
  prepData.todos.splice(i, 1);
  renderTodos();
  updateProgress();
  autoSave();
};

// ========== PROGRESS ==========
function updateProgress() {
  const sections = [
    { label: '路程票', data: prepData.transport },
    { label: '景点门票', data: prepData.scenicTickets },
    { label: '酒店', data: prepData.hotels },
    { label: '装备', data: prepData.gear },
    { label: '物品', data: prepData.items },
    { label: '待买', data: prepData.shopping },
    { label: '代办', data: prepData.todos },
  ].filter(s => s.data.length > 0);

  const barsEl = document.getElementById('progressBars');
  barsEl.innerHTML = '';

  let totalItems = 0, doneItems = 0;
  sections.forEach(s => {
    const total = s.data.length;
    const done = s.data.filter(x => x.checked).length;
    totalItems += total; doneItems += done;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const row = document.createElement('div');
    row.className = 'progress-row';
    row.innerHTML = `
      <span class="progress-label">${s.label}</span>
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <span class="progress-text">${done}/${total}</span>
    `;
    barsEl.appendChild(row);
  });

  const overall = totalItems > 0 ? Math.round(doneItems / totalItems * 100) : 0;
  document.getElementById('overallPct').textContent = overall + '%';
  document.getElementById('overallLabel').textContent =
    totalItems === 0 ? '尚未开始准备' :
    overall === 100 ? '🎉 全部准备完成，出发吧！' :
    `已完成 ${doneItems} / ${totalItems} 项准备`;
  updateCostSummary();
}

function updateCostSummary() {
  const el = document.getElementById('costSummary');
  if (!el) return;
  const fmt = (n) => n > 0 ? '¥' + n.toFixed(0) : '—';
  const parsePrice = (str) => parseFloat(String(str || '').replace(/[^0-9.]/g, '')) || 0;
  const transportTotal = prepData.transport.reduce((s, t) => s + parsePrice(t.price), 0);
  const ticketTotal    = prepData.scenicTickets.reduce((s, t) => s + parsePrice(t.price) * (t.count || 1), 0);
  const hotelTotal     = prepData.hotels.reduce((s, h) => s + parsePrice(h.price), 0);
  const shoppingTotal  = prepData.shopping.reduce((s, x) => s + parsePrice(x.price), 0);
  const grand          = transportTotal + ticketTotal + hotelTotal + shoppingTotal;
  el.innerHTML = [
    ['🚌 路程交通', transportTotal],
    ['🎫 景点门票', ticketTotal],
    ['🏨 酒店住宿', hotelTotal],
    ['🛒 待买清单', shoppingTotal],
  ].map(([label, val]) =>
    `<div class="cost-row"><span>${label}</span><span class="cost-val">${fmt(val)}</span></div>`
  ).join('') +
  `<div class="cost-row cost-total"><span>💰 费用合计</span><span class="cost-val">¥${grand.toFixed(0)}</span></div>`;
}

// ========== SAVE ==========
let saveTimer = null;

function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAll, 900);
}

window.saveAll = async function () {
  try {
    const existing = await TravelDB.getUserData(currentUser);
    const existingPrep = existing.tripPrep || {};
    existingPrep[tripName] = prepData;
    await TravelDB.saveUserData(currentUser, { tripPrep: existingPrep });
    showSaveIndicator('✓ 已保存');
  } catch (e) {
    console.error('保存失败', e);
    showSaveIndicator('⚠ 保存失败');
  }
};

function showSaveIndicator(msg) {
  let el = document.getElementById('saveIndicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'saveIndicator';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:9px 18px;border-radius:20px;font-size:13px;font-weight:bold;z-index:9999;transition:opacity 0.5s;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.style.background = msg.startsWith('✓') ? '#27ae60' : '#e74c3c';
  el.style.color = 'white';
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

// ========== UTILS ==========
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Enter key shortcuts
document.addEventListener('keypress', function (e) {
  if (e.key !== 'Enter') return;
  const id = document.activeElement && document.activeElement.id;
  if (!id) return;
  if (id === 'memberInput') window.addMember();
  else if (id === 'transportInput' || id === 'transportPrice' || id === 'transportDepartStation' || id === 'transportDepartDate' || id === 'transportDepartTime' || id === 'transportArriveStation' || id === 'transportArriveDate' || id === 'transportArriveTime') window.addTransport();
  else if (id === 'scenicTicketInput' || id === 'scenicTicketPrice') window.addScenicTicket();
  else if (id === 'hotelInput') window.addHotel();
  else if (id === 'gearInput') window.addGear();
  else if (id === 'itemInput') window.addItem();
  else if (id === 'shoppingInput' || id === 'shoppingPrice') window.addShopping();
  else if (id === 'todoInput') window.addTodo();
});

// ========== ROUTE PLANNING ==========
function nearestNeighborForDay(pts) {
  if (pts.length <= 1) return pts;
  const rem = [...pts];
  const res = [rem.splice(0, 1)[0]];
  while (rem.length > 0) {
    const last = res[res.length - 1];
    let best = 0, bestD = Infinity;
    rem.forEach((p, i) => {
      const d = Math.pow(p.lat - last.lat, 2) + Math.pow(p.lng - last.lng, 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    res.push(rem.splice(best, 1)[0]);
  }
  return res;
}

// Collect all route items for a given date from all data sources
function collectRouteItems(date) {
  const items = [];
  // Scenic tickets
  prepData.scenicTickets.filter(t => t.visitDate === date).forEach(t => {
    const s = t.scenicId ? scenicDataMap[t.scenicId] : null;
    items.push({ id: t.id, type: 'scenic', name: t.name, time: t.visitTime || '', lat: s && s.lat ? parseFloat(s.lat) : null, lng: s && s.lng ? parseFloat(s.lng) : null, deletable: false });
  });
  // Transport (depart)
  prepData.transport.filter(t => t.departDate === date).forEach(t => {
    const station = t.departStation ? `出发站点：${t.departStation}` : '';
    items.push({ id: 'trd_' + t.id, type: 'transport', name: t.name, dir: 'depart', time: t.departTime || '', subText: station, lat: null, lng: null, deletable: false });
  });
  // Transport (arrive)
  prepData.transport.filter(t => t.arriveDate === date).forEach(t => {
    const station = t.arriveStation ? `到达站点：${t.arriveStation}` : '';
    items.push({ id: 'tra_' + t.id, type: 'transport', name: t.name, dir: 'arrive', time: t.arriveTime || '', subText: station, lat: null, lng: null, deletable: false });
  });
  // Hotels check-in
  prepData.hotels.filter(h => h.checkIn === date).forEach(h => {
    const subText = h.checkInTime ? `入住时间：${h.checkInTime}` : '';
    items.push({ id: 'hci_' + h.id, type: 'hotel', name: h.name, dir: 'in', time: h.checkInTime || '', subText, lat: h.lat || null, lng: h.lng || null, deletable: false });
  });
  // Hotels check-out
  prepData.hotels.filter(h => h.checkOut === date).forEach(h => {
    const subText = h.checkOutTime ? `退房时间：${h.checkOutTime}` : '';
    items.push({ id: 'hco_' + h.id, type: 'hotel', name: h.name, dir: 'out', time: h.checkOutTime || '', subText, lat: h.lat || null, lng: h.lng || null, deletable: false });
  });
  // Custom route points
  (prepData.customRoutePoints || []).filter(p => p.date === date).forEach(p => {
    items.push({ id: p.id, type: 'custom', name: p.name, time: p.time || '', lat: p.lat || null, lng: p.lng || null, deletable: true });
  });
  return items;
}

function getAllRouteDates() {
  const dates = new Set();
  prepData.scenicTickets.forEach(t => t.visitDate && dates.add(t.visitDate));
  prepData.transport.forEach(t => { t.departDate && dates.add(t.departDate); t.arriveDate && dates.add(t.arriveDate); });
  prepData.hotels.forEach(h => { h.checkIn && dates.add(h.checkIn); h.checkOut && dates.add(h.checkOut); });
  (prepData.customRoutePoints || []).forEach(p => p.date && dates.add(p.date));
  return [...dates].sort();
}

function sortByTime(items) {
  return [...items].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

function initPrepMap() {
  if (prepMap) return;
  prepMap = new AMap.Map('tripPrepMap', { zoom: 10, center: [120.15, 30.28] });
}

window.openRouteMapModal = function(date) {
  const modal = document.getElementById('routeMapModal');
  const title = document.getElementById('routeMapTitle');
  const mapEl = document.getElementById('tripPrepMap');
  if (!modal || !mapEl) return;
  title.textContent = `查看日期：${date}`;
  modal.style.display = 'flex';
  mapEl.style.display = 'block';
  setTimeout(() => window.showDayOnMap(date), 120);
};

window.closeRouteMapModal = function() {
  const modal = document.getElementById('routeMapModal');
  if (modal) modal.style.display = 'none';
};

window.toggleExportMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('exportMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

window.hideExportMenu = function() {
  const menu = document.getElementById('exportMenu');
  if (menu) menu.style.display = 'none';
};

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') window.closeRouteMapModal();
});

document.addEventListener('click', function(e) {
  window.hideExportMenu();
  const modal = document.getElementById('routeMapModal');
  if (!modal || modal.style.display === 'none') return;
  const box = modal.querySelector('.modal-content');
  if (box && !box.contains(e.target) && e.target === modal) {
    window.closeRouteMapModal();
  }
});

function renderRoutePlan() {
  const container = document.getElementById('routePlanDays');
  if (!container) return;
  const days = getAllRouteDates();
  if (days.length === 0) {
    container.innerHTML = '<div style="color:#aaa;font-size:13px;padding:6px 0;">为景点门票设置访问日期、或为交通/住宿填写日期后，系统将自动按天展示路线规划</div>';
    return;
  }
  container.innerHTML = '';
  days.forEach((date, di) => {
    const allItems = collectRouteItems(date);
    const saved = (prepData.routePlanOrder || {})[date];
    let orderedItems;
    if (saved && saved.length > 0) {
      const savedSet = new Set(saved);
      orderedItems = [...saved.map(id => allItems.find(it => it.id === id)).filter(Boolean),
                      ...sortByTime(allItems.filter(it => !savedSet.has(it.id)))];
    } else {
      orderedItems = sortByTime(allItems);
    }

    const card = document.createElement('div');
    card.className = 'day-plan-card';

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'day-plan-header';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'day-plan-date';
    dateSpan.textContent = `📅 第${di + 1}天 · ${date}（${orderedItems.length} 项）`;
    const optBtn = document.createElement('button');
    optBtn.className = 'day-plan-action-btn'; optBtn.textContent = '⚡ 最短路线';
    optBtn.onclick = () => window.computeBestRoute(date);
    const mapBtn = document.createElement('button');
    mapBtn.className = 'day-plan-action-btn'; mapBtn.style.background = '#27ae60'; mapBtn.textContent = '🗺 地图';
    mapBtn.onclick = () => window.openRouteMapModal(date);
    const sortBtn = document.createElement('button');
    sortBtn.className = 'day-plan-action-btn'; sortBtn.style.background = '#95a5a6'; sortBtn.textContent = '↺ 按时间';
    sortBtn.onclick = () => {
      if (!prepData.routePlanOrder) prepData.routePlanOrder = {};
      delete prepData.routePlanOrder[date];
      renderRoutePlan(); autoSave();
    };
    hdr.append(dateSpan, optBtn, mapBtn, sortBtn);
    card.appendChild(hdr);

    // Item list
    const list = document.createElement('div');
    list.style.cssText = 'margin-top:6px;';
    let dragSrc = null;
    let scenicIdx = 0;
    orderedItems.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'route-plan-item rpi-' + item.type;
      el.draggable = true;
      el.dataset.idx = String(idx);

      const ICONS = { scenic: '', transport: '🚉', hotel: '🏨', custom: '📌' };
      const LABELS = { transport: { depart: '出发', arrive: '到达' }, hotel: { in: '入住', out: '退房' } };
      const LABEL_COLORS = { transport: '#27ae60', hotel: '#e67e22', custom: '#8e44ad' };
      const labelText = LABELS[item.type] ? (LABELS[item.type][item.dir] || '') : '';
      const labelHtml = labelText
        ? `<span style="background:${LABEL_COLORS[item.type]};color:white;font-size:10px;padding:1px 5px;border-radius:8px;white-space:nowrap;flex-shrink:0;">${labelText}</span>`
        : '';
      const timeHtml = item.time ? `<span class="route-item-time">🕐 ${escHtml(item.time)}</span>` : '';
      const subHtml = item.subText ? `<span style="font-size:11px;color:#7f8c8d;background:#f8f9fa;padding:1px 6px;border-radius:8px;white-space:nowrap;flex-shrink:0;">${escHtml(item.subText)}</span>` : '';
      const delHtml  = item.deletable ? `<button onclick="removeRoutePoint('${item.id}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:15px;padding:0 2px;margin-left:auto;flex-shrink:0;" title="删除">×</button>` : '';
      const warnHtml = item.type === 'scenic' && !item.lat ? '<span style="color:#e67e22;font-size:10px;flex-shrink:0;">⚠</span>' : '';

      if (item.type === 'scenic') {
        scenicIdx++;
        const scenicDelHtml = `<button onclick="removeRouteScenic('${item.id}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:15px;padding:0 2px;margin-left:auto;flex-shrink:0;" title="删除景点">×</button>`;
        el.innerHTML = `<span style="color:#ccc;font-size:10px;user-select:none;flex-shrink:0;">⠿⠿</span><span class="route-item-num">${scenicIdx}</span><span class="route-item-name">${escHtml(item.name)}</span>${timeHtml}${warnHtml}${scenicDelHtml}`;
      } else if (item.type === 'transport') {
        const stationText = item.dir === 'depart'
          ? (item.subText ? item.subText.replace(/^出发站点：/, '') : '')
          : (item.subText ? item.subText.replace(/^到达站点：/, '') : '');
        const topLine = stationText || '未填写站点';
        const bottomLine = item.time || '未填写时间';
        el.innerHTML = `
          <span style="color:#ccc;font-size:10px;user-select:none;flex-shrink:0;">⠿⠿</span>
          <span style="font-size:14px;flex-shrink:0;">${ICONS[item.type]}</span>
          <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
            <div style="display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap;">
              <span style="font-size:12px;font-weight:600;color:#2c3e50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(topLine)}</span>
              ${labelHtml}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-size:11px;color:#7f8c8d;background:#f8f9fa;padding:1px 6px;border-radius:8px;white-space:nowrap;flex-shrink:0;">${escHtml(bottomLine)}</span>
            </div>
          </div>
          ${delHtml}
        `;
      } else if (item.type === 'hotel') {
        const hotelTime = item.time || (item.subText ? item.subText.replace(/^入住时间：|^退房时间：/, '') : '');
        const metaHtml = hotelTime
          ? `<span style="font-size:11px;color:#7f8c8d;background:#f8f9fa;padding:1px 6px;border-radius:8px;white-space:nowrap;flex-shrink:0;">${escHtml(hotelTime)}</span>`
          : '';
        el.innerHTML = `<span style="color:#ccc;font-size:10px;user-select:none;flex-shrink:0;">⠿⠿</span><span style="font-size:14px;flex-shrink:0;">${ICONS[item.type]}</span>${labelHtml}<span class="route-item-name">${escHtml(item.name)}</span>${metaHtml}${delHtml}`;
      } else {
        el.innerHTML = `<span style="color:#ccc;font-size:10px;user-select:none;flex-shrink:0;">⠿⠿</span><span style="font-size:14px;flex-shrink:0;">${ICONS[item.type]}</span>${labelHtml}<span class="route-item-name">${escHtml(item.name)}</span>${subHtml}${timeHtml}${delHtml}`;
      }

      el.addEventListener('dragstart', e => { dragSrc = idx; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => el.style.opacity = '0.4', 0); });
      el.addEventListener('dragend', () => { el.style.opacity = '1'; });
      el.addEventListener('dragover', e => e.preventDefault());
      el.addEventListener('dragenter', () => { el.style.background = '#eaf4fb'; });
      el.addEventListener('dragleave', () => { el.style.background = ''; });
      el.addEventListener('drop', e => {
        e.preventDefault(); el.style.background = '';
        const di2 = parseInt(el.dataset.idx);
        if (dragSrc === null || dragSrc === di2) return;
        const cur = orderedItems.map(it => it.id);
        const [mv] = cur.splice(dragSrc, 1); cur.splice(di2, 0, mv);
        if (!prepData.routePlanOrder) prepData.routePlanOrder = {};
        prepData.routePlanOrder[date] = cur;
        dragSrc = null; renderRoutePlan(); autoSave();
      });
      list.appendChild(el);
    });
    card.appendChild(list);

    // Add items UI
    const addSec = document.createElement('div');
    addSec.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px dashed #e0e0e0;display:flex;flex-direction:column;gap:6px;';
    addSec.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:11px;color:#8e44ad;background:#f5eef8;padding:2px 7px;border-radius:8px;white-space:nowrap;flex-shrink:0;">＋景点</span>
        <div style="flex:1;position:relative;">
          <input type="text" class="rp-scenic-search" placeholder="搜索景点库添加到此天…" autocomplete="off" style="width:100%;padding:5px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;outline:none;">
          <div class="rp-scenic-sugg prep-suggestions"></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:11px;color:#7f8c8d;background:#f0f2f5;padding:2px 7px;border-radius:8px;white-space:nowrap;flex-shrink:0;">＋自定义</span>
        <input type="text" class="rp-custom-name" placeholder="行程点名称（如：晚餐、购物…）" style="flex:2;min-width:120px;padding:5px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;">
        <input type="time" class="rp-custom-time" style="flex:1;min-width:90px;padding:5px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;">
        <button class="day-plan-action-btn rp-custom-add" style="flex-shrink:0;">＋ 添加</button>
      </div>`;

    // Scenic search binding
    const searchIn = addSec.querySelector('.rp-scenic-search');
    const suggBox  = addSec.querySelector('.rp-scenic-sugg');
    let sTmr = null;
    searchIn.addEventListener('input', function() {
      clearTimeout(sTmr);
      const kw = this.value.trim().toLowerCase();
      if (!kw) { suggBox.style.display = 'none'; return; }
      sTmr = setTimeout(() => {
        const hits = Object.values(scenicDataMap)
          .filter(s => s && s.name && (s.name.toLowerCase().includes(kw) || (s.city || '').toLowerCase().includes(kw)))
          .slice(0, 8);
        suggBox.innerHTML = '';
        if (!hits.length) { suggBox.style.display = 'none'; return; }
        hits.forEach(s => {
          const d = document.createElement('div'); d.className = 'suggestion-item';
          d.textContent = s.name + (s.city ? '  ' + s.city : '');
          d.onclick = () => { searchIn.value = ''; suggBox.style.display = 'none'; window.addScenicToRoute(s.id, date); };
          suggBox.appendChild(d);
        });
        suggBox.style.display = 'block';
      }, 200);
    });
    document.addEventListener('click', e => { if (!searchIn.contains(e.target) && !suggBox.contains(e.target)) suggBox.style.display = 'none'; });

    // Custom point binding
    addSec.querySelector('.rp-custom-add').addEventListener('click', () => {
      const nameIn = addSec.querySelector('.rp-custom-name');
      const timeIn = addSec.querySelector('.rp-custom-time');
      const nm = nameIn.value.trim();
      if (!nm) { nameIn.focus(); return; }
      if (!prepData.customRoutePoints) prepData.customRoutePoints = [];
      prepData.customRoutePoints.push({ id: genId(), name: nm, date, time: timeIn.value || '' });
      nameIn.value = ''; timeIn.value = '';
      renderRoutePlan(); autoSave();
    });
    card.appendChild(addSec);
    container.appendChild(card);
  });
}

window.addScenicToRoute = function(scenicId, date) {
  const s = scenicDataMap[scenicId];
  if (!s) return;
  if (!prepData.customRoutePoints) prepData.customRoutePoints = [];
  if (!prepData.routePlanOrder) prepData.routePlanOrder = {};
  const scenicRouteId = 'route_scenic_' + s.id + '_' + date;
  const exists = prepData.customRoutePoints.find(p => p.id === scenicRouteId);
  if (!exists) {
    prepData.customRoutePoints.push({
      id: scenicRouteId,
      name: s.name,
      date,
      time: '',
      lat: s.lat || null,
      lng: s.lng || null,
      scenicId: s.id,
      isRouteScenic: true,
    });
  }
  if (!prepData.routePlanOrder[date]) prepData.routePlanOrder[date] = [];
  if (!prepData.routePlanOrder[date].includes(scenicRouteId)) {
    prepData.routePlanOrder[date].push(scenicRouteId);
  }
  renderAll();
  renderRoutePlan();
  autoSave();
  showSaveIndicator('✓ 已添加 ' + s.name + ' 到 ' + date);
};

window.removeRouteScenic = function(routeItemId) {
  const routePoint = (prepData.customRoutePoints || []).find(p => p.id === routeItemId && p.isRouteScenic);
  if (!routePoint) return;
  if (!confirm(`确定要从当天路线中删除景点「${routePoint.name}」吗？`)) return;

  const date = routePoint.date;
  prepData.customRoutePoints = (prepData.customRoutePoints || []).filter(p => p.id !== routeItemId);
  if (prepData.routePlanOrder && prepData.routePlanOrder[date]) {
    prepData.routePlanOrder[date] = prepData.routePlanOrder[date].filter(id => id !== routeItemId);
  }
  renderAll();
  renderRoutePlan();
  autoSave();
  showSaveIndicator(`✓ 已删除景点「${routePoint.name}」`);
};

window.removeRoutePoint = function(id) {
  prepData.customRoutePoints = (prepData.customRoutePoints || []).filter(p => p.id !== id);
  Object.keys(prepData.routePlanOrder || {}).forEach(date => {
    prepData.routePlanOrder[date] = prepData.routePlanOrder[date].filter(x => x !== id);
  });
  renderRoutePlan(); autoSave();
};

window.computeBestRoute = function(date) {
  const items = collectRouteItems(date);
  const pts = items.filter(it => it.lat && it.lng);
  if (pts.length < 2) { showSaveIndicator('⚠ 需要至少2个有坐标的地点'); return; }
  const sorted = nearestNeighborForDay(pts);
  const sortedIds = sorted.map(p => p.id);
  const unsorted = sortByTime(items.filter(it => !pts.some(p => p.id === it.id))).map(it => it.id);
  if (!prepData.routePlanOrder) prepData.routePlanOrder = {};
  prepData.routePlanOrder[date] = [...sortedIds, ...unsorted];
  renderRoutePlan(); window.showDayOnMap(date); autoSave();
};

window.showDayOnMap = function(date) {
  const mapEl = document.getElementById('tripPrepMap');
  if (!mapEl || typeof AMap === 'undefined') return;
  mapEl.style.display = 'block'; initPrepMap();
  if (prepMapObjects.length > 0) { prepMap.remove(prepMapObjects); prepMapObjects = []; }
  const allItems = collectRouteItems(date);
  const saved = (prepData.routePlanOrder || {})[date];
  let ordered;
  if (saved && saved.length > 0) {
    const ss = new Set(saved);
    ordered = [...saved.map(id => allItems.find(it => it.id === id)).filter(Boolean), ...sortByTime(allItems.filter(it => !ss.has(it.id)))];
  } else {
    ordered = sortByTime(allItems);
  }
  const pts = ordered.filter(it => it.lat && it.lng);
  if (pts.length === 0) { showSaveIndicator('⚠ 该日期无可定位地点'); return; }
  const COLORS = { scenic: '#3498db', transport: '#27ae60', hotel: '#e67e22', custom: '#8e44ad' };
  const ICONS  = { transport: '🚌', hotel: '🏨', custom: '📌' };
  let sNum = 0;
  pts.forEach(p => {
    const bg = COLORS[p.type] || '#3498db';
    const lbl = p.type === 'scenic' ? String(++sNum) : (ICONS[p.type] || '•');
    prepMapObjects.push(new AMap.Marker({
      position: [p.lng, p.lat],
      content: `<div style="background:${bg};color:white;border-radius:50%;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;padding:0 3px;transform:translate(-50%,-100%);white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3);">${lbl}</div>`,
      offset: new AMap.Pixel(0, 0), title: p.name,
    }));
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const [p1, p2] = [pts[i], pts[i + 1]];
    prepMapObjects.push(new AMap.Polyline({
      path: [[p1.lng, p1.lat], [p2.lng, p2.lat]],
      strokeColor: '#3498db',
      strokeWeight: 3,
      strokeOpacity: 0.85,
      strokeStyle: 'solid',
      showDir: true,
    }));
  }
  prepMap.add(prepMapObjects); prepMap.setFitView(prepMapObjects);
};

// ========== ADD-TO-DB MODAL ==========
window.openAddToDbModal = function(prefilledName) {
  document.getElementById('atdbName').value = prefilledName || '';
  ['atdbProvince','atdbCity','atdbTicket','atdbFeatures','atdbIntro','atdbSearch'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('atdbCategory').value = '自定义';
  document.getElementById('atdbLat').value = '';
  document.getElementById('atdbLng').value = '';
  document.getElementById('atdbSuggestions').innerHTML = '';
  document.getElementById('atdbSelectedTip').textContent = '';
  document.getElementById('addToDbModal').style.display = 'flex';
};
window.closeAddToDbModal = function() { document.getElementById('addToDbModal').style.display = 'none'; };
window.saveToDb = async function() {
  const name = document.getElementById('atdbName').value.trim();
  const lat  = document.getElementById('atdbLat').value;
  const lng  = document.getElementById('atdbLng').value;
  if (!name) { alert('请填写景点名称'); return; }
  if (!lat || !lng) { alert('请搜索并选择景点位置以确定坐标'); return; }
  const scenic = {
    id: 'cprep_' + currentUser + '_' + Date.now(), name,
    province: document.getElementById('atdbProvince').value.trim(),
    city:     document.getElementById('atdbCity').value.trim(),
    category: document.getElementById('atdbCategory').value,
    ticket:   document.getElementById('atdbTicket').value.trim() || '免费',
    features: document.getElementById('atdbFeatures').value.trim(),
    intro:    document.getElementById('atdbIntro').value.trim(),
    lat: parseFloat(lat), lng: parseFloat(lng),
    level: '未评级', isCustom: true, activities: [], visited: false,
    route: '', season: '', duration: '', tips: '',
  };
  try {
    await TravelDB.upsertScenic(scenic);
    const ud = await TravelDB.getUserData(currentUser);
    const cl = ud.customScenics || []; cl.push(scenic);
    await TravelDB.saveUserData(currentUser, { customScenics: cl });
    scenicDataMap[scenic.id] = scenic;
    window.closeAddToDbModal(); showSaveIndicator('✓ 已添加到景点库');
  } catch (e) { console.error(e); showSaveIndicator('⚠ 添加失败'); }
};

function initAtdbSearch() {
  const input = document.getElementById('atdbSearch');
  const sugg  = document.getElementById('atdbSuggestions');
  const tip   = document.getElementById('atdbSelectedTip');
  if (!input) return;
  let tmr = null;
  input.addEventListener('input', function() {
    clearTimeout(tmr); const kw = this.value.trim();
    if (!kw) { sugg.style.display = 'none'; return; }
    tmr = setTimeout(() => {
      new AMap.AutoComplete({ city: '' }).search(kw, (status, result) => {
        sugg.innerHTML = '';
        if (status === 'complete' && result.tips) {
          result.tips.filter(t => t.location).slice(0, 6).forEach(item => {
            const d = document.createElement('div');
            d.className = 'suggestion-item';
            d.textContent = item.name + (item.district ? '  ' + item.district : '');
            d.onclick = () => {
              input.value = item.name; sugg.style.display = 'none'; tip.textContent = '✔ ' + item.name;
              document.getElementById('atdbLat').value = item.location.lat;
              document.getElementById('atdbLng').value = item.location.lng;
              if (item.cityname && !document.getElementById('atdbCity').value) document.getElementById('atdbCity').value = item.cityname;
              if (item.pname && !document.getElementById('atdbProvince').value) document.getElementById('atdbProvince').value = item.pname.replace(/省|市/g,'');
            };
            sugg.appendChild(d);
          });
          sugg.style.display = sugg.children.length ? 'block' : 'none';
        } else { sugg.style.display = 'none'; }
      });
    }, 300);
  });
  document.addEventListener('click', (e) => { if (!input.contains(e.target) && !sugg.contains(e.target)) sugg.style.display = 'none'; });
}

function initHotelLocationSearch() {
  const input = document.getElementById('hotelAddressSearch');
  const sugg  = document.getElementById('hotelAddressSuggestions');
  const tip   = document.getElementById('hotelAddressTip');
  if (!input) return;
  let tmr = null;
  input.addEventListener('input', function() {
    clearTimeout(tmr); const kw = this.value.trim();
    if (!kw) { sugg.style.display = 'none'; pendingHotelLocation = null; return; }
    tmr = setTimeout(() => {
      new AMap.AutoComplete({ city: '' }).search(kw, (status, result) => {
        sugg.innerHTML = '';
        if (status === 'complete' && result.tips) {
          result.tips.filter(t => t.location).slice(0, 6).forEach(item => {
            const d = document.createElement('div');
            d.className = 'suggestion-item';
            d.textContent = item.name + (item.district ? '  ' + item.district : '');
            d.onclick = () => {
              input.value = item.name; sugg.style.display = 'none';
              if (tip) tip.textContent = '✔ ' + item.name;
              pendingHotelLocation = { name: item.name, lat: item.location.lat, lng: item.location.lng };
            };
            sugg.appendChild(d);
          });
          sugg.style.display = sugg.children.length ? 'block' : 'none';
        } else { sugg.style.display = 'none'; }
      });
    }, 300);
  });
  document.addEventListener('click', (e) => { if (!input.contains(e.target) && !sugg.contains(e.target)) sugg.style.display = 'none'; });
}

// ========== PDF EXPORT ==========
window.exportToPDF = async function () {
  await window.saveAll();
  const userData = await TravelDB.getUserData(currentUser);
  const tripIds = (userData.trips || {})[tripName] || [];
  const scenicNames = tripIds.map(id => (scenicDataMap[id] ? scenicDataMap[id].name : id));
  window.__exportScenicNames = scenicNames;
  const win = window.open('', '_blank');
  if (!win) { alert('请允许弹出窗口后再试'); return; }
  win.document.write(buildPDFHtml(scenicNames));
  win.document.close();
  win.addEventListener('load', () => { win.focus(); win.print(); });
};

function buildExportContent(scenicNames) {
  const now = new Date().toLocaleDateString('zh-CN');
  const memberList = prepData.members.map(m => escHtml(m.name)).join('、') || '暂无';
  const scenicHtml = scenicNames.length
    ? scenicNames.map((n, i) => `<span class="tag">${i + 1}. ${escHtml(n)}</span>`).join('')
    : '<em>暂无景点</em>';
  const transportRows = prepData.transport.map(t => {
    const timeStr = (t.departDate || t.arriveDate)
      ? `${t.departDate || ''} ${t.departTime || ''} → ${t.arriveDate || ''} ${t.arriveTime || ''}`.replace(/\s+/g, ' ').trim()
      : '';
    const stationStr = [t.departStation || '', t.arriveStation || ''].filter(Boolean).join(' → ');
    return `<tr><td>${t.checked ? '✓' : '○'}</td><td>${escHtml(t.name)}${t.price ? ` (¥${escHtml(t.price)})` : ''}${stationStr ? `<br><span style="color:#7f8c8d;">${escHtml(stationStr)}</span>` : ''}</td><td>${escHtml(timeStr)}</td></tr>`;
  }).join('');
  const ticketRows = prepData.scenicTickets.map(t => `<tr><td>${t.checked ? '✓' : '○'}</td><td>${escHtml(t.name)}</td><td>${escHtml(String(t.price))} × ${t.count || 1}</td><td>${t.visitDate ? escHtml(t.visitDate) + (t.visitTime ? ' ' + escHtml(t.visitTime) : '') : '—'}</td></tr>`).join('');
  const hotelRows = prepData.hotels.map(h => {
    const dateText = (h.checkIn || h.checkOut) ? ` (${h.checkIn || '?'}${h.checkInTime ? ' ' + h.checkInTime : ''} → ${h.checkOut || '?'}${h.checkOutTime ? ' ' + h.checkOutTime : ''})` : '';
    const addr = h.address ? ` · ${h.address}` : '';
    return `<tr><td>${h.checked ? '✓' : '○'}</td><td>${escHtml(h.name)}${escHtml(dateText)}${escHtml(addr)}</td>${h.price ? `<td>¥${escHtml(String(h.price))}</td>` : '<td>—</td>'}</tr>`;
  }).join('');
  const gearGrouped = {};
  prepData.gear.forEach(g => { (gearGrouped[g.category] = gearGrouped[g.category] || []).push(g); });
  const gearHtml = Object.entries(gearGrouped).map(([cat, items]) => `<div class="gcl">${escHtml(cat)}</div>${items.map(g => `<span class="tag${g.checked ? ' done' : ''}">${g.checked ? '✓ ' : ''}${escHtml(g.name)}</span>`).join('')}`).join('<br>');
  const chk = (arr, field) => arr.map(x => `<div class="ci${x.checked ? ' done' : ''}">${x.checked ? '☑' : '☐'} ${escHtml(x[field] || x.name || '')}${x.price ? ` (¥${escHtml(String(x.price))})` : ''}</div>`).join('');
  const parsePrice = (s) => parseFloat(String(s || '').replace(/[^0-9.]/g, '')) || 0;
  const tTransport = prepData.transport.reduce((s, t) => s + parsePrice(t.price), 0);
  const tTickets = prepData.scenicTickets.reduce((s, t) => s + parsePrice(t.price) * (t.count || 1), 0);
  const tHotel = prepData.hotels.reduce((s, h) => s + parsePrice(h.price), 0);
  const tShop = prepData.shopping.reduce((s, x) => s + parsePrice(x.price), 0);
  const tGrand = tTransport + tTickets + tHotel + tShop;
  const costRows = [['🚌 路程交通', tTransport],['🎫 景点门票', tTickets],['🏨 酒店住宿', tHotel],['🛒 待买清单', tShop]].filter(([, v]) => v > 0).map(([l, v]) => `<tr><td>${l}</td><td>¥${v.toFixed(0)}</td></tr>`).join('');
  const costHtml = tGrand > 0 ? `<table><tr><th>类别</th><th>金额</th></tr>${costRows}<tr style="font-weight:bold;background:#eafaf1;"><td>💰 合计</td><td style="color:#27ae60;">¥${tGrand.toFixed(0)}</td></tr></table>` : '<em style="color:#aaa;font-size:12px;">暂无费用信息</em>';
  const rpDays = getAllRouteDates();
  const routePlanHtml = rpDays.length === 0 ? '<em style="color:#aaa;font-size:12px;">未设置访问日期</em>' : rpDays.map((date, di) => {
    const allItems = collectRouteItems(date);
    const saved = (prepData.routePlanOrder || {})[date];
    let ordered;
    if (saved && saved.length > 0) {
      const ss = new Set(saved);
      ordered = [...saved.map(id => allItems.find(it => it.id === id)).filter(Boolean), ...sortByTime(allItems.filter(it => !ss.has(it.id)))];
    } else {
      ordered = sortByTime(allItems);
    }
    const TYPE_ICON = { scenic: '📍', transport: '🚌', hotel: '🏨', custom: '📌' };
    return `<div class="route-day"><div class="route-day-title">📅 第${di + 1}天 · ${date}</div><ol class="route-day-list">${ordered.map(it => {
      if (it.type === 'transport') {
        const stationText = it.subText ? it.subText.replace(/^出发站点：|^到达站点：/, '') : '';
        return `<li>${TYPE_ICON[it.type] || ''} <span class="route-top">${escHtml(stationText || '未填写站点')}</span> · <span class="route-bottom">${escHtml(it.time || '未填写时间')}</span></li>`;
      }
      if (it.type === 'hotel') {
        const hotelTime = it.time || (it.subText ? it.subText.replace(/^入住时间：|^退房时间：/, '') : '');
        return `<li>${TYPE_ICON[it.type] || ''}${escHtml(it.name)}${hotelTime ? ` - ${escHtml(hotelTime)}` : ''}</li>`;
      }
      return `<li>${TYPE_ICON[it.type] || ''}${escHtml(it.name)}${it.time ? ` - ${escHtml(it.time)}` : ''}</li>`;
    }).join('')}</ol></div>`;
  }).join('');
  return { now, memberList, scenicHtml, transportRows, ticketRows, hotelRows, gearHtml, chk, costHtml, routePlanHtml };
}

function buildLongImageHtml() {
  const scenicNames = window.__exportScenicNames || [];
  const c = buildExportContent(scenicNames);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escHtml(tripName)} - 长图</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#2c3e50}.wrap{width:900px;padding:18px 22px}.title{font-size:22px;font-weight:800;color:#2c3e50;border-bottom:3px solid #27ae60;padding-bottom:8px;margin-bottom:8px}.meta{font-size:12px;color:#7f8c8d;margin-bottom:14px}.sec{margin-bottom:12px}.st{font-size:14px;font-weight:700;background:#f0f2f5;padding:5px 9px;border-left:4px solid #27ae60;margin-bottom:6px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:5px 7px;border:1px solid #e5e7eb;vertical-align:top}th{background:#ecf0f1;text-align:left}tr:nth-child(even){background:#fafafa}.tag{display:inline-block;padding:3px 8px;background:#eaf4fb;border:1px solid #aed6f1;border-radius:10px;font-size:11px;margin:3px 3px 0 0;color:#2471a1}.tag.done{background:#eafaf1;border-color:#a9dfbf;color:#1e8449}.ci{display:block;padding:4px 7px;background:#f8f9fa;border:1px solid #eee;border-radius:5px;font-size:12px;margin-bottom:4px}.ci.done{background:#eafaf1;color:#95a5a6;text-decoration:line-through}.route-day{margin-bottom:8px;padding:8px 9px;border:1px solid #e5e7eb;border-radius:8px;background:#fff}.route-day-title{font-size:14px;font-weight:700;margin-bottom:5px}.route-day-list{margin:0;padding-left:18px;font-size:12px;line-height:1.65}.route-top{font-weight:600}.route-bottom{color:#7f8c8d}</style></head><body><div class="wrap"><div class="title">📋 ${escHtml(tripName)}</div><div class="meta">生成时间：${c.now} · 行程成员：${c.memberList}${(prepData.tripStartDate || prepData.tripEndDate) ? ` · 行程日期：${prepData.tripStartDate || '?'} → ${prepData.tripEndDate || '?'}` : ''}</div><div class="sec"><div class="st">📍 行程景点（${scenicNames.length} 处）</div><div>${c.scenicHtml}</div></div><div class="sec"><div class="st">🚌 路程交通票</div>${prepData.transport.length ? `<table><tr><th width="24"></th><th>票/行程</th><th>时间</th></tr>${c.transportRows}</table>` : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">🎫 景点门票</div>${prepData.scenicTickets.length ? `<table><tr><th width="24"></th><th>景点</th><th>票价</th><th>日期/时间</th></tr>${c.ticketRows}</table>` : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">🏨 酒店住宿</div>${prepData.hotels.length ? `<table><tr><th width="24"></th><th>酒店 / 日期</th></tr>${c.hotelRows}</table>` : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">🎒 装备准备</div>${prepData.gear.length ? c.gearHtml : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">📦 物品清单</div>${prepData.items.length ? c.chk(prepData.items, 'name') : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">🛒 待买清单</div>${prepData.shopping.length ? c.chk(prepData.shopping, 'name') : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">✅ 其他代办</div>${prepData.todos.length ? c.chk(prepData.todos, 'text') : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">📍 每日行程路线</div>${c.routePlanHtml}</div><div class="sec"><div class="st">💰 费用汇总</div>${c.costHtml}</div></div></body></html>`;
}

function buildPDFHtml(scenicNames) {
  const c = buildExportContent(scenicNames || []);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>行程准备 - ${escHtml(tripName)}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;color:#2c3e50;padding:15mm 16mm}h1{font-size:21px;color:#2c3e50;border-bottom:3px solid #27ae60;padding-bottom:7px;margin-bottom:4px}.meta{font-size:12px;color:#7f8c8d;margin-bottom:18px}.sec{margin-bottom:16px;page-break-inside:avoid}.st{font-size:14px;font-weight:bold;background:#f0f2f5;padding:4px 9px;border-left:4px solid #27ae60;margin-bottom:7px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#ecf0f1;padding:4px 7px;text-align:left;border:1px solid #ddd}td{padding:3px 7px;border:1px solid #ddd}tr:nth-child(even){background:#f9f9f9}.tag{display:inline-block;padding:2px 8px;background:#eaf4fb;border:1px solid #aed6f1;border-radius:10px;font-size:11px;margin:2px;color:#2471a1}.tag.done{background:#eafaf1;border-color:#a9dfbf;color:#1e8449}.gcl{font-size:11px;font-weight:bold;color:#95a5a6;text-transform:uppercase;margin:5px 0 2px 0}.ci{display:inline-block;padding:2px 8px;background:#f8f9fa;border:1px solid #eee;border-radius:4px;font-size:12px;margin:2px}.ci.done{background:#eafaf1;color:#95a5a6;text-decoration:line-through}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.route-day{margin-bottom:10px}.route-day-title{font-size:15px;font-weight:bold;margin-bottom:4px}.route-day-list{margin:0;padding-left:20px;font-size:12px;line-height:1.7}@media print{body{padding:8mm 10mm}@page{margin:8mm;size:A4}}</style></head><body><h1>📋 ${escHtml(tripName)}</h1><div class="meta">生成时间：${c.now} &nbsp;|&nbsp; 行程成员：${c.memberList}${(prepData.tripStartDate || prepData.tripEndDate) ? ` &nbsp;|&nbsp; 行程日期：${prepData.tripStartDate || '?'} → ${prepData.tripEndDate || '?'}` : ''}</div><div class="sec"><div class="st">📍 行程景点（${(scenicNames || []).length} 处）</div><div>${c.scenicHtml}</div></div><div class="two"><div class="sec"><div class="st">🚌 路程交通票</div>${prepData.transport.length ? `<table><tr><th width="20"></th><th>票/行程</th><th>时间</th></tr>${c.transportRows}</table>` : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">🎫 景点门票</div>${prepData.scenicTickets.length ? `<table><tr><th width="20"></th><th>景点</th><th>票价</th><th>日期/时间</th></tr>${c.ticketRows}</table>` : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div></div><div class="sec"><div class="st">🏨 酒店住宿</div>${prepData.hotels.length ? `<table><tr><th width="20"></th><th>酒店 / 日期</th></tr>${c.hotelRows}</table>` : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">🎒 装备准备</div>${prepData.gear.length ? c.gearHtml : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="two"><div class="sec"><div class="st">📦 物品清单</div>${prepData.items.length ? c.chk(prepData.items, 'name') : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">🛒 待买清单</div>${prepData.shopping.length ? c.chk(prepData.shopping, 'name') : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div></div><div class="sec"><div class="st">✅ 其他代办</div>${prepData.todos.length ? c.chk(prepData.todos, 'text') : '<em style="color:#aaa;font-size:12px;">暂无</em>'}</div><div class="sec"><div class="st">📍 每日行程路线</div>${c.routePlanHtml}</div><div class="sec"><div class="st">💰 费用汇总</div>${c.costHtml}</div></body></html>`;
}

window.exportToLongImage = async function() {
  await window.saveAll();
  const userData = await TravelDB.getUserData(currentUser);
  const tripIds = (userData.trips || {})[tripName] || [];
  const scenicNames = tripIds.map(id => (scenicDataMap[id] ? scenicDataMap[id].name : id));
  window.__exportScenicNames = scenicNames;
  const html = buildLongImageHtml();
  const overlay = document.createElement('div');
  overlay.id = 'longImageExportOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = '<div id="longImageExportText" style="background:white;border-radius:12px;padding:18px 22px;min-width:260px;box-shadow:0 10px 30px rgba(0,0,0,.2);font-size:14px;color:#2c3e50;text-align:center;">正在准备长图内容…</div>';
  document.body.appendChild(overlay);

  const cleanup = () => {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;height:6000px;border:0;opacity:0;pointer-events:none;';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  const updateText = (text) => {
    const el = document.getElementById('longImageExportText');
    if (el) el.textContent = text;
  };

  iframe.onload = async () => {
    try {
      updateText('正在渲染长图，请稍候…');
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const wrap = doc && doc.querySelector('.wrap');
      if (!wrap) throw new Error('long-image-wrap-missing');
      await new Promise(r => setTimeout(r, 300));
      if (typeof html2canvas !== 'function') throw new Error('html2canvas-missing');
      const canvas = await html2canvas(wrap, {
        backgroundColor: '#ffffff',
        useCORS: true,
        scale: Math.min(Math.max(window.devicePixelRatio || 1, 2), 2),
        scrollX: 0,
        scrollY: -window.scrollY,
        width: wrap.scrollWidth,
        height: wrap.scrollHeight,
        windowWidth: wrap.scrollWidth,
        windowHeight: wrap.scrollHeight
      });
      updateText('正在下载长图…');
      canvas.toBlob(blob => {
        if (!blob) {
          cleanup();
          alert('长图导出失败，请重试');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tripName || 'trip'}-长图.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          cleanup();
        }, 200);
      }, 'image/png');
    } catch (err) {
      console.error(err);
      cleanup();
      alert('长图导出失败，请重试');
    }
  };
};

init();
