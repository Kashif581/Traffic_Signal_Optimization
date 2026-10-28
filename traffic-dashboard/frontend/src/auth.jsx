import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, hasAdmin: true, user: null, error: null })

  const refresh = useCallback(async () => {
    try {
      const s = await api.status()
      setState({ loading: false, hasAdmin: s.hasAdmin, user: s.user, error: null })
    } catch (e) {
      setState((p) => ({ ...p, loading: false, error: 'Cannot reach the server. Is server.py running?' }))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const signUp = useCallback(async (body) => {
    const r = await api.signup(body)
    setState({ loading: false, hasAdmin: true, user: r.user, error: null })
  }, [])

  const signIn = useCallback(async (body) => {
    const r = await api.signin(body)
    setState((p) => ({ ...p, user: r.user }))
  }, [])

  const signOut = useCallback(async () => {
    try { await api.signout() } catch { /* ignore */ }
    setState((p) => ({ ...p, user: null }))
  }, [])

  const value = useMemo(() => ({ ...state, signUp, signIn, signOut, refresh }), [state, signUp, signIn, signOut, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
