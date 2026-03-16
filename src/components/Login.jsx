import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import logo from '../assets/matchupketchup_logo.svg'
import './Login.css'

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const result = mode === 'login' ? login(email, password) : signup(email, password)
    if (result.error) setError(result.error)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logo} alt="MatchupKetchup" className="login-logo" />
        <h1 className="login-title">MatchupKetchup</h1>
        <p className="login-subtitle">Sign in or create an account to manage decklists and metagames.</p>

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
