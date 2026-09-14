import type { StoryFn, Meta } from '@storybook/react'
import { Footer } from '.'
import { feedFooter } from '../../stories/feed'
import { IconInstagram } from '../../svg/icons'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Organisms/Footer',
  component: Footer,
} satisfies Meta<typeof Footer>

const Template: StoryFn<typeof Footer> = args => (
  <StoryWrapper>
    <Footer {...args} />
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = {
  layout: 'fullscreen',
}
Default.args = feedFooter()

/** Колонка контактов: внешняя ссылка со знаком сети перед подписью. */
export const WithContacts = Template.bind({})
WithContacts.parameters = {
  layout: 'fullscreen',
}
WithContacts.args = {
  ...feedFooter(),
  columns: [
    ...feedFooter().columns,
    {
      title: 'Контакты',
      links: [
        {
          label: 'Instagram',
          icon: <IconInstagram />,
          link: { href: 'https://www.instagram.com/sululu_kg', target: '_blank' },
        },
      ],
    },
  ],
}
