import { globalStyle, style } from '@vanilla-extract/css'
import { color } from '../../styling/lib/color'
import { font } from '../../styling/lib/font'
import { rem } from '../../styling/lib/rem'
import { media } from '../../styling/lib/media'
import { flexColumn, flexRow } from '../../styling/mixin'
import { vars } from '../../styling/themes/contract.css'

/**
 * От `md` галерея и описание встают в два столбца. Раньше они делили ширину
 * поровну — картинка выходила огромной; галерея сужена вдвое (с 1fr до 3fr
 * у соседней колонки — то есть с 50% примерно до 25% ширины), а планшет
 * специально не отделён от десктопа: с `md` до бесконечности — одна и та
 * же пропорция.
 */
export const container = style({
  ...flexColumn(32),
  ...media({
    md: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3fr)',
      gap: vars.space.xxl,
      alignItems: 'start',
    },
  }),
})

export const info = style(flexColumn(16))

export const tags = style({
  ...flexRow(6),
  flexWrap: 'wrap',
})

export const priceRow = style({
  ...flexRow(12),
  alignItems: 'center',
  flexWrap: 'wrap',
})

/**
 * Переключатель объёма стоит между ценой и описанием: выбор меняет цену прямо
 * над собой, и связь между ними должна быть видна без прокрутки. Отступ сверху
 * чуть больше колоночного — ряд кнопок иначе слипается со строкой цены.
 */
export const variants = style({
  marginTop: vars.space.xs,
})

export const description = style({
  whiteSpace: 'pre-line',
})

/**
 * То же описание из редактора: кегль и цвет — как у простого текста выше
 * (`Text` md, `secondary`), чтобы товар с оформлением и без читались одной
 * страницей. Остальное — `richTextContent` внутри `RichText`.
 */
export const descriptionRich = style({
  font: font('16/24'),
  color: color.text('secondary'),
})

/**
 * Строка действий: подписанная «в корзину» во всю оставшуюся ширину и круглое
 * сердце рядом.
 *
 * Сердце — иконкой, а не второй подписанной кнопкой: подписи делили строку
 * пополам, и на узком экране ужимались обе, хотя действия не равны. Главное
 * обязано читаться словами, второе опознаётся сердцем — тем же, что в углу
 * карточки каталога.
 *
 * Переноса нет: сердце фиксированной ширины, а кнопка занимает остаток, так
 * что вдвоём они помещаются в строку и на 320px.
 */
export const action = style({
  /*
    Зазор у строки нулевой, а промежутки розданы самим слотам отступами.
    Общий `gap` держал бы 8px и вокруг свёрнутого количества — то есть
    строка дёргалась бы на эти 8px в конце анимации, когда пустой слот
    наконец размонтируется.
  */
  ...flexRow(0),
  alignItems: 'center',
  marginTop: vars.space.xs,
})

/**
 * Количество. Появляется у позиции, которая уже в корзине, выездом по
 * ширине — поэтому содержимое подрезается: оно обязано держать свой размер,
 * пока коробка вокруг него едет от нуля.
 *
 * Подрезает `clip-path`, а не `overflow: hidden`: тот режет ровно по краю
 * коробки и срезал бы степперу тень со всех сторон — и в покое, не только
 * в движении. Здесь же режет только правый край, по которому и идёт выезд;
 * сверху, снизу и слева область отодвинута наружу, на тень с запасом.
 *
 * Отдельный слот, а не часть `actionPrimary`, намеренно: тот ужимает поля и
 * кегль любой кнопке внутри себя (`globalStyle` ниже), а кнопки степпера
 * квадратные — их эти правила просто расплющили бы.
 */
export const actionQuantity = style({
  flex: '0 0 auto',
  clipPath: `inset(calc(-1 * ${vars.space.sm}) 0 calc(-1 * ${vars.space.sm}) calc(-1 * ${vars.space.sm}))`,
})

/**
 * Само количество: своя ширина по содержимому и зазор до кнопки **внутри**
 * анимируемой коробки — так он сворачивается вместе с ней, а не остаётся
 * висеть пустым промежутком (см. `action` выше).
 */
export const actionQuantityInner = style({
  display: 'flex',
  width: 'max-content',
  paddingRight: vars.space.xs,
  ...media({
    md: { paddingRight: vars.space.md },
  }),
})

/* Действия — слоты из `apps/website`, поэтому раскладка задаётся отсюда. */
export const actionPrimary = style({
  flex: '1 1 auto',
  minWidth: 0,
  ...media({
    /* С `md` — по содержимому: во всю ширину колонки кнопка выглядит плакатом. */
    md: { flex: '0 1 auto' },
  }),
})

/**
 * Ширину задаёт анимация, а не раскладка: кнопка ужата в круг или едет в него
 * (и обратно). Растяжение снимается на всё это время — иначе `flex-grow`
 * разложил бы по строке свободное место поверх заданной ширины и кнопка
 * мгновенно возвращалась бы на всю строку.
 */
export const actionPrimaryFixed = style({
  flex: '0 0 auto',
  ...media({
    md: { flex: '0 0 auto' },
  }),
})

/**
 * Кнопка уже ужата в круг. Отдельный класс от `actionPrimaryFixed`
 * намеренно: тот висит и на обратном ходе, а этот — нет. На обратном ходе
 * кнопка обязана быть собой (с полями и по содержимому), иначе `auto` в
 * анимации меряет не её, а иконку внутри круга, и разворачиваться некуда:
 * на `md`, где растяжения нет вовсе, кнопка так и осталась бы кружком.
 */
export const actionPrimaryCompact = style({})

/**
 * Кнопка в движении: подпись подрезается. Ширину коробке в этот момент ведёт
 * анимация, а подпись остаётся во всю свою длину и без подрезки наезжала бы
 * на сердце.
 *
 * Подрезает себя сама кнопка (правило ниже), а не коробка вокруг неё: в
 * коробке рисуется абсолютный пузырь подсказки «нет открытого сбора»
 * (см. `Tooltip`), и `overflow: hidden` на ней срезал бы и его.
 *
 * Класс живёт ровно столько, сколько идёт анимация: у неподвижной кнопки
 * подпись и так по месту, а лишняя подрезка режет ей тень и кольцо фокуса.
 */
export const actionPrimaryMorphing = style({})

export const actionSecondary = style({
  flex: '0 0 auto',
  display: 'flex',
  marginLeft: vars.space.xs,
  ...media({
    md: { marginLeft: vars.space.md },
  }),
})

/*
  Кнопка приходит слотом из `apps/website`, поэтому класс ей не передать —
  ужимаем её отсюда. Размер `lg` задан ради десктопа, но в узкой строке рядом с
  сердцем его поля не влезают: до `md` кегль и горизонтальные поля ужимаются,
  высота остаётся крупной, чтобы попадать пальцем.
*/
globalStyle(`${actionPrimary} button, ${actionPrimary} a`, {
  paddingLeft: vars.space.sm,
  paddingRight: vars.space.sm,
  font: font('15/22', 600),
  /*
    Подпись в одну строку: ширина кнопки анимируется, и на полпути к кругу
    подпись иначе переносится в две строки. Подрезает её коробка
    (`actionPrimaryMorphing`), пока едет.
  */
  whiteSpace: 'nowrap',
  ...media({
    md: {
      paddingLeft: vars.space.xl,
      paddingRight: vars.space.xl,
      font: font('17/26', 600),
    },
  }),
})

/*
  Ужатая кнопка заполняет свою коробку целиком: ширину коробки ведёт анимация,
  а кнопка обязана ехать вместе с ней — иначе круг встал бы на место мгновенно,
  а поехал бы один пустой слот вокруг него. Поля обнуляются здесь же: от них
  круг на 52px растянулся бы в овал.

  Правило стоит после общего выше намеренно — оно его и перебивает. Поля
  обнуляются дважды, и второй раз — внутри `md`: vanilla-extract собирает все
  медиазапросы в конец файла, поэтому `md`-ветка правила выше идёт **после**
  правила без медиазапроса и без этой второй пары вернула бы свои 32px. На
  ширине круга это не «кнопка с полями», а раздавленная в нитку иконка.
*/
/*
  Подрезка на время поездки — см. `actionPrimaryMorphing`. `max-width` здесь
  не про подпись, а про саму кнопку: ширину ей задаёт коробка, только если
  кнопка растянута (`isFullWidth`), а собранная по содержимому вылезла бы за
  коробку целиком, и подрезать было бы нечего.
*/
globalStyle(`${actionPrimaryMorphing} button, ${actionPrimaryMorphing} a`, {
  overflow: 'hidden',
  maxWidth: '100%',
})

globalStyle(`${actionPrimaryCompact} button, ${actionPrimaryCompact} a`, {
  width: '100%',
  /* Та же высота, что у `Button size="lg"` и у сердца рядом. */
  height: rem(52),
  paddingLeft: 0,
  paddingRight: 0,
  ...media({
    md: { paddingLeft: 0, paddingRight: 0 },
  }),
})

/*
  Сердце ровняется по высоте с соседней кнопкой: `IconButton` задаёт себе
  квадрат 48px, а `Button size="lg"` — 52px, и круг стоял бы ниже строки.
  Ширина правится вместе с высотой, иначе из круга получится овал.
*/
globalStyle(`${actionSecondary} button, ${actionSecondary} a`, {
  width: rem(52),
  height: rem(52),
})

/**
 * Строка под кнопками: почему «в корзину» погашена. Прижата к ним вплотную —
 * `action` уже отбил себе отступ сверху, и колоночный зазор между кнопкой и
 * её же объяснением увёл бы объяснение к следующему блоку.
 */
export const note = style({
  marginTop: `calc(-1 * ${vars.space.sm})`,
})

/**
 * Каркас на время загрузки повторяет пропорции `ProductGallery` (кадр `4 / 5`,
 * миниатюры по 72px) — иначе при подстановке товара страница подпрыгнула бы.
 */
export const skeletonGallery = style(flexColumn(12))

export const skeletonMedia = style({
  aspectRatio: '4 / 5',
  borderRadius: vars.radius.xxl,
  // Тот же потолок высоты, что и у настоящего кадра (см. `ProductGallery.css`).
  width: '100%',
  maxWidth: 'calc(40svh * 4 / 5)',
  alignSelf: 'center',
  ...media({
    md: { maxWidth: 'none', alignSelf: 'stretch' },
  }),
})

export const skeletonThumbs = style({
  ...flexRow(8),
  justifyContent: 'center',
  ...media({
    md: { justifyContent: 'flex-start' },
  }),
})

export const skeletonThumb = style({
  width: rem(72),
  aspectRatio: '1 / 1',
  borderRadius: vars.radius.lg,
})
