import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Tailwind のクラス名をマージするユーティリティ
 * - falsy な値は無視される
 * - 重複するクラスは後勝ち
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
