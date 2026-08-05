import type { StoryFn, Meta } from '@storybook/react'
import { ErrorTemplate } from '.'
import { Button } from '../../atoms/button'
import { Text } from '../../atoms/text'
import { feedErrorTemplate } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Templates/ErrorTemplate',
  component: ErrorTemplate,
} satisfies Meta<typeof ErrorTemplate>

const Template: StoryFn<typeof ErrorTemplate> = args => (
  <StoryWrapper>
    <ErrorTemplate {...args} />
  </StoryWrapper>
)

/** Экран занимает страницу целиком — `padded` обрезал бы центрирование. */
const LAYOUT = { layout: 'fullscreen' }

export const NotFound = Template.bind({})
NotFound.parameters = LAYOUT
NotFound.args = {
  ...feedErrorTemplate(),
  actions: (
    <>
      <Button link={{ href: '/catalog' }}>В каталог</Button>

      <Button link={{ href: '/' }} variant="secondary">
        На главную
      </Button>
    </>
  ),
}

export const ServerError = Template.bind({})
ServerError.parameters = LAYOUT
ServerError.args = {
  code: '500',
  title: 'Что-то сломалось на нашей стороне',
  description: 'Мы уже знаем об этом. Попробуйте обновить страницу через минуту.',
  actions: <Button>Обновить страницу</Button>,
  details: (
    <Text size="sm" tone="muted">
      Если повторяется — напишите владельцу, это ускорит починку.
    </Text>
  ),
}

/** Без кода: тем же шаблоном рисуется «раздел временно недоступен». */
export const WithoutCode = Template.bind({})
WithoutCode.parameters = LAYOUT
WithoutCode.args = {
  title: 'Каталог сейчас недоступен',
  description: 'Не получилось получить список товаров. Это ненадолго.',
  actions: <Button>Повторить</Button>,
}
