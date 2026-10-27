// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import EcologyChart from './EcologyChart.vue'
import type { Report } from '../types'

it('opens retained generations from the physical-outcome chart using mouse or keyboard', async () => {
  const history = [0, 1, 2].map(
    (generation) =>
      ({
        generation,
        ecology: {
          captures_per_predator: generation + 1,
          prey_survival_seconds: 20 + generation,
          food_per_prey: 2,
        },
      }) as Report,
  )
  const chart = mount(EcologyChart, { props: { history, available: [0, 2], metric: 'survival' } })
  const markers = chart.findAll('[role="button"]')
  expect(markers).toHaveLength(2)
  expect(markers[1].attributes('aria-label')).toContain('22.00 seconds average prey lifetime')
  await markers[0].trigger('click')
  await markers[1].trigger('keydown', { key: 'Enter' })
  expect(chart.emitted('observe')).toEqual([[0], [2]])
})
