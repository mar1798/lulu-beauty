import type { StoryFn, Meta } from '@storybook/react'
import { Float } from '.'
import { feedFloat } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/Float',
  component: Float,
} satisfies Meta<typeof Float>

const Template: StoryFn<typeof Float> = args => (
  <StoryWrapper>
    <Float {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedFloat()

/**
 * Три соседа — сцена, ради которой атом и заведён: движение обязано читаться
 * как дыхание кластера, а не как дрожание блока целиком. Одинаковая фаза даёт
 * именно второе, поэтому смотреть этот атом поодиночке бессмысленно.
 */
const PHASES = [0, 0.35, 0.7]

export const Cluster: StoryFn<typeof Float> = () => (
  <StoryWrapper>
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
      {PHASES.map(phase => (
        <Float key={phase} phase={phase}>
          <div
            style={{
              width: 120,
              height: 160,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 28,
              background: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)',
            }}
          >
            {`phase ${phase}`}
          </div>
        </Float>
      ))}
    </div>
  </StoryWrapper>
)
Cluster.parameters = { layout: 'centered' }
