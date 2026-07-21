/**
 * Hook to read the current auth state/actions (user, login, signup, logout).
 * Lives in its own file, separate from the context object (auth-context.js)
 * and the AuthProvider component (AuthContext.jsx), so that Fast Refresh can
 * hot-reload the provider component without losing state — see auth-context.js.
 */
import { useContext } from 'react'
import { AuthContext } from './auth-context.js'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
