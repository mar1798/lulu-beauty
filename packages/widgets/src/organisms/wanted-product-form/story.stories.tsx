import type { StoryFn, Meta } from '@storybook/react'
import { WantedProductForm } from '.'
import { feedWantedProductForm } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/WantedProductForm',
  component: WantedProductForm,
} satisfies Meta<typeof WantedProductForm>

const Template: StoryFn<typeof WantedProductForm> = args => (
  <StoryWrapper>
    <WantedProductForm {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'centered',
}
Default.args = feedWantedProductForm()

/** Покупатель вошёл: контакт известен, остаётся одно поле. */
export const SignedIn = Template.bind({})
SignedIn.parameters = { layout: 'centered' }
SignedIn.args = { ...feedWantedProductForm(), isSignedIn: true }

/** Внутри выпадающего списка поиска: без своей карточки и с полем пониже. */
export const Compact = Template.bind({})
Compact.parameters = { layout: 'centered' }
Compact.args = { ...feedWantedProductForm(), isCompact: true, isSignedIn: true }

export const Sent = Template.bind({})
Sent.parameters = { layout: 'centered' }
Sent.args = { ...feedWantedProductForm(), isSent: true }
