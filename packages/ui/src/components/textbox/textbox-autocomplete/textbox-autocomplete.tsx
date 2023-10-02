import { ComponentChildren, h, RefObject } from 'preact'
import { useCallback, useRef, useState } from 'preact/hooks'

import menuStyles from '../../../css/menu.module.css'
import { useMouseDownOutside } from '../../../hooks/use-mouse-down-outside.js'
import { IconMenuCheckmarkChecked16 } from '../../../icons/icon-16/icon-menu-checkmark-checked-16.js'
import { Event, EventHandler } from '../../../types/event-handler.js'
import { FocusableComponentProps } from '../../../types/focusable-component-props'
import { createClassName } from '../../../utilities/create-class-name.js'
import { createComponent } from '../../../utilities/create-component.js'
import { getCurrentFromRef } from '../../../utilities/get-current-from-ref.js'
import { noop } from '../../../utilities/no-op'
import { computeNextValue } from '../private/compute-next-value.js'
import { isKeyCodeCharacterGenerating } from '../private/is-keycode-character-generating.js'
import textboxStyles from '../textbox/textbox.module.css'
import textboxAutocompleteStyles from './textbox-autocomplete.module.css'

const EMPTY_STRING = ''
const INVALID_ID = null
const ITEM_ID_DATA_ATTRIBUTE_NAME = 'data-textbox-autocomplete-item-id'
const MENU_VERTICAL_MARGIN = 16

export interface TextboxAutocompleteProps
  extends FocusableComponentProps<HTMLInputElement> {
  disabled?: boolean
  filter?: boolean
  icon?: ComponentChildren
  onInput?: EventHandler.onInput<HTMLInputElement>
  onValueInput?: EventHandler.onValueChange<string>
  options: Array<TextboxAutocompleteOption>
  placeholder?: string
  revertOnEscapeKeyDown?: boolean
  spellCheck?: boolean
  strict?: boolean
  top?: boolean
  value: string
  variant?: TextboxAutocompleteVariant
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
  disabled?: boolean
}
export type TextboxAutocompleteOptionSeparator = {
  separator: true
}
export type TextboxAutocompleteVariant = 'border' | 'underline'

type Option =
  | TextboxAutocompleteOptionHeader
  | OptionValueWithId
  | TextboxAutocompleteOptionSeparator
type OptionValueWithId = TextboxAutocompleteOptionValue & {
  id: string
}
type Id = typeof INVALID_ID | string

export const TextboxAutocomplete = createComponent<
  HTMLInputElement,
  TextboxAutocompleteProps
>(function (
  {
    blurOnEscapeKeyDown = true,
    disabled = false,
    filter = false,
    icon,
    onInput = noop,
    onKeyDown = noop,
    onValueInput = noop,
    placeholder,
    propagateEscapeKeyDown = true,
    revertOnEscapeKeyDown = false,
    spellCheck = false,
    strict = false,
    top = false,
    value,
    variant,
    ...rest
  },
  ref
) {
  if (typeof icon === 'string' && icon.length !== 1) {
    throw new Error(`String \`icon\` must be a single character: ${icon}`)
  }

  const rootElementRef: RefObject<HTMLDivElement> = useRef(null)
  const inputElementRef: RefObject<HTMLInputElement> = useRef(null)
  const menuElementRef: RefObject<HTMLDivElement> = useRef(null)

  const [isMenuVisible, setIsMenuVisible] = useState(false)
  const [selectedId, setSelectedId] = useState<Id>(INVALID_ID)
  const [originalValue, setOriginalValue] = useState(EMPTY_STRING) // Value of the textbox when it was initially focused
  const [editedValue, setEditedValue] = useState<string>(value) // Value being edited that does not match any of the options

  let options: Array<Option> = createOptions(rest.options)
  if (filter === true) {
    options = filterOptions(options, value, editedValue)
  }

  // Uncomment to debug
  // console.table([{ isMenuVisible, selectedId, originalValue, editedValue, value }])

  // Adjust the menu scroll position so that the selected option is always visible
  const updateScrollPosition = useCallback(function (id: Id) {
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
    function (editedValue: string) {
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

  const triggerBlur = useCallback(function () {
    getCurrentFromRef(inputElementRef).blur()
  }, [])

  const triggerHideMenu = useCallback(function () {
    setIsMenuVisible(false)
    setOriginalValue(EMPTY_STRING)
    setEditedValue(EMPTY_STRING)
    setSelectedId(INVALID_ID)
  }, [])

  const triggerShowMenu = useCallback(
    function () {
      updateMenuElementMaxHeight(
        getCurrentFromRef(rootElementRef),
        getCurrentFromRef(menuElementRef),
        top
      )
      setOriginalValue(value)
      updateEditedValue(value)
      setIsMenuVisible(true)
    },
    [top, updateEditedValue, value]
  )

  const handleFocus = useCallback(
    function (event: Event.onFocus<HTMLInputElement>) {
      event.currentTarget.select()
      if (isMenuVisible === false) {
        triggerShowMenu()
      }
    },
    [isMenuVisible, triggerShowMenu]
  )

  const handleInput = useCallback(
    function (event: Event.onInput<HTMLInputElement>) {
      if (isMenuVisible === false) {
        triggerShowMenu()
      }
      const newValue = event.currentTarget.value
      updateEditedValue(newValue)
      onValueInput(newValue)
      onInput(event)
    },
    [isMenuVisible, onInput, onValueInput, triggerShowMenu, updateEditedValue]
  )

  const handleKeyDown = useCallback(
    function (event: Event.onKeyDown<HTMLInputElement>) {
      const inputElement = event.currentTarget
      const key = event.key
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault()
        if (isMenuVisible === false) {
          triggerShowMenu()
          return
        }
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
          onValueInput(editedValue)
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
        onValueInput(newValue)
        onInput(event)
        inputElement.select()
        return
      }
      if (key === 'Escape') {
        event.preventDefault()
        if (propagateEscapeKeyDown === false) {
          event.stopPropagation()
        }
        if (isMenuVisible === false) {
          triggerBlur()
          return
        }
        if (revertOnEscapeKeyDown === true) {
          inputElement.value = originalValue
          const inputEvent = new window.Event('input', {
            bubbles: true,
            cancelable: true
          })
          inputElement.dispatchEvent(inputEvent)
        }
        triggerHideMenu()
        return
      }
      if (key === 'Enter') {
        event.preventDefault()
        inputElement.select()
        if (isMenuVisible === false) {
          triggerShowMenu()
          return
        }
        triggerHideMenu()
        return
      }
      if (key === 'Tab') {
        triggerHideMenu()
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
      isMenuVisible,
      onInput,
      onValueInput,
      options,
      originalValue,
      propagateEscapeKeyDown,
      revertOnEscapeKeyDown,
      selectedId,
      strict,
      triggerBlur,
      triggerHideMenu,
      triggerShowMenu,
      updateScrollPosition
    ]
  )

  const handleMouseDown = useCallback(
    function () {
      if (isMenuVisible === false) {
        triggerShowMenu()
      }
    },
    [isMenuVisible, triggerShowMenu]
  )

  const handlePaste = useCallback(
    function (event: Event.onPaste<HTMLInputElement>) {
      if (strict === false) {
        return
      }
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
    [options, strict]
  )

  const handleOptionChange = useCallback(
    function (event: Event.onChange<HTMLInputElement>) {
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
      const inputEvent = new window.Event('input', {
        bubbles: true,
        cancelable: true
      })
      inputElement.dispatchEvent(inputEvent)
      inputElement.focus()
      triggerHideMenu()
    },
    [options, triggerHideMenu]
  )

  const handleOptionMouseMove = useCallback(
    function (event: Event.onMouseMove<HTMLInputElement>) {
      const newId = event.currentTarget.getAttribute(
        ITEM_ID_DATA_ATTRIBUTE_NAME
      ) as string
      if (newId !== selectedId) {
        setSelectedId(newId)
      }
    },
    [selectedId]
  )

  const handleMouseDownOutside = useCallback(
    function () {
      if (isMenuVisible === false) {
        return
      }
      triggerHideMenu()
      triggerBlur()
    },
    [isMenuVisible, triggerBlur, triggerHideMenu]
  )
  useMouseDownOutside({
    onMouseDownOutside: handleMouseDownOutside,
    ref: rootElementRef
  })

  const refCallback = useCallback(
    function (inputElement: null | HTMLInputElement) {
      inputElementRef.current = inputElement
      if (ref === null) {
        return
      }
      if (typeof ref === 'function') {
        ref(inputElement)
        return
      }
      ref.current = inputElement
    },
    [ref, inputElementRef]
  )

  return (
    <div
      ref={rootElementRef}
      class={createClassName([
        textboxStyles.textbox,
        typeof variant === 'undefined'
          ? null
          : variant === 'border'
          ? textboxStyles.hasBorder
          : null,
        typeof icon === 'undefined' ? null : textboxStyles.hasIcon,
        disabled === true ? textboxStyles.disabled : null
      ])}
    >
      <div class={textboxStyles.inner}>
        <input
          {...rest}
          ref={refCallback}
          class={textboxStyles.input}
          disabled={disabled === true}
          onFocus={handleFocus}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          tabIndex={0}
          type="text"
          value={value}
        />
        {typeof icon === 'undefined' ? null : (
          <div class={textboxStyles.icon}>{icon}</div>
        )}
        <div class={textboxStyles.border} />
        {variant === 'underline' ? (
          <div class={textboxStyles.underline} />
        ) : null}
        <div
          ref={menuElementRef}
          class={createClassName([
            menuStyles.menu,
            disabled === true || isMenuVisible === false
              ? menuStyles.hidden
              : null,
            top === true
              ? textboxAutocompleteStyles.top
              : textboxAutocompleteStyles.bottom
          ])}
        >
          {options.map(function (option: Option, index: number) {
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
                  option.disabled === true
                    ? menuStyles.optionValueDisabled
                    : null,
                  option.disabled !== true && option.id === selectedId
                    ? menuStyles.optionValueSelected
                    : null
                ])}
              >
                <input
                  {...rest}
                  checked={value === option.value}
                  class={menuStyles.input}
                  disabled={option.disabled === true}
                  onChange={handleOptionChange}
                  onMouseMove={handleOptionMouseMove}
                  spellcheck={spellCheck}
                  tabIndex={-1}
                  type="radio"
                  value={`${option.value}`}
                  {...{ [ITEM_ID_DATA_ATTRIBUTE_NAME]: option.id }}
                />
                {option.value === originalValue ? ( // Show check icon if option matches `originalValue`
                  <div class={menuStyles.checkIcon}>
                    <IconMenuCheckmarkChecked16 />
                  </div>
                ) : null}
                {option.value}
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
})

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
    if ('id' in option && option.disabled !== true) {
      return option
    }
  }
  return null
}

// Returns the last `OptionValueWithId` encountered in `options`, else `null`
function findLastOptionValue(options: Array<Option>): null | OptionValueWithId {
  return findFirstOptionValue(options.slice().reverse())
}

function updateMenuElementMaxHeight(
  rootElement: HTMLDivElement,
  menuElement: HTMLDivElement,
  top: boolean
) {
  const rootElementTop = rootElement.getBoundingClientRect().top
  const maxHeight =
    top === true
      ? rootElementTop - MENU_VERTICAL_MARGIN
      : window.innerHeight -
        rootElementTop -
        rootElement.offsetHeight -
        MENU_VERTICAL_MARGIN
  menuElement.style.maxHeight = `${maxHeight}px`
}
