import { useState } from 'react'
import type { StoryFn, Meta } from '@storybook/react'
import { PromoCodeField } from '.'
import { feedPromoCodeField } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/PromoCodeField',
  component: PromoCodeField,
} satisfies Meta<typeof PromoCodeField>

const Template: StoryFn<typeof PromoCodeField> = args => {
  const [value, setValue] = useState(args.value)

  return (
    <StoryWrapper>
      <PromoCodeField {...args} value={value} onChange={setValue} />
    </StoryWrapper>
  )
}

export const Default = Template.bind({})
Default.parameters = { layout: 'padded' }
Default.args = feedPromoCodeField()

export const WithError = Template.bind({})
WithError.parameters = Default.parameters
WithError.args = {
  ...feedPromoCodeField(),
  value: 'ZZZZ0000',
  error: 'Такого промокода нет или он принадлежит не вам',
}

export const Checking = Template.bind({})
Checking.parameters = Default.parameters
Checking.args = { ...feedPromoCodeField(), value: 'K7M2XQ9R', isChecking: true }

export const Applied = Template.bind({})
Applied.parameters = Default.parameters
Applied.args = {
  ...feedPromoCodeField(),
  applied: { code: 'K7M2XQ9R', discountCents: 52_000, description: 'Скидка 15%' },
}

export const Mobile = Template.bind({})
Mobile.parameters = { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } }
Mobile.args = Default.args
