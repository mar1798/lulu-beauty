import React from 'react'
import type { Meta, StoryFn } from '@storybook/react'
import { AppImage } from '.'
import { feedImage } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Atoms/AppImage',
  component: AppImage,
} satisfies Meta<typeof AppImage>

const template: StoryFn<typeof AppImage> = args => (
  <StoryWrapper>
    <AppImage {...args} />
  </StoryWrapper>
)

export const Default = template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = {
  image: feedImage(300, 200),
  sizes: { fb: 300 },
}
