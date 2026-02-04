// employees.js
import { apiFetch, API_BASE } from "./api.js"
import { state } from "./state.js"
import { updateUI, showNotification } from "./ui.js"
import { paginationState } from "./state.js"
import { reloadAllData } from "./dataSync.js"


function normalizeInput(v) {
    return typeof v === 'string'
        ? v.replace(/\u3000/g, ' ').trim()
        : ''
}


// =============================
// Load Employees
// =============================
export async function loadEmployeesFromAPI() {
    try {
        const response = await apiFetch(`${API_BASE}/employees`)
        const result = await response.json()

        if (!response.ok || !result.success) {
            throw new Error(result.error || "載入員工資料失敗")
        }

        state.employees.clear()
        result.data.forEach(emp => {
            state.employees.set(normalizeInput(emp.barcode), {
                // site: emp.site,
                department: normalizeInput(emp.department),
                name: normalizeInput(emp.name),
                // seniority: emp.seniority
            })
        })

        console.log(`載入 ${state.employees.size} 筆員工資料`)
    } catch (err) {
        console.error("載入員工資料失敗:", err)
    }
}

// =============================
// Employee List Modal
// =============================
export function showEmployeeListModal() {
    const modal = document.getElementById("employeeListModal")
    const totalSpan = document.getElementById("modalTotalEmployees")
    const searchInput = document.getElementById("employeeSearchInput")

    searchInput.value = ""
    totalSpan.textContent = state.employees.size

    if (state.employees.size === 0) {
        document.getElementById("employeeListTableBody").innerHTML =
            `<tr><td colspan="7" class="employee-modal-table-no-data">
        尚未載入員工資料<br><br>請點擊「📂 載入員工資料」
       </td></tr>`
        modal.style.display = "block"
        return
    }

    paginationState.allEmployees = Array.from(state.employees.entries())
        .map(([barcode, d]) => ({ barcode, ...d }))
        .sort((a, b) => a.barcode.localeCompare(b.barcode))

    paginationState.filteredEmployees = paginationState.allEmployees
    paginationState.currentPage = 1
    paginationState.totalPages =
        Math.ceil(paginationState.filteredEmployees.length / paginationState.pageSize)

    renderEmployeeList()
    modal.style.display = "block"
}

// =============================
// Render / Pagination
// =============================
export function renderEmployeeList(filterText) {
    const tbody = document.getElementById('employeeListTableBody')

    // === 🔒 搜尋字串 normalize（只影響比對） ===
    const keyword =
        typeof filterText === 'string'
            ? filterText.trim().toLowerCase()
            : null

    // =============================
    // 搜尋 / 過濾
    // =============================
    if (keyword !== null) {
        if (keyword !== '') {
            paginationState.filteredEmployees = paginationState.allEmployees.filter(emp => {
                const name = emp.name?.trim().toLowerCase() || ''
                const barcode = emp.barcode?.trim().toLowerCase() || ''
                const department = emp.department?.trim().toLowerCase() || ''

                return (
                    name.includes(keyword) ||
                    barcode.includes(keyword) ||
                    department.includes(keyword)
                )
            })
        } else {
            // 清空搜尋 → 顯示全部
            paginationState.filteredEmployees = paginationState.allEmployees
        }

        // 搜尋時一定回到第一頁
        paginationState.currentPage = 1
    }

    // 每次都重新計算總頁數
    paginationState.totalPages = Math.ceil(
        paginationState.filteredEmployees.length / paginationState.pageSize
    )

    const employees = paginationState.filteredEmployees

    // =============================
    // 無資料狀態
    // =============================
    if (employees.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="employee-modal-table-no-data">找不到符合的員工</td></tr>'
        updatePaginationControls()
        return
    }

    // =============================
    // 分頁切片
    // =============================
    const startIndex = (paginationState.currentPage - 1) * paginationState.pageSize
    const endIndex = Math.min(startIndex + paginationState.pageSize, employees.length)
    const pageEmployees = employees.slice(startIndex, endIndex)

    // 清空表格
    tbody.innerHTML = ''

    // =============================
    // 渲染資料列
    // =============================
    pageEmployees.forEach((emp, pageIndex) => {
        const globalIndex = startIndex + pageIndex

        // 檢查是否已中獎
        let hasWon = false
        let wonPrize = ''

        for (let prize in state.winners) {
            if (state.winners[prize].some(w => w.barcode === emp.barcode)) {
                hasWon = true
                wonPrize =
                    state.prizes.get(parseInt(prize))?.label || `第${prize}獎`
                break
            }
        }

        const statusBadge = hasWon
            ? `<span class="employee-status-badge">✓ ${wonPrize}</span>`
            : `<span class="employee-status-empty">-</span>`

        const row = document.createElement('tr')
        if (hasWon) row.className = 'employee-row-winner'

        // === 🧼 顯示層 trim（不影響資料） ===
        row.innerHTML = `
            <td>${globalIndex + 1}</td>
            <td>${emp.barcode?.trim() || ''}</td>
            <td>${emp.department?.trim() || ''}</td>
            <td>${emp.name?.trim() || ''}</td>
            <td>${statusBadge}</td>
            <td>
                <button
                    class="employee-action-btn-edit"
                    data-action="edit"
                    data-barcode="${emp.barcode}">
                    ✏️ 編輯
                </button>
                <button
                    class="employee-action-btn-delete"
                    data-action="delete"
                    data-barcode="${emp.barcode}">
                    🗑️ 刪除
                </button>
            </td>
        `
        tbody.appendChild(row)
    })

    // 更新分頁控制
    updatePaginationControls()
}

export function bindEmployeeTableActions() {
    const tbody = document.getElementById('employeeListTableBody')
    if (!tbody) return

    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button')
        if (!btn) return

        const { action, barcode } = btn.dataset
        if (!barcode || !action) return

        if (action === 'delete') {
            deleteEmployee(barcode)
        }

        if (action === 'edit') {
            editEmployee(barcode)
        }
    })
}

export function bindPaginationActions() {
    const container = document.getElementById('employeePagination')
    if (!container) return

    // 翻頁按鈕
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('button')
        if (!btn) return

        switch (btn.dataset.page) {
            case 'first':
                paginationState.currentPage = 1
                break
            case 'prev':
                paginationState.currentPage--
                break
            case 'next':
                paginationState.currentPage++
                break
            case 'last':
                paginationState.currentPage = paginationState.totalPages
                break
            default:
                return
        }

        renderEmployeeList()
    })

    // page size
    container.addEventListener('change', (e) => {
        if (!e.target.hasAttribute('data-page-size')) return

        paginationState.pageSize = parseInt(e.target.value)
        paginationState.totalPages = Math.ceil(
            paginationState.filteredEmployees.length / paginationState.pageSize
        )
        paginationState.currentPage = 1

        renderEmployeeList()
    })
}

export function bindEditEmployeeModal() {
    const modal = document.getElementById('editEmployeeModal')
    const form = document.getElementById('editEmployeeForm')

    if (!modal || !form) return

    // 關閉（X）
    document
        .getElementById('editEmployeeCloseBtn')
        ?.addEventListener('click', () => {
            modal.style.display = 'none'
        })

    // 取消
    document
        .getElementById('editEmployeeCancelBtn')
        ?.addEventListener('click', () => {
            modal.style.display = 'none'
        })

    // 儲存（submit）
    form.addEventListener('submit', async (e) => {
        e.preventDefault()
        await saveEmployeeEdit()
    })
}

// employees.js

export function bindEmployeeListModal() {
    const modal = document.getElementById('employeeListModal')
    if (!modal) return

    // 關閉
    document
        .getElementById('employeeListCloseBtn')
        ?.addEventListener('click', () => {
            modal.style.display = 'none'
        })

    // 新增員工
    document
        .getElementById('addEmployeeBtn')
        ?.addEventListener('click', showAddEmployeeModal)
}

let paginationBound = false
export function updatePaginationControls() {
  let paginationDiv = document.getElementById('employeePagination')

  if (!paginationDiv) {
    const modalContent = document.querySelector('#employeeListModal .modal-content')

    paginationDiv = document.createElement('div')
    paginationDiv.id = 'employeePagination'
    paginationDiv.className = 'employee-pagination'

    modalContent.appendChild(paginationDiv)
  }

  const total = paginationState.filteredEmployees.length
  const start = (paginationState.currentPage - 1) * paginationState.pageSize + 1
  const end = Math.min(paginationState.currentPage * paginationState.pageSize, total)

  paginationDiv.innerHTML = `
    <div class="employee-pagination-info">
      顯示 ${start} - ${end} 筆，共 ${total} 筆
    </div>

    <div class="employee-pagination-controls">
      <button data-page="first" ${paginationState.currentPage === 1 ? 'disabled' : ''}>«</button>
      <button data-page="prev"  ${paginationState.currentPage === 1 ? 'disabled' : ''}>‹</button>

      <span class="employee-pagination-page">
        第 ${paginationState.currentPage} / ${paginationState.totalPages} 頁
      </span>

      <button data-page="next" ${paginationState.currentPage >= paginationState.totalPages ? 'disabled' : ''}>›</button>
      <button data-page="last" ${paginationState.currentPage >= paginationState.totalPages ? 'disabled' : ''}>»</button>
    </div>

    <div class="employee-pagination-size">
      <select data-page-size>
        <option value="25"  ${paginationState.pageSize === 25 ? 'selected' : ''}>25筆/頁</option>
        <option value="50"  ${paginationState.pageSize === 50 ? 'selected' : ''}>50筆/頁</option>
        <option value="100" ${paginationState.pageSize === 100 ? 'selected' : ''}>100筆/頁</option>
        <option value="200" ${paginationState.pageSize === 200 ? 'selected' : ''}>200筆/頁</option>
      </select>
    </div>
  `

  if (!paginationBound) {
    bindPaginationActions()
    paginationBound = true
  }
}

// =============================
// CRUD
// =============================
export async function deleteEmployee(barcode) {
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

export function editEmployee(barcode) {
    const employee = state.employees.get(barcode);
    if (!employee) {
        showNotification('找不到該員工', 'error');
        return;
    }

    // 填入表單
    document.getElementById('editEmployeeBarcode').value = barcode;
    // document.getElementById('editEmployeeSite').value = employee.site || '';
    document.getElementById('editEmployeeDepartment').value = employee.department || '';
    document.getElementById('editEmployeeName').value = employee.name || '';
    // document.getElementById('editEmployeeSeniority').value = employee.seniority || 0;

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
        winnerInfo.textContent = `此員工已在「${state.prizes.get(parseInt(wonPrize))?.label || `第${wonPrize}獎`}」中獎`;
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

export async function saveEmployeeEdit() {
    const barcode = normalizeInput(document.getElementById('editEmployeeBarcode').value);
    // const site = document.getElementById('editEmployeeSite').value.trim();
    const department = normalizeInput(document.getElementById('editEmployeeDepartment').value);
    const name = normalizeInput(document.getElementById('editEmployeeName').value);
    // const seniority = parseInt(document.getElementById('editEmployeeSeniority').value);
    const winnerId = document.getElementById('editEmployeeWinnerId').value;
    const removeWinner = document.getElementById('editEmployeeRemoveWinner').checked;

    if (!department || !name) {
        showNotification('請填寫所有必填欄位', 'error');
        return;
    }

    try {
        // 1. 更新員工資料
        const response = await apiFetch(`${API_BASE}/employees/${barcode}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ department, name })
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
        state.employees.set(barcode, { department, name });

        // 更新 UI
        updateUI();

        // 關閉編輯視窗
        document.getElementById('editEmployeeModal').style.display = 'none';

        // 重新載入資料並渲染員工清單
        await reloadAllData();
        showEmployeeListModal();

        showNotification(`已更新員工資料：${name}`, 'success');
    } catch (error) {
        console.error('更新員工失敗:', error);
        showNotification('更新失敗: ' + error.message, 'error');
    }
}

export function showAddEmployeeModal() {
    // 清空表單
    document.getElementById('addEmployeeBarcode').value = '';
    // document.getElementById('addEmployeeSite').value = '';
    document.getElementById('addEmployeeDepartment').value = '';
    document.getElementById('addEmployeeName').value = '';
    // document.getElementById('addEmployeeSeniority').value = '0';

    // 顯示新增視窗
    document.getElementById('addEmployeeModal').style.display = 'block';

    // 聚焦到員工編號輸入框
    setTimeout(() => {
        document.getElementById('addEmployeeBarcode').focus();
    }, 100);
}

export async function saveNewEmployee() {
    const barcode = normalizeInput(document.getElementById('addEmployeeBarcode').value);
    // const site = document.getElementById('addEmployeeSite').value.trim();
    const department = normalizeInput(document.getElementById('addEmployeeDepartment').value);
    const name = normalizeInput(document.getElementById('addEmployeeName').value);

    // const seniorityInput = document.getElementById('addEmployeeSeniority');
    // const seniorityRaw = seniorityInput.value.trim();

    // === 基本必填欄位 ===
    if (!barcode || !department || !name) {
        showNotification('請填寫所有必填欄位', 'error');
        return;
    }

    // if (seniorityRaw === "") {
    //     showNotification('請填寫年資（可填 0）', 'error');
    //     seniorityInput.focus();
    //     return;
    // }

    // const seniority = Number(seniorityRaw);

    // 防 NaN
    // if (!Number.isInteger(seniority)) {
    //     showNotification('年資必須是整數', 'error');
    //     seniorityInput.focus();
    //     return;
    // }

    // if (seniority < 0) {
    //     showNotification('年資不可為負數', 'error');
    //     seniorityInput.focus();
    //     return;
    // }

    // 檢查員工編號是否已存在
    if (state.employees.has(barcode)) {
        showNotification(`員工編號 ${barcode} 已存在！`, 'error');
        return;
    }

    try {
        const response = await apiFetch(`${API_BASE}/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, department, name })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || '新增失敗');
        }

        // 更新本地狀態（這裡現在一定是合法數字）
        state.employees.set(barcode, { department, name });

        updateUI();

        document.getElementById('addEmployeeModal').style.display = 'none';

        paginationState.allEmployees = Array.from(state.employees.entries())
            .map(([barcode, data]) => ({
                barcode,
                // site: data.site,
                department: data.department,
                name: data.name,
                // seniority: data.seniority
            }))
            .sort((a, b) => a.barcode.localeCompare(b.barcode));

        paginationState.filteredEmployees = paginationState.allEmployees;
        paginationState.totalPages = Math.ceil(
            paginationState.filteredEmployees.length / paginationState.pageSize
        );

        document.getElementById('modalTotalEmployees').textContent = state.employees.size;

        renderEmployeeList();

        showNotification(`已新增員工：${name}`, 'success');
    } catch (error) {
        console.error('新增員工失敗:', error);
        showNotification('新增失敗: ' + error.message, 'error');
    }
}

async function importExcelFile(file) {
    try {
        const buffer = await file.arrayBuffer()


        const response = await apiFetch(`${API_BASE}/employees/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Import-Format': 'xlsx'
            },
            body: buffer
        })


        const contentType = response.headers.get('content-type') || ''
        let result


        if (contentType.includes('application/json')) {
            result = await response.json()
        } else {
            const text = await response.text()
            throw new Error(text || '後端回傳格式錯誤（非 JSON）')
        }


        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Excel 匯入失敗')
        }


        await loadEmployeesFromAPI()
        updateUI()


        showNotification(`✅ ${result.message || 'Excel 匯入成功'}`, 'success')
    } catch (err) {
        console.error('Excel 匯入失敗:', err)
        showNotification('❌ Excel 匯入失敗：' + err.message, 'error')
    }
}

// =============================
// Import / Manual
// =============================
export function loadEmployeeData() {
    const input = document.getElementById('fileInput')
    input.value = ''
    input.click()

    input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return

        const validationError = validateEmployeeFile(file)
        if (validationError) {
            showNotification(validationError, 'error')
            input.value = ''
            return
        }

        // ✅ Excel 專用路徑
        if (file.name.toLowerCase().endsWith('.xlsx')) {
            await importExcelFile(file)
            return
        }

        // ⬇️ 原本 CSV / JSON 邏輯，完全不動
        attemptFileRead(file, 'UTF-8')
    }
}



export function openManualModal() {
    document.getElementById('manualModal').style.display = 'block';
    document.getElementById('manualBarcode').focus();
}

// employees.js
export function handleManualAdd(e) {
    e.preventDefault()

    const form = e.currentTarget
    const barcode = normalizeInput(form.elements.barcode?.value)

    if (!barcode) {
        showNotification('請輸入 Barcode', 'warning')
        return
    }

    // ✅ 不再直接處理中獎
    document.dispatchEvent(
        new CustomEvent('manual-barcode', { detail: barcode })
    )

    form.reset()
    document.getElementById('manualModal').style.display = 'none'
}

export function validateEmployeeFile(file) {
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
    const allowedExtensions = ['.json', '.csv', '.xlsx']
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
        return '❌ 不支援的檔案格式，請使用 .json、.csv 或 .xlsx 檔案';
    }

    // 5. 檢查 MIME type
    const allowedMimeTypes = [
        'application/json',
        'text/csv',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ''
    ]

    if (file.type && !allowedMimeTypes.includes(file.type)) {
        return `❌ 檔案類型不正確：${file.type}`;
    }

    return null; // 無錯誤
}

export function attemptFileRead(file, encoding) {
    const reader = new FileReader();

    reader.onload = async (event) => {
        try {
            let content = event.target.result;
            content = content.replace(/\u3000/g, ' ');

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

export function detectGarbledText(text) {
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