/**
 * Вернуть страницу к началу.
 *
 * Нужно там, где содержимое меняется под пальцем, а экран остаётся внизу:
 * клик по пагинации подменяет весь список, и без прокрутки человек смотрит на
 * хвост новой страницы вместо её начала.
 *
 * Прокрутка плавная — подмена списка и так меняет всё сразу, и мгновенный
 * прыжок к началу отнимает последнюю подсказку о том, что именно произошло.
 * При `prefers-reduced-motion` движения нет: переход мгновенный, но результат
 * тот же.
 *
 * `behavior` задан явно, хотя в глобальных стилях у страницы и так
 * `scroll-behavior: smooth`: `<html data-scroll-behavior="smooth">` (см.
 * `_document.tsx`) велит Next на время перехода подменять его на `auto`
 * (`handleSmoothScroll`), и полагаться на CSS здесь нельзя.
 */
export const scrollToTop = (): void => {
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  window.scrollTo({ top: 0, behavior: isReduced ? 'auto' : 'smooth' })
}
