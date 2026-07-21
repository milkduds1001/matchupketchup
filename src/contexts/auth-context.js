/**
 * The raw React context object for auth state.
 *
 * Split into its own file (separate from AuthProvider in AuthContext.jsx and
 * the useAuth hook in useAuth.js) because React Fast Refresh only preserves
 * component state in files that export exclusively components. Keeping the
 * context object and hook in non-component files lets AuthContext.jsx hot-reload
 * safely during development.
 */
import { createContext } from 'react'

export const AuthContext = createContext(null)
