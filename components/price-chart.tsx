"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEuro } from "@/lib/format";

/** Histórico de preço de mercado PT do modelo. */
export function PriceChart({ data }: { data: { month: string; price: number }[] }) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--steel)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--steel)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "var(--ink-soft)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            hide
            domain={["dataMin - 1500", "dataMax + 1500"]}
          />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--ink-soft)" }}
            formatter={(value: number) => [formatEuro(value), "Preço PT"]}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="var(--petrol-ink)"
            strokeWidth={2}
            fill="url(#priceFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
