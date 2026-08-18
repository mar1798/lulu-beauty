import type { StoryFn, Meta } from '@storybook/react'
import { BrandMarquee } from '.'
import { feedBrandMarquee } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/BrandMarquee',
  component: BrandMarquee,
} satisfies Meta<typeof BrandMarquee>

const Template: StoryFn<typeof BrandMarquee> = args => (
  <StoryWrapper>
    <BrandMarquee {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedBrandMarquee()
