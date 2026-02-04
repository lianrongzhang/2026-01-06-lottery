// ui.js
import { state } from "./state.js"
import { deleteWinner } from "./winners.js"
import { paginationState } from "./state.js";
import { renderEmployeeList } from "./employees.js";

// =============================
// Notification
// =============================
export function showNotification(message, type = 'info') {
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

// =============================
// Sound
// =============================
export function playSound(type) {
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

// =============================
// UI Lock (Visual Only)
// =============================
export function lockUI() {
  document.getElementById("adminLockOverlay").style.display = "flex"
  document.getElementById("adminLockTokenInput").value = ""
  document.getElementById("adminLockError").style.display = "none"
}

export function unlockUI() {
  document.getElementById("adminLockOverlay").style.display = "none"
}

// =============================
// Winner Modal UI
// =============================
export function displayWinner(winner, prize) {
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

export function createConfetti() {
    // 簡單的慶祝效果
    const modalContent = document.querySelector('.winner-modal-content');
    if (modalContent) {
        modalContent.style.transform = 'scale(1.02)';
        setTimeout(() => {
            modalContent.style.transform = 'scale(1)';
        }, 300);
    }
}

// =============================
// Main UI Render
// =============================
export function updateUI() {
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
        state.winners[prize].forEach((winner) => {
            hasWinners = true;
            const li = document.createElement('li');
            const prizeLabel = state.prizes.get(prize)?.label || `第${prize}獎`;
            const prizeItemName = state.prizes.get(prize)?.item || '';
            li.innerHTML = `
                <div class="winner-info-text">
                    <span class="winner-prize" style="background: ${prizeColors[prize]}; border-radius: 10px;">${prizeLabel} - ${prizeItemName}</span>
                    <span class="winner-barcode">${winner.barcode}</span>
                    <span class="winner-site-dept">${winner.department}</span>
                    <span class="winner-name-list">${winner.name}</span>
                </div>
            `;
            allWinnersList.appendChild(li);
            serialNumber++;
        });
    }
    
    if (!hasWinners) {
    allWinnersList.innerHTML = '<li class="no-winners">目前沒有中獎者</li>';
    resetWinnerScroll();
    } else {
    enableWinnerAutoScroll();
    }
}

function enableWinnerAutoScroll() {
  const track = document.getElementById("winnersScrollTrack");
  const list = document.getElementById("allWinnersList");

  if (!track || !list) return;

  // 清掉舊的 clone（避免越疊越多）
  [...track.children].forEach((child, idx) => {
    if (idx > 0) child.remove();
  });

  // 中獎人太少就不滾
  if (list.children.length < 10) {
    track.style.animation = "none";
    return;
  }

  // clone 一份 grid
  const clone = list.cloneNode(true);
  clone.setAttribute("aria-hidden", "true");
  track.appendChild(clone);

  // 重置動畫（新增中獎者時不跳）
  track.style.animation = "none";
  track.offsetHeight; // force reflow
  track.style.animation = "";
}

// =============================
// CSS Animation Injection
// =============================
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

export function filterEmployeeList() {
    const searchInput = document.getElementById('employeeSearchInput');
    const filterText = searchInput.value.trim();
    renderEmployeeList(filterText);
}

export function showEmployeeListModal() {
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
            department: data.department,
            name: data.name,
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

export function closePrizeEditor() {
  document.getElementById('editPrizeModal').style.display = 'none';
}

function resetWinnerScroll() {
const track = document.getElementById("winnersScrollTrack");
const list = document.getElementById("allWinnersList");


if (!track || !list) return;


// 移除所有 clone（保留第一個）
[...track.children].forEach((child, idx) => {
if (idx > 0) child.remove();
});


// 停止動畫
track.style.animation = "none";
}
