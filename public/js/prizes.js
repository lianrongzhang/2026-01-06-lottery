// prizes.js
import { apiFetch } from "./api.js"
import { state } from "./state.js"
import { updateUI, showNotification } from "./ui.js"

const PRIZES_SNAPSHOT_KEY = "prizes_snapshot"

function persistPrizesSnapshot() {
  try {
    localStorage.setItem(
      PRIZES_SNAPSHOT_KEY,
      JSON.stringify(Array.from(state.prizes.entries()))
    )
  } catch {}
}

// =============================
// Load Prizes
// =============================
export async function loadPrizesFromAPI() {
  try {
    const response = await apiFetch("/api/prizes")
    const result = await response.json()

    if (!response.ok || !result.success) {
      throw new Error(result.error || "載入獎項失敗")
    }

    state.prizes.clear()
    result.data.forEach(prize => {
      state.prizes.set(prize.id, {
        label: prize.label,
        item: prize.item, 
      })
    })

    persistPrizesSnapshot()

    console.log(`🎁 載入 ${state.prizes.size} 個獎項設定`)
  } catch (err) {
    console.error("載入獎項失敗:", err)
    showNotification("載入獎項設定失敗", "error")
  }
}

// =============================
// Prize Selector
// =============================
export function renderPrizeSelector() {
  const select = document.getElementById("currentPrize")
  if (!select) return

  const current = state.currentPrize
  select.innerHTML = ""

  Array.from(state.prizes.entries()).forEach(([id, prize]) => {
    const opt = document.createElement("option")
    opt.value = id
    opt.textContent = prize.label
    if (parseInt(id) === current) opt.selected = true
    select.appendChild(opt)
  })
}

// =============================
// Prize Editor
// =============================
export function openPrizeEditor() {
  const container = document.getElementById("prizeEditList")
  container.innerHTML = ""

  Array.from(state.prizes.entries()).forEach(([id, prize]) => {
    const div = document.createElement("div")
    div.className = "form-group"
    div.dataset.id = id   // ⭐ 關鍵：ID 掛在 group 上

    div.innerHTML = `
      <label>${prize.label}</label>

      <input
        type="text"
        class="prize-item-input"
        value="${prize.item || ""}"
        placeholder="獎品名稱"
      >
    `

    container.appendChild(div)
  })

  document.getElementById("editPrizeModal").style.display = "block"
}

export function closePrizeEditor() {
  document.getElementById("editPrizeModal").style.display = "none"
}

// =============================
// Save Prize Config
// =============================
export async function savePrizeConfig(e) {
  e.preventDefault()

  const payload = []

  document.querySelectorAll("#prizeEditList .form-group").forEach(group => {
    const id = parseInt(group.dataset.id)
    const prize = state.prizes.get(id)
    if (!prize) return

    const itemInput = group.querySelector(".prize-item-input")

    const item = itemInput?.value.trim() || ""

    payload.push({
      id,
      label: prize.label,
      item,
    })
  })

  try {
    const res = await apiFetch("/api/prizes/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    const result = await res.json()
    if (!res.ok || !result.success) {
      throw new Error(result.error || "儲存失敗")
    }

    await loadPrizesFromAPI()
    renderPrizeSelector()
    updateUI()
    closePrizeEditor()

    showNotification("✅ 獎項設定已儲存到系統", "success")
  } catch (err) {
    console.error(err)
    showNotification("❌ 儲存獎項設定失敗", "error")
  }
}
