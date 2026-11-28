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

/** Слот сезонного декора: три плейсхолдера разной высоты у верхнего края, под содержимым. */
export const WithDecor = Template.bind({})
WithDecor.parameters = {
  layout: 'fullscreen',
}
WithDecor.args = {
  ...feedFooter(),
  decor: (
    <>
      {[40, 56, 48].map((height, index) => (
        <span
          key={height}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 8,
            right: 16 + index * 56,
            width: Math.round(height * 0.8),
            height,
            borderRadius: 8,
            background: '#d9534f',
            opacity: 0.7,
          }}
        />
      ))}
    </>
  ),
}
