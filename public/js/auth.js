// auth.js
export const ADMIN_TOKEN_KEY = "ADMIN_TOKEN"

// 🔑 管理者解鎖後的 callback（由 app.js 註冊）
let onAdminUnlocked = null

export function registerAdminUnlockHandler(fn) {
  onAdminUnlocked = fn
}

// =============================
// Fullscreen Lock UI
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
// Token Confirm (Lock Screen)
// =============================
export async function confirmAdminTokenFromLock() {
  const input = document.getElementById("adminLockTokenInput")
  const error = document.getElementById("adminLockError")
  const token = input.value.trim()

  error.style.display = "none"

  if (!token) {
    error.textContent = "請輸入管理金鑰"
    error.style.display = "block"
    return
  }

  try {
    const res = await fetch("/api/admin/verify", {
      headers: { "X-Admin-Token": token }
    })

    if (!res.ok) throw new Error("INVALID_TOKEN")

    sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
    unlockUI()

    // ⭐ 關鍵：只「通知」，不管後續做什麼
    await onAdminUnlocked?.({ force: true })

  } catch {
    error.textContent = "金鑰錯誤，請重新輸入"
    error.style.display = "block"
  }
}

// =============================
// Token Modal
// =============================
let isAdminModalOpen = false

export function openAdminTokenModal() {
  if (isAdminModalOpen) return
  isAdminModalOpen = true
  document.getElementById("adminTokenModalInput").value = ""
  document.getElementById("adminTokenModalError").style.display = "none"
  document.getElementById("adminTokenModal").style.display = "block"
}

export function closeAdminTokenModal() {
  document.getElementById("adminTokenModal").style.display = "none"
  isAdminModalOpen = false
}

export async function confirmAdminToken() {
  const token = document.getElementById("adminTokenModalInput").value.trim()
  if (!token) return

  try {
    const res = await fetch("/api/admin/verify", {
      headers: { "X-Admin-Token": token }
    })

    if (!res.ok) throw new Error("INVALID_TOKEN")

    sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
    closeAdminTokenModal()

    // ⭐ 同樣只通知
    await onAdminUnlocked?.({ force: true })

  } catch {
    document.getElementById("adminTokenModalError").style.display = "block"
  }
}