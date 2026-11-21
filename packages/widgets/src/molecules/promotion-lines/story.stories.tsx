import type { StoryFn, Meta } from '@storybook/react'
import { PromotionLines } from '.'
import { feedPromotionLines } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/PromotionLines',
  component: PromotionLines,
} satisfies Meta<typeof PromotionLines>

const Template: StoryFn<typeof PromotionLines> = args => (
  <StoryWrapper>
    <PromotionLines {...args} />
  </StoryWrapper>
)

/** Строки скидок для блока итогов. */
export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = feedPromotionLines()

/** С применённым промокодом: отдельная строка скидки. */
export const WithCode = Template.bind({})
WithCode.parameters = Default.parameters
WithCode.args = { ...feedPromotionLines(), code: { code: 'K7M2XQ9R', discountCents: 30_000 } }

/** «Ещё N сом до акции» - подсказка над итогом. */
export const Hints = Template.bind({})
Hints.parameters = Default.parameters
Hints.args = { ...feedPromotionLines(), kind: 'hints' }

export const HintsMobile = Template.bind({})
HintsMobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
HintsMobile.args = Hints.args
