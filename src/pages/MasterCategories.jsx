import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { supabase } from '../lib/supabaseClient'
import { ConfirmDialog } from '../components/ui/confirm-dialog'

export default function MasterCategories() {
  const [categories, setCategories] = useState([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, targetCat: null })
  const [isDeleting, setIsDeleting] = useState(false)
  const [toast, setToast] = useState({ show: false, message: '', type: 'warning' })

  const showToast = (message, type = 'warning') => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }))
    }, 4000)
  }

  const load = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories(data || [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line
    load()
  }, [load])

  const addCategory = async () => {
    if (!name.trim()) {
      showToast('Form tidak lengkap! Nama kategori wajib diisi.', 'danger')
      return
    }

    const duplicate = categories.find((c) => c.name?.toLowerCase().trim() === name.toLowerCase().trim())
    if (duplicate) {
      showToast('Kategori sudah ada.', 'danger')
      return
    }

    await supabase.from('categories').insert({ name: name.trim() })
    setName('')
    load()
  }

  const startEdit = (cat) => {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const saveEdit = async (id) => {
    if (!editingName.trim()) {
      showToast('Form tidak lengkap! Nama kategori wajib diisi.', 'danger')
      return
    }

    const duplicate = categories.find(
      (c) => c.name?.toLowerCase().trim() === editingName.toLowerCase().trim() && c.id !== id,
    )
    if (duplicate) {
      showToast('Kategori sudah ada.', 'danger')
      return
    }
    const { error } = await supabase
      .from('categories')
      .update({ name: editingName.trim() })
      .eq('id', id)
    if (error) {
      showToast(`Gagal menyimpan: ${error.message}`, 'danger')
      return
    }
    cancelEdit()
    load()
  }

  const triggerDeleteCategory = (cat) => {
    setConfirmDelete({ isOpen: true, targetCat: cat })
  }

  const executeDeleteCategory = async () => {
    const cat = confirmDelete.targetCat
    if (!cat) return
    setIsDeleting(true)
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    setIsDeleting(false)
    setConfirmDelete({ isOpen: false, targetCat: null })
    if (error) {
      console.error('Error removing category:', error)
      showToast(`Gagal menghapus kategori: ${error.message}`, 'danger')
    } else {
      showToast('Kategori berhasil dihapus.', 'success')
      load()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kelola Kategori</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Nama kategori baru"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <Button onClick={addCategory}>Tambah</Button>
        </div>
        <div className="space-y-2 text-sm">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
            >
              {editingId === cat.id ? (
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(cat.id)
                    if (e.key === 'Escape') cancelEdit()
                  }}
                  className="mr-2 h-8"
                  autoFocus
                />
              ) : (
                <div>{cat.name}</div>
              )}
              <div className="flex items-center gap-2">
                {editingId === cat.id ? (
                  <>
                    <Button size="sm" onClick={() => saveEdit(cat.id)}>
                      Simpan
                    </Button>
                    <Button variant="outline" size="sm" onClick={cancelEdit}>
                      Batal
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => startEdit(cat)}>
                      Edit
                    </Button>
                     <Button
                       size="sm"
                       className="bg-rose-600 text-white hover:bg-rose-700"
                       onClick={() => triggerDeleteCategory(cat)}
                     >
                       Hapus
                     </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Hapus Kategori"
        description={`Apakah Anda yakin ingin menghapus kategori ${confirmDelete.targetCat?.name}?`}
        onConfirm={executeDeleteCategory}
        onCancel={() => setConfirmDelete({ isOpen: false, targetCat: null })}
        isLoading={isDeleting}
      />

      {toast.show && (
        <div className="fixed bottom-5 right-5 z-[200] animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 shadow-xl ${
            toast.type === 'danger'
              ? 'border-rose-200 bg-rose-50 text-rose-955 shadow-rose-100/50'
              : 'border-amber-200 bg-amber-50 text-amber-955 shadow-amber-100/50'
          }`}>
            <span className={`h-2 w-2 rounded-full ${toast.type === 'danger' ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </Card>
  )
}
