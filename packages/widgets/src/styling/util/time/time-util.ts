import { type delays, type durations, compiledDelay, compiledDuration } from './time-util.css'

export type IDelay = (typeof delays)[number]

export type IDuration = (typeof durations)[number]

export function delayClassName(delay?: IDelay): string {
  return compiledDelay[delay ?? 0]
}

export function durationClassName(duration?: IDuration): string {
  return compiledDuration[duration ?? 400]
}
