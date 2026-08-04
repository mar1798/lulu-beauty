import type { StoryFn, Meta } from '@storybook/react'
import { FileInput } from '.'
import { feedFileInput } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/FileInput',
  component: FileInput,
} satisfies Meta<typeof FileInput>

const Template: StoryFn<typeof FileInput> = args => (
  <StoryWrapper>
    <FileInput {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedFileInput()
