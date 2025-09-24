"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Slider } from "@/components/ui/slider"
import { COLORS } from "@/components/colors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Plus, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type TickerInfo = {
  ticker: string
  name: string
}

type Props = {
  tickers: string[]
  weights: Record<string, number>
  setWeights: (w: Record<string, number>) => void
  onAddTicker: (t: string) => void
  onRemoveTicker: (t: string) => void
}

export default function PortfolioSliders({
  tickers, weights, setWeights, onAddTicker, onRemoveTicker
}: Props) {
  const [locked, setLocked] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<TickerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [openSuggest, setOpenSuggest] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // ticker -> name のマッピング
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  const toggleLock = (ticker: string) => {
    setLocked({ ...locked, [ticker]: !locked[ticker] })
  }

  const handleSliderChange = (ticker: string, newValue: number) => {
    const newWeights = { ...weights, [ticker]: newValue }

    const lockedSum = tickers.reduce(
      (sum, t) => sum + (locked[t] ? (newWeights[t] ?? 0) : 0),
      0
    )
    const freeTickers = tickers.filter((t) => !locked[t] && t !== ticker)
    let remaining = 100 - lockedSum - newValue

    if (remaining < 0) remaining = 0
    if (freeTickers.length > 0) {
      const share = Math.floor(remaining / freeTickers.length)
      freeTickers.forEach((t) => {
        newWeights[t] = share
      })
      const diff =
        100 - Object.values(newWeights).reduce((a, b) => a + (b ?? 0), 0)
      if (diff !== 0) {
        newWeights[freeTickers[0]] += diff
      }
    }

    setWeights(newWeights)
  }

  // ---- Supabase で ticker と name を別々に検索して統合 ----
  useEffect(() => {
    let ignore = false
    const q = query.trim()
    if (!q) {
      setSuggestions([])
      setHighlight(0)
      return
    }
    setLoading(true)

    const id = setTimeout(async () => {
      try {
        // ticker検索
        const { data: tickerData, error: err1 } = await supabase
          .from("prices")
          .select("ticker, name")
          .ilike("ticker", `%${q}%`)
          .limit(30)

        if (err1) throw err1

        // name検索
        const { data: nameData, error: err2 } = await supabase
          .from("prices")
          .select("ticker, name")
          .ilike("name", `%${q}%`)
          .limit(30)

        if (err2) throw err2

        if (ignore) return

        // 結果をマージ & 重複削除
        const merged: TickerInfo[] = []
        const seen = new Set<string>()
        ;[...(tickerData ?? []), ...(nameData ?? [])].forEach((d: any) => {
          if (!seen.has(d.ticker)) {
            merged.push({ ticker: d.ticker, name: d.name })
            seen.add(d.ticker)
          }
        })

        // ソート（日本株は数字優先、米国株はアルファベット優先）
        merged.sort((a, b) => a.ticker.localeCompare(b.ticker))

        setSuggestions(merged)
        setHighlight(0)
      } catch (err) {
        console.error(err)
        setSuggestions([])
      } finally {
        setLoading(false)
        setOpenSuggest(true)
      }
    }, 200)

    return () => { ignore = true; clearTimeout(id) }
  }, [query])

  // ---- 外側クリックでサジェストを閉じる ----
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current) return
      if (boxRef.current.contains(e.target as Node)) return
      setOpenSuggest(false)
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [])

  const selectSuggestion = useCallback((s: TickerInfo) => {
    const val = s.ticker.toUpperCase()
    if (!tickers.includes(val)) {
      onAddTicker(val)
      setNameMap(prev => ({ ...prev, [val]: s.name }))
    }
    setQuery("")
    setOpenSuggest(false)
  }, [onAddTicker, tickers])

  const handleEnter = () => {
    if (!openSuggest) {
      setOpenSuggest(true)
      return
    }
  }

  const handleClickAdd = () => {
    if (!openSuggest) setOpenSuggest(true)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      handleEnter()
      return
    }

    if (!openSuggest) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      e.stopPropagation()
      setHighlight((h) => Math.min(h + 1, Math.max(0, suggestions.length - 1)))
      requestAnimationFrame(() => {
        const list = listRef.current
        const item = list?.querySelectorAll<HTMLButtonElement>('[role="option"]')[Math.min(highlight + 1, suggestions.length - 1)]
        item?.scrollIntoView({ block: "nearest" })
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      e.stopPropagation()
      setHighlight((h) => Math.max(h - 1, 0))
      requestAnimationFrame(() => {
        const list = listRef.current
        const item = list?.querySelectorAll<HTMLButtonElement>('[role="option"]')[Math.max(highlight - 1, 0)]
        item?.scrollIntoView({ block: "nearest" })
      })
    } else if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      setOpenSuggest(false)
    }
  }

  const visibleTickers = useMemo(() => tickers, [tickers])

  return (
    <div className="space-y-4">
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">ポートフォリオ比率</div>
        <div className="relative flex items-center gap-2" ref={boxRef}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpenSuggest(true)
              }}
              onFocus={() => setOpenSuggest(true)}
              placeholder="銘柄コードや企業名で検索"
              className="pl-8 w-64"
              onKeyDown={onKeyDown}
              type="search"
              autoComplete="off"
            />
            {openSuggest && (loading || suggestions.length > 0) && (
              <div
                id="ticker-suggest"
                ref={listRef}
                role="listbox"
                className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-md max-h-64 overflow-auto"
              >
                {loading && (
                  <div className="px-3 py-2 text-sm text-gray-500">検索中...</div>
                )}
                {!loading && suggestions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">候補なし</div>
                )}
                {!loading && suggestions.map((s, i) => {
                  const added = tickers.includes(s.ticker.toUpperCase())
                  const active = i === highlight

                  // 日本株なら 9984.T → 9984
                  const displayTicker = s.ticker.endsWith(".T")
                    ? s.ticker.replace(".T", "")
                    : s.ticker

                  return (
                    <button
                      key={s.ticker}
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm",
                        active ? "bg-gray-100" : "hover:bg-gray-50",
                        added && "text-gray-400"
                      )}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => selectSuggestion(s)}
                      disabled={added}
                      type="button"
                    >
                      ({displayTicker}) {s.name}{added ? "（追加済）" : ""}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <Button size="sm" onClick={handleClickAdd} type="button">
            <Plus className="h-4 w-4 mr-1" />
            追加
          </Button>
        </div>
      </div>

      {/* スライダー行 */}
      {visibleTickers.map((ticker, i) => {
        const color = COLORS[i % COLORS.length]
        const name = nameMap[ticker] ?? ticker

        // 表示用 ticker (日本株なら 9984)
        const displayTicker = ticker.endsWith(".T")
          ? ticker.replace(".T", "")
          : ticker

        return (
          <div key={ticker} className="space-y-1 rounded-xl border p-3">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium" style={{ color }}>
                ({displayTicker}) {name}
              </span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">{weights[ticker] ?? 0}%</span>
                <Button
                  size="sm"
                  variant={locked[ticker] ? "default" : "outline"}
                  onClick={() => toggleLock(ticker)}
                  type="button"
                >
                  {locked[ticker] ? "固定中" : "固定"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveTicker(ticker)}
                  aria-label={`${ticker} を削除`}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Slider
              value={[weights[ticker] ?? 0]}
              max={100}
              step={1}
              disabled={locked[ticker]}
              onValueChange={(val) => handleSliderChange(ticker, val[0])}
            />
          </div>
        )
      })}
    </div>
  )
}
