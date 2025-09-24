"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList, ReferenceLine, ReferenceDot
} from "recharts"
import PortfolioSliders from "@/components/portfolio-sliders"
import Recommendation from "@/components/recommendation"

type PriceRecord = {
  date: string
  ticker: string
  close: number
}

const INITIAL_TICKERS = ["SPY"]

type Mode = "lump" | "dca"
type RangeKey = "1M" | "3M" | "1Y" | "3Y" | "5Y" | "MAX"

const MAN_YEN = 10_000 // 万円→円の換算

export default function DashboardPage() {
  const [tickers, setTickers] = useState<string[]>(INITIAL_TICKERS)
  const [data, setData] = useState<PriceRecord[]>([])
  const [weights, setWeights] = useState<Record<string, number>>(
    INITIAL_TICKERS.reduce((acc, t) => ({ ...acc, [t]: Math.floor(100 / INITIAL_TICKERS.length) }), {})
  )
  const [loading, setLoading] = useState(true)

  // タブ・期間
  const [mode, setMode] = useState<Mode>("lump")
  const [range, setRange] = useState<RangeKey>("MAX")

  // 一括（万円入力）
  const [baseAumMan, setBaseAumMan] = useState<number>(100) // 100万円

  // 積立（万円入力）
  const [dcaInitialMan, setDcaInitialMan] = useState<number>(10) // 頭金：10万円
  const [dcaMonthlyMan, setDcaMonthlyMan] = useState<number>(5)  // 毎月：5万円

  // --- 追加（新規=100/n%、既存は(n-1)/n倍に圧縮） ---
  const addTicker = useCallback((t: string) => {
    const sym = t.trim().toUpperCase()
    if (!sym) return

    setTickers(prevTickers => {
      if (prevTickers.includes(sym)) return prevTickers

      const nOld = prevTickers.length
      const nNew = nOld + 1
      const scale = nOld / nNew

      setWeights(prevW => {
        const next: Record<string, number> = {}
        for (const k of prevTickers) next[k] = Math.floor((prevW[k] ?? 0) * scale)
        next[sym] = Math.floor(100 / nNew)
        const sum = Object.values(next).reduce((a, b) => a + b, 0)
        const diff = 100 - sum
        if (diff !== 0) next[sym] = Math.max(0, next[sym] + diff)
        return next
      })

      return [...prevTickers, sym]
    })
  }, [])

  const removeTicker = useCallback((t: string) => {
    setTickers(prev => prev.filter(x => x !== t))
    setWeights(prev => {
      const rest = Object.entries(prev).filter(([k]) => k !== t)
      if (rest.length === 0) return {}
      const sum = rest.reduce((s, [, v]) => s + (v ?? 0), 0)
      const next: Record<string, number> = {}
      rest.forEach(([k, v]) => {
        next[k] = sum > 0 ? Math.round((v * 100) / sum) : Math.floor(100 / rest.length)
      })
      const diff = 100 - Object.values(next).reduce((a, b) => a + b, 0)
      if (diff !== 0) {
        const first = Object.keys(next)[0]
        if (first) next[first] += diff
      }
      return next
    })
  }, [])

  // --- 価格データ取得（ページングで全件） ---
  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true)
      if (tickers.length === 0) {
        setData([])
        setLoading(false)
        return
      }

      const pageSize = 1000
      let from = 0
      let all: any[] = []

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: rows, error } = await supabase
          .from("prices")
          .select("date, ticker, close")
          .in("ticker", tickers)
          .order("date", { ascending: false })
          .range(from, from + pageSize - 1)

        if (error) {
          console.error(error)
          setData([])
          setLoading(false)
          return
        }

        if (!rows || rows.length === 0) break
        all = all.concat(rows)
        if (rows.length < pageSize) break
        from += pageSize
      }

      const parsed: PriceRecord[] = (all ?? []).map((r: any) => ({
        date: r.date,
        ticker: r.ticker,
        close: typeof r.close === "number" ? r.close : parseFloat(r.close as any),
      }))

      // 全日付を昇順で揃える
      const allDates = Array.from(new Set(parsed.map(r => r.date))).sort()

      // 銘柄ごとに全日付分を作成し、forward/backward fill
      const groupedByTicker: Record<string, PriceRecord[]> = {}
      tickers.forEach(t => {
        const map = new Map(parsed.filter(r => r.ticker === t).map(r => [r.date, r.close]))
        const filled: PriceRecord[] = allDates.map(d => ({
          date: d, ticker: t, close: (map.get(d) ?? (NaN as any))
        }))

        // forward fill
        let last: number | null = null
        for (let i = 0; i < filled.length; i++) {
          const c = filled[i].close as any
          if (c == null || isNaN(c)) {
            filled[i].close = last as any
          } else {
            last = c as number
          }
        }
        // backward fill（先頭側）
        let nextValid: number | null = null
        for (let i = filled.length - 1; i >= 0; i--) {
          const c = filled[i].close as any
          if (c == null || isNaN(c)) {
            filled[i].close = nextValid as any
          } else {
            nextValid = c as number
          }
        }
        groupedByTicker[t] = filled
      })

      setData(Object.values(groupedByTicker).flat())
      setLoading(false)
    }

    fetchPrices()
  }, [tickers])

  // --- 全日付（昇順） ---
  const allDates = useMemo(() => Array.from(new Set(data.map(d => d.date))).sort(), [data])
  const lastDate = allDates.at(-1) ?? ""

  // --- 範囲の開始日 ---
  const rangeStartDate = useMemo(() => {
    if (!lastDate || range === "MAX") return allDates[0] ?? ""
    const toISO = (d: Date) => d.toISOString().slice(0, 10)
    const d = new Date(`${lastDate}T00:00:00Z`)
    const back = (m: number) => {
      const x = new Date(d)
      x.setUTCMonth(x.getUTCMonth() - m)
      x.setUTCDate(1)
      return toISO(x)
    }
    const months = { "1M": 1, "3M": 3, "1Y": 12, "3Y": 36, "5Y": 60 } as const
    const lower = back(months[range])
    return allDates.find(d2 => d2 >= lower) ?? allDates[0] ?? ""
  }, [range, lastDate, allDates])

  // --- 指数（開始日=1）
  const portfolioIndex = useMemo(() => {
    if (data.length === 0 || tickers.length === 0) return []

    // 銘柄ごとに昇順配列
    const grouped: Record<string, PriceRecord[]> = {}
    for (const row of data) (grouped[row.ticker] ??= []).push(row)
    for (const t of tickers) grouped[t]?.sort((a, b) => a.date.localeCompare(b.date))

    const dates = allDates.filter(d => !rangeStartDate || d >= rangeStartDate)
    if (dates.length === 0) return []

    const base: Record<string, number> = {}
    for (const t of tickers) {
      const arr = grouped[t] || []
      const baseRow = arr.find(r => r.date >= (rangeStartDate || arr[0]?.date || "")) ?? arr[0]
      base[t] = baseRow?.close ?? 1
    }

    const sumW = tickers.reduce((s, t) => s + (weights[t] ?? 0), 0) || 1

    return dates.map(date => {
      let total = 0
      const rec: any = { date }
      for (const t of tickers) {
        const price = (grouped[t]?.find(r => r.date === date)?.close) ?? base[t]
        const norm = price / base[t]
        rec[t] = norm
        total += (weights[t] ?? 0) * norm
      }
      rec.total = total / sumW
      return rec
    })
  }, [data, weights, tickers, rangeStartDate, allDates])

  // --- 積立：AUM（紫）と積立元本（点線）
  const dcaSeries = useMemo(() => {
    if (portfolioIndex.length === 0) return []

    const dcaInitial = dcaInitialMan * MAN_YEN
    const dcaMonthly  = dcaMonthlyMan  * MAN_YEN

    let lastYM = ""
    let units = 0
    let contributions = 0
    const out: Array<{ date: string; idx: number; aum: number; contrib: number }> = []

    for (let i = 0; i < portfolioIndex.length; i++) {
      const row = portfolioIndex[i]
      const idx = row.total || 1
      const [y, m] = row.date.split("-")
      const ym = `${y}-${m}`

      let add = 0
      if (i === 0) {
        if (dcaInitial > 0) add += dcaInitial
        if (dcaMonthly > 0) add += dcaMonthly
      } else if (ym !== lastYM) {
        if (dcaMonthly > 0) add += dcaMonthly
      }

      if (add > 0) {
        units += add / idx
        contributions += add
      }

      out.push({ date: row.date, idx, aum: units * idx, contrib: contributions })
      lastYM = ym
    }
    return out
  }, [portfolioIndex, dcaInitialMan, dcaMonthlyMan])

  // --- チャートデータ：モード別
  const chartData = useMemo(() => {
    if (mode === "dca") {
      return dcaSeries.map(d => ({ date: d.date, aum: d.aum, contrib: d.contrib }))
    }
    return portfolioIndex
  }, [mode, dcaSeries, portfolioIndex])

  // --- 現在AUM（左上常時表示）
  const currentAum = useMemo(() => {
    if (mode === "lump") {
      if (portfolioIndex.length === 0) return 0
      const last = portfolioIndex[portfolioIndex.length - 1]
      return (baseAumMan * MAN_YEN) * (last.total || 1)
    } else {
      if (dcaSeries.length === 0) return 0
      return dcaSeries[dcaSeries.length - 1].aum
    }
  }, [mode, portfolioIndex, baseAumMan, dcaSeries])

  // --- 最大含み益／最大含み損（％で選び、表示は金額＋％） ---
  const lumpExtremes = useMemo(() => {
    if (portfolioIndex.length === 0) {
      return {
        maxGain: { date: "", amt: 0, pct: 0, y: 0 },
        maxLoss: { date: "", amt: 0, pct: 0, y: 0 },
      }
    }
    const base = baseAumMan * MAN_YEN
    let maxGainPct = -Infinity, maxGainDate = "", maxGainAmt = 0, maxGainY = 0
    let maxLossPct = +Infinity, maxLossDate = "", maxLossAmt = 0, maxLossY = 0

    for (const r of portfolioIndex) {
      const idx = r.total || 1
      const pct = idx - 1                         // 1始まり指数なのでそのまま％の小数
      const amt = base * pct
      const y = base * idx                        // AUM（縦軸上の値）

      if (pct > maxGainPct) {
        maxGainPct = pct
        maxGainDate = r.date
        maxGainAmt = amt
        maxGainY = y
      }
      if (pct < maxLossPct) {
        maxLossPct = pct
        maxLossDate = r.date
        maxLossAmt = amt
        maxLossY = y
      }
    }
    return {
      maxGain: { date: maxGainDate, amt: maxGainAmt, pct: maxGainPct, y: maxGainY },
      maxLoss: { date: maxLossDate, amt: maxLossAmt, pct: maxLossPct, y: maxLossY },
    }
  }, [portfolioIndex, baseAumMan])

  const dcaExtremes = useMemo(() => {
    if (dcaSeries.length === 0) {
      return {
        maxGain: { date: "", amt: 0, pct: 0, y: 0 },
        maxLoss: { date: "", amt: 0, pct: 0, y: 0 },
      }
    }
    let maxGainPct = -Infinity, maxGainDate = "", maxGainAmt = 0, maxGainY = 0
    let maxLossPct = +Infinity, maxLossDate = "", maxLossAmt = 0, maxLossY = 0

    for (const r of dcaSeries) {
      const base = r.contrib
      if (base <= 0) continue                     // %定義できない期間はスキップ
      const gainAmt = r.aum - base
      const gainPct = gainAmt / base

      if (gainPct > maxGainPct) {
        maxGainPct = gainPct
        maxGainDate = r.date
        maxGainAmt = gainAmt
        maxGainY = r.aum
      }
      if (gainPct < maxLossPct) {
        maxLossPct = gainPct
        maxLossDate = r.date
        maxLossAmt = gainAmt
        maxLossY = r.aum
      }
    }
    // すべてbase=0だった場合のガード
    if (!isFinite(maxGainPct)) maxGainPct = 0
    if (!isFinite(maxLossPct)) maxLossPct = 0

    return {
      maxGain: { date: maxGainDate, amt: maxGainAmt, pct: maxGainPct, y: maxGainY },
      maxLoss: { date: maxLossDate, amt: maxLossAmt, pct: maxLossPct, y: maxLossY },
    }
  }, [dcaSeries])

  // --- Tooltip
  const numberFmt = useMemo(() => new Intl.NumberFormat("ja-JP"), [])
  const yen = (n: number) => `¥${numberFmt.format(Math.round(n))}`
  const signedYen = (n: number) => `${n >= 0 ? "+" : "-"}${yen(Math.abs(n))}`
  const pctText = (p: number) => `${(p * 100).toFixed(2)}%`

  function CustomTooltip({ active, label }: { active?: boolean; label?: string }) {
    if (!active || !label) return null
    let aum = 0, base = 0, retAbs = 0, retPct = 0

    if (mode === "lump") {
      const idx = (portfolioIndex.find(r => r.date === label)?.total) ?? 1
      base = baseAumMan * MAN_YEN
      aum = base * idx
      retAbs = aum - base
      retPct = base > 0 ? (retAbs / base) : 0
    } else {
      const d = dcaSeries.find(x => x.date === label)
      base = d?.contrib ?? 0
      aum = d?.aum ?? 0
      retAbs = aum - base
      retPct = base > 0 ? (retAbs / base) : 0
    }

    return (
      <div style={{
        background: "rgba(0,0,0,0.85)",
        color: "white",
        padding: "10px 12px",
        borderRadius: 12,
        border: "none",
        minWidth: 240
      }}>
        <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 6 }}>{label === lastDate ? "今日" : label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {yen(aum)}
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 12, opacity: 0.95 }}>
          <span>元本 {yen(base)}</span>
          <span>／ 損益 {signedYen(retAbs)}（{pctText(retPct)}）</span>
        </div>
      </div>
    )
  }

  // 右端の終点ラベル用：最後のデータ点だけに ticker を描く（色・大きめフォント）
  function makeEndLabel(dataLen: number, text: string, color: string) {
    return (props: any) => {
      const { x, y, index } = props
      if (index !== dataLen - 1 || x == null || y == null) return null
      return (
        <text x={x + 6} y={y} dy={4} fontSize={12} fill={color}>
          {text}
        </text>
      )
    }
  }

  // X軸：最新だけ「今日」と表示
  const xTickFormatter = (val: string) => (val === lastDate ? "今日" : val)

  // 左上バッジの文言
  const headerBadge = useMemo(() => {
    if (mode === "lump") {
      const invested = baseAumMan * MAN_YEN
      return `開始時に ${yen(invested)} 投資していた時の今日の運用額: ${yen(currentAum)}`
    } else {
      const contrib = dcaSeries.at(-1)?.contrib ?? 0
      return `開始以来の元本: ${yen(contrib)} ／ 今日の運用額: ${yen(currentAum)}`
    }
  }, [mode, baseAumMan, currentAum, dcaSeries])

  // チャート余白（右端ラベルが潰れないように広め）
  const chartMargin = { top: 36, right: 120, bottom: 12, left: 8 }

  // 合計線の色
  const totalColor = "#8b5cf6"
  // 個別線の色パレット
  const seriesColors = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#22c55e", "#a855f7"]

  // 現タブの「最大含み益／最大含み損」を取り出し
  const activeExtremes = mode === "lump" ? lumpExtremes : dcaExtremes

  return (
    <div className="min-h-screen bg-purple-50 py-8">
      <div className="mx-auto max-w-6xl rounded-3xl bg-white shadow-xl p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight">資産運用シミュレーション</h1>
        </div>

        {/* コントロール群 */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-2xl bg-gray-100 p-1 shadow-inner" role="tablist" aria-label="mode-tabs">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "lump"}
              className={`px-4 py-2 rounded-2xl text-sm font-semibold transition ${mode === "lump" ? "bg-purple-600 text-white shadow" : "hover:bg-white"}`}
              onClick={() => setMode("lump")}
            >
              一括
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "dca"}
              className={`px-4 py-2 rounded-2xl text-sm font-semibold transition ${mode === "dca" ? "bg-purple-600 text-white shadow" : "hover:bg-white"}`}
              onClick={() => setMode("dca")}
            >
              積立
            </button>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {(["1M","3M","1Y","3Y","5Y","MAX"] as RangeKey[]).map(k => (
              <button
                key={k}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${range === k ? "bg-gray-900 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
                onClick={() => setRange(k)}
              >
                {k === "1M" && "1ヶ月"}
                {k === "3M" && "3ヶ月"}
                {k === "1Y" && "1年"}
                {k === "3Y" && "3年"}
                {k === "5Y" && "5年"}
                {k === "MAX" && "最大"}
              </button>
            ))}
          </div>
        </div>

        {/* 入力（万円） */}
        <div className="mt-3 flex flex-wrap items-end gap-4">
          {mode === "lump" ? (
            <label className="text-sm">
              一括投資額（万円）
              <input
                type="number"
                inputMode="numeric"
                className="ml-2 w-32 rounded-md border px-2 py-1 text-right"
                min={0}
                step={1}
                value={Number.isFinite(baseAumMan) ? baseAumMan : 0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setBaseAumMan(Number.isFinite(v) ? v : 0)
                }}
              />
            </label>
          ) : (
            <>
              <label className="text-sm">
                頭金（万円）
                <input
                  type="number"
                  inputMode="numeric"
                  className="ml-2 w-32 rounded-md border px-2 py-1 text-right"
                  min={0}
                  step={1}
                  value={Number.isFinite(dcaInitialMan) ? dcaInitialMan : 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setDcaInitialMan(Number.isFinite(v) ? v : 0)
                  }}
                />
              </label>
              <label className="text-sm">
                毎月の積立額（万円）
                <input
                  type="number"
                  inputMode="numeric"
                  className="ml-2 w-32 rounded-md border px-2 py-1 text-right"
                  min={0}
                  step={1}
                  value={Number.isFinite(dcaMonthlyMan) ? dcaMonthlyMan : 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setDcaMonthlyMan(Number.isFinite(v) ? v : 0)
                  }}
                />
              </label>
            </>
          )}
        </div>

        {/* チャート */}
        <div className="mt-6" style={{ width: "100%", height: 480 }}>
          <div className="relative h-full w-full">
            {/* 左上オーバーレイ（ポップ表示） */}
            <div className="absolute left-4 top-3 z-10 rounded-xl bg-black/70 px-3 py-2 text-white text-sm font-semibold pointer-events-none shadow">
              {headerBadge}
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 36, right: 120, bottom: 12, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(v) => (v === lastDate ? "今日" : v)} />
                <YAxis tick={false} axisLine={false} width={0} />
                <YAxis yAxisId="right" orientation="right" hide />

                <Tooltip content={<CustomTooltip />} />
                <Legend />

                {mode === "dca" ? (
                  <>
                    {/* 積立元本：水色の点線 */}
                    <Line
                      yAxisId="right"
                      type="stepAfter"
                      dataKey="contrib"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      strokeDasharray="6 6"
                      dot={false}
                      name="積立元本"
                      isAnimationActive={false}
                    />
                    {/* AUM（紫・太線） */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="aum"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={false}
                      name="AUM"
                      isAnimationActive={false}
                    />

                    {/* 積立：最大含み益／最大含み損（％で判定、マーキング） */}
                    {dcaExtremes.maxGain.date && (
                      <>
                        <ReferenceLine x={dcaExtremes.maxGain.date} stroke="#10b981" strokeDasharray="4 4" />
                        <ReferenceDot x={dcaExtremes.maxGain.date} y={dcaExtremes.maxGain.y} r={4} fill="#10b981" />
                      </>
                    )}
                    {dcaExtremes.maxLoss.date && (
                      <>
                        <ReferenceLine x={dcaExtremes.maxLoss.date} stroke="#ef4444" strokeDasharray="4 4" />
                        <ReferenceDot x={dcaExtremes.maxLoss.date} y={dcaExtremes.maxLoss.y} r={4} fill="#ef4444" />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* 合計（紫・太線） */}
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={false}
                      name="合計"
                      isAnimationActive={false}
                    >
                      <LabelList
                        content={makeEndLabel(chartData.length, "ポートフォリオ", "#8b5cf6")}
                        dataKey="total"
                      />
                    </Line>

                    {/* 各ティッカー（凡例＆終点ラベルはticker、色も一致） */}
                    {tickers.map((t, i) => {
                      const color = seriesColors[i % seriesColors.length]
                      return (
                        <Line
                          key={t}
                          type="monotone"
                          dataKey={t}
                          stroke={color}
                          strokeWidth={1.5}
                          dot={false}
                          name={t}
                          connectNulls
                          isAnimationActive={false}
                        >
                          <LabelList
                            content={makeEndLabel(chartData.length, t, color)}
                            dataKey={t}
                          />
                        </Line>
                      )
                    })}

                    {/* 一括：最大含み益／最大含み損（％で判定、マーキング） */}
                    {lumpExtremes.maxGain.date && (
                      <>
                        <ReferenceLine x={lumpExtremes.maxGain.date} stroke="#10b981" strokeDasharray="4 4" />
                        <ReferenceDot x={lumpExtremes.maxGain.date} y={lumpExtremes.maxGain.y} r={4} fill="#10b981" />
                      </>
                    )}
                    {lumpExtremes.maxLoss.date && (
                      <>
                        <ReferenceLine x={lumpExtremes.maxLoss.date} stroke="#ef4444" strokeDasharray="4 4" />
                        <ReferenceDot x={lumpExtremes.maxLoss.date} y={lumpExtremes.maxLoss.y} r={4} fill="#ef4444" />
                      </>
                    )}
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 指標表示（選択タブに応じて切替、金額＋（％）） */}
        <div className="mt-4 text-sm text-gray-800 space-y-1">
          {mode === "lump" ? (
            <>
              <p>
                最大含み益: { (lumpExtremes.maxGain.amt >= 0 ? "+" : "-") }
                { Math.abs(Math.round(lumpExtremes.maxGain.amt)).toLocaleString("ja-JP") }円
                （{ ((lumpExtremes.maxGain.pct) * 100).toFixed(2) }%）
                {lumpExtremes.maxGain.date ? ` 〔${lumpExtremes.maxGain.date}〕` : ""}
              </p>
              <p>
                最大含み損: { (lumpExtremes.maxLoss.amt >= 0 ? "+" : "-") }
                { Math.abs(Math.round(lumpExtremes.maxLoss.amt)).toLocaleString("ja-JP") }円
                （{ ((lumpExtremes.maxLoss.pct) * 100).toFixed(2) }%）
                {lumpExtremes.maxLoss.date ? ` 〔${lumpExtremes.maxLoss.date}〕` : ""}
              </p>
            </>
          ) : (
            <>
              <p>
                最大含み益: { (dcaExtremes.maxGain.amt >= 0 ? "+" : "-") }
                { Math.abs(Math.round(dcaExtremes.maxGain.amt)).toLocaleString("ja-JP") }円
                （{ ((dcaExtremes.maxGain.pct) * 100).toFixed(2) }%）
                {dcaExtremes.maxGain.date ? ` 〔${dcaExtremes.maxGain.date}〕` : ""}
              </p>
              <p>
                最大含み損: { (dcaExtremes.maxLoss.amt >= 0 ? "+" : "-") }
                { Math.abs(Math.round(dcaExtremes.maxLoss.amt)).toLocaleString("ja-JP") }円
                （{ ((dcaExtremes.maxLoss.pct) * 100).toFixed(2) }%）
                {dcaExtremes.maxLoss.date ? ` 〔${dcaExtremes.maxLoss.date}〕` : ""}
              </p>
            </>
          )}
        </div>

        {/* スライダー群 */}
        <div className="mt-6">
          <PortfolioSliders
            tickers={tickers}
            weights={weights}
            setWeights={setWeights}
            onAddTicker={addTicker}
            onRemoveTicker={removeTicker}
          />
        </div>
        <Recommendation
  existingTickers={tickers}
  onAddMany={(symbols)=> {
    symbols.forEach(sym => addTicker(sym))
  }}
/>
      </div>
    </div>
  )
}
