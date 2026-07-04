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

export const feedLink = (src = 'https://google.com'): ILink => ({
  href: src,
  target: '_blank',
})
