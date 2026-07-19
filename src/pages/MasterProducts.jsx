import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { supabase } from '../lib/supabaseClient'
import { formatRupiah } from '../lib/format'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { useAuth } from '../app/useAuth'

const emptyForm = {
  name: '',
  category_id: '',
  price: '',
  cogs: '',
  is_active: true,
  image_url: '',
  allow_customizations: false,
  allow_temperature: true,
  allow_sugar: true,
  allow_ice: true,
  allow_milk: true,
}

export default function MasterProducts() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingProduct, setEditingProduct] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)

  const [addons, setAddons] = useState([])
  const [productAddons, setProductAddons] = useState([])
  const [selectedAddons, setSelectedAddons] = useState([])
  const [editSelectedAddons, setEditSelectedAddons] = useState([])
  const [newAddonForm, setNewAddonForm] = useState({ name: '', price: '' })
  const [showNewAddonInput, setShowNewAddonInput] = useState(false)
  const [showEditNewAddonInput, setShowEditNewAddonInput] = useState(false)

  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState({ isOpen: false, targetProduct: null })
  const [confirmDeleteAddon, setConfirmDeleteAddon] = useState({ isOpen: false, targetAddon: null })
  const [isDeleting, setIsDeleting] = useState(false)
  const [toast, setToast] = useState({ show: false, message: '', type: 'warning' })

  const showToast = (message, type = 'warning') => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }))
    }, 4000)
  }

  const load = useCallback(async () => {
    const [{ data: prodData }, { data: catData }, { data: addonData }, { data: mappingData }] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('addons').select('*').order('name'),
      supabase.from('product_addons').select('*'),
    ])
    setProducts(prodData || [])
    setCategories(catData || [])
    setAddons(addonData || [])
    setProductAddons(mappingData || [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line
    load()
  }, [load])

  const addProduct = async () => {
    if (!form.name.trim() || !form.category_id || form.price === '' || form.cogs === '') {
      showToast('Form tidak lengkap! Nama, Kategori, Harga Jual, dan HPP wajib diisi.', 'danger')
      return
    }

    const duplicate = products.find((p) => p.name?.toLowerCase().trim() === form.name.toLowerCase().trim())
    if (duplicate) {
      showToast('Produk sudah ada.', 'danger')
      return
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name: form.name.trim(),
        category_id: form.category_id || null,
        price: Number(form.price || 0),
        cogs: Number(form.cogs || 0),
        is_active: true,
        image_url: form.image_url.trim() || null,
        allow_customizations: !!form.allow_customizations,
        allow_temperature: !!form.allow_customizations && !!form.allow_temperature,
        allow_sugar: !!form.allow_customizations && !!form.allow_sugar,
        allow_ice: !!form.allow_customizations && !!form.allow_ice,
        allow_milk: !!form.allow_customizations && !!form.allow_milk,
      })
      .select('id')
      .single()

    if (error || !product?.id) return

    if (form.allow_customizations && selectedAddons.length > 0) {
      const mappings = selectedAddons.map((addonId) => ({
        product_id: product.id,
        addon_id: addonId,
      }))
      await supabase.from('product_addons').insert(mappings)
    }

    setForm(emptyForm)
    setSelectedAddons([])
    load()
  }

  const handleAddNewAddon = async (isEditMode = false) => {
    const name = newAddonForm.name.trim()
    const price = Number(newAddonForm.price || 0)
    if (!name || !newAddonForm.price) {
      showToast('Form add-on tidak lengkap! Nama dan Harga wajib diisi.', 'danger')
      return
    }

    const duplicate = addons.find((a) => a.name?.toLowerCase().trim() === name.toLowerCase())
    if (duplicate) {
      showToast('Add-on sudah ada.', 'danger')
      return
    }

    const { data, error } = await supabase
      .from('addons')
      .insert({ name, price })
      .select('id, name, price')
      .single()

    if (error || !data) {
      showToast(`Gagal membuat add-on baru: ${error?.message || 'Error'}`, 'danger')
      return
    }

    const { data: refreshed } = await supabase.from('addons').select('*').order('name')
    setAddons(refreshed || [])

    if (isEditMode) {
      setEditSelectedAddons((prev) => [...prev, data.id])
      setShowEditNewAddonInput(false)
    } else {
      setSelectedAddons((prev) => [...prev, data.id])
      setShowNewAddonInput(false)
    }

    setNewAddonForm({ name: '', price: '' })
  }

  const triggerDeleteAddon = (addon, e) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirmDeleteAddon({ isOpen: true, targetAddon: addon })
  }

  const executeDeleteAddon = async () => {
    const addon = confirmDeleteAddon.targetAddon
    if (!addon) return
    setIsDeleting(true)
    const { error } = await supabase.from('addons').delete().eq('id', addon.id)
    setIsDeleting(false)
    setConfirmDeleteAddon({ isOpen: false, targetAddon: null })
    if (error) {
      console.error('Error deleting addon:', error)
      showToast(`Gagal hapus add-on: ${error.message}`, 'danger')
      return
    }
    showToast('Add-on berhasil dihapus.', 'success')
    const { data: refreshed } = await supabase.from('addons').select('*').order('name')
    setAddons(refreshed || [])
    setSelectedAddons((prev) => prev.filter((i) => i !== addon.id))
    setEditSelectedAddons((prev) => prev.filter((i) => i !== addon.id))
  }

  const toggleActive = async (product) => {
    const nextActive = product.is_active === false
    const { error } = await supabase.rpc('toggle_product_status', {
      p_product_id: product.id,
      p_is_active: nextActive,
    })
    if (error) {
      showToast(`Gagal update status: ${error.message}`, 'danger')
      return
    }
    load()
  }

  const openEdit = (product) => {
    setEditingProduct(product)
    setEditForm({
      name: product.name || '',
      category_id: product.category_id || '',
      price: product.price ?? '',
      cogs: product.cogs ?? '',
      is_active: product.is_active !== false,
      image_url: product.image_url || '',
      allow_customizations: product.allow_customizations === true,
      allow_temperature: product.allow_temperature !== false,
      allow_sugar: product.allow_sugar !== false,
      allow_ice: product.allow_ice !== false,
      allow_milk: product.allow_milk !== false,
    })
    const mapped = productAddons
      .filter((pa) => pa.product_id === product.id)
      .map((pa) => pa.addon_id)
    setEditSelectedAddons(mapped)
  }

  const closeEdit = () => {
    setEditingProduct(null)
    setEditForm(emptyForm)
    setEditSelectedAddons([])
    setShowEditNewAddonInput(false)
  }

  const saveEdit = async () => {
    if (!editingProduct) return
    if (!editForm.name.trim() || !editForm.category_id || editForm.price === '' || editForm.cogs === '') {
      showToast('Form tidak lengkap! Nama, Kategori, Harga Jual, dan HPP wajib diisi.', 'danger')
      return
    }

    const duplicate = products.find(
      (p) =>
        p.name?.toLowerCase().trim() === editForm.name.toLowerCase().trim() &&
        p.id !== editingProduct.id,
    )
    if (duplicate) {
      showToast('Produk sudah ada.', 'danger')
      return
    }

    const { error } = await supabase
      .from('products')
      .update({
        name: editForm.name.trim(),
        category_id: editForm.category_id || null,
        price: Number(editForm.price || 0),
        cogs: Number(editForm.cogs || 0),
        is_active: !!editForm.is_active,
        image_url: editForm.image_url.trim() || null,
        allow_customizations: !!editForm.allow_customizations,
        allow_temperature: !!editForm.allow_customizations && !!editForm.allow_temperature,
        allow_sugar: !!editForm.allow_customizations && !!editForm.allow_sugar,
        allow_ice: !!editForm.allow_customizations && !!editForm.allow_ice,
        allow_milk: !!editForm.allow_customizations && !!editForm.allow_milk,
      })
      .eq('id', editingProduct.id)

    if (error) {
      showToast(`Gagal menyimpan: ${error.message}`, 'danger')
      return
    }

    await supabase.from('product_addons').delete().eq('product_id', editingProduct.id)

    if (editForm.allow_customizations && editSelectedAddons.length > 0) {
      const mappings = editSelectedAddons.map((addonId) => ({
        product_id: editingProduct.id,
        addon_id: addonId,
      }))
      await supabase.from('product_addons').insert(mappings)
    }

    closeEdit()
    load()
  }

  const triggerDeleteProduct = (product) => {
    setConfirmDeleteProduct({ isOpen: true, targetProduct: product })
  }

  const executeDeleteProduct = async () => {
    const product = confirmDeleteProduct.targetProduct
    if (!product) return
    setIsDeleting(true)
    const { error } = await supabase.from('products').delete().eq('id', product.id)
    setIsDeleting(false)
    setConfirmDeleteProduct({ isOpen: false, targetProduct: null })
    if (error) {
      console.error('Error removing product:', error)
      if (error.code === '23503') {
        showToast(
          'Produk ini masih memiliki item di transaksi. Nonaktifkan produk daripada menghapusnya.',
          'danger',
        )
        return
      }
      showToast(`Gagal menghapus produk: ${error.message}`, 'danger')
      return
    }
    showToast('Produk berhasil dihapus.', 'success')
    load()
  }

  return (
    <div className="space-y-6">
      {isOwner && (<Card>
        <CardHeader>
          <CardTitle>Tambah Produk</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            placeholder="Nama produk"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={form.category_id}
            onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
          >
            <option value="">Kategori</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            placeholder="Harga jual"
            value={form.price}
            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="HPP (Harga Pokok Produksi)"
            value={form.cogs}
            onChange={(e) => setForm((prev) => ({ ...prev, cogs: e.target.value }))}
          />
          <Input
            placeholder="URL Gambar (opsional)"
            value={form.image_url}
            onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
            className="md:col-span-2"
          />

          <div className="md:col-span-2 space-y-3 p-3 border border-slate-200 rounded-md bg-slate-50/50">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_customizations}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  allow_customizations: e.target.checked,
                  allow_temperature: true,
                  allow_sugar: true,
                  allow_ice: true,
                  allow_milk: true,
                }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Aktifkan Kustomisasi Minuman
            </label>
            {form.allow_customizations && (
              <div className="pl-6 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                <div className="text-xs font-semibold text-slate-600 col-span-2 mb-1">Pilih Opsi Kustomisasi yang Tersedia:</div>
                {[
                  { key: 'allow_temperature', label: 'Suhu (Hot / Iced)' },
                  { key: 'allow_sugar',       label: 'Gula (No / Less / Normal / Extra)' },
                  { key: 'allow_ice',         label: 'Es (Less Ice / Normal)' },
                  { key: 'allow_milk',        label: 'Susu (Freshmilk / Oatmilk)' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form[key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}

            {form.allow_customizations && (
              <div className="pt-2 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-600 mb-2">Pilih Add-on yang Tersedia:</div>
                <div className="flex flex-wrap gap-3">
                  {addons.map((addon) => (
                    <div
                      key={addon.id}
                      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                    >
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAddons.includes(addon.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAddons((prev) => [...prev, addon.id])
                            } else {
                              setSelectedAddons((prev) => prev.filter((id) => id !== addon.id))
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                        <span>{addon.name} (+{formatRupiah(addon.price)})</span>
                      </label>
                      <button
                        type="button"
                        onClick={(e) => triggerDeleteAddon(addon, e)}
                        className="ml-1 text-slate-400 hover:text-rose-600 font-semibold px-0.5"
                        title="Hapus add-on"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  {!showNewAddonInput ? (
                    <button
                      type="button"
                      onClick={() => setShowNewAddonInput(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      [+ Tambah Pilihan Add-on Baru]
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 max-w-sm mt-1">
                      <Input
                        placeholder="Nama Add-on baru"
                        value={newAddonForm.name}
                        onChange={(e) => setNewAddonForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="Harga"
                        value={newAddonForm.price}
                        onChange={(e) => setNewAddonForm((prev) => ({ ...prev, price: e.target.value }))}
                        className="h-8 text-xs w-24"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-xs px-2.5"
                        onClick={() => handleAddNewAddon(false)}
                      >
                        Simpan
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewAddonInput(false)
                          setNewAddonForm({ name: '', price: '' })
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <Button onClick={addProduct} className="w-full">
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>)}

      <Card>
        <CardHeader>
          <CardTitle>Daftar Produk & Status Menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {products.map((product) => {
            const isActive = product.is_active !== false
            return (
              <div
                key={product.id}
                className={`flex flex-col gap-3 rounded-md border px-3 py-2 md:flex-row md:items-center md:justify-between ${
                  isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-90'
                }`}
              >
                <div className="flex items-center gap-3">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className={`h-10 w-10 rounded-md object-cover ${isActive ? '' : 'grayscale'}`}
                    />
                  ) : null}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{product.name}</div>
                      {isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          Tersedia
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{formatRupiah(product.price)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => toggleActive(product)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {isActive ? 'Aktif' : 'Nonaktif'}
                  </label>
                  {isOwner && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(product)}>
                      Edit
                    </Button>
                  )}
                  {isOwner && (
                    <Button
                      size="sm"
                      className="bg-rose-600 text-white hover:bg-rose-700"
                      onClick={() => triggerDeleteProduct(product)}
                    >
                      Hapus
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {isOwner && editingProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-lg">
            <div className="mb-4">
              <div className="text-lg font-semibold text-slate-900">Edit Produk</div>
              <div className="text-xs text-slate-500">{editingProduct.name}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Nama produk"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={editForm.category_id}
                onChange={(e) => setEditForm((prev) => ({ ...prev, category_id: e.target.value }))}
              >
                <option value="">Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                placeholder="Harga jual"
                value={editForm.price}
                onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="HPP"
                value={editForm.cogs}
                onChange={(e) => setEditForm((prev) => ({ ...prev, cogs: e.target.value }))}
              />
              <Input
                placeholder="URL Gambar (opsional)"
                value={editForm.image_url}
                onChange={(e) => setEditForm((prev) => ({ ...prev, image_url: e.target.value }))}
                className="md:col-span-2"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Menu tersedia (bisa dipesan di POS)
              </label>

              <div className="md:col-span-2 space-y-3 p-3 border border-slate-200 rounded-md bg-slate-50/50">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.allow_customizations}
                    onChange={(e) => setEditForm((prev) => ({
                      ...prev,
                      allow_customizations: e.target.checked,
                      allow_temperature: true,
                      allow_sugar: true,
                      allow_ice: true,
                      allow_milk: true,
                    }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Aktifkan Kustomisasi Minuman
                </label>
                {editForm.allow_customizations && (
                  <div className="pl-6 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                    <div className="text-xs font-semibold text-slate-600 col-span-2 mb-1">Pilih Opsi Kustomisasi yang Tersedia:</div>
                    {[
                      { key: 'allow_temperature', label: 'Suhu (Hot / Iced)' },
                      { key: 'allow_sugar',       label: 'Gula (No / Less / Normal / Extra)' },
                      { key: 'allow_ice',         label: 'Es (Less Ice / Normal)' },
                      { key: 'allow_milk',        label: 'Susu (Freshmilk / Oatmilk)' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!editForm[key]}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}

                {editForm.allow_customizations && (
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-xs font-semibold text-slate-600 mb-2">Pilih Add-on yang Tersedia:</div>
                    <div className="flex flex-wrap gap-3">
                      {addons.map((addon) => (
                        <div
                          key={addon.id}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                        >
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editSelectedAddons.includes(addon.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditSelectedAddons((prev) => [...prev, addon.id])
                                } else {
                                  setEditSelectedAddons((prev) => prev.filter((id) => id !== addon.id))
                                }
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            <span>{addon.name} (+{formatRupiah(addon.price)})</span>
                          </label>
                          <button
                            type="button"
                            onClick={(e) => triggerDeleteAddon(addon, e)}
                            className="ml-1 text-slate-400 hover:text-rose-600 font-semibold px-0.5"
                            title="Hapus add-on"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3">
                      {!showEditNewAddonInput ? (
                        <button
                          type="button"
                          onClick={() => setShowEditNewAddonInput(true)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          [+ Tambah Pilihan Add-on Baru]
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 max-w-sm mt-1">
                          <Input
                            placeholder="Nama Add-on baru"
                            value={newAddonForm.name}
                            onChange={(e) => setNewAddonForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number"
                            placeholder="Harga"
                            value={newAddonForm.price}
                            onChange={(e) => setNewAddonForm((prev) => ({ ...prev, price: e.target.value }))}
                            className="h-8 text-xs w-24"
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 text-xs px-2.5"
                            onClick={() => handleAddNewAddon(true)}
                          >
                            Simpan
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowEditNewAddonInput(false)
                              setNewAddonForm({ name: '', price: '' })
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={closeEdit}>
                Batal
              </Button>
              <Button onClick={saveEdit}>Simpan Perubahan</Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirmDeleteProduct.isOpen}
        title="Hapus Produk"
        description={`Apakah Anda yakin ingin menghapus produk ${confirmDeleteProduct.targetProduct?.name}?`}
        onConfirm={executeDeleteProduct}
        onCancel={() => setConfirmDeleteProduct({ isOpen: false, targetProduct: null })}
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={confirmDeleteAddon.isOpen}
        title="Hapus Add-on"
        description={`Apakah Anda yakin ingin menghapus add-on ${confirmDeleteAddon.targetAddon?.name} secara permanen dari sistem?`}
        onConfirm={executeDeleteAddon}
        onCancel={() => setConfirmDeleteAddon({ isOpen: false, targetAddon: null })}
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
    </div>
  )
}
