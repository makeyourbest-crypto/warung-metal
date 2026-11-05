import { useEffect, useRef, type ReactNode } from 'react'

export function Modal({
  title,
  onClose,
  children,
  open = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  open?: boolean
}) {
  if (!open) return null
  const ref = useRef<HTMLDivElement>(null)

  // Handle tombol Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus HANYA SEKALI saat modal pertama kali terbuka (mount), TIDAK boleh jalan tiap re-render input!
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstFormInput = ref.current?.querySelector<HTMLElement>(
        'form input:not([disabled]), form select, form textarea'
      )
      firstFormInput?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="mb-4 flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button
            type="button"
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer font-bold"
            onClick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
