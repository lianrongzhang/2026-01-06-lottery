// dataSync.js
import { loadEmployeesFromAPI } from "./employees.js"
import { loadWinnersFromAPI } from "./winners.js"

export async function reloadAllData() {
  await loadEmployeesFromAPI()
  await loadWinnersFromAPI()
}