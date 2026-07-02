import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const STUDENT_DOMAIN = 'students.classpoint.app'
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/

export type Role = 'instructor' | 'student'

export interface ClaimInput {
  token: string
  username: string
  pin: string
  displayName?: string
}

interface AuthContextValue {
  loading: boolean
  session: Session | null
  user: User | null
  role: Role | null
  signInStudent: (username: string, pin: string) => Promise<{ error?: string }>
  signInInstructor: (email: string, password: string) => Promise<{ error?: string }>
  claim: (input: ClaimInput) => Promise<{ error?: string }>
  resetPin: (token: string, pin: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${STUDENT_DOMAIN}`
}

function isStudentEmail(email: string | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${STUDENT_DOMAIN}`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  // Guard against out-of-order role resolutions from rapid auth changes.
  const resolveSeq = useRef(0)

  const resolveRole = useCallback(async (next: Session | null) => {
    const seq = ++resolveSeq.current
    if (!next?.user) {
      if (seq === resolveSeq.current) setRole(null)
      return
    }
    if (isStudentEmail(next.user.email)) {
      if (seq === resolveSeq.current) setRole('student')
      return
    }
    // Non-student email: confirm instructor against the allowlist.
    const { data } = await supabase.rpc('is_instructor')
    if (seq === resolveSeq.current) setRole(data === true ? 'instructor' : null)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await resolveRole(data.session)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void resolveRole(next)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [resolveRole])

  const signInStudent = useCallback(async (username: string, pin: string) => {
    if (!USERNAME_RE.test(username.trim().toLowerCase())) {
      return { error: 'Enter a valid username.' }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: pin,
    })
    if (error) return { error: 'Wrong username or PIN.' }
    return {}
  }, [])

  const signInInstructor = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return { error: 'Wrong email or password.' }
    const { data: ok } = await supabase.rpc('is_instructor')
    if (ok !== true) {
      await supabase.auth.signOut()
      return { error: 'This account is not an instructor.' }
    }
    return {}
  }, [])

  const claim = useCallback(
    async ({ token, username, pin, displayName }: ClaimInput) => {
      const { data, error } = await supabase.functions.invoke('claim-token', {
        body: { token, username, pin, display_name: displayName ?? null },
      })
      if (error) {
        // Surface the real cause for debugging (usually: function not deployed,
        // or JWT verification still ON so the unauthenticated caller is rejected).
        // eslint-disable-next-line no-console
        console.error('[claim-token] invoke failed:', error)
        return { error: "Couldn't reach the claim service. Ask your instructor to check setup." }
      }
      if (!data?.ok) return { error: (data?.error as string) ?? 'Something went wrong.' }
      // Auto sign-in with the freshly created credentials.
      return signInStudent(username, pin)
    },
    [signInStudent],
  )

  const resetPin = useCallback(
    async (token: string, pin: string) => {
      const { data, error } = await supabase.functions.invoke('reset-pin', {
        body: { token: token.trim(), pin },
      })
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[reset-pin] invoke failed:', error)
        return { error: "Couldn't reach the reset service. Ask your instructor to check setup." }
      }
      if (!data?.ok) return { error: (data?.error as string) ?? 'Something went wrong.' }
      // Sign in with the freshly set PIN using the username the function returned.
      const username = data.username as string | undefined
      if (!username) return { error: 'Reset succeeded — please sign in with your new PIN.' }
      return signInStudent(username, pin)
    },
    [signInStudent],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      signInStudent,
      signInInstructor,
      claim,
      resetPin,
      signOut,
    }),
    [loading, session, role, signInStudent, signInInstructor, claim, resetPin, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
