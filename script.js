/**
 * ============================================
 * 校园无人书车调度系统 - 主逻辑脚本 (script.js)
 * ============================================
 * 
 * 下方代码实现了以下核心功能：
 * 1. 地图初始化 (Map Initialization)
 * 2. POI 标记渲染 (Markers)
 * 3. 路径规划 (Path Planning using AMap.Riding)
 * 4. 无人车移动动画 (Marker Animation)
 */

// 全局变量定义
let map = null;              // 地图实例对象
let AMapObj = null;          // AMap 命名空间引用
let carMarker = null;        // 小车 Marker 实例
let riding = null;           // 非机动车（骑行）路线规划插件实例
let pathPolyline = null;         // 绘制路径的折线对象

// 自定义路径相关状态
let isDrawingCustom = false;     // 是否处于自定义路径点选模式
let customViaPoints = [];        // 用户选择的途径点
let customMarkers = [];          // 途径点的临时标记
let customPreviewPolyline = null;// 预览折线

// ============================================
// 1. 基础数据定义 (Mock Data)
// ============================================

// 模拟校园内的关键地点（东南大学九龙湖校区）
// 坐标采用高德坐标系 (GCJ-02)
const locations = [
    // 桃园宿舍区5-6 (Dorm A)
    {
        id: 'dorm_a',
        name: '桃园5-6栋',
        type: 'dorm',
        position: [118.827694, 31.890928]
    },
    // 桃园宿舍区7-8 (Dorm B)
    {
        id: 'dorm_b',
        name: '桃园7-8栋',
        type: 'dorm',
        position: [118.82628, 31.890783]
    },
    // 交通大楼 (Office)
    {
        id: 'dorm_c',
        name: '交通大楼',
        type: 'office',
        position: [118.823748, 31.890009]
    },
    // 兰园宿舍区 (Dorm D)
    {
        id: 'dorm_d',
        name: '兰园宿舍区',
        type: 'dorm',
        position: [118.825223, 31.891883]
    },
    // 土木楼/电子信息楼
    {
        id: 'civil_electronics',
        name: '土木楼/电子信息楼',
        type: 'office',
        position: [118.822881, 31.891321]
    },
    // 图书馆取还点 (终点)
    {
        id: 'library',
        name: '图书馆取还点',
        type: 'library',
        position: [118.819181, 31.88836]
    },
    // 交通实验楼 (New)
    {
        id: 'traffic_experiment',
        name: '交通实验楼',
        type: 'office',
        position: [118.821637, 31.890095]
    },
    // 教学楼南入口 (New - Disabled)
    {
        id: 'teaching_south',
        name: '教学楼南入口',
        type: 'classroom',
        position: [118.823404, 31.886848],
        disabled: true
    },
    // 材料/化工楼 (New)
    {
        id: 'material_chem',
        name: '材料/化工楼',
        type: 'office',
        position: [118.820567, 31.890035]
    }
];

// 校园范围边界（用于生成随机位置）
const campusBounds = {
    minLng: 118.818,
    maxLng: 118.828,
    minLat: 31.885,
    maxLat: 31.892
};

/**
 * 生成校园内随机位置 (需在电子围栏内)
 * @returns {Array} [lng, lat]
 */
function getRandomCampusPosition() {
    let lng, lat;
    let safeGuard = 0;
    // 尝试最多20次生成在围栏内的点，避免死循环
    do {
        lng = campusBounds.minLng + Math.random() * (campusBounds.maxLng - campusBounds.minLng);
        lat = campusBounds.minLat + Math.random() * (campusBounds.maxLat - campusBounds.minLat);
        safeGuard++;
    } while (!isPointInFence([lng, lat]) && safeGuard < 20);

    return [lng, lat];
}

// Global Weather State
let isWeatherBad = false;

// 任务状态追踪
let isTaskInProgress = false;   // 是否有任务正在进行中
let hasPickedUpGoods = false;   // 是否已取到货物（装载完成）
window.locationMarkers = {};    // 存储所有地点标记实例
let isEmergencyStopped = false; // 是否处于紧急停止状态
let lastStatusState = { keyword: 'idle', text: '空闲' }; // 记录紧急停车前的状态，用于恢复


// 小车初始停靠位置（每次加载随机生成）
let carInitPosition = null;
let isFollowingCar = false; // 是否正在跟随小车视角

// ============================================
// 2. 地图初始化流程
// ============================================

// 监听 DOM 加载完成事件
document.addEventListener('DOMContentLoaded', function () {
    // ===================================
    // 0. Theme Initialization (Dark/Light)
    // ===================================
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIconLight = document.getElementById('theme-icon-light');
    const themeIconDark = document.getElementById('theme-icon-dark');

    // Check saved theme => default to 'light'
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    applyTheme(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    function applyTheme(theme) {
        // 1. Update Icons
        if (theme === 'dark') {
            themeIconLight.style.display = 'none';
            themeIconDark.style.display = 'block';
        } else {
            themeIconLight.style.display = 'block';
            themeIconDark.style.display = 'none';
        }

        // 2. Update Map Style (if map is initialized)
        if (map) {
            const styleName = theme === 'dark' ? "amap://styles/dark" : "amap://styles/normal";
            map.setMapStyle(styleName);
        }
    }

    // ===================================
    // 1. 初始化地图
    // ===================================
    initAMap();

    // ===================================
    // 2. Initialize Volunteer Count (New)
    // ===================================
    initVolunteerStatus();

    // Note: initWeather() is now called inside initAMap().then()
    // because it requires AMapObj to be set first.
});

/**
 * Mock Interface: Get Library Volunteer Count
 * @returns {Number} 0 means no service, >0 means available
 * To test: Run `localStorage.setItem('volunteer_count', '0')` in console and reload.
 */
function getLibraryVolunteerCount() {
    // 优先从 localStorage 读取，方便测试 (Default: 1)设置志愿者数量
    const stored = localStorage.getItem('volunteer_count');
    return stored !== null ? parseInt(stored, 10) : 1;
}

/**
 * Initialize Volunteer Status logic
 */
function initVolunteerStatus() {
    const count = getLibraryVolunteerCount();
    const countEl = document.getElementById('volunteer-count');
    const badgeEl = document.getElementById('volunteer-status');
    const startSelect = document.getElementById('start-select');
    const endSelect = document.getElementById('end-select');

    if (countEl && badgeEl) {
        countEl.textContent = count;

        if (count === 0) {
            badgeEl.classList.add('unavailable');
            badgeEl.setAttribute('title', '当前无志愿者值班，图书馆服务暂停');
        } else {
            badgeEl.classList.remove('unavailable');
            badgeEl.setAttribute('title', `当前有 ${count} 名志愿者提供服务`);
        }
    }

    // Store count globally or just use the function when populating options
    // Since initControls populates options, we need to handle it there or update it here.
    // simpler to update options here if they are already populated? 
    // Wait, initControls is called inside initAMap -> then, so it happens later.
    // So we should expose a check function or just let initControls call getLibraryVolunteerCount.
}

// ============================================
// Weather Logic (New)
// ============================================
function initWeather() {
    const weatherDisplay = document.getElementById('weather-display');
    const iconEl = weatherDisplay.querySelector('.weather-icon');
    const tempEl = weatherDisplay.querySelector('.weather-temp');
    const textEl = weatherDisplay.querySelector('.weather-text');

    // [New] Nav Weather Row Elements
    const navWeatherRow = document.getElementById('nav-weather-row');
    const navIconEl = navWeatherRow.querySelector('.weather-icon');
    const navTempEl = navWeatherRow.querySelector('.weather-temp');
    const navTextEl = navWeatherRow.querySelector('.weather-text');

    // Default state
    weatherDisplay.style.display = 'flex';

    if (!AMapObj || !AMapObj.Weather) {
        console.warn('AMap Weather plugin not available.');
        textEl.textContent = '加载失败';
        if (navTextEl) navTextEl.textContent = '加载失败';
        return;
    }

    const weather = new AMapObj.Weather();

    // 查询南京市天气 (可以改成动态城市)
    weather.getLive('南京市', function (err, data) {
        if (!err && data.info === 'OK') {
            const { weather: weatherStateRaw, temperature } = data;
            // 使用高德地图 API 返回的真实天气状态
            const weatherState = weatherStateRaw;

            tempEl.textContent = `${temperature}°C`;
            textEl.textContent = weatherState;

            // Sync to Nav Row
            if (navTempEl) navTempEl.textContent = `${temperature}°C`;
            if (navTextEl) navTextEl.textContent = weatherState;

            // Simple mapping for icons
            let iconChar = '🌤️';
            if (weatherState.includes('晴')) iconChar = '☀️';
            else if (weatherState.includes('云') || weatherState.includes('阴')) iconChar = '☁️';
            else if (weatherState.includes('雨')) iconChar = '🌧️';
            else if (weatherState.includes('雪')) iconChar = '❄️';
            else if (weatherState.includes('雷')) iconChar = '⚡';
            else if (weatherState.includes('雾') || weatherState.includes('霾')) iconChar = '🌫️';

            iconEl.textContent = iconChar;
            if (navIconEl) navIconEl.textContent = iconChar;

            // Trigger Visual Effects (New)
            updateWeatherEffect(weatherState);

            // Check for bad weather (current)
            // Rules: Rain (雨), Snow (雪), Storm (暴)
            if (weatherState.includes('雨') || weatherState.includes('雪') || weatherState.includes('暴')) {
                handleBadWeather(weatherState);
            } else {
                // If current weather is fine, check forecast for FUTURE bad weather
                // We use daily forecast as a proxy for "upcoming" since hourly API is limited on free plan
                checkWeatherForecast(weather, '南京市');

                isWeatherBad = false;
                weatherDisplay.classList.remove('bad-weather');
                restoreCallButton();
            }

        } else {
            textEl.textContent = '获取失败';
            if (navTextEl) navTextEl.textContent = '获取失败';
        }
    });
}

/**
 * Update visual weather effects overlay
 * @param {String} weatherState 
 */
function updateWeatherEffect(weatherState) {
    const overlay = document.getElementById('weather-effect-overlay');
    if (!overlay) return;

    // Remove existing classes
    overlay.className = '';

    if (weatherState.includes('雨')) {
        overlay.classList.add('weather-rain');
    } else if (weatherState.includes('雪')) {
        overlay.classList.add('weather-snow');
    } else if (weatherState.includes('晴')) {
        overlay.classList.add('weather-sun');
    }
}

// Global exposure for simulation/testing
window.updateWeatherEffect = updateWeatherEffect;

function handleBadWeather(weatherState) {
    isWeatherBad = true;
    const weatherDisplay = document.getElementById('weather-display');
    const textEl = weatherDisplay ? weatherDisplay.querySelector('.weather-text') : null;
    const topNav = document.getElementById('top-nav'); // [New] for Vertical Mode
    const navTextEl = topNav ? topNav.querySelector('.weather-text') : null; // [New]

    if (weatherDisplay) {
        weatherDisplay.classList.add('bad-weather');
        if (textEl) textEl.textContent = `${weatherState} (暂停运营)`;
    }

    // [New] Apply to Top Nav
    if (topNav) {
        topNav.classList.add('bad-weather');
        if (navTextEl) navTextEl.textContent = `${weatherState} (暂停运营)`; // Update nav text too
    }

    // Disable call button
    const callBtn = document.getElementById('call-btn');
    if (callBtn) {
        const btnTextEl = callBtn.querySelector('span');
        if (btnTextEl) btnTextEl.textContent = "暂停服务";

        callBtn.classList.add('disabled');
        callBtn.style.opacity = '0.7';
        callBtn.style.cursor = 'not-allowed';
    }
}

/**
 * 恢复呼叫按钮正常状态
 */
function restoreCallButton() {
    const callBtn = document.getElementById('call-btn');
    const weatherDisplay = document.getElementById('weather-display');
    const topNav = document.getElementById('top-nav'); // [New]

    if (weatherDisplay) weatherDisplay.classList.remove('bad-weather');
    if (topNav) topNav.classList.remove('bad-weather'); // [New]

    if (callBtn) {
        callBtn.classList.remove('disabled');
        // callBtn.disabled = false;

        // Reset text based on task state
        updateCallButtonState();
    }
}


/**
 * Check forecast for upcoming bad weather
 * @param {AMap.Weather} weatherObj 
 * @param {String} city 
 */
function checkWeatherForecast(weatherObj, city) {
    // Check for simulation flag in localStorage
    // Usage: localStorage.setItem('simulate_forecast_rain', 'true');
    const simulateRain = localStorage.getItem('simulate_forecast_rain') === 'true';

    if (simulateRain) {
        console.log("Simulating forecast rain...");
        showWeatherWarning("模拟测试：预计即将有雨雪天气");
        return;
    }

    weatherObj.getForecast(city, function (err, data) {
        if (!err && data.info === 'OK') {
            const forecasts = data.forecasts;
            if (forecasts && forecasts.length > 0) {
                // Check closest forecast (Today)
                // If it says Rain/Snow, but currently it is NOT (checked in getLive), then it's "upcoming"
                const today = forecasts[0];
                const dayWeather = today.dayWeather;
                const nightWeather = today.nightWeather;

                if (dayWeather.includes('雨') || dayWeather.includes('雪') ||
                    nightWeather.includes('雨') || nightWeather.includes('雪')) {

                    showWeatherWarning(`预报显示即将有${dayWeather.includes('雨') ? '雨' : '雪'}，运行服务可能会中途暂停。`);
                }
            }
        }
    });
}

// ============================================
// 12. Dynamic Island Bottom Navigation Logic
// ============================================

/**
 * 状态枚举
 */
const ISLAND_STATES = {
    HIDDEN: 'hidden',
    WAITING: 'waiting',  // En route to pickup
    PICKUP: 'pickup',    // Arrived at pickup
    MOVING: 'moving',    // En route to delivery
    ARRIVED: 'arrived'   // Arrived at destination
};

/**
 * 更新底部动态岛状态
 * @param {String} state State key from ISLAND_STATES
 * @param {Object} data Optional data (code, speed, etc)
 */
function updateBottomIsland(state, data = {}) {
    const island = document.getElementById('bottom-dynamic-island');
    const sections = {
        [ISLAND_STATES.WAITING]: document.getElementById('island-state-waiting'),
        [ISLAND_STATES.PICKUP]: document.getElementById('island-state-pickup'),
        [ISLAND_STATES.MOVING]: document.getElementById('island-state-moving'),
        [ISLAND_STATES.ARRIVED]: document.getElementById('island-state-arrived')
    };

    // 1. Hide Island if state is HIDDEN
    if (state === ISLAND_STATES.HIDDEN) {
        island.classList.add('hidden');
        // Hide all sections too just in case
        Object.values(sections).forEach(el => el.classList.add('hidden'));
        return;
    }

    // 2. Show Main Island Container
    island.classList.remove('hidden');

    // 3. Toggle specific content sections
    Object.keys(sections).forEach(key => {
        if (key === state) {
            sections[key].classList.remove('hidden');
        } else {
            sections[key].classList.add('hidden');
        }
    });

    // 4. Update dynamic data and Glow Effects
    // Reset Glow
    island.classList.remove('island-glow-primary', 'island-glow-success');

    if (state === ISLAND_STATES.PICKUP) {
        if (data.code) {
            document.getElementById('island-pickup-code').textContent = data.code;
        }
        // Add Primary Glow for Pickup Confirmation
        island.classList.add('island-glow-primary');
    }

    if (state === ISLAND_STATES.ARRIVED) {
        // Add Success Glow for Delivery Confirmation
        island.classList.add('island-glow-success');
    }

    if (state === ISLAND_STATES.MOVING) {
        // Start Speed Simulation if not provided
        if (data.speed !== undefined) {
            updateVehicleSpeed(data.speed);
        } else {
            // Default start loop if just switching state
            startSpeedSimulation();
        }
    } else {
        stopSpeedSimulation();
    }
}

// Speed Simulation
let speedInterval = null;

function updateVehicleSpeed(speed) {
    const display = document.getElementById('island-speed-display');
    if (display) {
        display.textContent = `${speed.toFixed(1)} km/h`;
    }
}

function startSpeedSimulation() {
    if (speedInterval) clearInterval(speedInterval);

    // Simulate speed fluctuation around 20km/h
    speedInterval = setInterval(() => {
        const baseSpeed = 20;
        const fluctuation = (Math.random() - 0.5) * 5; // +/- 2.5
        const currentSpeed = baseSpeed + fluctuation;
        updateVehicleSpeed(currentSpeed > 0 ? currentSpeed : 0);
    }, 1000);
}

function stopSpeedSimulation() {
    if (speedInterval) {
        clearInterval(speedInterval);
        speedInterval = null;
    }
    updateVehicleSpeed(0);
}

// ROS Hook for external speed updates
// User can call window.setVehicleSpeed(15.5) from ROS bridge
window.setVehicleSpeed = function (speed) {
    if (speedInterval) clearInterval(speedInterval); // Stop sim if real data comes in
    updateVehicleSpeed(speed);
};

// Bind New Island Buttons
(function bindIslandEvents() {
    // Confirm Load
    const confirmLoadBtn = document.getElementById('island-confirm-load-btn');
    if (confirmLoadBtn) {
        confirmLoadBtn.addEventListener('click', confirmLoadAndContinue);
    }

    // Confirm Delivery
    const confirmDeliveryBtn = document.getElementById('island-confirm-delivery-btn');
    if (confirmDeliveryBtn) {
        confirmDeliveryBtn.addEventListener('click', function () {
            // Re-use the existing logic from the old button, copied here for clarity or called directly
            // For now, let's trigger the same cleanup logic.
            // Best practice: Refactor cleanup into a named function call to avoid duplication.
            // We'll call the click handler of the OLD button if it exists, OR better, duplicated logic.
            // Since we plan to remove the old button, let's copy the logic.

            // 停止小车移动（如果仍在移动）
            if (carMarker) {
                carMarker.stopMove();
            }

            // 清除路径显示
            if (pathPolyline) {
                map.remove(pathPolyline);
                pathPolyline = null;
            }

            // 重置自定义路径
            resetCustomPath();

            // 清除待处理的送货数据
            window.pendingDelivery = null;

            // 重置任务状态
            isTaskInProgress = false;
            hasPickedUpGoods = false;
            updateCallButtonState();

            updateStatus('idle', '空闲');

            // Hide Island
            updateBottomIsland(ISLAND_STATES.HIDDEN);

            // Save History
            if (window.currentMission) {
                saveHistoryRecord(window.currentMission.pickupName, window.currentMission.deliveryName, '成功');
                window.currentMission = null;
            }

            // Reset UI displays
            document.getElementById('transport-code').innerText = '-----';
            const navCodeEl = document.getElementById('nav-pickup-code');
            if (navCodeEl) navCodeEl.innerText = '-----';
            const navCargoEl = document.getElementById('nav-cargo-status');
            if (navCargoEl) navCargoEl.innerText = "未装载";
            document.getElementById('distance-display').innerText = '等待计算...';
            document.getElementById('time-display').innerText = '等待计算...';

            showAlert("🎉 订单结束，感谢使用无人书车系统！", "任务完成");
        });
    }
})();

/**
 * Show Weather Warning Modal
 */
function showWeatherWarning(msg) {
    // Only show if we haven't shown it recently to avoid spamming
    const lastWarn = sessionStorage.getItem('weather_warning_shown');
    if (lastWarn) return; // Already warned this session

    showAlert(msg + "\n\n请谨慎下单，车辆可能会在恶劣天气下强制回库。", "⚠️ 天气预报提醒");
    sessionStorage.setItem('weather_warning_shown', 'true');
}

/**
 * 天气恶劣时自动返回交通大楼（车库）
 * 无需显示导航路径，直接移动到目的地
 */
function returnToDepot() {
    // 交通大楼位置 (dorm_c)
    const depotPosition = [118.823748, 31.890009];
    const depotName = '交通大楼';

    // 获取小车当前位置
    if (!carMarker) {
        console.warn('车辆标记未初始化，无法回库');
        return;
    }

    const currentPos = carMarker.getPosition();
    const carPos = [currentPos.lng, currentPos.lat];

    // 检查是否已在交通大楼附近（100米内）
    if (AMapObj && AMapObj.GeometryUtil) {
        const distance = AMapObj.GeometryUtil.distance(carPos, depotPosition);
        if (distance < 100) {
            updateStatus('idle', '已在车库');
            return;
        }
    }

    // 更新状态为回库中（紫色）
    updateStatus('returning', '回库中');

    // 使用骑行规划获取路径（不显示路径，只是为了移动）
    if (!riding) {
        riding = new AMapObj.Riding({ map: null });
    }

    riding.search(carPos, depotPosition, function (status, result) {
        if (status === 'complete' && result.routes && result.routes[0]) {
            const route = result.routes[0];
            const pathArr = extractPathFromRoute(route);

            if (pathArr.length > 0) {
                // 清除之前的路径显示（如果有）
                if (pathPolyline) {
                    map.remove(pathPolyline);
                    pathPolyline = null;
                }

                // 设置起始位置并开始移动
                carMarker.setPosition(pathArr[0]);

                carMarker.moveAlong(pathArr, {
                    speed: 30,           // 回库速度快一些
                    autoRotation: false,
                    circlable: false,
                    easing: function (k) { return k; }
                });

                // 监听到达事件
                carMarker.on('movealong', function onArriveDepot() {
                    carMarker.off('movealong', onArriveDepot);
                    updateStatus('idle', '已安全回库');
                });
            }
        } else {
            console.error('回库路径规划失败：', result);
            // 回退方案：直接移动到目标位置
            carMarker.setPosition(depotPosition);
            updateStatus('idle', '已安全回库');
        }
    });
}


/**
 * 初始化高德地图
 * 使用 AMapLoader 加载 API 和相关插件
 */
function initAMap() {
    // 使用 AMapLoader 加载高德地图 API
    AMapLoader.load({
        key: "d45afa22c2da1ef8a3e573ba97d76fd8", // 你的高德地图 Key
        version: "2.0",       // 指定 API 版本
        plugins: [
            "AMap.Riding",        // 非机动车/骑行路线规划插件（可走人行道与非机动车道）
            "AMap.MoveAnimation",   // 轨迹移动动画插件
            "AMap.GeometryUtil",  // 几何计算插件（用于围栏判断）
            "AMap.Weather"        // 天气插件
        ]
    }).then((AMap) => {
        // 保存 AMap 对象
        AMapObj = AMap;

        // 获取当前主题
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const mapStyle = currentTheme === 'dark' ? "amap://styles/dark" : "amap://styles/normal";

        // 创建地图实例
        map = new AMap.Map('map-container', {
            viewMode: '2D',           // 2D 视图
            zoom: 17,                 // 初始缩放级别
            center: [118.819712, 31.887148], // 地图中心点：东南大学九龙湖校区
            resizeEnable: true,       // 允许监控地图容器尺寸变化
            mapStyle: mapStyle        // 初始化时设置样式
        });

        initMarkers();
        initCar();
        initControls();

        // Initialize Weather (must be after AMapObj is set)
        initWeather();

        console.log("地图初始化完成");

    }).catch((e) => {
        console.error("加载高德地图失败:", e);
        showAlert("地图加载失败，请确保在 index.html 中配置了正确的 Key 和 SecurityCode", "❌ 错误");
    });
}

// 电子围栏坐标点 (Polygon Ring)
const geoFencePath = [
    [118.81407, 31.890719],
    [118.813826, 31.886345],
    [118.81932, 31.886573],
    [118.82352, 31.886801],
    [118.825095, 31.886879],
    [118.828425, 31.887076],
    [118.828388, 31.889761],
    [118.828401, 31.89115],
    [118.828413, 31.89229],
    [118.825031, 31.891928],
    [118.822272, 31.891461],
    [118.820929, 31.891316]
];

/**
 * 检查点是否在电子围栏内
 * @param {Array} position [lng, lat]
 * @returns {Boolean}
 */
function isPointInFence(position) {
    if (!AMapObj || !AMapObj.GeometryUtil) return true; // 如果插件未加载，默认允许（防止报错）
    return AMapObj.GeometryUtil.isPointInRing(position, geoFencePath);
}

// ============================================
// 8. 自定义提示弹窗 (Alert Modal) 工具函数
// ============================================

/**
 * 显示模态提示框
 * @param {String} message 提示信息
 * @param {String} title 标题 (可选)
 */
function showAlert(message, title = '提示') {
    const modal = document.getElementById('alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const okBtn = document.getElementById('alert-ok-btn');

    if (modal && titleEl && msgEl) {
        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.classList.remove('hidden'); // 显示模态框

        // 绑定关闭事件
        okBtn.onclick = function () {
            modal.classList.add('hidden');
        };
    } else {
        //以此为降级方案
        alert(message);
    }
}

// 替换掉旧的 showToast 调用，统一适配为 showAlert
// 注意：为了兼容之前的代码逻辑，这里将原来的 showToast 重定义为 showAlert 的别名
// 并适配参数 (message, type) -> (message, title)
function showToast(message, type = 'info') {
    const titles = {
        info: '提示',
        success: '🎉 成功',
        warning: '⚠️ 注意',
        error: '❌ 错误'
    };
    showAlert(message, titles[type] || '提示');
}

// ============================================
// 3. 标记点 (Markers) 管理
// ============================================

/**
 * 生成标记点的内容 HTML
 * @param {Object} loc 地点数据对象
 * @param {Boolean} isSelected 是否被选中
 */
function createMarkerContent(loc, isSelected) {
    // Default colors
    // Default colors
    let color = loc.disabled ? '#bdc3c7' : (loc.type === 'dorm' ? '#4facfe' : (loc.type === 'office' ? '#ce88fdff' : '#ff4b1f')); // Office: Cyan

    // Icon Logic
    let iconSymbol = '🏠'; // Default Dorm
    if (loc.type === 'library') iconSymbol = '📚';
    else if (loc.type === 'office') iconSymbol = '🏢';
    else if (loc.type === 'classroom') iconSymbol = '🏫';

    // Additional info for library (Volunteer Count)
    let extraBadge = '';
    let glowClass = ''; // Default no glow

    if (loc.type === 'library') {
        const vCount = getLibraryVolunteerCount();

        // Dynamic Color for Library based on count
        if (vCount > 0) {
            color = '#4CAF50'; // Green for Available
            glowClass = 'marker-glow-green';
        } else {
            color = '#95a5a6'; // Grey for Unavailable
            glowClass = 'marker-glow-red';
        }

        const badgeColor = vCount > 0 ? '#00bcd4' : '#e53935'; // Cyan for available, Red for unavailable
        extraBadge = `
            <span style="
                margin-top: 4px; 
                font-size: 10px; 
                color: white; 
                background: ${badgeColor}; 
                padding: 1px 6px; 
                border-radius: 8px;
                display: inline-block;
                line-height: 1.2;
            ">
                志愿者: ${vCount}
            </span>
        `;
    }

    // 如果被选中，强制显示紫色脉冲动效 (覆盖默认状态颜色)
    if (isSelected) {
        glowClass = 'marker-glow-purple';
    }

    // 自定义标记的内容结构 (Neumorphic Dashboard Style)
    // Add glowClass to the wrapper div
    return `
        <div class="${glowClass}" style="
            background: linear-gradient(145deg, #ffffff, #f0f4f8);
            color: #4a5568;
            padding: 8px 12px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            /* Neumorphic Soft Shadow - Reduced Size Further */
            box-shadow: 3px 3px 6px rgba(163, 177, 198, 0.3), 
                        -3px -3px 6px rgba(255, 255, 255, 0.5);
            border: 1px solid rgba(255,255,255,0.6);
            transform: translateY(0);
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            white-space: nowrap;
        ">
            <span style="
                margin-right: 8px; 
                font-size: 16px;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
            ">${iconSymbol}</span>
            <div style="display: flex; flex-direction: column; align-items: flex-start; justify-content: center;">
                <span style="color: ${color}; line-height: 1.1;">${loc.name}</span>
                ${extraBadge}
            </div>
        </div>
    `;
}

/**
 * 更新指定地点标记的高亮状态
 * @param {String} locationId 地点ID
 * @param {Boolean} isSelected 是否选中
 */
function updateMarkerHighlight(locationId, isSelected) {
    if (!window.locationMarkers[locationId]) return;

    const loc = locations.find(l => l.id === locationId);
    if (!loc) return;

    const marker = window.locationMarkers[locationId];
    const newContent = createMarkerContent(loc, isSelected);
    marker.setContent(newContent);
}

/**
 * 初始化并绘制地点标记
 */
function initMarkers() {
    locations.forEach(loc => {
        // 创建 Content
        const content = createMarkerContent(loc, false);

        // 创建 Marker
        const marker = new AMapObj.Marker({
            position: loc.position,
            content: content,      // 使用自定义 HTML 内容
            offset: new AMapObj.Pixel(-10, -30), // 调整偏移量使尖角对准坐标
            map: map,              //直接添加到地图
            title: loc.name,
            extData: { id: loc.id } // 存储ID以便后续使用
        });

        // 存储 marker 实例
        window.locationMarkers[loc.id] = marker;
    });
}

/**
 * 初始化小车标记
 */
function initCar() {
    // 生成校园内随机位置作为小车初始位置
    carInitPosition = getRandomCampusPosition();

    // Modern Car Style - Custom Icon
    const carContent = `
        <div class="vehicle-glow" style="
            width: 64px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            border: 1px solid white; /* Reduced from 3px */
            border-radius: 50%; /* Circular marker */
            /* box-shadow: 0 4px 10px rgba(0,0,0,0.3); Removed to let animation take over */
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            overflow: hidden;
        ">
            <img src="./icon/car.png" style="width: 90%; height: 90%; object-fit: contain;" alt="Car">
        </div>
    `;

    carMarker = new AMapObj.Marker({
        position: carInitPosition,
        content: carContent,
        offset: new AMapObj.Pixel(-32, -32), // Center the 64px icon
        map: map,
        zIndex: 100 // 确保小车在最上层
    });
}

// ============================================
// 4. 用户交互与控件逻辑
// ============================================

/**
 * 初始化控制面板的下拉菜单和事件监听
 */
function initControls() {
    const startSelect = document.getElementById('start-select');
    const endSelect = document.getElementById('end-select');
    const modeSelect = document.getElementById('mode-select');
    const drawBtn = document.getElementById('draw-btn');
    const clearBtn = document.getElementById('clear-path-btn');
    const customCountEl = document.getElementById('custom-count');

    // 绑定顶部导航条“联系管理员”按钮 (New)
    const contactAdminBtn = document.getElementById('contact-admin-btn');
    if (contactAdminBtn) {
        contactAdminBtn.addEventListener('click', function () {
            showAlert("管理员电话号码：000000000", "📞 联系管理员");
        });
    }

    // 绑定跟随车辆按钮 (New)
    const followBtn = document.getElementById('follow-car-btn');
    if (followBtn) {
        followBtn.addEventListener('click', function () {
            if (isFollowingCar) {
                // Determine if we should toggle OFF? 
                // User requirement: "Button: Follow Vehicle". Usually implies "Turn On".
                // If already on, maybe re-center? 
                // Let's implement toggle OFF for completeness if they click it again, 
                // OR just re-center. "Follow Vehicle" suggests ACTION.
                // Given the requirement "When user drags... follow cancelled", 
                // clicking this button should RESUME follow.
                // Let's make it enable follow if disabled, or re-center if enabled.
                enableCameraFollow();
            } else {
                if (!carMarker) {
                    showAlert("车辆未初始化");
                    return;
                }
                enableCameraFollow();
            }
        });
    }

    // Map Drag Listener to interrupt follow
    map.on('dragstart', function () {
        if (isFollowingCar) {
            disableCameraFollow();
            // showToast("已停止跟随视角"); // Optional feedback
        }
    });

    // 填充下拉菜单 - 根据志愿者数量决定是否禁用图书馆
    const volunteerCount = getLibraryVolunteerCount();

    locations.forEach(loc => {
        // Check if this location is a library and if we should disable it
        const isLibrary = loc.type === 'library';
        // const isDisabled = isLibrary && volunteerCount === 0; // Removed disable logic

        let disabledText = '';
        let isOptionDisabled = false;

        if (isLibrary && volunteerCount === 0) {
            disabledText = ' (需确认)';
        } else if (loc.disabled) {
            disabledText = ' (暂未开通)';
            isOptionDisabled = true;
        }

        const startOption = document.createElement('option');
        startOption.value = loc.id;
        startOption.text = loc.name + disabledText;
        if (isOptionDisabled) startOption.disabled = true;
        // startOption.disabled = isDisabled;
        startSelect.add(startOption);

        const endOption = document.createElement('option');
        endOption.value = loc.id;
        endOption.text = loc.name + disabledText;
        if (isOptionDisabled) endOption.disabled = true;
        // endOption.disabled = isDisabled;
        endSelect.add(endOption);
    });

    // 初始化自定义圆角下拉菜单
    setTimeout(() => {
        createCustomSelect('start-select');
        createCustomSelect('end-select');
        createCustomSelect('mode-select');
    }, 0);

    // Track previous values for revert support
    let prevStart = startSelect.value;
    let prevEnd = endSelect.value;

    function checkAndWarn(selectEl, prevVal, callback) {
        const val = selectEl.value;
        const loc = locations.find(l => l.id === val);
        const vCount = getLibraryVolunteerCount();

        if (loc && loc.type === 'library' && vCount === 0) {
            showConfirmDialog(
                '⚠️ 需人工确认',
                '当前图书馆无志愿者值班。\n如需取/送服务，请确认现场有人员协调。',
                function () {
                    // Confirmed
                    callback(val);
                }
            );

            setTimeout(() => {
                const cancelBtn = document.getElementById('confirm-no-btn');
                if (cancelBtn) {
                    const newCancel = cancelBtn.cloneNode(true);
                    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

                    newCancel.addEventListener('click', function () {
                        selectEl.value = prevVal;
                        const wrapper = selectEl.parentNode.querySelector('.custom-select-trigger span');
                        const options = selectEl.options;
                        if (wrapper && options) {
                            for (let i = 0; i < options.length; i++) {
                                if (options[i].value === prevVal) {
                                    wrapper.textContent = options[i].text;
                                    break;
                                }
                            }
                        }
                        callback(prevVal);
                        document.getElementById('alert-modal').classList.add('hidden');
                        document.getElementById('alert-ok-btn').style.display = '';
                        document.getElementById('alert-message').innerHTML = '';
                    });
                }
            }, 50);

        } else {
            callback(val);
        }
    }

    // 禁止选择相同的取货点和送货点
    function updateDisabledOptions() {
        const startVal = startSelect.value;
        const endVal = endSelect.value;
        const volunteerCount = getLibraryVolunteerCount();

        // 更新送货点下拉 - 禁用与取货点相同的选项，同时保持永久禁用的选项
        Array.from(endSelect.options).forEach(opt => {
            const loc = locations.find(l => l.id === opt.value);
            const isPermanentlyDisabled = loc && loc.disabled;

            if ((opt.value && opt.value === startVal) || isPermanentlyDisabled) {
                opt.disabled = true;
            } else {
                opt.disabled = false;
            }
        });

        // 更新取货点下拉 - 禁用与送货点相同的选项，同时保持永久禁用的选项
        Array.from(startSelect.options).forEach(opt => {
            const loc = locations.find(l => l.id === opt.value);
            const isPermanentlyDisabled = loc && loc.disabled;

            if ((opt.value && opt.value === endVal) || isPermanentlyDisabled) {
                opt.disabled = true;
            } else {
                opt.disabled = false;
            }
        });

        // 刷新自定义下拉菜单UI
        setTimeout(() => {
            createCustomSelect('start-select');
            createCustomSelect('end-select');
        }, 0);
    }

    // 监听取货点和送货点变化
    startSelect.addEventListener('change', () => {
        checkAndWarn(startSelect, prevStart, (final) => {
            // Remove highlight from previous
            if (prevStart) updateMarkerHighlight(prevStart, false);

            startSelect.value = final;
            prevStart = final;

            // Add highlight to new
            updateMarkerHighlight(final, true);

            updateDisabledOptions();

            // Auto Zoom to Selected Start Point
            const loc = locations.find(l => l.id === final);
            if (loc && map) {
                smoothZoom(loc.position, 18); // Smooth close up zoom
            }
        });
    });

    endSelect.addEventListener('change', () => {
        checkAndWarn(endSelect, prevEnd, (final) => {
            // Remove highlight from previous
            if (prevEnd) updateMarkerHighlight(prevEnd, false);

            endSelect.value = final;
            prevEnd = final;

            // Add highlight to new
            updateMarkerHighlight(final, true);

            updateDisabledOptions();

            // Auto Zoom to Selected End Point
            const loc = locations.find(l => l.id === final);
            if (loc && map) {
                smoothZoom(loc.position, 18); // Smooth close up zoom
            }
        });
    });

    // 绑定按钮点击事件
    document.getElementById('call-btn').addEventListener('click', handleCallCar);

    // 绑定确认装载按钮事件 (Old - Deprecated)
    // const oldLoadBtn = document.getElementById('confirm-load-btn');
    // if(oldLoadBtn) oldLoadBtn.addEventListener('click', confirmLoadAndContinue);

    // 绑定确认送达按钮事件 (Old - Deprecated)
    // const oldDeliveryBtn = document.getElementById('confirm-delivery-btn');
    // if(oldDeliveryBtn) {
    //     oldDeliveryBtn.addEventListener('click', function () {
    //        ...
    //     });
    // }

    // 绑定摄像头按钮事件
    document.getElementById('camera-btn').addEventListener('click', openCameraModal);
    document.getElementById('close-camera-modal').addEventListener('click', closeCameraModal);
    document.getElementById('camera-modal').addEventListener('click', function (e) {
        if (e.target === this) closeCameraModal();
    });

    // 模式切换监听：自动规划（骑行）/ 自定义路径
    modeSelect.addEventListener('change', function () {
        const isCustom = this.value === 'custom';
        drawBtn.disabled = !isCustom;
        clearBtn.disabled = !isCustom;
        // 更新按钮样式
        drawBtn.style.opacity = isCustom ? '1' : '0.5';
        drawBtn.style.cursor = isCustom ? 'pointer' : 'not-allowed';
        clearBtn.style.opacity = isCustom ? '1' : '0.5';
        clearBtn.style.cursor = isCustom ? 'pointer' : 'not-allowed';
        isDrawingCustom = false; // 切换模式时关闭绘制状态
        updateCustomCount(customCountEl);

        // Toggle badge visibility
        const badge = document.getElementById('custom-nodes-badge');
        if (isCustom) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });

    // Initialize Badge State
    const badge = document.getElementById('custom-nodes-badge');
    if (modeSelect.value === 'custom') {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    // 开始点选途径点
    drawBtn.addEventListener('click', () => {
        isDrawingCustom = true;
        updateStatus('idle', '点选途径点中...');
        showAlert('请在地图上依次点击要经过的途径点（可选），再点击“呼叫无人车”。', "ℹ️ 操作提示");
    });

    // 清除自定义路径
    clearBtn.addEventListener('click', () => {
        resetCustomPath();
        updateCustomCount(customCountEl);
    });

    // 地图点击事件：仅在自定义模式且绘制开启时生效
    map.on('click', (e) => {
        if (!isDrawingCustom || modeSelect.value !== 'custom') return;

        const lnglat = [e.lnglat.lng, e.lnglat.lat];

        // 电子围栏检查
        if (!isPointInFence(lnglat)) {
            showAlert("⚠️ 警告：该区域超出无人车运行范围（电子围栏）\n请选择围栏内的位置！");
            return;
        }

        customViaPoints.push(lnglat);

        // 为每个途径点添加带序号的临时标记
        const index = customViaPoints.length;
        const marker = new AMapObj.Marker({
            position: lnglat,
            content: `<div style="
                background: #4CAF50;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            ">${index}</div>`,
            offset: new AMapObj.Pixel(-12, -12),
            map: map,
            zIndex: 120
        });
        customMarkers.push(marker);

        // 实时绘制预览折线：起点 → 途径点(按顺序) → 终点
        const startId = startSelect.value;
        const endId = endSelect.value;
        const startLoc = locations.find(l => l.id === startId);
        const endLoc = locations.find(l => l.id === endId);
        drawCustomPreviewLine(startLoc ? startLoc.position : null, endLoc ? endLoc.position : null);
        updateCustomCount(customCountEl);
    });

    // 首次渲染计数
    updateCustomCount(customCountEl);

    // Initial Highlight for default selections
    if (startSelect.value) updateMarkerHighlight(startSelect.value, true);
    if (endSelect.value) updateMarkerHighlight(endSelect.value, true);
}

// ============================================
// 5. 核心业务：路径规划与调度
// ============================================

/**
 * 处理“呼叫无人车”点击事件
 */
function handleCallCar() {
    const callBtn = document.getElementById('call-btn');
    const btnTextEl = callBtn.querySelector('span');
    const startSelect = document.getElementById('start-select');
    const endSelect = document.getElementById('end-select');

    // 停止地图上选点的动画效果
    if (startSelect && startSelect.value) updateMarkerHighlight(startSelect.value, false);
    if (endSelect && endSelect.value) updateMarkerHighlight(endSelect.value, false);

    // ========================================
    // 新逻辑：如果任务进行中，按钮变为"结束任务"
    // ========================================
    if (isTaskInProgress) {
        // 检查是否已取到货物
        if (hasPickedUpGoods) {
            showAlert("正在运送中，非紧急情况无法结束任务", "⚠️ 无法结束");
            return;
        }

        // 未取到货物，弹窗确认后结束任务
        showConfirmDialog(
            "⚠️ 确认取消任务",
            "确定要取消当前任务吗？\n车辆将停止并释放。",
            function () {
                endCurrentTask();
            }
        );
        return;
    }

    // ========================================
    // 正常呼叫逻辑
    // ========================================

    // 1. Check Weather First
    if (isWeatherBad) {
        showAlert("当前天气恶劣（雨/雪），无人车为了安全已暂停服务。请稍后再试。", "⚠️ 暂停运营");
        return;
    }

    const startId = document.getElementById('start-select').value;
    const endId = document.getElementById('end-select').value;
    const mode = document.getElementById('mode-select').value;

    // 简单校验
    if (!startId || !endId) {
        showAlert("请先选择起点和终点！", "⚠️ 注意");
        return;
    }

    // 获取对应的坐标对象
    const startLoc = locations.find(l => l.id === startId); // 取货点（宿舍）
    const endLoc = locations.find(l => l.id === endId);     // 送货点（图书馆）

    // 获取小车当前位置
    const currentCarPosition = carMarker.getPosition();
    const carPos = [currentCarPosition.lng, currentCarPosition.lat];

    // 开始任务，更新状态
    isTaskInProgress = true;
    hasPickedUpGoods = false;
    updateCallButtonState();  // 更新按钮为"结束任务"

    // 自定义模式：分段规划（当前位置 → 取货点 → 途径点 → 送货点）
    if (mode === 'custom') {
        updateStatus('calculating', '路径计算中...');
        // 将取货点加入途径点开头
        const allWaypoints = [startLoc.position, ...customViaPoints];

        // Save current mission details for history
        window.currentMission = {
            pickupName: startLoc.name,
            deliveryName: endLoc.name,
            timestamp: new Date().toLocaleString()
        };

        // 分两段：先到取货点，等待确认后再继续
        planTwoStageRoute(carPos, startLoc.position, endLoc.position, customViaPoints);
        return;
    }

    // 自动模式：先前往取货点，等待确认装载，再前往送货点
    updateStatus('calculating', '路径计算中...');

    // Save current mission details for history
    window.currentMission = {
        pickupName: startLoc.name,
        deliveryName: endLoc.name,
        timestamp: new Date().toLocaleString()
    };

    planTwoStageRoute(carPos, startLoc.position, endLoc.position, []);
}

/**
 * 两阶段路径规划：
 * 第一阶段：当前位置 → 取货点（到达后等待确认）
 * 第二阶段：取货点 → (途径点) → 送货点
 * @param {Array} carPos 小车当前位置
 * @param {Array} pickupPos 取货点位置
 * @param {Array} deliveryPos 送货点位置
 * @param {Array} viaPoints 途径点（可选）
 */
function planTwoStageRoute(carPos, pickupPos, deliveryPos, viaPoints = []) {
    // 保存第二阶段信息，供确认后使用
    window.pendingDelivery = {
        pickupPos: pickupPos,
        deliveryPos: deliveryPos,
        viaPoints: viaPoints
    };

    // 生成运输码
    const transportCode = generateTransportCode();
    document.getElementById('transport-code').innerText = transportCode;
    // 更新顶部导航条提取码
    const navCodeEl = document.getElementById('nav-pickup-code');
    if (navCodeEl) navCodeEl.innerText = transportCode;

    // 更新顶部导航条货物状态
    const navCargoEl = document.getElementById('nav-cargo-status');
    if (navCargoEl) navCargoEl.innerText = "前往取货";

    // 第一阶段：规划到取货点的路径
    if (!riding) {
        riding = new AMapObj.Riding({ map: null });
    }

    riding.search(carPos, pickupPos, function (status, result) {
        if (status === 'complete' && result.routes && result.routes[0]) {
            const route = result.routes[0];
            const pathArr = extractPathFromRoute(route);
            const distance = route.distance || 0;

            // 显示第一阶段距离
            document.getElementById('distance-display').innerText = `${distance.toFixed(0)} 米（前往取货点）`;
            document.getElementById('time-display').innerText = `${Math.ceil((route.time || 0) / 60)} 分钟`;

            // 绘制路径
            drawPathPolyline(pathArr);

            // 开始移动到取货点，到达后等待确认
            startCarAnimationToPickup(pathArr, distance);

            // Start follow is handled inside startCarAnimationToPickup

            // Show waiting state immediately
            updateBottomIsland(ISLAND_STATES.WAITING);
        } else {
            console.error('规划到取货点路径失败：', result);
            updateStatus('error', '路径计算失败');
            showAlert('规划到取货点的路径失败', "❌ 错误");
        }
    });
}

/**
 * 生成5位随机运输码
 * @returns {String} 运输码
 */
function generateTransportCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的字符
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * 小车移动到取货点，到达后等待确认装载
 */
function startCarAnimationToPickup(path, distance) {
    updateStatus('moving', '前往取货点...');

    carMarker.setPosition(path[0]);

    carMarker.moveAlong(path, {
        speed: 20,
        autoRotation: false,
        circlable: false,
        easing: function (k) { return k; }
    });

    // Enable Camera Follow
    enableCameraFollow();

    // 到达取货点后的处理
    carMarker.on('movealong', function onArrivePickup() {
        // 移除此监听器，避免重复触发
        carMarker.off('movealong', onArrivePickup);

        // Stop Camera Follow (Wait at pickup)
        disableCameraFollow();

        updateStatus('waiting', '等待装载书籍...');

        // 显示确认装载面板 -> Show Dynamic Island Pickup State
        // document.getElementById('loading-confirm-panel').classList.remove('hidden');
        const code = document.getElementById('transport-code').innerText;
        updateBottomIsland(ISLAND_STATES.PICKUP, { code: code });
    });
}

/**
 * ROS Interface: Send Vehicle Start Command
 */
function rosVehicleStart() {
    console.log("[ROS Interface] Command: START_VEHICLE");
    // ROS integration code here
    // e.g., startTopic.publish({ data: true });
}

/**
 * 确认装载后，继续前往送货点
 */
function confirmLoadAndContinue() {
    const pending = window.pendingDelivery;
    if (!pending) {
        showAlert('没有待处理的送货任务', "⚠️ 注意");
        return;
    }

    // Safety Confirmation Dialog
    showConfirmDialog(
        "⚠️ 安全确认",
        "车辆即将启动，请注意周围环境安全！\n确认周围安全并立即启动车辆吗？",
        function () {
            // User Confirmed: Proceed with start
            executeLoadAndContinue(pending);
        }
    );
}

/**
 * Internal function to execute the logic after confirmation
 */
function executeLoadAndContinue(pending) {
    // 1. ROS Hook: Ignite/Start Vehicle
    rosVehicleStart();

    // 标记已取到货物（此后无法取消任务）
    hasPickedUpGoods = true;

    // 更新顶部导航条货物状态
    const navCargoEl = document.getElementById('nav-cargo-status');
    if (navCargoEl) navCargoEl.innerText = "已装载";

    // 隐藏确认面板 -> Switch to Moving State on Island
    // document.getElementById('loading-confirm-panel').classList.add('hidden');
    updateBottomIsland(ISLAND_STATES.MOVING);

    updateStatus('calculating', '规划送货路径...');

    // 第二阶段：从取货点出发，经途径点到送货点
    if (pending.viaPoints && pending.viaPoints.length > 0) {
        planRouteWithWaypoints(pending.pickupPos, pending.deliveryPos, pending.viaPoints);
    } else {
        // 直接规划到送货点
        riding.search(pending.pickupPos, pending.deliveryPos, function (status, result) {
            if (status === 'complete') {
                onRouteSuccess(result);
                // Re-enable follow for second leg
                enableCameraFollow();
            } else {
                updateStatus('error', '送货路径规划失败');
                showAlert('送货路径规划失败', "❌ 错误");
            }
        });
    }

    // 清除待处理任务
    window.pendingDelivery = null;
}

/**
 * 结束当前任务（释放车辆）
 * 仅在未取到货物时可用
 */
function endCurrentTask() {
    // 停止小车移动
    if (carMarker) {
        carMarker.stopMove();
        disableCameraFollow(); // Ensure follow stops
    }

    // 清除路径显示
    if (pathPolyline) {
        map.remove(pathPolyline);
        pathPolyline = null;
    }

    // 隐藏所有确认面板 -> Hide Island
    // document.getElementById('loading-confirm-panel').classList.add('hidden');
    // document.getElementById('delivery-confirm-panel').classList.add('hidden');
    updateBottomIsland(ISLAND_STATES.HIDDEN);

    // 重置任务状态
    isTaskInProgress = false;
    hasPickedUpGoods = false;
    window.pendingDelivery = null;
    window.currentMission = null;

    // 重置自定义路径
    resetCustomPath();

    // 更新状态
    updateStatus('idle', '空闲');
    updateCallButtonState();

    // 重置运输码
    document.getElementById('transport-code').innerText = '-----';
    const navCodeEl = document.getElementById('nav-pickup-code');
    if (navCodeEl) navCodeEl.innerText = '-----';

    // 重置货物状态
    const navCargoEl = document.getElementById('nav-cargo-status');
    if (navCargoEl) navCargoEl.innerText = "未装载";
    document.getElementById('distance-display').innerText = '等待计算...';
    document.getElementById('time-display').innerText = '等待计算...';

    showAlert("任务已取消，车辆已释放", "ℹ️ 任务取消");
}

/**
 * 更新呼叫按钮状态
 * - 任务进行中：显示"结束任务"
 * - 空闲：显示"呼叫无人车"
 * - 天气恶劣：禁用并显示"天气恶劣 暂停服务"
 */
function updateCallButtonState() {
    const callBtn = document.getElementById('call-btn');
    const btnTextEl = callBtn.querySelector('span');

    if (!callBtn || !btnTextEl) return;

    // 天气恶劣时的特殊处理（已在 initWeather 中处理）
    if (isWeatherBad) {
        return; // 让 initWeather 的逻辑控制
    }

    if (isTaskInProgress) {
        // 任务进行中：变为"结束任务"按钮
        btnTextEl.textContent = "结束任务";
        callBtn.style.opacity = '1';
        callBtn.style.cursor = 'pointer';
        // 改变按钮样式为警告色
        callBtn.classList.add('task-end-mode');
    } else {
        // 空闲：恢复"呼叫无人车"
        btnTextEl.textContent = "呼叫无人车";
        callBtn.style.opacity = '1';
        callBtn.style.cursor = 'pointer';
        callBtn.classList.remove('task-end-mode');
    }
}

/**
 * 完整路径规划：当前位置 → 取货点 → 送货点
 * @param {Array} carPos 小车当前位置
 * @param {Array} pickupPos 取货点位置
 * @param {Array} deliveryPos 送货点位置
 */
function planFullRoute(carPos, pickupPos, deliveryPos) {
    // 使用途径点规划：当前位置 → 取货点 → 送货点
    planRouteWithWaypoints(carPos, deliveryPos, [pickupPos]);
}

/**
 * 开启摄像头跟随模式
 */
function enableCameraFollow() {
    if (!carMarker || !map) return;

    isFollowingCar = true;

    // Fix: Use instant setCenter to prevent "twitching" conflict with panTo animation
    // Reverted smooth zoom duration to avoid jitter during movement
    const carPos = carMarker.getPosition();
    map.setCenter(carPos); // Instant snap to target
    map.setZoom(19); // Standard zoom (avoids conflict with center updates)

    // Listener for real-time following
    carMarker.on('moving', onCarMoving);

    // Update Button Style (Active)
    const followBtn = document.getElementById('follow-car-btn');
    if (followBtn) {
        followBtn.style.opacity = '1';
        followBtn.style.color = '#3498db'; // Active Blue
        followBtn.classList.add('active-follow');
    }
}

/**
 * Helper for smooth zoom and pan
 */
function smoothZoom(position, zoomLevel) {
    if (!map) return;
    // Prefer panTo for smooth "fly" effect, and setZoom separately
    // Duration: 1200ms, Easing: easeOutQuint (non-linear)
    map.setZoom(zoomLevel);
    map.panTo(position);
    // Note: AMap 2.0 setZoom/panTo default animation is usually good, 
    // but explicit duration gives better control if API supports it.
    // map.setZoom(zoom, false, 1200); 
    // map.panTo(pos, 1200, 'easeOutQuint');
    // Let's force the parameters for smoother feel.
    map.setZoom(zoomLevel, false, 1200);
    map.panTo(position, 1200, 'easeOutQuint');
}

/**
 * 关闭摄像头跟随模式
 */
function disableCameraFollow() {
    isFollowingCar = false;
    if (carMarker) {
        carMarker.off('moving', onCarMoving);
    }

    // Update Button Style (Inactive)
    const followBtn = document.getElementById('follow-car-btn');
    if (followBtn) {
        followBtn.style.opacity = ''; // Reset opacity to default (1.0)
        followBtn.style.color = ''; // Reset color
        followBtn.classList.remove('active-follow');
    }
}

/**
 * 车辆移动时的回调（用于更新地图中心）
 */
function onCarMoving(e) {
    if (isFollowingCar && map) {
        // e.target is the marker
        // But passed event object might contain passedPos or we just use marker pos
        // AMap 'moving' event usually provides the current position
        // Safest is to just get position from marker or event target
        map.setCenter(carMarker.getPosition());
    }
}

/**
 * 使用 AMap.Riding 规划非机动车路线
 * 非机动车模式可走人行道/非机动车道，更贴合校园内小车行驶
 * @param {Array} startLngLat 起点经纬度 [lng, lat]
 * @param {Array} endLngLat 终点经纬度 [lng, lat]
 */
function planRoute(startLngLat, endLngLat) {
    if (!riding) {
        riding = new AMapObj.Riding({
            map: null // 结果自行绘制，避免默认 UI 过于复杂
        });
    }

    riding.search(startLngLat, endLngLat, function (status, result) {
        if (status === 'complete') {
            onRouteSuccess(result);
        } else {
            console.error('获取骑行数据失败：' + result);
            updateStatus('error', '路径计算失败');
            showAlert("路径规划失败，请检查网络或 Key 配额。", "❌ 错误");
        }
    });
}

/**
 * 带途径点的分段路径规划
 * 由于骑行API不支持途径点，需要分段规划后合并
 * @param {Array} startLngLat 起点
 * @param {Array} endLngLat 终点
 * @param {Array} waypoints 途径点数组
 */
function planRouteWithWaypoints(startLngLat, endLngLat, waypoints) {
    if (!riding) {
        riding = new AMapObj.Riding({
            map: null
        });
    }

    // 构建完整的节点序列：起点 → 途径点1 → 途径点2 → ... → 终点
    const allPoints = [startLngLat, ...waypoints, endLngLat];
    const segments = []; // 存储每段的路径结果
    let totalDistance = 0;
    let totalTime = 0;
    let currentSegment = 0;

    // 递归规划每一段
    function planNextSegment() {
        if (currentSegment >= allPoints.length - 1) {
            // 所有段都规划完成，合并路径
            mergeAndShowPath(segments, totalDistance, totalTime);
            return;
        }

        const from = allPoints[currentSegment];
        const to = allPoints[currentSegment + 1];

        riding.search(from, to, function (status, result) {
            if (status === 'complete' && result.routes && result.routes[0]) {
                const route = result.routes[0];
                const pathArr = extractPathFromRoute(route);

                segments.push(pathArr);
                totalDistance += route.distance || 0;
                totalTime += route.time || 0;

                currentSegment++;
                planNextSegment();
            } else {
                console.error('分段规划失败，段:', currentSegment, result);
                updateStatus('error', '路径计算失败');
                showAlert(`途径点 ${currentSegment + 1} 到下一点的路径规划失败`, "❌ 错误");
            }
        });
    }

    planNextSegment();
}

/**
 * 合并分段路径并显示
 */
function mergeAndShowPath(segments, totalDistance, totalTime) {
    // 合并所有段的路径点
    const fullPath = [];
    segments.forEach((segPath, index) => {
        if (index === 0) {
            fullPath.push(...segPath);
        } else {
            // 跳过第一个点（与上一段终点重复）
            fullPath.push(...segPath.slice(1));
        }
    });

    // 更新界面数据
    document.getElementById('distance-display').innerText = `${totalDistance.toFixed(0)} 米`;
    document.getElementById('time-display').innerText = `${Math.ceil(totalTime / 60)} 分钟`;

    // 绘制完整路径
    drawPathPolyline(fullPath);

    // 开始小车移动（模拟速度 5 km/h，真实车辆可通过参数修改）
    startCarAnimation(fullPath, totalDistance);
}

/**
 * 路径规划成功回调
 * @param {Object} result 规划结果
 */
function onRouteSuccess(result) {
    // 1. 获取第一条规划方案
    const route = result.routes && result.routes[0];
    if (!route) {
        updateStatus('error', '未找到可用路径');
        showAlert('未找到可用路径，请尝试调整起终点', "⚠️ 注意");
        return;
    }

    const distanceMeta = route.distance || 0; // 总距离 (米)
    const timeMeta = route.time || 0;         // 总时间 (秒)

    // 更新界面数据
    document.getElementById('distance-display').innerText = `${distanceMeta.toFixed(0)} 米`;
    document.getElementById('time-display').innerText = `${Math.ceil(timeMeta / 60)} 分钟`;

    // 2. 解析路径节点生成完整轨迹坐标数组
    const pathArr = extractPathFromRoute(route);
    if (!pathArr.length) {
        updateStatus('error', '路径解析失败');
        showAlert('路径解析失败，请稍后再试', "❌ 错误");
        return;
    }

    // 3. 绘制绿色轨迹 Polyline
    drawPathPolyline(pathArr);

    // 4. 开始小车移动（模拟速度 5 km/h，真实车辆可通过参数修改）
    startCarAnimation(pathArr, distanceMeta);
}

/**
 * 从路线结果中提取经纬度数组
 * 兼容骑行/步行不同的返回结构
 * @param {Object} route
 * @returns {Array<[number, number]>}
 */
function extractPathFromRoute(route) {
    const path = [];

    // 优先使用骑行结果的 rides/steps
    if (route.rides && Array.isArray(route.rides)) {
        route.rides.forEach(ride => {
            if (ride.path) {
                path.push(...ride.path);
            }
            if (ride.steps) {
                ride.steps.forEach(step => {
                    if (step.path) path.push(...step.path);
                });
            }
        });
    }

    // 兼容步行/驾车的 steps
    if (!path.length && route.steps && Array.isArray(route.steps)) {
        route.steps.forEach(step => {
            if (step.path) path.push(...step.path);
        });
    }

    // 兜底：如果有 path 字段直接使用
    if (!path.length && route.path) {
        path.push(...route.path);
    }

    // [New] Clean up path: Remove duplicates and very close points (< 0.5m)
    if (path.length > 1) {
        const uniquePath = [path[0]];
        for (let i = 1; i < path.length; i++) {
            const last = uniquePath[uniquePath.length - 1];
            const current = path[i];
            // Simple distance check (approximate meter conversion for performance)
            // 1 degree lat ~= 111km, 1 degree lng ~= 111km * cos(lat)
            const dx = (current.lng - last.lng) * 111000 * Math.cos(last.lat * Math.PI / 180);
            const dy = (current.lat - last.lat) * 111000;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.5) { // Threshold: 0.5 meter
                uniquePath.push(current);
            }
        }
        return uniquePath;
    }

    return path;
}

/**
 * 计算路径总距离（米）
 * @param {Array<[number,number]>} path
 */
function computePathDistance(path) {
    if (!path || path.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        total += haversineDistance(path[i - 1], path[i]);
    }
    return total;
}

/**
 * 简单的哈弗辛公式计算两点间距离（米）
 */
function haversineDistance(a, b) {
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 6371000; // 地球半径（米）
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 在地图上绘制规划路径
 * @param {Array} path 经纬度数组
 */
function drawPathPolyline(path) {
    // 如果之前有路径，先移除
    if (pathPolyline) {
        map.remove(pathPolyline);
    }

    // 创建 Polyline
    pathPolyline = new AMapObj.Polyline({
        path: path,
        isOutline: true,       // 是否描边
        outlineColor: '#fff',
        borderWeight: 2,
        strokeColor: "#2979ff", // 线条颜色：高亮蓝，避免与草地混色
        strokeOpacity: 0.9,
        strokeWeight: 6,       // 线宽
        strokeStyle: "solid",  // 线样式
        lineJoin: 'round',     // 折线拐点样式
        lineCap: 'round',      // 折线两端样式
        zIndex: 50,
        map: map               // 立即显示在地图上
    });

    // 调整地图视野以适应路径
    map.setFitView([pathPolyline]);
}

/**
 * 执行小车沿轨迹移动动画
 * @param {Array} path 路径坐标数组
 * @param {Number} totalDistance 总距离，用于简单模拟速度
 * @param {Number} speedKmh 移动速度（km/h），默认 20 km/h 用于模拟演示
 *                        【真实车辆接口】可通过此参数传入实际车速
 */
function startCarAnimation(path, totalDistance, speedKmh = 20) {
    updateStatus('moving', '运输中...');

    // Ensure Island is in moving state (handles speed sim)
    updateBottomIsland(ISLAND_STATES.MOVING);

    // 将小车瞬间移动到起点 (为了演示流畅性，先跳到起点)
    carMarker.setPosition(path[0]);

    // 高德地图 2.0 moveAlong API 调用方式
    // 参数1: 路径数组（经纬度坐标）
    // 参数2: 配置对象 { speed: 速度(km/h), autoRotation: 是否自动旋转 }
    carMarker.moveAlong(path, {
        speed: speedKmh,           // 移动速度，单位：km/h
        autoRotation: false,       // Revert to false to fix twitching
        circlable: false,          // 是否循环播放
        easing: function (k) { return k; }
    });

    // 监听移动结束事件
    // 高德地图 2.0 使用 on 方法监听事件
    // 注意：必须使用命名函数并在触发后移除，避免重复触发
    carMarker.on('movealong', function onArriveDelivery() {
        // 移除此监听器，避免重复触发（开始新任务时不会再次弹出）
        carMarker.off('movealong', onArriveDelivery);

        updateStatus('arrived', '已到达目的地');
        console.log("小车已到达");
        console.log("小车已到达");
        // 显示到达确认面板 -> Show Dynamic Island Arrived State
        // const deliveryPanel = document.getElementById('delivery-confirm-panel');
        // if (deliveryPanel) {
        //     deliveryPanel.classList.remove('hidden');
        // }
        updateBottomIsland(ISLAND_STATES.ARRIVED);
    });
}

/**
 * 绘制自定义途径点的预览折线
 * @param {Array|null} start 起点坐标
 * @param {Array|null} end 终点坐标
 */
function drawCustomPreviewLine(start, end) {
    const path = [];
    if (start) path.push(start);
    if (customViaPoints.length) path.push(...customViaPoints);
    if (end) path.push(end);

    if (customPreviewPolyline) {
        map.remove(customPreviewPolyline);
        customPreviewPolyline = null;
    }

    if (path.length < 2) return;

    customPreviewPolyline = new AMapObj.Polyline({
        path,
        strokeColor: "#00A7FF",
        strokeOpacity: 0.7,
        strokeWeight: 4,
        strokeStyle: "dashed",
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 40,
        map
    });
}

/**
 * 清理自定义路径的标记与数据
 */
function resetCustomPath() {
    customViaPoints = [];
    isDrawingCustom = false;
    // 移除临时标记
    customMarkers.forEach(m => m.setMap(null));
    customMarkers = [];
    // 移除临时折线
    if (customPreviewPolyline) {
        map.remove(customPreviewPolyline);
        customPreviewPolyline = null;
    }
}

/**
 * 更新自定义路径节点计数显示
 */
function updateCustomCount(el) {
    if (el) el.innerText = customViaPoints.length;
}

/**
 * 更新状态栏 UI
 * @param {String} stateKeyword 状态关键字 (calculating, moving, arrived, idle, error, waiting)
 * @param {String} text 显示文本
 */
function updateStatus(stateKeyword, text) {
    // Save state for restoration (unless it's the emergency state itself)
    if (stateKeyword !== 'emergency') {
        lastStatusState = { keyword: stateKeyword, text: text };
    }

    const statusEl = document.getElementById('status-display');
    const carStatusEl = document.getElementById('car-status');

    // 兼容 index.html 里的两个可能的 ID
    const targetEl = statusEl || carStatusEl;

    if (targetEl) {
        targetEl.innerText = text;

        // --- 同步更新顶部导航条状态 ---
        const navStatusEl = document.getElementById('nav-car-status');
        if (navStatusEl) {
            navStatusEl.innerText = text;

            // Sync class name logic
            navStatusEl.className = 'nav-value'; // Reset base class
            if (stateKeyword === 'moving') navStatusEl.classList.add('status-moving');
            else if (stateKeyword === 'arrived') navStatusEl.classList.add('status-arrived');
            else if (stateKeyword === 'waiting') navStatusEl.classList.add('status-waiting');
            else if (stateKeyword === 'returning') navStatusEl.classList.add('status-returning');
            else if (stateKeyword === 'emergency') navStatusEl.classList.add('status-emergency');
            else navStatusEl.classList.add('status-idle');
        }

        // 重置类名
        targetEl.className = '';

        // 添加对应样式类
        if (stateKeyword === 'moving') targetEl.classList.add('status-moving');
        else if (stateKeyword === 'arrived') targetEl.classList.add('status-arrived');
        else if (stateKeyword === 'waiting') targetEl.classList.add('status-waiting');
        else if (stateKeyword === 'returning') targetEl.classList.add('status-returning');
        else if (stateKeyword === 'emergency') targetEl.classList.add('status-emergency');
        else targetEl.classList.add('status-idle');
    }

    // 更新紧急停车按钮状态
    const emergencyBtn = document.getElementById('emergency-stop-btn');
    const navEmergencyBtn = document.getElementById('nav-emergency-btn'); // [New] Nav Button

    // 只有在计算、移动、等待(任务执行中)时才允许紧急停车
    // 排除 idle, arrived, error
    // 注意：Emergency 状态下 keyword 是 'emergency'，不在此列，但下方 checks covers it
    const isTaskRunning = ['calculating', 'moving', 'waiting'].includes(stateKeyword);
    const shouldEnable = isTaskRunning || (typeof isEmergencyStopped !== 'undefined' && isEmergencyStopped);

    if (emergencyBtn) {
        if (shouldEnable) {
            emergencyBtn.disabled = false;
            emergencyBtn.style.opacity = '1';
            emergencyBtn.style.cursor = 'pointer';
        } else {
            emergencyBtn.disabled = true;
            emergencyBtn.style.opacity = '0.5';
            emergencyBtn.style.cursor = 'not-allowed';
        }
    }

    // Update Nav Button (Vertical Mode)
    if (navEmergencyBtn) {
        if (shouldEnable) {
            navEmergencyBtn.disabled = false;
            // let CSS handle style or force it if needed
            navEmergencyBtn.style.opacity = '1';
            navEmergencyBtn.style.cursor = 'pointer';
            navEmergencyBtn.style.pointerEvents = 'auto';
        } else {
            navEmergencyBtn.disabled = true;
            navEmergencyBtn.style.opacity = '0.5';
            navEmergencyBtn.style.cursor = 'not-allowed';
            navEmergencyBtn.style.pointerEvents = 'none'; // Ensure no clicks
        }
    }
}

// ============================================
// 7. 摄像头模态框控制
// ============================================

/**
 * 打开摄像头模态框
 * TODO: ROS 接口集成
 * 可通过 rosbridge_suite 连接 ROS 系统
 * 订阅 /camera/image_raw 话题获取视频流
 */
function openCameraModal() {
    const modal = document.getElementById('camera-modal');
    modal.classList.remove('hidden');

    // TODO: 连接 ROS WebSocket
    // const ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
    // const imageTopic = new ROSLIB.Topic({
    //     ros: ros,
    //     name: '/camera/image_raw',
    //     messageType: 'sensor_msgs/CompressedImage'
    // });
    // imageTopic.subscribe(function(message) {
    //     // 更新摄像头画面
    // });

    console.log('摄像头模态框已打开 - ROS 接口待集成');
}

/**
 * 关闭摄像头模态框
 */
function closeCameraModal() {
    const modal = document.getElementById('camera-modal');
    modal.classList.add('hidden');

    // TODO: 断开 ROS 连接
    console.log('摄像头模态框已关闭');
}

// ============================================
// 9. 自定义圆角下拉菜单 (Custom Select Logic)
// ============================================

/**
 * 将原生 select 转换为自定义样式的下拉菜单
 * @param {String} selectId 原生 select 元素的 ID
 */
function createCustomSelect(selectId) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;

    // 清除已存在的自定义组件 (防止重复初始化)
    const parent = selectEl.parentNode;
    const existingWrapper = parent.querySelector('.custom-select-wrapper');
    if (existingWrapper) existingWrapper.remove();

    // 隐藏原生 select
    selectEl.style.display = 'none';

    // 创建自定义 DOM 结构
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';

    const customSelect = document.createElement('div');
    customSelect.className = 'custom-select';

    // 触发器 (显示当前选中的值)
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    trigger.innerHTML = `<span>${selectedOption ? selectedOption.text : '-- 请选择 --'}</span>`;

    // 下拉选项列表
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'custom-options';

    // 遍历原生 options 生成自定义 option
    Array.from(selectEl.options).forEach(opt => {
        const optionDiv = document.createElement('div');
        optionDiv.className = `custom-option ${opt.selected ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}`;
        optionDiv.setAttribute('data-value', opt.value);
        optionDiv.textContent = opt.text;

        if (!opt.disabled) {
            optionDiv.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡

                // 1. 更新原生 select 的值
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change')); // 手动触发 change 事件，通知其他监听器

                // 2. 更新 UI 显示
                trigger.innerHTML = `<span>${opt.text}</span>`;
                customSelect.classList.remove('open');

                // 3. 更新选中状态样式
                optionsDiv.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
                optionDiv.classList.add('selected');

                console.log(`[CustomSelect] Selected: ${opt.text} (${opt.value})`);
            });
        }

        optionsDiv.appendChild(optionDiv);
    });

    // 绑定触发器点击事件 (切换打开/关闭)
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // 关闭页面上其他已打开的下拉
        document.querySelectorAll('.custom-select').forEach(el => {
            if (el !== customSelect) el.classList.remove('open');
        });
        customSelect.classList.toggle('open');
    });

    // 组装并插入 DOM
    customSelect.appendChild(trigger);
    customSelect.appendChild(optionsDiv);
    wrapper.appendChild(customSelect);

    // 插入到原生 select 后面
    selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
}

// 全局点击事件：点击空白处关闭所有下拉菜单
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select').forEach(el => el.classList.remove('open'));
});

// ============================================
// 10. 运输历史记录逻辑 (History Logic)
// ============================================

const HISTORY_KEY = 'transport_history';

/**
 * 保存历史记录
 */
function saveHistoryRecord(pickup, delivery, status) {
    const record = {
        timestamp: new Date().toLocaleString(),
        pickup: pickup,
        delivery: delivery,
        status: status
    };

    let history = getHistoryRecords();
    history.unshift(record); // Add to beginning (newest first)

    // Limit to 50 records
    if (history.length > 50) {
        history = history.slice(0, 50);
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/**
 * 获取历史记录
 */
function getHistoryRecords() {
    try {
        const data = localStorage.getItem(HISTORY_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("Failed to parse history", e);
        return [];
    }
}

/**
 * 渲染并显示历史记录模态框
 */
function openHistoryModal() {
    const modal = document.getElementById('history-modal');
    const tbody = document.getElementById('history-list');
    const noMsg = document.getElementById('no-history-msg');

    if (!modal || !tbody) return;

    const records = getHistoryRecords();
    tbody.innerHTML = '';

    if (records.length === 0) {
        noMsg.style.display = 'block';
    } else {
        noMsg.style.display = 'none';
        records.forEach(rec => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${rec.timestamp}</td>
                <td>${rec.pickup}</td>
                <td>${rec.delivery}</td>
                <td><span class="history-status-badge">${rec.status}</span></td>
            `;
            tbody.appendChild(row);
        });
    }

    modal.classList.remove('hidden');
}

/**
 * 清空历史记录
 */
function clearHistory() {
    if (confirm('确定要清空所有运输记录吗？')) {
        localStorage.removeItem(HISTORY_KEY);
        openHistoryModal(); // Refresh view
    }
}

// Bind History Events
// Note: Since elements are dynamically loaded or static, we can bind roughly here.
// But some elements might be ready.
(function bindHistoryEvents() {
    const historyBtn = document.getElementById('history-btn');
    const closeBtn = document.getElementById('close-history-modal');
    const clearBtn = document.getElementById('clear-history-btn');
    const modal = document.getElementById('history-modal');

    if (historyBtn) {
        historyBtn.addEventListener('click', openHistoryModal);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearHistory);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    }
})();

// ============================================
// 11. 紧急停车逻辑 (Emergency Stop Logic)
// ============================================

// isEmergencyStopped declared globally at top

/**
 * ROS Interface Placeholder: Send Emergency Stop Command
 * @param {Boolean} stop - true for stop, false for resume
 */
function rosEmergencyStop(stop) {
    // --- ROS 接口预留 ---
    // 使用 rosbridge_suite 或 ros2-web-bridge 发送指令
    // Topic: /emergency_stop
    // Type: std_msgs/Bool
    // Data: { data: stop }
    console.log(`[ROS Interface] Emergency Stop Command: ${stop ? 'STOP' : 'RESUME'}`);
    // Example with roslibjs (need to include roslibjs library):
    // const ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
    // const stopTopic = new ROSLIB.Topic({ ros: ros, name: '/emergency_stop', messageType: 'std_msgs/Bool' });
    // const stopTopic = new ROSLIB.Topic({ ros: ros, name: '/emergency_stop', messageType: 'std_msgs/Bool' });
    // stopTopic.publish(new ROSLIB.Message({ data: stop }));
}

/**
 * Show Contact Admin Modal (Phone: 000000000)
 * Uses the reusable Alert Modal but adds a cleanup step
 */
function showContactAdminModal() {
    const modal = document.getElementById('alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const okBtn = document.getElementById('alert-ok-btn');

    if (modal) {
        titleEl.textContent = '📞 联系管理员';
        msgEl.innerHTML = `
            <div style="text-align: center; padding: 10px 0;">
                <div style="font-size: 14px; color: #7f8c8d; margin-bottom: 8px;">管理员电话</div>
                <div style="font-size: 24px; font-weight: 800; color: #2196F3; letter-spacing: 1px; margin-bottom: 12px;">
                    000000000
                </div>
            </div>
        `;

        // Ensure OK button is visible and styled as Close
        okBtn.textContent = '关闭';
        okBtn.style.display = '';
        okBtn.onclick = function () {
            modal.classList.add('hidden');
        };

        // Ensure footer is visible
        const footer = okBtn.closest('.alert-footer');
        if (footer) footer.style.display = '';

        modal.classList.remove('hidden');
    } else {
        alert("管理员电话：000000000");
    }
}

/**
 * Handle Emergency Stop Button Click
 */
function handleEmergencyStop() {
    const btn = document.getElementById('emergency-stop-btn');
    if (!btn) return;

    if (isEmergencyStopped) {
        // Currently stopped, confirm resume
        showConfirmDialog(
            '确认恢复无人车运行？',
            '无人车将继续执行当前任务。',
            function () {
                isEmergencyStopped = false;
                rosEmergencyStop(false);
                updateEmergencyButtonState(btn);

                // 恢复之前的状态
                if (lastStatusState && lastStatusState.keyword) {
                    updateStatus(lastStatusState.keyword, lastStatusState.text);
                } else {
                    updateStatus('moving', '运输中...'); // Fallback
                }

                showAlert('无人车已恢复运行', '✅ 恢复成功');

                // Resume car animation if paused
                if (carMarker && carMarker.resumeMove) {
                    carMarker.resumeMove();
                }
            }
        );
    } else {
        // 1. Single Confirmation (Refined Flow)
        showConfirmDialog(
            '⚠️ 确认紧急停车？',
            '这将立即停止无人车，请确保必要性。',
            function () {
                // Trigger Stop Immediately
                isEmergencyStopped = true;
                rosEmergencyStop(true);
                updateStatus('emergency', '紧急停车'); // Update UI status
                updateEmergencyButtonState(btn);

                if (carMarker && carMarker.pauseMove) {
                    carMarker.pauseMove();
                }

                // 2. Post-Stop Prompt: Contact Admin?
                setTimeout(() => {
                    const modal = document.getElementById('alert-modal');
                    const titleEl = document.getElementById('alert-title');
                    const msgEl = document.getElementById('alert-message');
                    const okBtn = document.getElementById('alert-ok-btn');

                    if (modal) {
                        titleEl.textContent = '🛑 已紧急停车';
                        msgEl.innerHTML = `
                            <p style="margin-bottom: 20px; text-align: center;">车辆已停止运行。<br>是否需要立即联系管理员？</p>
                            <div class="modal-action-row">
                                <button id="post-stop-no-btn" class="secondary-button" style="flex:1;">暂不需要</button>
                                <button id="post-stop-contact-btn" class="btn-gradient-purple" style="flex:1.5;">
                                     <span>📞</span> 是，联系管理员
                                </button>
                            </div>
                        `;

                        // Hide default OK button
                        okBtn.style.display = 'none';
                        const footer = okBtn.closest('.alert-footer');
                        if (footer) footer.style.display = 'none';

                        modal.classList.remove('hidden');

                        // Bind Events
                        document.getElementById('post-stop-no-btn').onclick = function () {
                            modal.classList.add('hidden');
                        };

                        document.getElementById('post-stop-contact-btn').onclick = function () {
                            modal.classList.add('hidden');
                            // Open the Contact Info Modal
                            setTimeout(() => showContactAdminModal(), 100);
                        };
                    }
                }, 300); // Slight delay for UX
            }
        );
    }
}

/**
 * Update button appearance based on state
 */
function updateEmergencyButtonState(btn) {
    const iconSvg = btn.querySelector('svg');
    const textSpan = btn.querySelector('span');

    // Also update the Nav Button (Vertical Mode)
    const navBtn = document.getElementById('nav-emergency-btn');

    if (isEmergencyStopped) {
        btn.classList.remove('danger');
        btn.classList.add('resume');
        textSpan.textContent = '恢复运行';
        iconSvg.innerHTML = `
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="10 8 16 12 10 16 10 8"></polygon>
        `;

        if (navBtn) {
            navBtn.classList.add('resume-mode');
            const navText = navBtn.childNodes[navBtn.childNodes.length - 1]; // Text node usually at end or explicitly select
            // Ideally we wrap text in span, but here it's text node. 
            // Simple replace innerHTML for icon+text is safer.
            navBtn.innerHTML = `
                <svg class="neu-icon" viewBox="0 0 24 24" style="width:14px;height:14px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8"></polygon>
                </svg>
                恢复运行
            `;
        }
    } else {
        btn.classList.remove('resume');
        btn.classList.add('danger');
        textSpan.textContent = '紧急停车';
        iconSvg.innerHTML = `
            <circle cx="12" cy="12" r="10"></circle>
            <rect x="9" y="9" width="6" height="6" rx="1"></rect>
        `;

        if (navBtn) {
            navBtn.classList.remove('resume-mode');
            navBtn.innerHTML = `
                <svg class="neu-icon" viewBox="0 0 24 24" style="width:14px;height:14px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <rect x="9" y="9" width="6" height="6" rx="1"></rect>
                </svg>
                紧急停车
            `;
        }
    }
}

/**
 * Show Confirmation Dialog (reusable)
 */
function showConfirmDialog(title, message, onConfirm) {
    const modal = document.getElementById('alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const okBtn = document.getElementById('alert-ok-btn');

    if (!modal) {
        if (confirm(title + '\n' + message)) {
            onConfirm();
        }
        return;
    }

    titleEl.textContent = title;
    msgEl.innerHTML = `
        <p style="margin-bottom: 20px; color: inherit;">${message}</p>
        <div class="modal-action-row">
            <button id="confirm-no-btn" class="secondary-button" style="flex:1;">取消</button>
            <button id="confirm-yes-btn" class="confirm-btn-danger">确认</button>
        </div>
    `;
    okBtn.style.display = 'none';
    const footer = okBtn.closest('.alert-footer');
    if (footer) footer.style.display = 'none';
    modal.classList.remove('hidden');

    document.getElementById('confirm-yes-btn').onclick = function () {
        modal.classList.add('hidden');
        okBtn.style.display = '';
        if (footer) footer.style.display = '';
        msgEl.innerHTML = '';
        onConfirm();
    };

    document.getElementById('confirm-no-btn').onclick = function () {
        modal.classList.add('hidden');
        okBtn.style.display = '';
        if (footer) footer.style.display = '';
        msgEl.innerHTML = '';
    };
}

// Bind Emergency Stop Button
(function bindEmergencyStopEvents() {
    const btn = document.getElementById('emergency-stop-btn');
    if (btn) {
        btn.addEventListener('click', handleEmergencyStop);
    }

    // Bind Top Nav Contact Button
    const contactBtn = document.getElementById('contact-admin-btn');
    if (contactBtn) {
        contactBtn.addEventListener('click', showContactAdminModal);
    }

    // Bind Island Contact Button
    const islandContactBtn = document.getElementById('island-contact-btn');
    if (islandContactBtn) {
        islandContactBtn.addEventListener('click', showContactAdminModal);
    }

    // Bind New Nav Emergency Button
    const navEmergencyBtn = document.getElementById('nav-emergency-btn');
    if (navEmergencyBtn) {
        navEmergencyBtn.addEventListener('click', handleEmergencyStop);
    }
})();
