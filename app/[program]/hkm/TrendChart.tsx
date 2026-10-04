"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export function TrendChart({ data }: { data: { date: string; avgJuz: number; participants: number }[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-card p-4 dark:border-neutral-800">
      {/* Garis tren mewarisi `currentColor` dari div ini (emerald = setoran naik). */}
      <div className="text-emerald-600 dark:text-emerald-400" style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-200 dark:text-neutral-800" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelFormatter={(d) => `Tanggal ${d}`}
              formatter={(v) => [`${v} juz`, "Rata²"]}
            />
            <Line
              type="monotone"
              dataKey="avgJuz"
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
