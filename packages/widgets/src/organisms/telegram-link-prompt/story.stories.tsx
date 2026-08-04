import type { StoryFn, Meta } from '@storybook/react'
import { TelegramLinkPrompt } from '.'
import { feedTelegramLinkPrompt } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/TelegramLinkPrompt',
  component: TelegramLinkPrompt,
} satisfies Meta<typeof TelegramLinkPrompt>

const Template: StoryFn<typeof TelegramLinkPrompt> = args => (
  <StoryWrapper>
    <TelegramLinkPrompt {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedTelegramLinkPrompt()
