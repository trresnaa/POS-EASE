import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { supabase } from '../lib/supabaseClient'
import { ConfirmDialog } from '../components/ui/confirm-dialog'

const emptyCreateForm = {
  password: '',
  full_name: '',
  username: '',
  role_id: '',
}

export default function MasterStaff() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [creating, setCreating] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [detailForm, setDetailForm] = useState({ full_name: '', username: '', role_id: '', password: '' })

  const [savingDetail, setSavingDetail] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, targetUser: null })
  const [toast, setToast] = useState({ show: false, message: '', type: 'warning' })

  const showToast = (message, type = 'warning') => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }))
    }, 4000)
  }

  const load = useCallback(async () => {
    const [{ data: userData }, { data: roleData }] = await Promise.all([
      supabase
        .from('users')
        .select('id, auth_user_id, full_name, username, role_id, role:roles(name), is_active')
        .order('created_at', { ascending: false }),
      supabase.from('roles').select('*').order('name'),
    ])
    setUsers(userData || [])
    setRoles(roleData || [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line
    load()
  }, [load])

  const openCreateModal = () => {
    setCreateForm({
      ...emptyCreateForm,
      role_id: '',
    })
    setShowCreateModal(true)
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setCreateForm(emptyCreateForm)
  }

  const createUser = async () => {
    if (!createForm.full_name.trim() || !createForm.username.trim() || !createForm.password.trim() || !createForm.role_id) {
      showToast('Form tidak lengkap! Mohon isi semua field (Nama Lengkap, Username, Password, dan Peran).', 'danger')
      return
    }

    const duplicate = users.find((u) => u.username?.toLowerCase().trim() === createForm.username.toLowerCase().trim())
    if (duplicate) {
      showToast('Username sudah ada dan sudah digunakan.', 'danger')
      return
    }

    setCreating(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-staff-user', {
        body: {
          email: `${createForm.username.trim()}@ease.local`,
          password: createForm.password,
          full_name: createForm.full_name.trim() || null,
          username: createForm.username.trim() || null,
          role_id: createForm.role_id || null,
        },
      })

      if (error) {
        showToast(`Gagal membuat akun: ${error.message}`, 'danger')
        setCreating(false)
        return
      }

      if (data?.error) {
        showToast(`Gagal membuat akun: ${data.error}`, 'danger')
        setCreating(false)
        return
      }

      await load()
      closeCreateModal()
    } catch (err) {
      showToast(`Gagal membuat akun: ${err.message || 'Unknown error'}`, 'danger')
    } finally {
      setCreating(false)
    }
  }

  const openDetailModal = (user) => {
    setSelectedUser(user)
    setDetailForm({
      full_name: user.full_name || '',
      username: user.username || '',
      role_id: user.role_id || '',
      password: '',
    })
  }

  const closeDetailModal = () => {
    setSelectedUser(null)
    setDetailForm({ full_name: '', username: '', role_id: '', password: '' })
  }

  const saveUserDetail = async () => {
    if (!selectedUser) return
    if (!detailForm.full_name.trim() || !detailForm.username.trim() || !detailForm.role_id) {
      showToast('Form tidak lengkap! Mohon isi semua field yang wajib.', 'danger')
      return
    }

    const duplicate = users.find(
      (u) =>
        u.username?.toLowerCase().trim() === detailForm.username.toLowerCase().trim() &&
        u.id !== selectedUser.id,
    )
    if (duplicate) {
      showToast('Username sudah ada dan sudah digunakan.', 'danger')
      return
    }

    setSavingDetail(true)
    const { error } = await supabase.rpc('update_staff_user', {
      p_user_id: selectedUser.id,
      p_auth_user_id: selectedUser.auth_user_id,
      p_full_name: detailForm.full_name.trim(),
      p_username: detailForm.username.trim(),
      p_role_id: detailForm.role_id,
      p_password: detailForm.password.trim() || null,
    })
    setSavingDetail(false)

    if (error) {
      showToast(`Gagal simpan detail: ${error.message}`, 'danger')
      return
    }

    await load()
    closeDetailModal()
  }


  const triggerDeleteUser = (user) => {
    setConfirmDelete({ isOpen: true, targetUser: user })
  }

  const executeDeleteUser = async () => {
    const user = confirmDelete.targetUser
    if (!user) return
    setSavingDetail(true)
    try {
      const { data, error } = await supabase.functions.invoke('delete-staff-user', {
        body: { user_id: user.id, auth_user_id: user.auth_user_id },
      })
      setSavingDetail(false)
      setConfirmDelete({ isOpen: false, targetUser: null })
      if (error) {
        console.error('Error invoking delete-staff-user:', error)
        showToast(`Gagal hapus staff: ${error.message}`, 'danger')
        return
      }
      if (data?.error) {
        console.error('Error in delete-staff-user response data:', data.error)
        showToast(`Gagal hapus staff: ${data.error}`, 'danger')
        return
      }
      showToast('Akun staff berhasil dihapus.', 'success')
      load()
    } catch (err) {
      setSavingDetail(false)
      setConfirmDelete({ isOpen: false, targetUser: null })
      console.error('Exception in deleteUser:', err)
      showToast(`Gagal hapus staff: ${err.message || 'Unknown error'}`, 'danger')
    }
  }

  const toggleStaffStatus = async (user) => {
    const newStatus = !user.is_active
    const label = newStatus ? 'mengaktifkan' : 'menonaktifkan'
    setSavingDetail(true)
    try {
      const { error } = await supabase.rpc('toggle_staff_status', {
        p_user_id: user.id,
        p_is_active: newStatus,
      })
      if (error) {
        showToast(`Gagal ${label} staff: ${error.message}`, 'danger')
        return
      }
      showToast(
        `Staff ${user.full_name || user.username} berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}.`,
        'success',
      )
      await load()
    } catch (err) {
      showToast(`Gagal ${label} staff: ${err.message || 'Unknown error'}`, 'danger')
    } finally {
      setSavingDetail(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Kelola Staff</CardTitle>
        <Button onClick={openCreateModal}>Add Staff</Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {users.length === 0 ? <div className="text-slate-500">Belum ada data staff.</div> : null}
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex flex-col gap-2 rounded-md border px-3 py-2 md:flex-row md:items-center md:justify-between ${
              user.is_active
                ? 'border-slate-200 bg-white'
                : 'border-rose-100 bg-rose-50/60'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{user.full_name || '-'}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    user.is_active
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      user.is_active ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  {user.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <div className="text-xs text-slate-500">Username: {user.username || '-'}</div>
              <div className="mt-1">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {user.role?.name || '-'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openDetailModal(user)}>
                Detail
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`${
                  user.is_active
                    ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                    : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                }`}
                onClick={() => toggleStaffStatus(user)}
                disabled={savingDetail}
              >
                {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => triggerDeleteUser(user)}
              >
                Hapus
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-lg">
            <div className="mb-4">
              <div className="text-lg font-semibold text-slate-900">Tambah Staff</div>
              <div className="text-xs text-slate-500">Form pembuatan akun login baru.</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Username"
                value={createForm.username}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))}
              />
              <Input
                type="password"
                placeholder="Password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
              />
              <Input
                placeholder="Nama lengkap"
                value={createForm.full_name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))}
                className="md:col-span-2"
              />
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 md:col-span-2"
                value={createForm.role_id}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, role_id: e.target.value }))}
              >
                <option value="" disabled hidden>
                  Pilih role
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={closeCreateModal} disabled={creating}>
                Batal
              </Button>
              <Button onClick={createUser} disabled={creating}>
                {creating ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-lg">
            <div className="mb-4">
              <div className="text-lg font-semibold text-slate-900">Detail Staff</div>
              <div className="text-xs text-slate-500">User ID: {selectedUser.id}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Nama lengkap"
                value={detailForm.full_name}
                onChange={(e) => setDetailForm((prev) => ({ ...prev, full_name: e.target.value }))}
                className="md:col-span-2"
              />
              <Input
                placeholder="Username"
                value={detailForm.username}
                onChange={(e) => setDetailForm((prev) => ({ ...prev, username: e.target.value }))}
              />
              <Input
                type="password"
                placeholder="Password Baru (Kosongkan jika tidak diubah)"
                value={detailForm.password}
                onChange={(e) => setDetailForm((prev) => ({ ...prev, password: e.target.value }))}
                className="md:col-span-2"
              />

              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 md:col-span-2"
                value={detailForm.role_id}
                onChange={(e) => setDetailForm((prev) => ({ ...prev, role_id: e.target.value }))}
              >
                <option value="" disabled hidden>
                  Pilih role
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={closeDetailModal} disabled={savingDetail}>
                Tutup
              </Button>
              <Button onClick={saveUserDetail} disabled={savingDetail}>
                {savingDetail ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Hapus Staff"
        description={`Apakah Anda yakin ingin menghapus staff ${confirmDelete.targetUser?.full_name || confirmDelete.targetUser?.username}? Tindakan ini tidak bisa dibatalkan.`}
        onConfirm={executeDeleteUser}
        onCancel={() => setConfirmDelete({ isOpen: false, targetUser: null })}
        isLoading={savingDetail}
      />

      {toast.show && (
        <div className="fixed bottom-5 right-5 z-[200] animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 shadow-xl ${
            toast.type === 'danger'
              ? 'border-rose-200 bg-rose-50 text-rose-800 shadow-rose-100/50'
              : toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-emerald-100/50'
              : 'border-amber-200 bg-amber-50 text-amber-800 shadow-amber-100/50'
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              toast.type === 'danger' ? 'bg-rose-500' : toast.type === 'success' ? 'bg-emerald-500' : 'bg-amber-500'
            }`} />
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </Card>
  )
}
