import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { useState } from 'react'
import { db } from '../db/schema'
import { dayRange, summarize, topProducts } from '../db/services'
import { formatRupiah } from '../lib/money'

const toInput = (d: Date) => format(d, 'yyyy-MM-dd')

export default function Laporan() {
  const [day, setDay] = useState(toInput(new Date()))
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  const valid = !Number.isNaN(date.getTime())

  const data = useLiveQuery(async () => {
    if (!valid) return null
    const [from, to] = dayRange(date)
    const [summary, top, sales] = await Promise.all([
      summarize(from, to),
      topProducts(from, to, 5),
      db.sales.where('createdAt').between(from, to, true, false).reverse().toArray(),
    ])
    const items = await db.saleItems.where('saleId').anyOf(sales.map((s) => s.id)).toArray()
    return { summary, top, sales, items }
  }, [day])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold text-white">Laporan</h1>
        <label className="sr-only" htmlFor="tgl">Tanggal</label>
        <input id="tgl" type="date" className="input !w-auto" value={day} max={toInput(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} />
      </div>

      {data && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="card !p-3"><div className="label">Transaksi</div><div className="text-2xl font-extrabold text-white">{data.summary.count}</div></div>
            <div className="card !p-3"><div className="label">Omzet</div><div className="text-xl font-extrabold text-ember">{formatRupiah(data.summary.revenue)}</div></div>
            <div className="card !p-3"><div className="label">Laba kotor</div><div className="text-xl font-extrabold text-emerald-400">{formatRupiah(data.summary.profit)}</div></div>
          </div>

          {data.top.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-2 font-bold text-white">Terlaris</h2>
              <ol className="space-y-1">
                {data.top.map((t, i) => (
                  <li key={t.name} className="flex gap-3 rounded-lg bg-steel-800 px-3 py-2 text-sm">
                    <span className="w-5 text-steel-400">{i + 1}.</span>
                    <span className="flex-1 text-white">{t.name}</span>
                    <span className="font-bold">{t.qty}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-bold text-white">Riwayat transaksi</h2>
            {data.sales.length === 0 && <p className="card text-center text-steel-400">Belum ada transaksi pada tanggal ini.</p>}
            <ul className="space-y-2">
              {data.sales.map((s) => (
                <li key={s.id}>
                  <details className="card !p-3">
                    <summary className="flex cursor-pointer items-center gap-3">
                      <span className="text-sm text-steel-400">{format(s.createdAt, 'HH:mm')}</span>
                      <span className="flex-1 text-sm text-steel-400">{data.items.filter((i) => i.saleId === s.id).length} jenis barang</span>
                      <span className="font-bold text-white">{formatRupiah(s.total)}</span>
                    </summary>
                    <ul className="mt-2 space-y-1 border-t border-steel-700 pt-2 text-sm">
                      {data.items.filter((i) => i.saleId === s.id).map((i) => (
                        <li key={i.id} className="flex justify-between">
                          <span>{i.name} × {i.qty}</span>
                          <span>{formatRupiah(i.qty * i.sellPrice)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between text-steel-400"><span>Bayar / kembali</span><span>{formatRupiah(s.paid)} / {formatRupiah(s.change)}</span></li>
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
