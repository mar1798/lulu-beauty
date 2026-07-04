import React from 'react'
import type { IWrapperComponent } from '../types'

const EMPTY: unique symbol = Symbol()

export interface ContainerProviderProps<State = void> extends IWrapperComponent {
  initialState: State
}

export interface Container<Value, State = void> {
  Provider: React.ComponentType<ContainerProviderProps<State>>
  useContainer: () => Value
}

/**
 * Creates a container with a contexts provider and a hook to access the value
 */
export function createContainer<Value, State = void>(
  useHook: (initialState: State) => Value
): Container<Value, State> {
  const Context = React.createContext<Value | typeof EMPTY>(EMPTY)

  const Provider: React.FC<ContainerProviderProps<State>> = props => {
    const value = useHook(props.initialState)
    return <Context.Provider value={value}>{props.children}</Context.Provider>
  }

  const useContainer = (): Value => {
    const value = React.useContext(Context)
    if (value === EMPTY) {
      throw new Error('Component must be wrapped with <Container.Provider>')
    }
    return value
  }

  return { Provider, useContainer }
}

/**
 * Creates a container with a contexts provider and a hook to access the value. The value is
 * the same as the initial state.
 */
export function unmanagedContainer<T>(): Container<T, T> {
  return createContainer<T, T>(initial => initial)
}
