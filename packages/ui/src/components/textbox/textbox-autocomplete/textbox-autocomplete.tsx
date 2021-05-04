/** @jsx h */
import { ComponentChildren, h, JSX, RefObject } from 'preact'
import { useCallback, useRef, useState } from 'preact/hooks'

import menuStyles from '../../../css/menu.css'
import { useClickOutside } from '../../../hooks/use-click-outside'
import { OnValueChange, Props } from '../../../types'
import { createClassName } from '../../../utilities/create-class-name'
import { getCurrentFromRef } from '../../../utilities/get-current-from-ref'
import { IconCheck } from '../../icon/icon-check/icon-check'
import { computeNextValue } from '../private/compute-next-value'
import { isKeyCodeCharacterGenerating } from '../private/is-keycode-character-generating'
import textboxStyles from '../textbox.css'

const EMPTY_STRING = ''
const INVALID_ID = null
const ITEM_ID_DATA_ATTRIBUTE_NAME = 'data-textbox-autocomplete-item-id'

export type TextboxAutocompleteProps<N extends string> = {
  disabled?: boolean
  filter?: boolean
  icon?: ComponentChildren
  name?: N
  noBorder?: boolean
  onInput?: OmitThisParameter<JSX.GenericEventHandler<HTMLInputElement>>
  onValueChange?: OnValueChange<string, N>
  options: Array<TextboxAutocompleteOption>
  placeholder?: string
  propagateEscapeKeyDown?: boolean
  revertOnEscapeKeyDown?: boolean
  strict?: boolean
  top?: boolean
  value: string
}
export type TextboxAutocompleteOption =
  | TextboxAutocompleteOptionHeader
  | TextboxAutocompleteOptionValue
  | TextboxAutocompleteOptionSeparator
export type TextboxAutocompleteOptionHeader = {
  header: string
}
export type TextboxAutocompleteOptionValue = {
  value: string
}
export type TextboxAutocompleteOptionSeparator = {
  separator: true
}

type Option =
  | TextboxAutocompleteOptionHeader
  | OptionValueWithId
  | TextboxAutocompleteOptionSeparator
type OptionValueWithId = TextboxAutocompleteOptionValue & {
  id: string
}
type Id = typeof INVALID_ID | string

export function TextboxAutocomplete<N extends string>({
  disabled = false,
  filter = false,
  icon,
  name,
  noBorder = false,
  onInput = function () {},
  onValueChange = function () {},
  placeholder,
  propagateEscapeKeyDown = true,
  revertOnEscapeKeyDown = false,
  strict = false,
  top = false,
  value,
  ...rest
}: Props<HTMLInputElement, TextboxAutocompleteProps<N>>): JSX.Element {
  if (typeof icon === 'string' && icon.length !== 1) {
    throw new Error(`String \`icon\` must be a single character: ${icon}`)
  }

  const rootElementRef: RefObject<HTMLDivElement> = useRef(null)
  const inputElementRef: RefObject<HTMLInputElement> = useRef(null)
  const menuElementRef: RefObject<HTMLDivElement> = useRef(null)

  const [isMenuVisible, setIsMenuVisible] = useState(false)
  const [selectedId, setSelectedId] = useState<Id>(INVALID_ID)
  const [originalValue, setOriginalValue] = useState(EMPTY_STRING) // Value of the textbox when it is focused
  const [editedValue, setEditedValue] = useState<string>(value) // Value being edited that does not match any of the options

  let options: Array<Option> = createOptions(rest.options)
  if (filter === true) {
    options = filterOptions(options, value, editedValue)
  }

  // Uncomment to debug
  // console.table([{ isMenuVisible, selectedId, originalValue, editedValue, value }])

  const triggerBlur = useCallback(function (): void {
    setIsMenuVisible(false)
    setOriginalValue(EMPTY_STRING)
    setEditedValue(EMPTY_STRING)
    setSelectedId(INVALID_ID)
    getCurrentFromRef(inputElementRef).blur()
  }, [])

  // Adjust the menu scroll position so that the selected option is always visible
  const updateScrollPosition = useCallback(function (id: Id): void {
    const menuElement = getCurrentFromRef(menuElementRef)
    if (id === INVALID_ID) {
      menuElement.scrollTop = 0
      return
    }
    const selectedElement = menuElement.querySelector<HTMLDivElement>(
      `[${ITEM_ID_DATA_ATTRIBUTE_NAME}='${id}']`
    )
    if (selectedElement === null) {
      throw new Error('Invariant violation') // `id` is valid
    }
    const y =
      selectedElement.getBoundingClientRect().y -
      menuElement.getBoundingClientRect().y
    if (y < menuElement.scrollTop) {
      menuElement.scrollTop = y
      return
    }
    const offsetBottom = y + selectedElement.offsetHeight
    if (offsetBottom > menuElement.scrollTop + menuElement.offsetHeight) {
      menuElement.scrollTop = offsetBottom - menuElement.offsetHeight
    }
  }, [])

  const updateEditedValue = useCallback(
    function (editedValue: string): void {
      const newId = getIdByValue(options, editedValue)
      if (newId === INVALID_ID) {
        // `newValue` does not match any option in `options`
        setEditedValue(editedValue)
        setSelectedId(INVALID_ID)
        updateScrollPosition(INVALID_ID)
        return
      }
      // `newValue` matches one of the options in `options`
      setEditedValue(EMPTY_STRING)
      setSelectedId(newId)
      updateScrollPosition(newId)
    },
    [options, updateScrollPosition]
  )

  const handleFocus = useCallback(
    function (event: JSX.TargetedFocusEvent<HTMLInputElement>): void {
      setIsMenuVisible(true)
      setOriginalValue(value)
      updateEditedValue(value)
      const inputElement = event.currentTarget
      inputElement.focus()
      inputElement.select()
    },
    [updateEditedValue, value]
  )

  const handleInput = useCallback(
    function (event: JSX.TargetedEvent<HTMLInputElement>): void {
      const newValue = event.currentTarget.value
      updateEditedValue(newValue)
      onValueChange(newValue, name)
      onInput(event)
    },
    [name, onInput, onValueChange, updateEditedValue]
  )

  const handleKeyDown = useCallback(
    function (event: JSX.TargetedKeyboardEvent<HTMLInputElement>): void {
      const inputElement = event.currentTarget
      const key = event.key
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault()
        if (options.length === 0) {
          return
        }
        const newId =
          key === 'ArrowUp'
            ? computePreviousId(options, selectedId)
            : computeNextId(options, selectedId)
        if (newId === INVALID_ID) {
          // Reached beginning/end of list of `options`, so just restore `savedValue`
          setSelectedId(INVALID_ID)
          inputElement.value = editedValue
          onValueChange(editedValue, name)
          onInput(event)
          updateScrollPosition(INVALID_ID)
          return
        }
        // Set the selected option to `newId`, and update `value`
        setSelectedId(newId)
        updateScrollPosition(newId)
        const newOptionValue = findOptionValueById(options, newId)
        if (newOptionValue === null) {
          throw new Error('Invariant violation') // `newId` is valid
        }
        const newValue = newOptionValue.value
        inputElement.value = newValue
        onValueChange(newValue, name)
        onInput(event)
        inputElement.select()
        return
      }
      if (key === 'Enter' || key === 'Escape' || key === 'Tab') {
        event.preventDefault()
        if (propagateEscapeKeyDown === false) {
          event.stopPropagation()
        }
        if (key === 'Escape' && revertOnEscapeKeyDown === true) {
          inputElement.value = originalValue
          const inputEvent = document.createEvent('Event')
          inputEvent.initEvent('input', true, true)
          inputElement.dispatchEvent(inputEvent)
        }
        triggerBlur()
        return
      }
      if (strict === false) {
        return
      }
      if (event.ctrlKey === true || event.metaKey === true) {
        return
      }
      if (isKeyCodeCharacterGenerating(event.keyCode) === true) {
        // Piece together `newValue`, and stop the `keyDown` event if `newValue` is invalid
        const newValue = computeNextValue(inputElement, event.key)
        if (isValidValue(options, newValue) === false) {
          event.preventDefault()
        }
      }
    },
    [
      editedValue,
      name,
      onInput,
      onValueChange,
      options,
      originalValue,
      propagateEscapeKeyDown,
      revertOnEscapeKeyDown,
      selectedId,
      strict,
      triggerBlur,
      updateScrollPosition
    ]
  )

  const handlePaste = useCallback(
    function (event: JSX.TargetedClipboardEvent<HTMLInputElement>): void {
      if (event.clipboardData === null) {
        throw new Error('`event.clipboardData` is `null`')
      }
      const newValue = computeNextValue(
        event.currentTarget,
        event.clipboardData.getData('Text')
      )
      if (isValidValue(options, newValue) === false) {
        event.preventDefault()
      }
    },
    [options]
  )

  const handleOptionChange = useCallback(
    function (event: JSX.TargetedEvent<HTMLInputElement>): void {
      const newId = event.currentTarget.getAttribute(
        ITEM_ID_DATA_ATTRIBUTE_NAME
      ) as string
      // Set the selected option to `newId`, and update `value`
      setSelectedId(newId)
      const newOptionValue = findOptionValueById(options, newId)
      if (newOptionValue === null) {
        throw new Error('Invariant violation') // `newId` is valid
      }
      const inputElement = getCurrentFromRef(inputElementRef)
      inputElement.value = newOptionValue.value
      const inputEvent = document.createEvent('Event')
      inputEvent.initEvent('input', true, true)
      inputElement.dispatchEvent(inputEvent)
      triggerBlur()
    },
    [options, triggerBlur]
  )

  const handleOptionMouseMove = useCallback(
    function (event: JSX.TargetedMouseEvent<HTMLInputElement>): void {
      const newId = event.currentTarget.getAttribute(
        ITEM_ID_DATA_ATTRIBUTE_NAME
      ) as string
      if (newId !== selectedId) {
        setSelectedId(newId)
      }
    },
    [selectedId]
  )

  const handleClickOutside = useCallback(
    function (): void {
      if (isMenuVisible === false) {
        return
      }
      triggerBlur()
    },
    [isMenuVisible, triggerBlur]
  )
  useClickOutside({
    onClickOutside: handleClickOutside,
    ref: rootElementRef
  })

  return (
    <div
      ref={rootElementRef}
      class={createClassName([
        textboxStyles.textbox,
        noBorder === true ? textboxStyles.noBorder : null,
        typeof icon === 'undefined' ? null : textboxStyles.hasIcon
      ])}
    >
      <input
        {...rest}
        ref={inputElementRef}
        class={textboxStyles.input}
        disabled={disabled === true}
        name={name}
        onFocus={handleFocus}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        tabIndex={disabled === true ? -1 : 0}
        type="text"
        value={value}
      />
      {typeof icon === 'undefined' ? null : (
        <div class={textboxStyles.icon}>{icon}</div>
      )}
      <div class={textboxStyles.border}></div>
      <div
        ref={menuElementRef}
        class={createClassName([
          menuStyles.menu,
          disabled === true || isMenuVisible === false
            ? menuStyles.hidden
            : null,
          top === true ? menuStyles.top : null
        ])}
      >
        {options.map(function (option: Option, index: number): JSX.Element {
          if ('separator' in option) {
            return <hr key={index} class={menuStyles.optionSeparator} />
          }
          if ('header' in option) {
            return (
              <h1 key={index} class={menuStyles.optionHeader}>
                {option.header}
              </h1>
            )
          }
          return (
            <label
              key={index}
              class={createClassName([
                menuStyles.optionValue,
                option.id === selectedId ? menuStyles.optionValueSelected : null
              ])}
            >
              <input
                {...rest}
                checked={value === option.value}
                class={menuStyles.input}
                name={name}
                onChange={handleOptionChange}
                onMouseMove={handleOptionMouseMove}
                tabIndex={-1}
                type="radio"
                value={`${option.value}`}
                {...{ [ITEM_ID_DATA_ATTRIBUTE_NAME]: option.id }}
              />
              {option.value === originalValue ? ( // Show check icon if option matches `originalValue`
                <div class={menuStyles.checkIcon}>
                  <IconCheck />
                </div>
              ) : null}
              {option.value}
            </label>
          )
        })}
      </div>
    </div>
  )
}

// Add an `id` attribute to all the `TextboxAutocompleteOptionValue` items in `options`
function createOptions(
  options: Array<TextboxAutocompleteOption>
): Array<Option> {
  return options.map(function (
    option: TextboxAutocompleteOption,
    index: number
  ): Option {
    if ('value' in option) {
      const optionValueWithId: OptionValueWithId = {
        ...option,
        id: `${index}`
      }
      return optionValueWithId
    }
    return option
  })
}

function filterOptions(
  options: Array<Option>,
  value: string,
  editedValue: string
): Array<Option> {
  if (value === EMPTY_STRING) {
    return options
  }
  const id = getIdByValue(options, value)
  if (id === INVALID_ID) {
    // `value` does not match any option in `options`
    return options.filter(function (option: Option): boolean {
      if ('value' in option) {
        return doesStringContainSubstring(option.value, value) === true
      }
      return false
    })
  }
  // `value` matches one of the options in `options`
  if (editedValue === EMPTY_STRING) {
    return options
  }
  // Filter `options` by `editedValue`
  return options.filter(function (option: Option): boolean {
    if ('value' in option) {
      return doesStringContainSubstring(option.value, editedValue) === true
    }
    return false
  })
}

// Returns `true` if `string` contains `substring`, else `false`
function doesStringContainSubstring(
  string: string,
  substring: string
): boolean {
  return string.toLowerCase().indexOf(substring.toLowerCase()) !== -1
}

// Returns the `id` of an `OptionValueWithId` in `options` with the given `value`
function getIdByValue(options: Array<Option>, value: string): Id {
  for (const option of options) {
    if ('value' in option) {
      if (option.value === value) {
        return option.id
      }
    }
  }
  return INVALID_ID
}

// Returns `true` if `value` is a substring of `options[i].value` in `options`, else `false`
function isValidValue(options: Array<Option>, value: string): boolean {
  if (value === EMPTY_STRING) {
    return true
  }
  for (const option of options) {
    if ('value' in option) {
      if (option.value.toLowerCase().indexOf(value.toLowerCase()) === 0) {
        return true
      }
    }
  }
  return false
}

// Returns the `OptionValueWithId` in `options` with the given `id`, else `null`
function findOptionValueById(
  options: Array<Option>,
  id: string
): null | OptionValueWithId {
  for (const option of options) {
    if ('id' in option && option.id === id) {
      return option
    }
  }
  return null
}

// Returns the index of the `OptionValueWithId` in `options` with the given `id`, else `-1`
function getIndexById(options: Array<Option>, id: string): number {
  let index = 0
  for (const option of options) {
    if ('id' in option && option.id === id) {
      return index
    }
    index += 1
  }
  return -1
}

// Returns the `Id` of the `OptionValueWithId` _before_ the `OptionValueWithId` in `options` with the given `id`
function computePreviousId(options: Array<Option>, id: Id): Id {
  if (id === INVALID_ID) {
    const result = findOptionValueAtOrBeforeIndex(options, options.length - 1)
    return result === null ? null : result.id
  }
  const index = getIndexById(options, id)
  if (index === -1) {
    throw new Error(`No option with \`id\` ${id}`)
  }
  if (index === 0) {
    return null
  }
  const result = findOptionValueAtOrBeforeIndex(options, index - 1)
  return result === null ? null : result.id
}

// Returns the `Id` of the `OptionValueWithId` _after_ the `OptionValueWithId` in `options` with the given `id`
function computeNextId(options: Array<Option>, id: Id): Id {
  if (id === INVALID_ID) {
    const result = findOptionValueAtOrAfterIndex(options, 0)
    return result === null ? null : result.id
  }
  const index = getIndexById(options, id)
  if (index === -1) {
    throw new Error(`No option with \`id\` ${id}`)
  }
  if (index === options.length - 1) {
    return null
  }
  const result = findOptionValueAtOrAfterIndex(options, index + 1)
  return result === null ? null : result.id
}

// Returns the `OptionValueWithId` in `options` at or _before_ the `index`, else `null`
function findOptionValueAtOrBeforeIndex(
  options: Array<Option>,
  index: number
): null | OptionValueWithId {
  if (index < 0) {
    throw new Error('`index` < 0')
  }
  if (index > options.length - 1) {
    throw new Error('`index` > `options.length` - 1')
  }
  return findLastOptionValue(options.slice(0, index + 1))
}

// Returns the `OptionValueWithId` in `options` at or _after_ the `index`, else `null`
function findOptionValueAtOrAfterIndex(
  options: Array<Option>,
  index: number
): null | OptionValueWithId {
  if (index < 0) {
    throw new Error('`index` < 0')
  }
  if (index > options.length - 1) {
    throw new Error('`index` > `options.length` - 1')
  }
  return findFirstOptionValue(options.slice(index))
}

// Returns the first `OptionValueWithId` encountered in `options`, else `null`
function findFirstOptionValue(
  options: Array<Option>
): null | OptionValueWithId {
  for (const option of options) {
    if ('id' in option) {
      return option
    }
  }
  return null
}

// Returns the last `OptionValueWithId` encountered in `options`, else `null`
function findLastOptionValue(options: Array<Option>): null | OptionValueWithId {
  return findFirstOptionValue(options.slice().reverse())
}
