const TravelDB = (() => {
  const DB_NAME = 'travalor_db';
  const DB_VERSION = 1;
  const SCENIC_STORE = 'scenics';
  const USER_STORE = 'users';
  const USER_DATA_STORE = 'user_data';

  let db = null;

  const EXTRA_HANGZHOU_SCENICS = [
    {
      id: 'hz_1001',
      name: '九溪十八涧',
      province: '浙江',
      city: '杭州',
      lat: 30.205,
      lng: 120.089,
      ticket: '免费',
      features: '溪流、茶园、古道并存的经典徒步线',
      route: '九溪烟树 -> 九溪桥 -> 理安寺 -> 龙井村',
      season: '春秋最佳',
      intro: '九溪十八涧是杭州近郊最受欢迎的自然徒步路线之一。',
      category: '自然风光',
      level: '未评级',
      duration: '2-4小时',
      tips: '雨后溪水更美，建议穿防滑鞋。',
      activities: ['徒步', '溯溪', '摄影', '野餐']
    },
    {
      id: 'hz_1002',
      name: '湘湖旅游度假区',
      province: '浙江',
      city: '杭州',
      lat: 30.150,
      lng: 120.260,
      ticket: '免费（部分项目收费）',
      features: '湖区骑行、划船、露营活动丰富',
      route: '湘湖慢生活街区 -> 湖心岛 -> 越王城遗址公园',
      season: '四季皆宜',
      intro: '湘湖是杭州热门周末休闲地，适合亲子和户外活动。',
      category: '自然风光',
      level: '未评级',
      duration: '4-6小时',
      tips: '可租自行车环湖。',
      activities: ['骑行', '划船 / 桨板 / 皮划艇', '野餐', '摄影']
    },
    {
      id: 'hz_1003',
      name: '良渚博物院',
      province: '浙江',
      city: '杭州',
      lat: 30.390,
      lng: 120.040,
      ticket: '免费（需预约）',
      features: '系统展示良渚文明与玉器文化',
      route: '序厅 -> 良渚古城展厅 -> 玉器展厅 -> 文创区',
      season: '全年开放，周一闭馆',
      intro: '良渚博物院是了解中华五千年文明的重要场馆。',
      category: '博物馆',
      level: '未评级',
      duration: '2-3小时',
      tips: '建议提前预约讲解。',
      activities: ['逛博物馆', '看展', '手工体验（陶艺 / 扎染 / 做糕点等）']
    },
    {
      id: 'hz_1004',
      name: '塘栖古镇',
      province: '浙江',
      city: '杭州',
      lat: 30.476,
      lng: 120.191,
      ticket: '免费',
      features: '京杭运河边的江南古镇，市井气息浓厚',
      route: '广济桥 -> 水北街 -> 乾隆御碑 -> 运河码头',
      season: '春秋最佳',
      intro: '塘栖古镇是杭州周边逛吃休闲的代表地。',
      category: '古镇',
      level: '未评级',
      duration: '3-5小时',
      tips: '可尝粢毛肉圆和细沙羊尾。',
      activities: ['逛古镇 / 创意园区', '逛市集 / 夜市', '吃美食', '打卡咖啡馆 / 茶馆']
    },
    {
      id: 'hz_1005',
      name: '天目里艺术街区',
      province: '浙江',
      city: '杭州',
      lat: 30.273,
      lng: 120.115,
      ticket: '免费（展览单独计费）',
      features: '艺术展览、设计店铺与咖啡空间聚集',
      route: '主展馆 -> 户外装置区 -> 文创商店 -> 咖啡馆',
      season: '全年开放',
      intro: '天目里是杭州新兴文化创意街区。',
      category: '人文历史',
      level: '未评级',
      duration: '2-3小时',
      tips: '周末活动较多，建议错峰。',
      activities: ['看展', '打卡咖啡馆 / 茶馆', '逛商场', '摄影']
    },
    {
      id: 'hz_1006',
      name: '杭州极地海洋公园',
      province: '浙江',
      city: '杭州',
      lat: 30.185,
      lng: 120.245,
      ticket: '299元起',
      features: '极地动物展示与海洋主题演艺',
      route: '极地馆 -> 海洋馆 -> 白鲸剧场 -> 企鹅馆',
      season: '全年开放',
      intro: '适合亲子出游的综合性海洋主题乐园。',
      category: '主题公园',
      level: '未评级',
      duration: '4-5小时',
      tips: '演出时段建议提前占位。',
      activities: ['游乐园', '看展']
    }
  ];

  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const upgradeDb = event.target.result;
        if (!upgradeDb.objectStoreNames.contains(SCENIC_STORE)) {
          const scenicStore = upgradeDb.createObjectStore(SCENIC_STORE, { keyPath: 'id' });
          scenicStore.createIndex('idx_city', 'city', { unique: false });
          scenicStore.createIndex('idx_province', 'province', { unique: false });
          scenicStore.createIndex('idx_category', 'category', { unique: false });
        }
        if (!upgradeDb.objectStoreNames.contains(USER_STORE)) {
          upgradeDb.createObjectStore(USER_STORE, { keyPath: 'username' });
        }
        if (!upgradeDb.objectStoreNames.contains(USER_DATA_STORE)) {
          upgradeDb.createObjectStore(USER_DATA_STORE, { keyPath: 'username' });
        }
      };
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function txPromise(storeName, mode, action) {
    return openDB().then((dbConn) => new Promise((resolve, reject) => {
      const tx = dbConn.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      result = action(store);
    }));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    return txPromise(storeName, 'readonly', (store) => reqToPromise(store.getAll()));
  }

  async function put(storeName, data) {
    return txPromise(storeName, 'readwrite', (store) => reqToPromise(store.put(data)));
  }

  async function get(storeName, key) {
    return txPromise(storeName, 'readonly', (store) => reqToPromise(store.get(key)));
  }

  async function seedScenicsIfNeeded() {
    const existing = await getAll(SCENIC_STORE);
    if (existing.length > 0) return;

    const merged = [...(SCENIC_SEED || []), ...EXTRA_HANGZHOU_SCENICS];

    await txPromise(SCENIC_STORE, 'readwrite', (store) => {
      merged.forEach((item) => {
        const normalized = {
          ...item,
          activities: Array.isArray(item.activities) ? item.activities : (DEFAULT_ACTIVITIES_BY_CATEGORY[item.category] || []),
          visited: false
        };
        store.put(normalized);
      });
      return true;
    });
  }

  async function getOrInitUserData(username) {
    const found = await get(USER_DATA_STORE, username);
    if (found) return found;
    const initial = { username, visited: [], trips: {}, customScenics: [], ratings: {}, tripPrep: {} };
    await put(USER_DATA_STORE, initial);
    return initial;
  }

  return {
    async init() {
      await openDB();
      await seedScenicsIfNeeded();
    },

    async getAllScenics() {
      return getAll(SCENIC_STORE);
    },

    async upsertScenic(scenic) {
      return put(SCENIC_STORE, scenic);
    },

    async deleteScenic(id) {
      return txPromise(SCENIC_STORE, 'readwrite', (store) => reqToPromise(store.delete(id)));
    },

    async saveUser(username, password) {
      return put(USER_STORE, { username, password });
    },

    async getUser(username) {
      return get(USER_STORE, username);
    },

    async getUserData(username) {
      return getOrInitUserData(username);
    },

    async saveUserData(username, patch) {
      const prev = await getOrInitUserData(username);
      const next = { ...prev, ...patch, username };
      await put(USER_DATA_STORE, next);
      return next;
    },

    async getAllUsers() {
      return getAll(USER_STORE);
    },

    async getAllUserData() {
      return getAll(USER_DATA_STORE);
    }
  };
})();
