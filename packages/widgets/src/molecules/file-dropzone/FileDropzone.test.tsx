import { describe, expect, it } from 'vitest'
import { FileDropzone } from '.'
import { feedFileDropzone } from '../../stories/feed'
import { renderWidget } from '../../testing/render'

/**
 * Базовый smoke-тест: компонент рендерится с той же фикстурой, что и стори.
 * Осмысленные проверки (поведение, форматирование, доступность) дописываются
 * сюда же — чисто презентационным компонентам хватает этого теста и Storybook.
 */
describe('FileDropzone', () => {
  it('рендерится с фикстурой из feed', () => {
    const { container } = renderWidget(<FileDropzone {...feedFileDropzone()} />)

    expect(container.firstElementChild).not.toBeNull()
  })
})
