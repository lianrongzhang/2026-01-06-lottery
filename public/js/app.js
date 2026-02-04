// app.js
import { 
  ADMIN_TOKEN_KEY, 
  lockUI, 
  registerAdminUnlockHandler, 
  confirmAdminTokenFromLock
} from "./auth.js"
import { state } from "./state.js"

import { reloadAllData } from "./dataSync.js"
import { UI_EVENTS } from "./uiEvents.js"

const DISPLAY_MODE_VALUES = new Set(["1", "true", "yes", "on"])
const displayParam = new URLSearchParams(window.location.search).get("display")
const isDisplayMode =
  displayParam !== null &&
  (displayParam === "" || DISPLAY_MODE_VALUES.has(displayParam.toLowerCase()))

if (isDisplayMode) {
  document.body.classList.add("display-mode")
  window.__DISPLAY_MODE__ = true
}
const DISPLAY_LAST_WINNER_KEY = "display_last_winner_ts"
const PRIZES_SNAPSHOT_KEY = "prizes_snapshot"
const WINNERS_SNAPSHOT_KEY = "winners_snapshot"
const WINNER_EVENT_KEY = "winner_event"
const WINNER_CLOSE_EVENT_KEY = "winner_close_event"
const CURRENT_PRIZE_KEY = "current_prize"
const WINNERS_BG_KEY = "winners_bg_image"
const DISPLAY_OPENED_AT_KEY = "display_opened_at"
const DISPLAY_SESSION_START_KEY = "display_session_start"

// === winners ===
import {
  handleBarcodeInput,
  handlePrizeChange,
  exportWinners,
  clearAllData,
} from "./winners.js"

// === employees ===
import {
  loadEmployeeData,
  openManualModal,
  handleManualAdd,
  bindEmployeeTableActions,
  bindPaginationActions,
  bindEditEmployeeModal,
  bindEmployeeListModal,
  saveNewEmployee
} from "./employees.js"

// === prizes ===
import {
  loadPrizesFromAPI,
  renderPrizeSelector,
  openPrizeEditor,
  savePrizeConfig
} from "./prizes.js"

// === ui ===
import {
  updateUI,
  displayWinner,
  showEmployeeListModal,
  filterEmployeeList,
  closePrizeEditor,
  showNotification
} from "./ui.js"

// =============================
// App Initialization
// =============================
export function initializeApp() {
  // === 基本操作 ===
  document.getElementById('barcodeInput')?.addEventListener('keypress', handleBarcodeInput)
  document.getElementById('currentPrize')?.addEventListener('change', handlePrizeChange)
  document.getElementById('loadDataBtn')?.addEventListener('click', loadEmployeeData)
  document.getElementById('exportBtn')?.addEventListener('click', exportWinners)
  document.getElementById('clearBtn')?.addEventListener('click', clearAllData)
  document.getElementById('manualAddBtn')?.addEventListener('click', openManualModal)
  document.getElementById('editPrizeBtn')?.addEventListener('click', openPrizeEditor)
  document.getElementById('openDisplayBtn')?.addEventListener('click', () => {
    const displayUrl = new URL(window.location.href)
    displayUrl.searchParams.set('display', '1')
    try {
      localStorage.setItem(DISPLAY_OPENED_AT_KEY, String(Date.now()))
      localStorage.removeItem(WINNER_EVENT_KEY)
    } catch {}
    window.open(displayUrl.toString(), '_blank', 'noopener,noreferrer')
  })
  document.getElementById('uploadDisplayBackgroundBtn')?.addEventListener('click', () => {
    document.getElementById('winnerBgInput')?.click()
  })
  document.getElementById('winnerBgInput')?.addEventListener('change', async (e) => {
    const target = e.target
    const file = target?.files?.[0]
    if (!file) return
    await uploadWinnersBackground(file)
    target.value = ""
  })

  // === Manual Modal ===
  document.getElementById('manualForm')?.addEventListener('submit', handleManualAdd)
  document.getElementById('manualModalCloseBtn')?.addEventListener('click', () => { document.getElementById('manualModal').style.display = 'none' })
  document.getElementById('manualModalCancelBtn')?.addEventListener('click', () => { document.getElementById('manualModal').style.display = 'none' })

  // === 員工清單 ===
  document.getElementById('employeeStatsCard')?.addEventListener('click', showEmployeeListModal)

  document.getElementById('employeeSearchInput')?.addEventListener('input', filterEmployeeList)

  // === 獎項編輯 ===
  document.getElementById('editPrizeForm')?.addEventListener('submit', savePrizeConfig)

  // === Winner Modal ===
  document.getElementById('closeWinnerModal')?.addEventListener('click', () => {
    document.getElementById('winnerModal').style.display = 'none'
    try {
      localStorage.setItem(
        WINNER_CLOSE_EVENT_KEY,
        JSON.stringify({ ts: Date.now() })
      )
    } catch {}
    document.getElementById('barcodeInput')?.focus()
  })

  // === 離開提醒 ===
  window.addEventListener('beforeunload', (e) => {
    const total = Object.values(state.winners)
      .reduce((sum, arr) => sum + arr.length, 0)

    if (total > 0) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
  const input = document.getElementById('adminLockTokenInput')
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      confirmAdminTokenFromLock()
    }
  })

  document.getElementById('addEmployeeCloseBtn')?.addEventListener('click', () => {
    document.getElementById('addEmployeeModal').style.display = 'none'
  })

  document.getElementById('addEmployeeCancelBtn')?.addEventListener('click', () => {
    document.getElementById('addEmployeeModal').style.display = 'none'
  })

  document.getElementById('editPrizeCloseBtn')?.addEventListener('click', closePrizeEditor)

  // === 初始 focus ===
  if (!isDisplayMode) {
    document.getElementById('barcodeInput')?.focus()
  }

  // === 員工清單操作綁定 ===
  bindEmployeeTableActions()
  bindPaginationActions()
  bindEditEmployeeModal()
  bindEmployeeListModal()
}

function applyPrizesSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) return
  state.prizes.clear()
  snapshot.forEach(([id, prize]) => {
    if (!prize) return
    state.prizes.set(parseInt(id), prize)
  })
}

function normalizeWinnersSnapshot(snapshot) {
  const base = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
  if (!snapshot || typeof snapshot !== "object") return base
  for (let prize = 1; prize <= 6; prize++) {
    if (Array.isArray(snapshot[prize])) {
      base[prize] = snapshot[prize]
    }
  }
  return base
}

function applyWinnersSnapshot(snapshot) {
  state.winners = normalizeWinnersSnapshot(snapshot)
}

function applyWinnersBackground(version) {
  const section = document.querySelector(".winners-section")
  if (!section) return
  if (version) {
    const cacheBuster = encodeURIComponent(version)
    section.style.backgroundImage = `url("BG003_1.jpg?v=${cacheBuster}")`
    section.style.backgroundSize = "100% 100%"
    section.style.backgroundPosition = "center"
    return
  }
  section.style.removeProperty("background-image")
  section.style.removeProperty("background-size")
  section.style.removeProperty("background-position")
}

function loadWinnersBackgroundFromStorage() {
  try {
    const version = localStorage.getItem(WINNERS_BG_KEY)
    if (version && version.startsWith("data:")) {
      localStorage.removeItem(WINNERS_BG_KEY)
      applyWinnersBackground("")
      return
    }
    applyWinnersBackground(version || "")
  } catch {}
}

async function uploadWinnersBackground(file) {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY)
  if (!token) {
    showNotification("請先解鎖管理員", "warning")
    return
  }

  const formData = new FormData()
  formData.append("image", file)

  try {
    const res = await fetch("/api/winners/background", {
      method: "POST",
      headers: { "X-Admin-Token": token },
      body: formData,
    })

    if (!res.ok) {
      let message = "上傳失敗"
      try {
        const payload = await res.json()
        if (payload?.error) message = payload.error
      } catch {}
      showNotification(message, "error")
      return
    }

    const payload = await res.json()
    const version = payload?.data?.updatedAt
      ? String(payload.data.updatedAt)
      : String(Date.now())
    applyWinnersBackground(version)
    try {
      localStorage.setItem(WINNERS_BG_KEY, version)
    } catch {}
    showNotification("背景已更新", "success")
  } catch {
    showNotification("上傳失敗", "error")
  }
}

function loadSnapshotsFromStorage() {
  try {
    const prizesRaw = localStorage.getItem(PRIZES_SNAPSHOT_KEY)
    if (prizesRaw) {
      applyPrizesSnapshot(JSON.parse(prizesRaw))
    }
  } catch {}

  try {
    const winnersRaw = localStorage.getItem(WINNERS_SNAPSHOT_KEY)
    if (winnersRaw) {
      applyWinnersSnapshot(JSON.parse(winnersRaw))
    }
  } catch {}

  try {
    const currentPrizeRaw = localStorage.getItem(CURRENT_PRIZE_KEY)
    const parsed = parseInt(currentPrizeRaw, 10)
    if (Number.isFinite(parsed)) {
      state.currentPrize = parsed
    }
  } catch {}
}

function maybeDisplayWinnerFromEvent(eventPayload) {
  if (!eventPayload) return
  const lastTs = parseInt(sessionStorage.getItem(DISPLAY_LAST_WINNER_KEY) || "0", 10)
  const ts = parseInt(eventPayload.ts || "0", 10)
  if (!Number.isFinite(ts) || ts <= lastTs) return
  sessionStorage.setItem(DISPLAY_LAST_WINNER_KEY, String(ts))
  displayWinner(eventPayload.winner, eventPayload.prize)
}

function initDisplayModeSync() {
  loadSnapshotsFromStorage()
  loadWinnersBackgroundFromStorage()
  updateUI()
  try {
    const openedAt =
      parseInt(localStorage.getItem(DISPLAY_OPENED_AT_KEY) || "0", 10) || Date.now()
    sessionStorage.setItem(DISPLAY_SESSION_START_KEY, String(openedAt))
    sessionStorage.setItem(DISPLAY_LAST_WINNER_KEY, String(openedAt))
    localStorage.removeItem(WINNER_EVENT_KEY)
  } catch {}

  window.addEventListener("storage", (e) => {
    if (!e.key) return

    if (e.key === PRIZES_SNAPSHOT_KEY || e.key === WINNERS_SNAPSHOT_KEY) {
      loadSnapshotsFromStorage()
      updateUI()
      return
    }

    if (e.key === WINNER_EVENT_KEY && e.newValue) {
      loadSnapshotsFromStorage()
      updateUI()
      try {
        const payload = JSON.parse(e.newValue)
        maybeDisplayWinnerFromEvent(payload)
      } catch {}
      return
    }

    if (e.key === WINNERS_BG_KEY) {
      loadWinnersBackgroundFromStorage()
      return
    }

    if (e.key === CURRENT_PRIZE_KEY && e.newValue) {
      const parsed = parseInt(e.newValue, 10)
      if (Number.isFinite(parsed)) {
        state.currentPrize = parsed
        updateUI()
      }
      return
    }

    if (e.key === WINNER_CLOSE_EVENT_KEY && e.newValue) {
      const modal = document.getElementById('winnerModal')
      if (modal) modal.style.display = 'none'
    }
  })

}

// =============================
// After Admin Unlock
// =============================
let isAdminInitialized = false

export async function afterAdminUnlocked({ force = false } = {}) {
  if (isAdminInitialized && !force) return
  isAdminInitialized = true

  await loadPrizesFromAPI()
  renderPrizeSelector()
  await reloadAllData()
  updateUI()
}

registerAdminUnlockHandler(afterAdminUnlocked)

// =============================
// DOM Ready
// =============================
document.addEventListener('DOMContentLoaded', async () => {
  // 🔐 admin unlock
  document.getElementById("adminLockConfirmBtn")?.addEventListener("click", confirmAdminTokenFromLock)

  initializeApp()
  loadWinnersBackgroundFromStorage()
  const addEmployeeForm = document.getElementById('addEmployeeForm')
  addEmployeeForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  await saveNewEmployee()
  })

  if (isDisplayMode) {
    initDisplayModeSync()
    return
  }

  if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) {
    lockUI()
    return
  }

  await afterAdminUnlocked()
})

document.addEventListener(UI_EVENTS.OPEN_MANUAL_MODAL, () => {
  document.getElementById('manualModal').style.display = 'block'
  document.getElementById('manualBarcode')?.focus()
})

