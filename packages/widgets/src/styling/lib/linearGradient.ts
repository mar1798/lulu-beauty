export type GradientPoint = [color: string, point: string]

export const linearGradient = (direction: string | number, ...points: GradientPoint[]): string => {
  return `linear-gradient(${[direction, ...points.map(([c, p]) => `${c} ${p}`)].join()})`
}
