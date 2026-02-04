// state.js
export const state = {
  employees: new Map(),
  winners: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
  prizes: new Map(),
  currentPrize: 1
}

export const paginationState = {
  allEmployees: [],
  filteredEmployees: [],
  currentPage: 1,
  pageSize: 50,
  totalPages: 1
}