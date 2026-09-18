import { describe, expect, it } from 'vitest'
import { SearchField } from '.'
import { feedSearchField } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('SearchField', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<SearchField {...feedSearchField()} />)

    expect(container.firstElementChild).not.toBeNull()
  })

  /*
    Занятость показывается на месте лупы, а кнопка очистки остаётся: стереть
    набранное должно быть можно и во время запроса.
  */
  it('на время поиска подменяет лупу спиннером, не трогая очистку', () => {
    const feed = { ...feedSearchField(), value: 'крем' }

    const idle = renderWidget(<SearchField {...feed} />)

    expect(idle.container.querySelector('svg')).not.toBeNull()
    expect(idle.container.querySelector('[role="status"]')).toBeNull()

    idle.unmount()

    const busy = renderWidget(<SearchField {...feed} isBusy={true} />)

    expect(busy.container.querySelector('[role="status"]')).not.toBeNull()
    expect(busy.getByLabelText('Очистить поиск')).toBeInTheDocument()
  })
})
