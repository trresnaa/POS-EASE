import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useAuth } from '../app/useAuth'

const INACTIVE_ERROR_KEY = 'login_inactive_error'

export default function Login() {
  const navigate = useNavigate()
  const { session, profile, loadingProfile } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    // Baca pesan error akun nonaktif yang disimpan sebelum signOut
    const saved = sessionStorage.getItem(INACTIVE_ERROR_KEY)
    if (saved) {
      sessionStorage.removeItem(INACTIVE_ERROR_KEY)
      return saved
    }
    return ''
  })

  useEffect(() => {
    if (session && !loadingProfile && profile) {
      if (profile.role === 'owner') {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/pos', { replace: true })
      }
    }
  }, [navigate, session, profile, loadingProfile])

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    let finalEmail = username.trim()
    if (!finalEmail.includes('@')) {
      finalEmail = `${finalEmail}@ease.local`
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: finalEmail, password })
    if (signInError) {
      const msg = signInError.message?.toLowerCase() ?? ''
      if (msg.includes('invalid login credentials') || msg.includes('invalid email or password') || msg.includes('email not confirmed')) {
        setError('Username atau password salah.')
      } else {
        setError('Gagal masuk. Silakan coba lagi.')
      }
      setLoading(false)
      return
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role:roles(name), is_active')
      .eq('auth_user_id', signInData.user.id)
      .single()

    if (!userData?.is_active) {
      // Simpan pesan ke sessionStorage dulu sebelum signOut,
      // karena signOut menyebabkan komponen ini unmount & remount (state hilang)
      sessionStorage.setItem(INACTIVE_ERROR_KEY, 'Akun Anda telah dinonaktifkan. Hubungi owner untuk informasi lebih lanjut.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    setLoading(false)
    if (userData?.role?.name === 'owner') {
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/pos', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Masuk</CardTitle>
          <CardDescription>Login untuk lanjut ke dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Masukkan username Anda"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? 'Loading...' : 'Masuk'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-slate-400">
          Akun dibuat oleh owner.
        </CardFooter>
      </Card>
    </div>
  )
}
