// =============================
// Admin Token Guard
// =============================
const ADMIN_TOKEN_KEY = "ADMIN_TOKEN"

async function apiFetch(url, options = {}) {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY)
    const method = (options.method || "GET").toUpperCase()

    options.headers = options.headers || {}

    if (token) {
    options.headers["X-Admin-Token"] = token
    }


    const res = await fetch(url, options)

    if (res.status === 403) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    lockUI();
    return Promise.reject(new Error("Unauthorized"));
    }

  return res
}

/* =============================
   Admin Fullscreen Lock Logic
============================= */
function lockUI() {
  document.getElementById("adminLockOverlay").style.display = "flex";
  document.getElementById("adminLockTokenInput").value = "";
  document.getElementById("adminLockError").style.display = "none";
}

function unlockUI() {
  document.getElementById("adminLockOverlay").style.display = "none";
}

async function confirmAdminTokenFromLock() {
  const input = document.getElementById("adminLockTokenInput");
  const error = document.getElementById("adminLockError");
  const token = input.value.trim();

  error.style.display = "none";

  if (!token) {
    error.textContent = "請輸入管理金鑰";
    error.style.display = "block";
    return;
  }

  try {
    const res = await fetch("/api/admin/verify", {
      headers: { "X-Admin-Token": token }
    });

    if (!res.ok) throw new Error("INVALID_TOKEN");

    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    unlockUI();

    await afterAdminUnlocked(); // ✅ 解鎖後立刻初始化

  } catch (e) {
    error.textContent = "金鑰錯誤，請重新輸入";
    error.style.display = "block";
  }
}





let isAdminModalOpen = false;

/* =========================
   Admin Token Modal
========================= */


// 開啟 Modal
function openAdminTokenModal() {
  if (isAdminModalOpen) return

  isAdminModalOpen = true
  document.getElementById("adminTokenModalInput").value = ""
  document.getElementById("adminTokenModalError").style.display = "none"
  document.getElementById("adminTokenModal").style.display = "block"
}


// 關閉 Modal
function closeAdminTokenModal() {
  document.getElementById("adminTokenModal").style.display = "none";
  pendingAdminAction = null;
  isAdminModalOpen = false;
}

// 確認金鑰
async function confirmAdminToken() {
  const token = document.getElementById("adminTokenModalInput").value.trim()
  if (!token) return

  try {
    const res = await fetch("/api/admin/verify", {
      headers: { "X-Admin-Token": token }
    })

    if (!res.ok) throw new Error("INVALID_TOKEN")

    localStorage.setItem(ADMIN_TOKEN_KEY, token)
    closeAdminTokenModal()
    showNotification("✅ 管理金鑰驗證成功", "success")

    await afterAdminUnlocked(); // ✅ 正確

  } catch (e) {
    document.getElementById("adminTokenModalError").style.display = "block"
  }
}


async function afterAdminUnlocked() {
    await loadPrizesFromAPI();
    renderPrizeSelector();
    await loadEmployeesFromAPI();
    await loadWinnersFromAPI();
    updateUI();
}

function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  showNotification("已清除管理金鑰", "info");
}

if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
  console.info("🔐 尚未設定管理金鑰，管理操作將要求驗證");
}

window.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
    lockUI();
  }
});

// 應用程式狀態
const state = {
    employees: new Map(), // barcode -> {site, department, name, seniority}
    winners: {
        1: [], 2: [], 3: [], 4: [], 5: [], 6: []
    },
    prizes: new Map(),
    currentPrize: 1
};

// API 基礎 URL
const API_BASE = '/api';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    initializeApp();

    // 🔐 先鎖 UI
    if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
        lockUI();
        return; // ⛔ 沒解鎖前不跑下面
    }
    await loadPrizesFromAPI();
    renderPrizeSelector();
    await loadEmployeesFromAPI();
    await loadWinnersFromAPI();
    updateUI();
});


function initializeApp() {
    // 綁定事件監聽器
    document.getElementById('barcodeInput').addEventListener('keypress', handleBarcodeInput);
    document.getElementById('currentPrize').addEventListener('change', handlePrizeChange);
    document.getElementById('loadDataBtn').addEventListener('click', loadEmployeeData);
    document.getElementById('exportBtn').addEventListener('click', exportWinners);
    document.getElementById('clearBtn').addEventListener('click', clearAllData);
    document.getElementById('manualAddBtn').addEventListener('click', openManualModal);
    document.getElementById('editPrizeBtn').addEventListener('click', openPrizeEditor);
    // Modal 相關
    const modal = document.getElementById('manualModal');
    const closeBtn = document.querySelector('.close');
    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    
    // 員工總數卡片點擊事件
    document.getElementById('employeeStatsCard').addEventListener('click', showEmployeeListModal);
    
    // 員工清單搜尋功能
    document.getElementById('employeeSearchInput').addEventListener('input', filterEmployeeList);
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
        
        const employeeModal = document.getElementById('employeeListModal');
        if (e.target === employeeModal) {
            employeeModal.style.display = 'none';
        }
    });
    document.getElementById('manualForm').addEventListener('submit', handleManualAdd);
    const prizeForm = document.getElementById('editPrizeForm');
    if (prizeForm) {
    prizeForm.addEventListener('submit', savePrizeConfig);
    }
    
    // 中獎彈出視窗相關
    const winnerModal = document.getElementById('winnerModal');
    const closeWinnerBtn = document.getElementById('closeWinnerModal');
    
    if (closeWinnerBtn) {
        closeWinnerBtn.addEventListener('click', () => {
            winnerModal.style.display = 'none';
            // 關閉後將焦點回到 barcode 輸入框
            document.getElementById('barcodeInput').focus();
        });
    }
    
    // 點擊視窗外部關閉
    window.addEventListener('click', (e) => {
        if (e.target === winnerModal) {
            winnerModal.style.display = 'none';
            document.getElementById('barcodeInput').focus();
        }
    });

    // 頁面卸載前提示（如果有未匯出的中獎記錄）
    window.addEventListener('beforeunload', (e) => {
        let totalWinners = 0;
        for (let prize in state.winners) {
            totalWinners += state.winners[prize].length;
        }
        if (totalWinners > 0) {
            e.preventDefault();
            e.returnValue = '您有中獎記錄尚未匯出，確定要離開嗎？';
        }
    });

    // 載入時將焦點放在 barcode 輸入框
    document.getElementById('barcodeInput').focus();
}

function handleBarcodeInput(e) {
    if (e.key === 'Enter') {
        const barcode = e.target.value.trim();
        if (barcode) {
            processBarcode(barcode);
            e.target.value = '';
        }
    }
}

async function processBarcode(barcode) {
    const employee = state.employees.get(barcode);
    
    if (!employee) {
        showNotification('找不到此 Barcode 對應的員工資料', 'error');
        playSound('error');
        // 自動開啟手動輸入視窗
        openManualModal();
        return;
    }

    try {
        // 呼叫 API 新增中獎記錄（後端會檢查重複）
        let response;
        try {
        response = await apiFetch(`${API_BASE}/winners`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, prize: state.currentPrize })
        });
        } catch (err) {
        console.warn("API blocked:", err.message);
        return;
        }

        const result = await response.json();

        if (!response.ok || !result.success) {
            // 後端返回的錯誤訊息（包括重複中獎）
            showNotification(result.error || '新增中獎記錄失敗', 'warning');
            playSound('warning');
            return;
        }

        // 新增中獎者到本地狀態
        const winner = {
            id: result.data.id,
            barcode: barcode,
            name: employee.name,
            site: employee.site,
            department: employee.department,
            seniority: employee.seniority,
            timestamp: result.data.won_at
        };

        state.winners[state.currentPrize].push(winner);
        
        // 顯示中獎動畫
        displayWinner(winner, state.currentPrize);
        playSound('success');
        
        // 更新UI
        updateUI();
        
        showNotification(`🎉 恭喜 ${employee.name} 中獎！`, 'success');
    } catch (error) {
        console.error('處理中獎失敗:', error);
        showNotification('新增中獎記錄失敗: ' + error.message, 'error');
        playSound('error');
    }
}

function displayWinner(winner, prize) {
    const modal = document.getElementById('winnerModal');
    const prizeLabel = document.getElementById('winnerPrizeLabel');
    const winnerName = document.getElementById('winnerName');
    const winnerInfo = document.getElementById('winnerInfo');

    prizeLabel.textContent = state.prizes.get(prize)?.label || `第${prize}獎`;
    winnerName.textContent = winner.name;
    winnerInfo.textContent = '';

    // 顯示彈出視窗
    modal.style.display = 'block';

    // 重新觸發動畫
    winnerName.style.animation = 'none';
    setTimeout(() => {
        winnerName.style.animation = '';
    }, 10);

    // 慶祝效果
    createConfetti();
}

function createConfetti() {
    // 簡單的慶祝效果
    const modalContent = document.querySelector('.winner-modal-content');
    if (modalContent) {
        modalContent.style.transform = 'scale(1.02)';
        setTimeout(() => {
            modalContent.style.transform = 'scale(1)';
        }, 300);
    }
}

function handlePrizeChange(e) {
    state.currentPrize = parseInt(e.target.value);
    document.getElementById('barcodeInput').focus();
}

function loadEmployeeData() {
    const input = document.getElementById('fileInput');
    
    // 重置 input 的值，確保可以重複載入同一個檔案
    input.value = '';
    
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 驗證檔案
        const validationError = validateEmployeeFile(file);
        if (validationError) {
            showNotification(validationError, 'error');
            input.value = ''; // 清除選擇
            return;
        }

        // 先嘗試用 UTF-8 讀取
        attemptFileRead(file, 'UTF-8');
    };
}

// 嘗試讀取檔案，支援多種編碼
function attemptFileRead(file, encoding) {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
        try {
            const content = event.target.result;
            
            // 檢測是否有亂碼
            if (detectGarbledText(content)) {
                if (encoding === 'UTF-8') {
                    // UTF-8 失敗，嘗試 Big5
                    console.log('偵測到可能的編碼問題，嘗試使用其他編碼...');
                    attemptFileRead(file, 'Big5');
                    return;
                } else {
                    // 所有編碼都失敗
                    showNotification(
                        '❌ 檔案編碼錯誤：偵測到亂碼\n\n' +
                        '請嘗試以下解決方案：\n' +
                        '1. 用記事本開啟檔案，另存新檔時選擇「UTF-8」編碼\n' +
                        '2. 用 Excel 開啟，另存為 CSV UTF-8 格式\n' +
                        '3. 確保檔案中的中文字可以正常顯示',
                        'error'
                    );
                    return;
                }
            }
            
            let format = file.name.endsWith('.json') ? 'json' : 'csv';

            // 呼叫 API 匯入資料
            const response = await apiFetch(`${API_BASE}/employees/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ format, content })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '匯入失敗');
            }

            // 重新載入員工資料
            await loadEmployeesFromAPI();
            
            updateUI();
            const encodingNote = encoding === 'Big5' ? '（使用 Big5 編碼）' : '';
            showNotification(`✅ ${result.message} ${encodingNote}`, 'success');
        } catch (error) {
            console.error('檔案處理錯誤:', error);
            showNotification('❌ 匯入失敗：' + error.message, 'error');
        }
    };
    
    reader.onerror = () => {
        showNotification('❌ 檔案讀取失敗', 'error');
    };
    
    // 使用指定的編碼讀取
    reader.readAsText(file, encoding);
}


// 偵測亂碼（檢查是否有常見的亂碼字元）
function detectGarbledText(text) {
    if (!text || text.length === 0) return false;
    
    // 計算亂碼字元的比例
    let garbledCount = 0;
    const totalChars = text.length;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const code = text.charCodeAt(i);
        
        // 檢測常見的亂碼字元模式
        // 1. 常見的 Big5/GBK 轉 UTF-8 錯誤產生的字元
        if (char === '�' || char === '�') {
            garbledCount++;
        }
        // 2. 不可見的控制字元（排除正常的換行、tab等）
        else if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
            garbledCount++;
        }
        // 3. 檢查是否有異常的字元組合（如"锟斤拷"等常見亂碼）
    }
    
    // 如果超過 5% 的字元是亂碼，判定為編碼問題
    const garbledRatio = garbledCount / totalChars;
    
    // 也檢查特定的亂碼字串
    const hasCommonGarbled = (
        text.includes('�') ||
        text.includes('锟斤拷') ||
        text.includes('烫烫烫') ||
        /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)
    );
    
    return garbledRatio > 0.05 || hasCommonGarbled;
}

// 驗證檔案的基本屬性
function validateEmployeeFile(file) {
    // 1. 檢查檔案是否存在
    if (!file) {
        return '請選擇檔案';
    }
    
    // 2. 檢查檔案大小（最大 5MB）
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        return `❌ 檔案過大：${(file.size / 1024 / 1024).toFixed(2)}MB（最大 5MB）`;
    }
    
    // 3. 檢查檔案大小（最小 1 byte）
    if (file.size === 0) {
        return '❌ 檔案是空的，請檢查檔案內容';
    }
    
    // 4. 檢查檔案類型（只允許 .json 和 .csv）
    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.json', '.csv'];
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!hasValidExtension) {
        return '❌ 不支援的檔案格式，請使用 .json 或 .csv 檔案';
    }
    
    // 5. 檢查 MIME type
    const allowedMimeTypes = [
        'application/json',
        'text/csv',
        'text/plain',
        'application/vnd.ms-excel',
        '' // 某些系統可能沒有 MIME type
    ];
    
    if (file.type && !allowedMimeTypes.includes(file.type)) {
        return `❌ 檔案類型不正確：${file.type}`;
    }
    
    return null; // 無錯誤
}

async function exportWinners() {
    try {
        // 直接向後端請求 CSV 檔案
        const response = await apiFetch(`${API_BASE}/winners/export`);
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || '匯出失敗');
        }
        
        // 取得 CSV 資料
        const blob = await response.blob();
        
        // 觸發下載
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `中獎名單_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification('✅ 已匯出中獎名單', 'success');
    } catch (error) {
        console.error('匯出失敗:', error);
        showNotification('❌ 匯出失敗: ' + error.message, 'error');
    }
}

async function clearAllData() {
    if (confirm('確定要清空所有資料（包括員工資料和中獎記錄）嗎？此操作無法復原！')) {
        try {
            const response = await apiFetch(`${API_BASE}/all`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '清空資料失敗');
            }

            // 清空本地狀態
            state.winners = {
                1: [], 2: [], 3: [], 4: [], 5: [], 6: []
            };
            state.employees.clear();
            
            updateUI();
            showNotification('已清空所有資料', 'success');
        } catch (error) {
            console.error('清空資料失敗:', error);
            showNotification('清空資料失敗: ' + error.message, 'error');
        }
    }
}

function openManualModal() {
    document.getElementById('manualModal').style.display = 'block';
    document.getElementById('manualBarcode').focus();
}

async function handleManualAdd(e) {
    e.preventDefault();

    const form = e.currentTarget;
    const barcode = form.elements.barcode?.value.trim();

    if (!barcode) {
        showNotification('請輸入 Barcode', 'warning');
        return;
    }

    try {
        await processBarcode(barcode);
        form.reset();
        document.getElementById('manualModal').style.display = 'none';
    } catch (err) {
        console.error(err);
    }
}

async function loadPrizesFromAPI() {
    try {
        const response = await apiFetch(`${API_BASE}/prizes`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || '載入獎項失敗');
        }

        state.prizes.clear();
        result.data.forEach(prize => {
            state.prizes.set(prize.id, {
                label: prize.label,
                item: prize.item
            });
        });

        console.log(`🎁 載入 ${state.prizes.size} 個獎項設定`);
    } catch (err) {
        console.error('載入獎項失敗:', err);
        showNotification('載入獎項設定失敗', 'error');
    }
}


function renderPrizeSelector() {
  const select = document.getElementById('currentPrize');
  if (!select) return;

  const current = state.currentPrize;
  select.innerHTML = '';

  Array.from(state.prizes.entries()).forEach(([id, prize]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = prize.label;
    if (parseInt(id) === current) opt.selected = true;
    select.appendChild(opt);
  });
}

function openPrizeEditor() {
  const container = document.getElementById('prizeEditList');
  container.innerHTML = '';

  Array.from(state.prizes.entries()).forEach(([id, prize]) => {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `
      <label>${prize.label}</label>
      <input type="text" data-id="${id}" data-field="item" value="${prize.item}" placeholder="獎品名稱">
    `;
    container.appendChild(div);
  });

  document.getElementById('editPrizeModal').style.display = 'block';
}


async function savePrizeConfig(e) {
  e.preventDefault();

  const payload = [];

  e.currentTarget.querySelectorAll('input').forEach(input => {
    const id = parseInt(input.dataset.id);
    const prize = state.prizes.get(id);
    if (!prize) return;

    prize.item = input.value.trim();

    payload.push({
      id,
      label: prize.label,
      item: prize.item
    });
  });

  try {
    const res = await apiFetch(`${API_BASE}/prizes/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || '儲存失敗');
    }

    // 🔁 一定要重新從後端載入（權威來源）
    await loadPrizesFromAPI();
    renderPrizeSelector();
    updateUI();
    closePrizeEditor();

    showNotification('✅ 獎項設定已儲存到系統', 'success');

  } catch (err) {
    console.error(err);
    showNotification('❌ 儲存獎項設定失敗', 'error');
  }
}

function closePrizeEditor() {
  document.getElementById('editPrizeModal').style.display = 'none';
}

function updateUI() {
    // 更新統計
    let totalWinners = 0;
    for (let prize in state.winners) {
        totalWinners += state.winners[prize].length;
    }
    document.getElementById('totalWinners').textContent = totalWinners;
    document.getElementById('totalEmployees').textContent = state.employees.size;

    // 更新中獎名單（單一列表）
    const allWinnersList = document.getElementById('allWinnersList');
    allWinnersList.innerHTML = '';
    
    let hasWinners = false;

    // 動態調整獎項顏色
    const prizeColors = {
        1: '#EF4444', 
        2: '#DB2777', 
        3: '#22C55E', 
        4: '#FB923C', 
        5: '#FACC15', 
        6: '#94A3B8' 
    };

    let serialNumber = 1; // 流水號計數器
    
    // 按獎項順序顯示所有中獎者
    for (let prize = 1; prize <= 6; prize++) {
        state.winners[prize].forEach((winner, index) => {
            hasWinners = true;
            const li = document.createElement('li');
            const prizeLabel = state.prizes.get(prize)?.label || `第${prize}獎`;
            const prizeItemName = state.prizes.get(prize)?.item || '';
            li.innerHTML = `
                <div class="winner-info-text">
                    <span class="winner-serial">#${serialNumber}</span>
                    <span class="winner-prize" style="background: ${prizeColors[prize]};">${prizeLabel}</span>
                    <span class="winner-prize-name">${prizeItemName}</span>
                    <span class="winner-barcode">${winner.barcode}</span>
                    <span class="winner-site-dept">${winner.site} - ${winner.department}</span>
                    <span class="winner-name-list">${winner.name}</span>
                    <span class="winner-seniority">年資 ${winner.seniority}</span>
                </div>
                <button class="delete-btn" onclick="deleteWinner(${prize}, ${index})">❌</button>
            `;
            allWinnersList.appendChild(li);
            serialNumber++;
        });
    }
    
    if (!hasWinners) {
        allWinnersList.innerHTML = '<li class="no-winners">目前沒有中獎者</li>';
        stopAutoScroll();
    } else {
        // 複製內容以創造無縫滾動效果
        duplicateListForScroll();
        initAutoScroll();
    }
}

async function deleteWinner(prize, index) {
    if (confirm('確定要刪除這位中獎者嗎？')) {
        try {
            const winner = state.winners[prize][index];
            if (!winner || !winner.id) {
                throw new Error('找不到中獎記錄ID');
            }

            const response = await apiFetch(`${API_BASE}/winners/${winner.id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '刪除失敗');
            }

            state.winners[prize].splice(index, 1);
            updateUI();
            showNotification('已刪除中獎記錄', 'success');
        } catch (error) {
            console.error('刪除中獎記錄失敗:', error);
            showNotification('刪除失敗: ' + error.message, 'error');
        }
    }
}

function showNotification(message, type = 'info') {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#6366f1'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        font-weight: 600;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function playSound(type) {
    // 使用 Web Audio API 播放簡單音效
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        if (type === 'success') {
            oscillator.frequency.value = 800;
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        } else if (type === 'error') {
            oscillator.frequency.value = 200;
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        } else if (type === 'warning') {
            oscillator.frequency.value = 500;
            gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        }

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        console.log('Audio not supported');
    }
}

// API 相關函數
async function loadEmployeesFromAPI() {
    try {
        const response = await apiFetch(`${API_BASE}/employees`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || '載入員工資料失敗');
        }

        state.employees.clear();
        result.data.forEach(emp => {
            state.employees.set(emp.barcode, {
                site: emp.site,
                department: emp.department,
                name: emp.name,
                seniority: emp.seniority
            });
        });

        console.log(`載入 ${state.employees.size} 筆員工資料`);
    } catch (error) {
        console.error('載入員工資料失敗:', error);
        // 不顯示錯誤通知，因為初次載入時可能沒有資料
    }
}

async function loadWinnersFromAPI() {
    try {
        const response = await apiFetch(`${API_BASE}/winners`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || '載入中獎記錄失敗');
        }

        // 清空現有中獎記錄
        state.winners = {
            1: [], 2: [], 3: [], 4: [], 5: [], 6: []
        };

        // 重新組織中獎記錄
        result.data.forEach(winner => {
            state.winners[winner.prize].push({
                id: winner.id,
                barcode: winner.barcode,
                name: winner.name,
                site: winner.site,
                department: winner.department,
                seniority: winner.seniority,
                timestamp: winner.won_at
            });
        });

        let totalWinners = 0;
        for (let prize in state.winners) {
            totalWinners += state.winners[prize].length;
        }
        
        if (totalWinners > 0) {
            console.log(`載入 ${totalWinners} 筆中獎記錄`);
        }
    } catch (error) {
        console.error('載入中獎記錄失敗:', error);
        // 不顯示錯誤通知，因為初次載入時可能沒有資料
    }
}

// 添加 CSS 動畫
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 自動滾動跑馬燈功能
let animationFrameId = null;
let isScrollPaused = false;
let originalItemCount = 0;
let singleGroupHeight = 0;
let lastTimestamp = 0;
const scrollSpeed = 30; // 每秒滾動的像素數

function duplicateListForScroll() {
    const list = document.getElementById('allWinnersList');
    if (!list) return;
    
    // 移除之前可能存在的複製節點（清理舊複製）
    const allItems = Array.from(list.children);
    allItems.forEach(item => {
        if (item.dataset.cloned === 'true') {
            item.remove();
        }
    });
    
    // 保存原始項目數量（排除 no-winners）
    const items = Array.from(list.children).filter(item => !item.classList.contains('no-winners'));
    originalItemCount = items.length;
    
    // 計算原始內容高度（包含 margin 和 padding）
    singleGroupHeight = 0;
    items.forEach(item => {
        const style = window.getComputedStyle(item);
        const marginTop = parseFloat(style.marginTop) || 0;
        const marginBottom = parseFloat(style.marginBottom) || 0;
        singleGroupHeight += item.offsetHeight + marginTop + marginBottom;
    });
    
    // 只要中獎人數超過14人，就複製內容以創造循環滾動效果
    if (originalItemCount > 14) {
        items.forEach(item => {
            const clone = item.cloneNode(true);
            clone.dataset.cloned = 'true'; // 標記為複製節點
            list.appendChild(clone);
        });
    }
}

function initAutoScroll() {
    const list = document.getElementById('allWinnersList');
    if (!list || originalItemCount <= 14) return;
    
    // 停止現有的滾動
    stopAutoScroll();
    
    // 添加滑鼠懸停事件監聽
    list.addEventListener('mouseenter', pauseAutoScroll);
    list.addEventListener('mouseleave', resumeAutoScroll);
    
    // 添加手動滾動循環監聽
    list.addEventListener('scroll', handleManualScroll);
    
    // 重置滾動位置
    list.scrollTop = 0;
    
    // 開始自動滾動
    lastTimestamp = performance.now();
    startAutoScroll();
}

function startAutoScroll() {
    const list = document.getElementById('allWinnersList');
    if (!list || originalItemCount <= 14) return;
    
    function scroll(timestamp) {
        if (isScrollPaused) {
            animationFrameId = requestAnimationFrame(scroll);
            return;
        }
        
        // 計算時間差（毫秒）
        const deltaTime = timestamp - lastTimestamp;
        lastTimestamp = timestamp;
        
        // 根據時間差計算滾動距離（確保滾動速度不受幀率影響）
        const scrollDelta = (scrollSpeed * deltaTime) / 1000;
        
        // 增加滾動位置
        list.scrollTop += scrollDelta;
        
        // 使用原始高度來判斷重置點（如果有複製內容，會在第一組結束時重置）
        if (list.scrollTop >= singleGroupHeight) {
            list.scrollTop = list.scrollTop - singleGroupHeight;
        }
        
        animationFrameId = requestAnimationFrame(scroll);
    }
    
    animationFrameId = requestAnimationFrame(scroll);
}

function stopAutoScroll() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    const list = document.getElementById('allWinnersList');
    if (list) {
        list.removeEventListener('mouseenter', pauseAutoScroll);
        list.removeEventListener('mouseleave', resumeAutoScroll);
        list.removeEventListener('scroll', handleManualScroll);
    }
}

function pauseAutoScroll() {
    isScrollPaused = true;
}

function resumeAutoScroll() {
    isScrollPaused = false;
    lastTimestamp = performance.now();
}

function handleManualScroll() {
    const list = document.getElementById('allWinnersList');
    if (!list || originalItemCount <= 14) return;
    
    // 當手動滾動超過原始內容高度時，重置到開始位置（實現無縫循環）
    if (list.scrollTop >= singleGroupHeight) {
        list.scrollTop = list.scrollTop - singleGroupHeight;
    }
    // 當向上滾動到頂部時，跳到複製內容的對應位置
    else if (list.scrollTop <= 0 && singleGroupHeight > 0) {
        list.scrollTop = singleGroupHeight;
    }
}

// 員工清單分頁狀態
const paginationState = {
    allEmployees: [],
    filteredEmployees: [],
    currentPage: 1,
    pageSize: 50, // 每頁顯示50筆
    totalPages: 1
};

// 顯示員工清單彈出視窗
function showEmployeeListModal() {
    const modal = document.getElementById('employeeListModal');
    const totalSpan = document.getElementById('modalTotalEmployees');
    const searchInput = document.getElementById('employeeSearchInput');
    
    // 清空搜尋框
    searchInput.value = '';
    
    // 更新總人數
    totalSpan.textContent = state.employees.size;
    
    // 如果沒有員工資料
    if (state.employees.size === 0) {
        const tbody = document.getElementById('employeeListTableBody');
        tbody.innerHTML = '<tr><td colspan="7" class="employee-modal-table-no-data">尚未載入員工資料<br><br>請點擊「📂 載入員工資料」按鈕</td></tr>';
        modal.style.display = 'block';
        return;
    }
    
    // 準備員工資料
    paginationState.allEmployees = Array.from(state.employees.entries())
        .map(([barcode, data]) => ({ 
            barcode, 
            site: data.site,
            department: data.department,
            name: data.name,
            seniority: data.seniority
        }))
        .sort((a, b) => a.barcode.localeCompare(b.barcode));
    
    paginationState.filteredEmployees = paginationState.allEmployees;
    paginationState.currentPage = 1;
    paginationState.totalPages = Math.ceil(paginationState.filteredEmployees.length / paginationState.pageSize);
    
    // 渲染第一頁
    renderEmployeeList();
    
    // 顯示彈出視窗
    modal.style.display = 'block';
}

// 渲染員工清單（支援分頁）
function renderEmployeeList(filterText) {
    const tbody = document.getElementById('employeeListTableBody');
    
    // 只有在提供 filterText 參數時才進行過濾（用於搜尋功能）
    if (filterText !== undefined) {
        if (filterText !== '') {
            paginationState.filteredEmployees = paginationState.allEmployees.filter(emp => 
                emp.name.toLowerCase().includes(filterText.toLowerCase()) ||
                emp.barcode.toLowerCase().includes(filterText.toLowerCase()) ||
                emp.site.toLowerCase().includes(filterText.toLowerCase()) ||
                emp.department.toLowerCase().includes(filterText.toLowerCase())
            );
        } else {
            // 清空搜尋時，恢復顯示所有員工
            paginationState.filteredEmployees = paginationState.allEmployees;
        }
        // 重置到第一頁並重新計算總頁數（只在搜尋時）
        paginationState.currentPage = 1;
        paginationState.totalPages = Math.ceil(paginationState.filteredEmployees.length / paginationState.pageSize);
    } else {
        // 換頁時，只重新計算總頁數
        paginationState.totalPages = Math.ceil(paginationState.filteredEmployees.length / paginationState.pageSize);
    }
    
    const employees = paginationState.filteredEmployees;
    
    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="employee-modal-table-no-data">找不到符合的員工</td></tr>';
        updatePaginationControls();
        return;
    }
    
    // 計算當前頁的資料範圍
    const startIndex = (paginationState.currentPage - 1) * paginationState.pageSize;
    const endIndex = Math.min(startIndex + paginationState.pageSize, employees.length);
    const pageEmployees = employees.slice(startIndex, endIndex);
    
    // 清空表格
    tbody.innerHTML = '';
    
    // 渲染當前頁的員工
    pageEmployees.forEach((emp, pageIndex) => {
        const globalIndex = startIndex + pageIndex;
        
        // 檢查是否已中獎
        let hasWon = false;
        let wonPrize = '';
        for (let prize in state.winners) {
            if (state.winners[prize].some(w => w.barcode === emp.barcode)) {
                hasWon = true;
                wonPrize = state.prizes.get(parseInt(prize))?.label || `第${prize}獎`;
                break;
            }
        }
        
        const statusBadge = hasWon 
            ? `<span class="employee-status-badge">✓ ${wonPrize}</span>`
            : `<span class="employee-status-empty">-</span>`;
        
        const row = document.createElement('tr');
        if (hasWon) {
            row.className = 'employee-row-winner';
        }
        
        row.innerHTML = `
            <td>${globalIndex + 1}</td>
            <td>${emp.barcode}</td>
            <td>${emp.site}</td>
            <td>${emp.department}</td>
            <td>${emp.name}</td>
            <td>${emp.seniority}</td>
            <td>${statusBadge}</td>
            <td>
                <button onclick="editEmployee('${emp.barcode}')" class="employee-action-btn-edit">✏️ 編輯</button>
                <button onclick="deleteEmployee('${emp.barcode}')" class="employee-action-btn-delete">🗑️ 刪除</button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // 更新分頁控制
    updatePaginationControls();
}

// 更新分頁控制元件
function updatePaginationControls() {
    let paginationDiv = document.getElementById('employeePagination');
    
    // 如果不存在，創建分頁控制元件
    if (!paginationDiv) {
        const modalContent = document.querySelector('#employeeListModal .modal-content');
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'employeePagination';
        paginationDiv.style.cssText = `
            margin-top: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            border-top: 1px solid #ddd;
        `;
        modalContent.appendChild(paginationDiv);
    }
    
    const totalEmployees = paginationState.filteredEmployees.length;
    const startIndex = (paginationState.currentPage - 1) * paginationState.pageSize + 1;
    const endIndex = Math.min(paginationState.currentPage * paginationState.pageSize, totalEmployees);
    
    paginationDiv.innerHTML = `
        <div style="color: #666;">
            顯示 ${startIndex} - ${endIndex} 筆，共 ${totalEmployees} 筆
        </div>
        <div style="display: flex; gap: 5px; align-items: center;">
            <button onclick="goToFirstPage()" 
                    ${paginationState.currentPage === 1 ? 'disabled' : ''}
                    style="padding: 5px 10px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 3px;">
                «
            </button>
            <button onclick="goToPrevPage()" 
                    ${paginationState.currentPage === 1 ? 'disabled' : ''}
                    style="padding: 5px 10px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 3px;">
                ‹
            </button>
            <span style="padding: 5px 15px;">
                第 ${paginationState.currentPage} / ${paginationState.totalPages} 頁
            </span>
            <button onclick="goToNextPage()" 
                    ${paginationState.currentPage >= paginationState.totalPages ? 'disabled' : ''}
                    style="padding: 5px 10px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 3px;">
                ›
            </button>
            <button onclick="goToLastPage()" 
                    ${paginationState.currentPage >= paginationState.totalPages ? 'disabled' : ''}
                    style="padding: 5px 10px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 3px;">
                »
            </button>
        </div>
        <div>
            <select onchange="changePageSize(this.value)" 
                    style="padding: 5px 10px; border: 1px solid #ddd; border-radius: 3px;">
                <option value="25" ${paginationState.pageSize === 25 ? 'selected' : ''}>25筆/頁</option>
                <option value="50" ${paginationState.pageSize === 50 ? 'selected' : ''}>50筆/頁</option>
                <option value="100" ${paginationState.pageSize === 100 ? 'selected' : ''}>100筆/頁</option>
                <option value="200" ${paginationState.pageSize === 200 ? 'selected' : ''}>200筆/頁</option>
            </select>
        </div>
    `;
}

// 分頁控制函數
function goToFirstPage() {
    paginationState.currentPage = 1;
    renderEmployeeList();
}

function goToPrevPage() {
    if (paginationState.currentPage > 1) {
        paginationState.currentPage--;
        renderEmployeeList();
    }
}

function goToNextPage() {
    if (paginationState.currentPage < paginationState.totalPages) {
        paginationState.currentPage++;
        renderEmployeeList();
    }
}

function goToLastPage() {
    paginationState.currentPage = paginationState.totalPages;
    renderEmployeeList();
}

function changePageSize(newSize) {
    paginationState.pageSize = parseInt(newSize);
    paginationState.totalPages = Math.ceil(paginationState.filteredEmployees.length / paginationState.pageSize);
    paginationState.currentPage = 1;
    renderEmployeeList();
}

// 過濾員工清單
function filterEmployeeList() {
    const searchInput = document.getElementById('employeeSearchInput');
    const filterText = searchInput.value.trim();
    renderEmployeeList(filterText);
}

// 刪除員工
async function deleteEmployee(barcode) {
    const employee = state.employees.get(barcode);
    if (!employee) {
        showNotification('找不到該員工', 'error');
        return;
    }
    
    // 檢查該員工是否已中獎
    let hasWon = false;
    for (let prize in state.winners) {
        if (state.winners[prize].some(w => w.barcode === barcode)) {
            hasWon = true;
            break;
        }
    }
    
    if (hasWon) {
        if (!confirm(`警告：${employee.name} 已經中獎！\n刪除員工資料不會影響已產生的中獎記錄。\n\n確定要刪除此員工嗎？`)) {
            return;
        }
    } else {
        if (!confirm(`確定要刪除員工 ${employee.name} (${barcode}) 嗎？`)) {
            return;
        }
    }
    
    try {
        const response = await apiFetch(`${API_BASE}/employees/${barcode}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.error || '刪除失敗');
        }
        
        // 從本地狀態中移除
        state.employees.delete(barcode);
        
        // 更新 UI
        updateUI();
        
        // 重新渲染員工清單
        showEmployeeListModal();
        
        showNotification(`已刪除員工：${employee.name}`, 'success');
    } catch (error) {
        console.error('刪除員工失敗:', error);
        showNotification('刪除失敗: ' + error.message, 'error');
    }
}

// 編輯員工
function editEmployee(barcode) {
    const employee = state.employees.get(barcode);
    if (!employee) {
        showNotification('找不到該員工', 'error');
        return;
    }
    
    // 填入表單
    document.getElementById('editEmployeeBarcode').value = barcode;
    document.getElementById('editEmployeeSite').value = employee.site || '';
    document.getElementById('editEmployeeDepartment').value = employee.department || '';
    document.getElementById('editEmployeeName').value = employee.name || '';
    document.getElementById('editEmployeeSeniority').value = employee.seniority || 0;
    
    // 檢查是否已中獎
    let winnerId = null;
    let wonPrize = null;
    for (let prize in state.winners) {
        const winner = state.winners[prize].find(w => w.barcode === barcode);
        if (winner) {
            winnerId = winner.id;
            wonPrize = prize;
            break;
        }
    }
    
    // 設置中獎資訊
    const winnerSection = document.getElementById('editEmployeeWinnerSection');
    const winnerInfo = document.getElementById('editEmployeeWinnerInfo');
    const winnerIdInput = document.getElementById('editEmployeeWinnerId');
    const removeCheckbox = document.getElementById('editEmployeeRemoveWinner');
    
    if (winnerId) {
        winnerSection.style.display = 'block';
        winnerInfo.textContent =`此員工已在「${state.prizes.get(parseInt(wonPrize))?.label || `第${wonPrize}獎`}」中獎`;
        winnerIdInput.value = winnerId;
        removeCheckbox.checked = false;
    } else {
        winnerSection.style.display = 'none';
        winnerIdInput.value = '';
        removeCheckbox.checked = false;
    }
    
    // 顯示編輯視窗
    document.getElementById('editEmployeeModal').style.display = 'block';
}

// 儲存員工編輯
async function saveEmployeeEdit() {
    const barcode = document.getElementById('editEmployeeBarcode').value;
    const site = document.getElementById('editEmployeeSite').value.trim();
    const department = document.getElementById('editEmployeeDepartment').value.trim();
    const name = document.getElementById('editEmployeeName').value.trim();
    const seniority = parseInt(document.getElementById('editEmployeeSeniority').value);
    const winnerId = document.getElementById('editEmployeeWinnerId').value;
    const removeWinner = document.getElementById('editEmployeeRemoveWinner').checked;
    
    if (!site || !department || !name) {
        showNotification('請填寫所有必填欄位', 'error');
        return;
    }
    
    try {
        // 1. 更新員工資料
        const response = await apiFetch(`${API_BASE}/employees/${barcode}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ site, department, name, seniority })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.error || '更新失敗');
        }
        
        // 2. 如果勾選取消中獎，刪除中獎記錄
        if (removeWinner && winnerId) {
            const deleteResponse = await apiFetch(`${API_BASE}/winners/${winnerId}`, {
                method: 'DELETE'
            });
            
            const deleteResult = await deleteResponse.json();
            
            if (deleteResponse.ok && deleteResult.success) {
                // 從本地狀態中移除中獎記錄
                for (let prize in state.winners) {
                    state.winners[prize] = state.winners[prize].filter(w => w.id !== parseInt(winnerId));
                }
                showNotification('已取消該員工的中獎資格', 'success');
            }
        }
        
        // 更新本地狀態
        state.employees.set(barcode, { site, department, name, seniority });
        
        // 更新 UI
        updateUI();
        
        // 關閉編輯視窗
        document.getElementById('editEmployeeModal').style.display = 'none';
        
        // 重新載入資料並渲染員工清單
        await loadEmployeesFromAPI();
        await loadWinnersFromAPI();
        showEmployeeListModal();
        
        showNotification(`已更新員工資料：${name}`, 'success');
    } catch (error) {
        console.error('更新員工失敗:', error);
        showNotification('更新失敗: ' + error.message, 'error');
    }
}

// 顯示新增員工視窗
function showAddEmployeeModal() {
    // 清空表單
    document.getElementById('addEmployeeBarcode').value = '';
    document.getElementById('addEmployeeSite').value = '';
    document.getElementById('addEmployeeDepartment').value = '';
    document.getElementById('addEmployeeName').value = '';
    document.getElementById('addEmployeeSeniority').value = '0';
    
    // 顯示新增視窗
    document.getElementById('addEmployeeModal').style.display = 'block';
    
    // 聚焦到員工編號輸入框
    setTimeout(() => {
        document.getElementById('addEmployeeBarcode').focus();
    }, 100);
}

// 儲存新員工
async function saveNewEmployee() {
    const barcode = document.getElementById('addEmployeeBarcode').value.trim();
    const site = document.getElementById('addEmployeeSite').value.trim();
    const department = document.getElementById('addEmployeeDepartment').value.trim();
    const name = document.getElementById('addEmployeeName').value.trim();
    const seniority = parseInt(document.getElementById('addEmployeeSeniority').value);
    
    if (!barcode || !site || !department || !name) {
        showNotification('請填寫所有必填欄位', 'error');
        return;
    }
    
    // 檢查員工編號是否已存在
    if (state.employees.has(barcode)) {
        showNotification(`員工編號 ${barcode} 已存在！`, 'error');
        return;
    }
    
    try {
        const response = await apiFetch(`${API_BASE}/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, site, department, name, seniority })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.error || '新增失敗');
        }
        
        // 更新本地狀態
        state.employees.set(barcode, { site, department, name, seniority });
        
        // 更新 UI
        updateUI();
        
        // 關閉新增視窗
        document.getElementById('addEmployeeModal').style.display = 'none';
        
        // 更新員工清單資料（不重新開啟視窗）
        paginationState.allEmployees = Array.from(state.employees.entries())
            .map(([barcode, data]) => ({ 
                barcode, 
                site: data.site,
                department: data.department,
                name: data.name,
                seniority: data.seniority
            }))
            .sort((a, b) => a.barcode.localeCompare(b.barcode));
        
        paginationState.filteredEmployees = paginationState.allEmployees;
        paginationState.totalPages = Math.ceil(paginationState.filteredEmployees.length / paginationState.pageSize);
        
        // 更新總人數顯示
        document.getElementById('modalTotalEmployees').textContent = state.employees.size;
        
        // 重新渲染當前頁
        renderEmployeeList();
        
        showNotification(`已新增員工：${name}`, 'success');
    } catch (error) {
        console.error('新增員工失敗:', error);
        showNotification('新增失敗: ' + error.message, 'error');
    }
}

