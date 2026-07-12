import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Button } from './button'

export function ConfirmDialog({
  isOpen,
  title = 'Konfirmasi',
  description,
  onConfirm,
  onCancel,
  confirmText = 'Hapus',
  cancelText = 'Batal',
  isLoading = false,
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm transition-all duration-300">
      <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-rose-100 bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {description}
          </p>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              className="text-slate-600 hover:bg-slate-50 border-slate-200"
            >
              {cancelText}
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-100"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Memproses...' : confirmText}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
