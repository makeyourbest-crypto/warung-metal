import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface ToastItem {
  id: number
  kind: 'ok' | 'error'
  text: string
}
interface ToastApi {
  ok: (t: string) => void
  success: (t: string) => void
  error: (t: string) => void
}
const Ctx = createContext<ToastApi>({ ok: () => {}, success: () => {}, error: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, kind, text }])
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3500)
  }, [])
  const api = useMemo<ToastApi>(() => ({ ok: (t) => push('ok', t), success: (t) => push('ok', t), error: (t) => push('error', t) }), [push])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
        {items.map((i) => (
          <div
            key={i.id}
            role={i.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm font-semibold shadow-lg ${
              i.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-500 text-steel-950'
            }`}
          >
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
