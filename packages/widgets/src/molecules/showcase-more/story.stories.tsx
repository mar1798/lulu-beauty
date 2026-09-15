import type { StoryFn, Meta } from '@storybook/react'
import { ShowcaseMore } from '.'
import { feedShowcaseMore } from '../../stories/feed'
import { StoryWrapper } from '../../stories/wrapper'

export default {
  title: 'Molecules/ShowcaseMore',
  component: ShowcaseMore,
} satisfies Meta<typeof ShowcaseMore>

/*
  Ширина и высота плитки — дело ряда, в котором она стоит (в герое это лента
  витрины). В отдельной сцене их приходится задать руками, иначе плитка
  схлопывается по содержимому и о её настоящих пропорциях ничего не скажешь.
*/
const Template: StoryFn<typeof ShowcaseMore> = args => (
  <StoryWrapper>
    <div style={{ width: 170, height: 306 }}>
      <ShowcaseMore {...args} />
    </div>
  </StoryWrapper>
)

export const Default = Template.bind({})
Default.parameters = { layout: 'centered' }
Default.args = feedShowcaseMore()

/** Без подсказки: счётчик каталога странице может быть неоткуда взять. */
export const WithoutHint = Template.bind({})
WithoutHint.parameters = { layout: 'centered' }
WithoutHint.args = { ...feedShowcaseMore(), hint: undefined }
