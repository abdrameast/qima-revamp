'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartFrame, ChartTooltip, type LegendEntry } from './ChartFrame'
import { AXIS_PROPS, CHART, GRID_PROPS } from './theme'
import { formatEuro, formatEuroCompact, formatMonth } from '@/lib/format'
import type { MonthlyPoint } from '@/lib/compute'

/**
 * Évolution du chiffre d'affaires — réalisé contre prévisionnel.
 *
 * `connectNulls={false}` est essentiel ici : un mois non saisi vaut `null`, et
 * la courbe doit s'**interrompre**. La relier ferait lire une progression
 * continue là où la donnée n'existe pas.
 */
export function RevenueChart({
  points,
  showBudget = true,
}: {
  points: MonthlyPoint[]
  showBudget?: boolean
}) {
  const data = points.map((point) => ({
    ...point,
    display: formatMonth(point.label).split(' ')[0],
  }))

  const hasBudget = showBudget && points.some((point) => point.budget !== null)

  const legend: LegendEntry[] = [
    { label: 'CA réalisé', color: CHART.primary },
    ...(hasBudget ? [{ label: 'CA prévisionnel', color: CHART.secondary, dashed: true }] : []),
  ]

  const realised = points.filter((p) => p.reel !== null)
  const total = realised.reduce((sum, p) => sum + (p.reel ?? 0), 0)

  const summary =
    realised.length === 0
      ? "Graphique d'évolution du chiffre d'affaires : aucun mois renseigné sur la période."
      : `Évolution mensuelle du chiffre d'affaires sur ${points.length} mois. ` +
        `${realised.length} mois renseignés, pour un total de ${formatEuro(total)}. ` +
        (hasBudget ? 'Le prévisionnel est superposé en trait discontinu.' : '')

  return (
    <ChartFrame
      legend={legend}
      summary={summary}
      height={280}
      footnote={
        realised.length < points.length
          ? `${points.length - realised.length} mois sans écriture : la courbe s'interrompt plutôt que de passer par zéro.`
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="display" {...AXIS_PROPS} />
          <YAxis
            {...AXIS_PROPS}
            axisLine={false}
            width={58}
            tickFormatter={(value: number) => formatEuroCompact(value)}
          />

          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <ChartTooltip
                  label={String(label)}
                  rows={payload
                    .filter((entry) => entry.value !== null && entry.value !== undefined)
                    .map((entry) => ({
                      name: entry.dataKey === 'reel' ? 'CA réalisé' : 'CA prévisionnel',
                      value: formatEuro(entry.value as number),
                      color: entry.dataKey === 'reel' ? CHART.primary : CHART.secondary,
                    }))}
                />
              )
            }}
          />

          <Area
            type="monotone"
            dataKey="reel"
            stroke={CHART.primary}
            strokeWidth={2}
            fill="url(#revenueFill)"
            dot={{ r: 2.5, fill: CHART.primary, strokeWidth: 0 }}
            activeDot={{ r: 4.5 }}
            connectNulls={false}
            name="reel"
          />

          {hasBudget && (
            <Line
              type="monotone"
              dataKey="budget"
              stroke={CHART.secondary}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              name="budget"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
