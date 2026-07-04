import { createVar, style } from '@vanilla-extract/css'
import { type IDelay, type IDuration } from './time-util'

export const delays = [0, 200, 400, 600, 800, 1000, 1200] as const

export const durations = [200, 400, 600, 800, 1000, 1200, 1400, 1600] as const

export const vars = {
  delay: createVar(),
  duration: createVar(),
}

export const compiledDelay = delays.reduce((acc, delay) => {
  acc[delay] = style({
    vars: {
      [vars.delay]: `${delay.toString()}ms`,
    },
  })
  return acc
}, {} as Record<IDelay, string>)

export const compiledDuration = durations.reduce((acc, duration) => {
  acc[duration] = style({
    vars: {
      [vars.duration]: `${duration.toString()}ms`,
    },
  })
  return acc
}, {} as Record<IDuration, string>)
