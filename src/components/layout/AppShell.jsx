import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../app/useAuth'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { supabase } from '../../lib/supabaseClient'
import { clearCache } from '../../lib/dataCache'


const baseLink =
  'flex items-center rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-all duration-200'
const activeLink = 'bg-slate-800 text-white font-medium shadow-sm'

export default function AppShell({ children }) {
  const { profile, refreshProfile } = useAuth()

  const [showProfileModal, setShowProfileModal] = useState(false)
  const [fullNameInput, setFullNameInput] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const openProfileModal = () => {
    setFullNameInput(profile?.fullName || '')
    setNewPassword('')
    setConfirmPassword('')
    setShowProfileModal(true)
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    if (!fullNameInput.trim()) {
      showToast('Nama Lengkap tidak boleh kosong!', 'error')
      return
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        showToast('Password baru minimal 6 karakter!', 'error')
        return
      }
      if (newPassword !== confirmPassword) {
        showToast('Konfirmasi password baru tidak cocok!', 'error')
        return
      }
    }

    setSavingProfile(true)
    try {
      const { error: dbError } = await supabase
        .from('users')
        .update({ full_name: fullNameInput.trim() })
        .eq('id', profile.id)

      if (dbError) throw dbError

      if (newPassword) {
        const { error: authError } = await supabase.auth.updateUser({
          password: newPassword,
        })
        if (authError) throw authError
      }

      if (refreshProfile) {
        await refreshProfile()
      }

      showToast('Profil berhasil diperbarui!')
      setShowProfileModal(false)
    } catch (err) {
      console.error('Error updating profile:', err)
      showToast(`Gagal memperbarui profil: ${err.message}`, 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const [showLogoutShiftModal, setShowLogoutShiftModal] = useState(false)
  const [activeShiftOnLogout, setActiveShiftOnLogout] = useState(null)

  const handleLogoutClick = async () => {
    if (!profile?.id) {
      clearCache()
      await supabase.auth.signOut()
      return
    }

    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('id, opened_at')
        .eq('opened_by', profile.id)
        .is('closed_at', null)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setActiveShiftOnLogout(data)
        setShowLogoutShiftModal(true)
      } else {
        clearCache()
        await supabase.auth.signOut()
      }
    } catch (err) {
      console.error('Error checking active shift on logout:', err)
      clearCache()
      await supabase.auth.signOut()
    }
  }

  const handleCloseShiftAndLogout = async () => {
    if (!profile?.id || !activeShiftOnLogout) return
    try {
      await supabase
        .from('shifts')
        .update({
          closed_by: profile.id,
          closed_at: new Date().toISOString(),
          notes: 'Shift ditutup otomatis saat logout dari sistem.',
        })
        .eq('id', activeShiftOnLogout.id)
    } catch (err) {
      console.error('Error closing shift on logout:', err)
    } finally {
      clearCache()
      await supabase.auth.signOut()
    }
  }

  const handleLogoutSaja = async () => {
    clearCache()
    await supabase.auth.signOut()
  }


  const staffLinks = [
    { to: '/pos', label: 'POS' },
    { to: '/queue', label: 'Antrean' },
    { to: '/master/products', label: 'Produk' },
  ]

  const ownerLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/reports', label: 'Laporan' },
    { to: '/master/products', label: 'Produk' },
    { to: '/master/categories', label: 'Kategori' },
    { to: '/master/staff', label: 'Staff' },
  ]

  const links = profile?.role === 'owner' ? [...ownerLinks, ...staffLinks] : staffLinks

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-slate-950/20 bg-slate-900 px-4 py-6 flex flex-col">
        <div className="mb-8 text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
          EASECOFFEE
        </div>
        <nav className="space-y-1.5 flex-1">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${baseLink} ${isActive ? activeLink : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Pengguna Aktif</div>
          <button
            type="button"
            onClick={openProfileModal}
            className="w-full text-left focus:outline-none group mt-0.5 animate-duration-300"
          >
            <div className="font-semibold text-white text-sm group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <span className="truncate">{profile?.fullName || profile?.username || 'User'}</span>
              <svg className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          </button>
          <div className="inline-block rounded-full bg-amber-950/40 border border-amber-900 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-300 font-bold mt-1.5">
            {profile?.role || 'staff'}
          </div>
          <Button 
            className="mt-4 w-full border-slate-800 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white" 
            variant="outline" 
            onClick={handleLogoutClick}
          >
            Logout
          </Button>
        </div>
      </aside>
      <main className="ml-60 min-h-screen px-8 py-8">{children}</main>

      {/* Ubah Profil Saya Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-fade-in">
          <form onSubmit={handleUpdateProfile} className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Ubah Profil Saya</h3>
              <p className="text-xs text-slate-500">Sesuaikan informasi profil dan password akun Anda.</p>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Username (Login)</label>
                <Input value={profile?.username || ''} disabled className="bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed" />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nama Lengkap</label>
                <Input 
                  type="text" 
                  value={fullNameInput} 
                  onChange={(e) => setFullNameInput(e.target.value)} 
                  placeholder="Masukkan nama lengkap Anda"
                  required
                />
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Password Baru (Opsional)</label>
                <Input 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="Minimal 6 karakter"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Konfirmasi Password Baru</label>
                <Input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  placeholder="Ulangi password baru"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setShowProfileModal(false)} disabled={savingProfile}>
                Batal
              </Button>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Peringatan Shift Belum Ditutup Saat Logout */}
      {showLogoutShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-rose-600">Peringatan: Shift Masih Aktif!</h3>
              <p className="text-xs text-slate-500 mt-1">
                Anda masih memiliki shift kasir yang aktif sejak <strong className="text-slate-700">{new Date(activeShiftOnLogout?.opened_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</strong>.
                Disarankan untuk menutup shift agar rekapitulasi uang kas drawer tercatat dengan benar sebelum Anda keluar.
              </p>
            </div>
            
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <Button 
                type="button" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                onClick={handleCloseShiftAndLogout}
              >
                Tutup Shift &amp; Logout
              </Button>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-1/2 border-rose-200 text-rose-600 hover:bg-rose-50"
                  onClick={handleLogoutSaja}
                >
                  Logout Saja
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-1/2"
                  onClick={() => setShowLogoutShiftModal(false)}
                >
                  Batal
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-sm text-white shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

