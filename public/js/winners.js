// winners.js
import { apiFetch } from "./api.js"
import { state } from "./state.js"
import { showNotification, playSound } from "./ui.js"
import { API_BASE } from "./api.js"
import { updateUI } from "./ui.js"
import { displayWinner } from "./ui.js"
import { UI_EVENTS } from './uiEvents.js'

const WINNERS_SNAPSHOT_KEY = "winners_snapshot"
const WINNER_EVENT_KEY = "winner_event"

function persistWinnersSnapshot() {
    try {
        localStorage.setItem(WINNERS_SNAPSHOT_KEY, JSON.stringify(state.winners))
    } catch {}
}

function persistWinnerEvent(winner, prize) {
    try {
        localStorage.setItem(
            WINNER_EVENT_KEY,
            JSON.stringify({ winner, prize, ts: Date.now() })
        )
    } catch {}
}


// =============================
// Load Winners
// =============================
export async function loadWinnersFromAPI() {
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
                department: winner.department,
                timestamp: winner.won_at
            });
        });

        let totalWinners = 0;
        for (let prize in state.winners) {
            totalWinners += state.winners[prize].length;
        }
        persistWinnersSnapshot();
        
        if (totalWinners > 0) {
            console.log(`載入 ${totalWinners} 筆中獎記錄`);
        }
    } catch (error) {
        console.error('載入中獎記錄失敗:', error);
        // 不顯示錯誤通知，因為初次載入時可能沒有資料
    }
}

// =============================
// Process Barcode
// =============================
export async function processBarcode(barcode) {
    const employee = state.employees.get(barcode);
    
    if (!employee) {
    showNotification('找不到此 Barcode 對應的員工資料', 'error')
    playSound('error')


    document.dispatchEvent(new Event(UI_EVENTS.OPEN_MANUAL_MODAL))
    return
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
            department: employee.department,
            timestamp: result.data.won_at
        };

        state.winners[state.currentPrize].push(winner);
        
        // 顯示中獎動畫
        displayWinner(winner, state.currentPrize);
        playSound('success');
        
        // 更新UI
        updateUI();
        persistWinnersSnapshot();
        persistWinnerEvent(winner, state.currentPrize);
        
        showNotification(`🎉 恭喜 ${employee.name} 中獎！`, 'success');
    } catch (error) {
        console.error('處理中獎失敗:', error);
        showNotification('新增中獎記錄失敗: ' + error.message, 'error');
        playSound('error');
    }
}


// =============================
// Delete Winner
// =============================
export async function deleteWinner(prize, index) {
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
            persistWinnersSnapshot();
            showNotification('已刪除中獎記錄', 'success');
        } catch (error) {
            console.error('刪除中獎記錄失敗:', error);
            showNotification('刪除失敗: ' + error.message, 'error');
        }
    }
}

// =============================
// Export Winners
// =============================
export async function exportWinners() {
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


export async function clearAllData() {
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
            persistWinnersSnapshot();
            showNotification('已清空所有資料', 'success');
        } catch (error) {
            console.error('清空資料失敗:', error);
            showNotification('清空資料失敗: ' + error.message, 'error');
        }
    }
}

export function handleBarcodeInput(e) {
    if (e.key === 'Enter') {
        const barcode = e.target.value.trim();
        if (barcode) {
            processBarcode(barcode);
            e.target.value = '';
        }
    }
}

export function handlePrizeChange(e) {
    state.currentPrize = parseInt(e.target.value);
    try {
        localStorage.setItem("current_prize", String(state.currentPrize));
    } catch {}
    document.getElementById('barcodeInput').focus();
}

// winners.js（檔案最下面即可）
document.addEventListener('manual-barcode', async (e) => {
  const barcode = e.detail
  await processBarcode(barcode)
})
