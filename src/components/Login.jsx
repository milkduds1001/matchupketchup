import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import logo from '../assets/matchupketchup_logo_mark.png'
import './Login.css'

export default function Login({ onBack, onSuccess } = {}) {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const result = mode === 'login' ? login(email, password) : signup(email, password)
    if (result.error) {
      setError(result.error)
      return
    }
    onSuccess?.()
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {onBack && (
          <button type="button" className="login-back" onClick={onBack}>
            ← Back to home
          </button>
        )}
        <div className="login-logo-wrap" aria-hidden="true">
          <img src={logo} alt="" className="login-logo" />
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              required
              autoComplete="email"
            />
          </label>
          <label className="login-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 6 : 1}
            />
          </label>
          {mode === 'signup' && (
            <p className="login-hint">Use at least 6 characters for your password.</p>
          )}
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="login-btn">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="login-toggle"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'signup' : 'login'))
            setError('')
          }}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
