import faker from './faker'
import {
  IImage,
  ILink,
} from '../types'

export const repeatFeed = <T>(val: T, times: number): T[] => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return new Array(times).fill(val)
}

export const feedImage = (w: number, h: number): IImage => ({
  src: faker.image.url({ width: w, height: h }),
  alt: 'Avataar',
  title: 'Dicebear Avatar',
  width: w,
  height: h,
})

/**
 * Картинка товара — без размеров, ровно как её отдаёт API (только `url`/`alt`).
 * Рендерится в режиме `fill`, см. `IImageComponentProps`.
 */
export const feedProductImage = (): IImage => ({
  src: faker.image.url({ width: 600, height: 750 }),
  alt: faker.commerce.productName(),
})

export const feedLink = (src = 'https://google.com'): ILink => ({
  href: src,
  target: '_blank',
})
