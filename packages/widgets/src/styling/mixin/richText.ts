import { globalStyle } from '@vanilla-extract/css'
import { color, font, rem } from '../lib'
import { vars } from '../themes/contract.css'

/**
 * Типографика описания товара — для всего, что лежит внутри `scope`.
 *
 * Одна на двоих: на витрине её носит `RichText`, в админке — поле
 * `RichTextEditor`. Владелец должен видеть в редакторе ровно ту страницу,
 * которую увидит покупатель: разойдись отступы или маркеры, он подгонял бы
 * текст под редактор, а не под сайт.
 *
 * Правила глобальные, но привязаны к классу-контейнеру: разметку рисует не
 * React-компонент, а HTML из базы (и ProseMirror в редакторе), так что
 * навесить классы на каждый `<p>` и `<li>` нечем.
 *
 * Вызывается только из `.css.ts` — `globalStyle` вне него не работает.
 */
export function richTextContent(scope: string): void {
  globalStyle(`${scope} > * + *`, {
    marginTop: vars.space.sm,
  })

  /*
    Подзаголовок крупнее текста на ступень веса, а не кегля: описание стоит
    в колонке рядом с ценой и кнопкой, и настоящий заголовок перетянул бы на
    себя страницу. Отступ сверху больше абзацного — он отделяет раздел.
  */
  globalStyle(`${scope} h2`, {
    font: font('16/24', 600),
    color: color.text('primary'),
  })

  globalStyle(`${scope} > * + h2`, {
    marginTop: vars.space.lg,
  })

  globalStyle(`${scope} strong`, {
    fontWeight: 600,
    color: color.text('primary'),
  })

  globalStyle(`${scope} a`, {
    color: color.text('brand'),
    textDecorationLine: 'underline',
    textUnderlineOffset: rem(3),
  })

  /*
    Маркеры — свои, псевдоэлементами, как в `LegalTemplate`: `list-style`
    снят в preflight на весь документ, и возвращать его одному списку значит
    зависеть от того, что под ним понимает браузер.
  */
  globalStyle(`${scope} ul, ${scope} ol`, {
    display: 'flex',
    flexDirection: 'column',
    gap: vars.space.xxs,
    paddingLeft: vars.space.xs,
  })

  globalStyle(`${scope} ol`, {
    counterReset: 'rich-text-item',
  })

  globalStyle(`${scope} li`, {
    position: 'relative',
    paddingLeft: vars.space.lg,
  })

  globalStyle(`${scope} ul > li::before`, {
    content: '""',
    position: 'absolute',
    left: rem(6),
    // Кружок ловится на середину первой строки, а не на её верх.
    top: rem(10),
    width: rem(5),
    height: rem(5),
    borderRadius: '50%',
    backgroundColor: color.border('strong'),
  })

  globalStyle(`${scope} ol > li`, {
    counterIncrement: 'rich-text-item',
  })

  globalStyle(`${scope} ol > li::before`, {
    content: 'counter(rich-text-item) "."',
    position: 'absolute',
    left: 0,
    fontVariantNumeric: 'tabular-nums',
    color: color.text('muted'),
  })

  // Пункт списка в редакторе — это `<li><p>…</p></li>`: абзацу внутри пункта
  // свой отступ не нужен, иначе список расползается.
  globalStyle(`${scope} li > p`, {
    margin: 0,
  })
}
