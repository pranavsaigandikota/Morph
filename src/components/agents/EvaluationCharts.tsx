import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EvaluationResult } from '../../types/agents'

interface Props {
  result: EvaluationResult
}

const tooltipStyle = {
  background: '#11161d',
  border: '1px solid #243040',
  borderRadius: 8,
  fontSize: 12,
}

export function EvaluationCharts({ result }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-line bg-panel p-4">
        <h3 className="mb-3 font-display text-sm font-bold text-soft">Training curve</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={result.training_curve}>
              <CartesianGrid stroke="#243040" strokeDasharray="3 3" />
              <XAxis dataKey="step" stroke="#6b7c90" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6b7c90" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="reward"
                stroke="#2ee6d6"
                strokeWidth={2}
                dot={false}
                name="Reward"
              />
              <Line
                type="monotone"
                dataKey="success_rate"
                stroke="#f5a623"
                strokeWidth={2}
                dot={false}
                name="Success rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-panel p-4">
        <h3 className="mb-3 font-display text-sm font-bold text-soft">Episode rewards</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={result.episodes}>
              <CartesianGrid stroke="#243040" strokeDasharray="3 3" />
              <XAxis dataKey="episode" stroke="#6b7c90" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6b7c90" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="reward" fill="#2ee6d6" radius={[4, 4, 0, 0]} name="Reward" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
