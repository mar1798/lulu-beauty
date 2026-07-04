import React from 'react'
import type { Meta, StoryFn } from '@storybook/react'
import { AppLink } from '.'
import { StoryWrapper } from '../../stories/wrapper'
import { feedLink } from '../../stories/feed'

export default {
  title: 'Atoms/AppLink',
  component: AppLink,
} satisfies Meta<typeof AppLink>

const template: StoryFn<typeof AppLink> = args => (
  <StoryWrapper>
    <AppLink {...args}>Link text</AppLink>
  </StoryWrapper>
)

export const Default = template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedLink()
