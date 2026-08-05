import type { StoryFn, Meta } from '@storybook/react'
import { ProfileForm } from '.'
import { feedProfileForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/ProfileForm',
  component: ProfileForm,
} satisfies Meta<typeof ProfileForm>

const Template: StoryFn<typeof ProfileForm> = args => (
  <StoryWrapper>
    <ProfileForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedProfileForm()

/** Скелетон вместо спиннера: раскладка известна заранее, страница не прыгает. */
export const Loading = Template.bind({})
Loading.parameters = { layout: 'padded' }
Loading.args = { ...feedProfileForm(), user: null, isLoading: true }
