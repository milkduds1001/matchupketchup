import { useState } from 'react'
import { AuthContext } from './auth-context.js'

const STORAGE_USERS = 'mtg-users'
const STORAGE_CURRENT = 'mtg-current-user'

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_CURRENT)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data?.id && data?.email) return data
    return null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser())

  function login(email, password) {
    const users = getUsers()
    const found = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase().trim() && u.password === password
    )
    if (!found) return { error: 'Invalid email or password' }
    const current = { id: found.id, email: found.email }
    setUser(current)
    try {
      localStorage.setItem(STORAGE_CURRENT, JSON.stringify(current))
    } catch {
      // localStorage may be unavailable (private mode, quota)
    }
    return {}
  }

  function signup(email, password) {
    const trimmed = String(email).trim().toLowerCase()
    if (!trimmed || !password) return { error: 'Email and password are required' }
    const users = getUsers()
    if (users.some((u) => u.email.toLowerCase() === trimmed)) return { error: 'Email already in use' }
    const id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
    const newUser = { id, email: trimmed, password }
    users.push(newUser)
    try {
      localStorage.setItem(STORAGE_USERS, JSON.stringify(users))
    } catch {
      return { error: 'Could not save account' }
    }
    const current = { id: newUser.id, email: newUser.email }
    setUser(current)
    localStorage.setItem(STORAGE_CURRENT, JSON.stringify(current))
    return {}
  }

  function logout() {
    setUser(null)
    try {
      localStorage.removeItem(STORAGE_CURRENT)
    } catch {
      // localStorage may be unavailable (private mode, quota)
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

function getUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
