import type { StoryFn, Meta } from '@storybook/react'
import { FileDropzone } from '.'
import { feedFileDropzone } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/FileDropzone',
  component: FileDropzone,
} satisfies Meta<typeof FileDropzone>

const Template: StoryFn<typeof FileDropzone> = args => (
  <StoryWrapper>
    <FileDropzone {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedFileDropzone()
