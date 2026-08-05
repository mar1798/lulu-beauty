import type { StoryFn, Meta } from '@storybook/react'
import { Modal } from '.'
import { feedModal } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/Modal',
  component: Modal,
} satisfies Meta<typeof Modal>

const Template: StoryFn<typeof Modal> = args => (
  <StoryWrapper>
    <Modal {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedModal()
