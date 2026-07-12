import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AuthContext } from './authContext'

/**
 * AuthProvider — Context Provider untuk autentikasi dan profil user.
 *
 * Menyediakan state berikut ke seluruh komponen dalam tree melalui AuthContext:
 * - session      : Sesi Supabase Auth yang aktif (null jika belum login)
 * - profile      : Data profil user dari tabel 'users' (id, fullName, username, role)
 * - loading      : true saat mengecek status sesi awal
 * - loadingProfile: true saat memuat data profil dari database
 * - refreshProfile: fungsi untuk memuat ulang data profil
 *
 * Behavior penting:
 * - Jika akun staff di-nonaktifkan (is_active = false), langsung sign out otomatis
 * - Setiap login berhasil dicatat ke tabel 'login_logs' untuk audit trail
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(true)
  // Ref untuk mencegah pencatatan login_log duplikat saat re-render
  const lastLoggedUser = useRef(null)

  // Effect 1: Inisialisasi sesi auth dan subscribe perubahan state auth
  useEffect(() => {
    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data.session ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        setSession(null)
        setLoading(false)
      })

    // Listener perubahan auth (login, logout, token refresh)
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
    })

    return () => {
      mounted = false
      data?.subscription?.unsubscribe()
    }
  }, [])

  // Effect 2: Fetch profil user dari tabel 'users' setiap kali sesi berubah
  useEffect(() => {
    let mounted = true
    if (!session?.user?.id) {
      queueMicrotask(() => {
        if (!mounted) return
        setProfile(null)
        setLoadingProfile(false)
      })
      return () => {}
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingProfile(true)
    supabase
      .from('users')
      .select('id, full_name, username, role:roles(name), is_active')
      .eq('auth_user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          setProfile(null)
          setLoadingProfile(false)
          return
        }
        if (!data.is_active) {
          // Staff account deactivated — sign out immediately
          setProfile(null)
          setLoadingProfile(false)
          supabase.auth.signOut()
          return
        }
        setProfile({
          id: data.id,
          fullName: data.full_name,
          username: data.username,
          role: data.role?.name ?? 'staff',
        })
        setLoadingProfile(false)
      })

    return () => {
      mounted = false
    }
  }, [session])

  // Effect 3: Catat event SIGNED_IN ke tabel 'login_logs' saat profil pertama kali dimuat
  useEffect(() => {
    if (!profile?.id) return
    if (lastLoggedUser.current === profile.id) return // Cegah duplikat log
    lastLoggedUser.current = profile.id
    ;(async () => {
      const { error } = await supabase
        .from('login_logs')
        .insert({ event: 'SIGNED_IN', user_id: profile.id })
      if (error) {
        console.error('Gagal insert login_logs:', error.message)
      }
    })()
  }, [profile?.id])

  /**
   * Memuat ulang data profil user dari database Supabase.
   * Dipanggil setelah update data staff agar UI langsung ter-refresh.
   * Jika akun di-nonaktifkan saat ini aktif, akan otomatis sign out.
   */
  const refreshProfile = async () => {
    if (!session?.user?.id) return
    setLoadingProfile(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, username, role:roles(name), is_active')
        .eq('auth_user_id', session.user.id)
        .single()
      if (!error && data) {
        if (!data.is_active) {
          setProfile(null)
          supabase.auth.signOut()
        } else {
          setProfile({
            id: data.id,
            fullName: data.full_name,
            username: data.username,
            role: data.role?.name ?? 'staff',
          })
        }
      }
    } catch (err) {
      console.error('Error refreshing profile:', err)
    } finally {
      setLoadingProfile(false)
    }
  }

  // Memoize value agar tidak trigger re-render yang tidak perlu
  const value = useMemo(
    () => ({ session, profile, loading, loadingProfile, refreshProfile }),
    [session, profile, loading, loadingProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
