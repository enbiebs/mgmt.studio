'use client'
// ──────────────────────────────────────────────────────────
//  Login / Signup Page
//  Matches the Studio design aesthetic.
//  Supports: email+password login, signup, and magic link.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup' | 'magic' | 'reset'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // Created here, not at render time — Next.js statically prerenders this
    // page at build time, when Supabase env vars may not be present (e.g.
    // a demo-mode deployment). Calling createClient() during render throws
    // in that case and crashes the build.
    const supabase = createClient()
    setMessage(null)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/'
      }

      else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { workspace_name: workspaceName || email.split('@')[0] },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (error) throw error
        setMessage({ text: 'Check your email to confirm your account.', type: 'success' })
      }

      else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) throw error
        setMessage({ text: 'Magic link sent — check your email.', type: 'success' })
      }

      else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
        })
        if (error) throw error
        setMessage({ text: 'Password reset link sent — check your email.', type: 'success' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setMessage({ text: msg, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="font-serif font-semibold text-2xl tracking-tight mb-1">Mgmt Studio</div>
        <div className="text-sm text-gray-400">Music Management OS</div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Mode tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {([['login', 'Sign in'], ['signup', 'Create account'], ['magic', 'Magic link']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setMessage(null) }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === m ? 'bg-gray-900 text-canvas shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'reset' && (
          <p className="text-xs text-gray-400 mb-3 -mt-2">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Workspace name (signup only) */}
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Company / workspace name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                placeholder="e.g. Mascolo Management"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Password (not for magic link or password reset) */}
          {mode !== 'magic' && mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('reset'); setMessage(null) }}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Choose a strong password' : '••••••••'}
                required
                minLength={6}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Status message */}
          {message && (
            <div className={`text-xs px-3 py-2.5 rounded-xl ${
              message.type === 'error'
                ? 'bg-red-50 text-red-600'
                : 'bg-green-50 text-green-700'
            }`}>
              {message.text}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-canvas py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? 'Loading…' : (
              mode === 'login'  ? 'Sign in' :
              mode === 'signup' ? 'Create account' :
              mode === 'reset'  ? 'Send reset link' :
              'Send magic link'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          {mode === 'login'
            ? <>No account? <button className="text-blue-500 hover:underline" onClick={() => setMode('signup')}>Sign up</button></>
            : <>Have an account? <button className="text-blue-500 hover:underline" onClick={() => setMode('login')}>Sign in</button></>
          }
        </p>
      </div>

      {/* Footer */}
      <div className="mt-12 text-[10px] uppercase tracking-widest text-gray-300">
        Mgmt Studio · Music Management · v0.1
      </div>
    </div>
  )
}
