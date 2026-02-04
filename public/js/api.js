// api.js
import { ADMIN_TOKEN_KEY, lockUI } from "./auth.js"

export const API_BASE = "/api"

// =============================
// Unified API Fetch
// =============================
export async function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY)

  options.headers = options.headers || {}

  if (token) {
    options.headers["X-Admin-Token"] = token
  }

  const res = await fetch(url, options)

  // 🔐 統一處理權限失效
  if (res.status === 403) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    const isDisplayMode =
      window.__DISPLAY_MODE__ === true ||
      document.body?.classList.contains("display-mode")
    if (!isDisplayMode) {
      lockUI()
    }
    throw new Error("Unauthorized")
  }

  return res
}
