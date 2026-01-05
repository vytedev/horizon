import { Component } from '@theme/component';
import { QuantitySelectorUpdateEvent } from '@theme/events';
import { parseIntOrDefault } from '@theme/utilities';

/**
 * A custom element that allows the user to select a quantity.
 *
 * This component follows a pure event-driven architecture where quantity changes
 * are broadcast via QuantitySelectorUpdateEvent. Parent components that contain
 * quantity selectors listen for these events and handle them according to their
 * specific needs, with event filtering ensuring each parent only processes events
 * from its own quantity selectors to prevent conflicts between different cart
 * update strategies.
 *
 * @typedef {Object} Refs
 * @property {HTMLInputElement} quantityInput
 * @property {HTMLElement} stockMessage
 *
 * @extends {Component<Refs>}
 */
class QuantitySelectorComponent extends Component {
  /**
   * Gets the parent buttons group container
   * @returns {HTMLElement|null} The product-form-buttons container
   */
  #getButtonsGroup() {
    let parent = this.parentElement;
    while (parent && !parent.classList.contains('product-form-buttons')) {
      parent = parent.parentElement;
    }
    return parent;
  }

  /**
   * Updates min/max/step constraints and snaps value to valid increment
   * @param {string} min - Minimum value
   * @param {string|null} max - Maximum value (null if no max)
   * @param {string} step - Step increment
   */
  updateConstraints(min, max, step) {
    const { quantityInput } = this.refs;
    const currentValue = parseInt(quantityInput.value) || 0;

    quantityInput.min = min;
    if (max) {
      quantityInput.max = max;
    } else {
      quantityInput.removeAttribute('max');
    }
    quantityInput.step = step;

    const newMin = parseIntOrDefault(min, 1);
    const newStep = parseIntOrDefault(step, 1);
    const effectiveMax = this.getEffectiveMax();

    // Snap to valid increment if not already aligned
    let newValue = currentValue;
    if ((currentValue - newMin) % newStep !== 0) {
      // Snap DOWN to closest valid increment
      newValue = newMin + Math.floor((currentValue - newMin) / newStep) * newStep;
    }

    // Ensure value is within bounds
    newValue = Math.max(newMin, Math.min(effectiveMax ?? Infinity, newValue));

    if (newValue !== currentValue) {
      quantityInput.value = newValue.toString();
    }

    this.updateButtonStates();
  }

  /**
   * Gets current values from DOM (fresh read every time)
   * @returns {{min: number, max: number|null, step: number, value: number, cartQuantity: number}}
   */
  getCurrentValues() {
    const { quantityInput } = this.refs;

    return {
      min: parseIntOrDefault(quantityInput.min, 1),
      max: parseIntOrDefault(quantityInput.max, null),
      step: parseIntOrDefault(quantityInput.step, 1),
      value: parseIntOrDefault(quantityInput.value, 0),
      cartQuantity: parseIntOrDefault(quantityInput.getAttribute('data-cart-quantity'), 0),
    };
  }

  /**
   * Gets the effective maximum value for this quantity selector
   * Product page: max - cartQuantity (how many can be added)
   * Override in subclass for different behavior
   * @returns {number | null} The effective max, or null if no max
   */
  getEffectiveMax() {
    const { max, cartQuantity, min } = this.getCurrentValues();
    if (max === null) return null;
    // Product page: can only add what's left
    return Math.max(max - cartQuantity, min);
  }

  /**
   * Updates button states based on current value and limits
   */
  updateButtonStates() {
    const { minusButton, plusButton } = this.refs;
    const { min, value } = this.getCurrentValues();
    const effectiveMax = this.getEffectiveMax();

    // Only manage buttons that weren't server-disabled
    if (!this.serverDisabledMinus) {
      minusButton.disabled = value <= min;
    }

    if (!this.serverDisabledPlus) {
      plusButton.disabled = effectiveMax !== null && value >= effectiveMax;
    }
  }

  /**
   * Updates quantity by a given step
   * @param {number} stepMultiplier - Positive for increase, negative for decrease
   */
  updateQuantity(stepMultiplier) {
    const { quantityInput } = this.refs;
    const { min, step, value } = this.getCurrentValues();
    const effectiveMax = this.getEffectiveMax();

    const newValue = Math.min(effectiveMax ?? Infinity, Math.max(min, value + step * stepMultiplier));

    quantityInput.value = newValue.toString();
    this.onQuantityChange();
    this.updateButtonStates();
  }
  /**
   * Handles the quantity increase event.
   * @param {Event} event - The event.
   */
  increaseQuantity(event) {
    if (!(event.target instanceof HTMLElement)) return;

    event.preventDefault();
    const { quantityInput } = this.refs;
    const stockMessage = this.refs.stockMessage;
    const availableQuantity = parseInt(this.dataset.availableQuantity || '') || parseInt(quantityInput.max || '') || 9999;
    const oldValue = parseInt(quantityInput.value) || 0;
    
    // Update message position before showing
    this.#updateMessagePosition();
    const stockMessage = this.#getStockMessage();
    
    // Check if we can increase
    if (oldValue >= availableQuantity) {
      if (stockMessage && stockMessage instanceof HTMLElement) {
        stockMessage.textContent = `That's the max quantity`;
        stockMessage.style.display = 'block';
      }
      return;
    }
    
    quantityInput.stepUp();
    const newValue = parseInt(quantityInput.value) || 0;
    
    // Ensure we don't exceed available stock
    if (newValue > availableQuantity) {
      quantityInput.value = String(availableQuantity);
      if (stockMessage && stockMessage instanceof HTMLElement) {
        stockMessage.textContent = `That's the max quantity`;
        stockMessage.style.display = 'block';
      }
    } else if (stockMessage && stockMessage instanceof HTMLElement) {
      stockMessage.style.display = 'none';
    }
    
    const cartLine = Number(quantityInput.dataset.cartLine);
    console.log('[Quantity Selector] ➕ Increase clicked:', {
      cartLine,
      oldValue,
      newValue,
      trigger: 'increaseQuantity',
      stackTrace: new Error().stack
    });
    this.#onQuantityChange(event);
  }

  /**
   * Handles the quantity decrease event.
   * @param {Event} event - The event.
   */
  decreaseQuantity(event) {
    if (!(event.target instanceof HTMLElement)) return;

    event.preventDefault();
    const oldValue = parseInt(this.refs.quantityInput.value) || 0;
    this.refs.quantityInput.stepDown();
    const newValue = parseInt(this.refs.quantityInput.value) || 0;
    const cartLine = Number(this.refs.quantityInput.dataset.cartLine);
    console.log('[Quantity Selector] ➖ Decrease clicked:', {
      cartLine,
      oldValue,
      newValue,
      trigger: 'decreaseQuantity',
      stackTrace: new Error().stack
    });
    this.#onQuantityChange(event);
  }

  /**
   * When our input gets focused, we want to fully select the value.
   * @param {FocusEvent} event
   */
  selectInputValue(event) {
    const { quantityInput } = this.refs;
    if (!(event.target instanceof HTMLInputElement) || document.activeElement !== quantityInput) return;

    quantityInput.select();
  }

  /**
   * Handles the quantity set event.
   * @param {Event} event - The event.
   */
  setQuantity(event) {
    if (!(event.target instanceof HTMLInputElement)) return;

    event.preventDefault();
    const { quantityInput } = this.refs;
    const { min, step } = this.getCurrentValues();
    const effectiveMax = this.getEffectiveMax();

    // Snap to bounds
    const quantity = Math.min(effectiveMax ?? Infinity, Math.max(min, parseInt(event.target.value) || 0));

    // Validate step increment
    if ((quantity - min) % step !== 0) {
      // Set the invalid value and trigger native HTML validation
      quantityInput.value = quantity.toString();
      quantityInput.reportValidity();
      return;
    }

    event.preventDefault();
    const oldValue = parseInt(this.refs.quantityInput.value) || 0;
    if (event.target instanceof HTMLInputElement) {
      this.refs.quantityInput.value = event.target.value;
    }
    const newValue = parseInt(this.refs.quantityInput.value) || 0;
    const cartLine = Number(this.refs.quantityInput.dataset.cartLine);
    console.log('[Quantity Selector] ✏️ Set quantity (blur/input):', {
      cartLine,
      oldValue,
      newValue,
      inputValue: event.target instanceof HTMLInputElement ? event.target.value : 'N/A',
      trigger: 'setQuantity',
      stackTrace: new Error().stack
    });
    this.#onQuantityChange(event);
  }

  /**
   * Handles the quantity change event.
   * @param {Event} event - The event.
   */
  #onQuantityChange(event) {
    const { quantityInput } = this.refs;

    // Skip if this is being updated by morphSection (to prevent infinite loops)
    if (quantityInput.dataset.morphing === 'true') {
      console.log('[Quantity Selector] ⏭️ Skipping - input is being morphed');
      return;
    }

    this.#checkQuantityRules();
    // Validate quantity after rules check
    this.validateQuantity(event);
    const newValue = parseInt(quantityInput.value);

    this.dispatchEvent(new QuantitySelectorUpdateEvent(newValue, Number(quantityInput.dataset.cartLine) || undefined));
  }

  /**
   * Validates quantity against available stock
   * @param {Event} event - The input event.
   */
  validateQuantity(event) {
    if (!(event.target instanceof HTMLInputElement)) return;
    
    // Update message position before showing
    this.#updateMessagePosition();
    
    const { quantityInput } = this.refs;
    const { min, value } = this.getCurrentValues();
    const effectiveMax = this.getEffectiveMax();

    // Clamp value to new effective max if necessary
    const clampedValue = Math.min(effectiveMax ?? Infinity, Math.max(min, value));

    if (clampedValue !== value) {
      quantityInput.value = clampedValue.toString();
    }

    this.updateButtonStates();
  }

  /**
   * Gets the quantity input.
   * @returns {HTMLInputElement} The quantity input.
   */
  get quantityInput() {
    if (!this.refs.quantityInput) {
      throw new Error('Missing <input ref="quantityInput" /> inside <quantity-selector-component />');
    }

    return this.refs.quantityInput;
  }
}

if (!customElements.get('quantity-selector-component')) {
  customElements.define('quantity-selector-component', QuantitySelectorComponent);
}
