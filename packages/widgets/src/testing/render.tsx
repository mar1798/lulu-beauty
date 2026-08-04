import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { StoryWrapper } from '../stories/wrapper'

/**
 * Рендер виджета в тестах. Оборачивает в тот же `StoryWrapper`, что и
 * Storybook, — иначе любой компонент, дотягивающийся до `AppLink`/`AppImage`,
 * падал бы на пустом `ServicesContext`.
 */
export const renderWidget = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult => render(ui, { wrapper: StoryWrapper, ...options })
