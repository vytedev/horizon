import { Component } from '@theme/component';
import { QuantitySelectorUpdateEvent } from '@theme/events';

/**
 * A custom element that allows the user to select a quantity.
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
   * Updates the stock message position to be relative to buttons group
   */
  #updateMessagePosition() {
    const stockMessage = this.refs.stockMessage;
    const buttonsGroup = this.#getButtonsGroup();
    
    if (stockMessage && buttonsGroup && stockMessage instanceof HTMLElement) {
      // Move message to buttons group if not already there
      if (stockMessage.parentElement !== buttonsGroup) {
        buttonsGroup.appendChild(stockMessage);
        // Ensure it's still accessible via refs
        this.refs.stockMessage = stockMessage;
      }
    }
  }
  
  /**
   * Gets the stock message element (may be moved to buttons group)
   */
  #getStockMessage() {
    const stockMessage = this.refs.stockMessage;
    // If refs don't work, try to find it in buttons group
    if (!stockMessage) {
      const buttonsGroup = this.#getButtonsGroup();
      if (buttonsGroup) {
        return buttonsGroup.querySelector('.quantity-selector__stock-message');
      }
    }
    return stockMessage;
  }

  connectedCallback() {
    super.connectedCallback?.();
    // Update message position after component is connected
    setTimeout(() => this.#updateMessagePosition(), 0);
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
    if (!(event.target instanceof HTMLElement)) return;

    // Skip if this is being updated by morphSection
    if (this.refs.quantityInput.dataset.morphing === 'true') {
      console.log('[Quantity Selector] ⏭️ Skipping setQuantity - input is being morphed');
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
    const cartLine = Number(quantityInput.dataset.cartLine);
    
    console.log('[Quantity Selector] 🔄 Dispatching QuantitySelectorUpdateEvent:', {
      cartLine,
      quantity: newValue,
      inputValue: quantityInput.value,
      min: quantityInput.min,
      max: quantityInput.max,
      step: quantityInput.step
    });

    quantityInput.dispatchEvent(new QuantitySelectorUpdateEvent(newValue, cartLine));
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
    const stockMessage = this.#getStockMessage();
    const availableQuantity = parseInt(this.dataset.availableQuantity || '') || parseInt(quantityInput.max || '') || 9999;
    const requestedQuantity = parseInt(quantityInput.value) || 0;
    
    if (stockMessage && stockMessage instanceof HTMLElement) {
      if (requestedQuantity > availableQuantity) {
        stockMessage.textContent = `That's the max quantity`;
        stockMessage.style.display = 'block';
        // Reset to max available
        quantityInput.value = String(availableQuantity);
      } else {
        stockMessage.style.display = 'none';
      }
    }
    
    this.#checkQuantityRules();
  }

  /**
   * Checks the quantity rules are met
   */
  #checkQuantityRules = () => {
    const { quantityInput } = this.refs;
    const stockMessage = this.#getStockMessage();
    const { min, max, value: newValue } = quantityInput;
    const availableQuantity = parseInt(this.dataset.availableQuantity || '') || parseInt(max || '') || 9999;
    const numValue = parseInt(newValue) || 0;

    if (numValue < parseInt(min || '1')) {
      quantityInput.value = min || '1';
    }
    
    if (max && numValue > parseInt(max)) {
      quantityInput.value = max;
    }
    
    // Update message position before showing
    this.#updateMessagePosition();
    
    // Check against available stock
    if (numValue > availableQuantity) {
      quantityInput.value = String(availableQuantity);
      if (stockMessage && stockMessage instanceof HTMLElement) {
        stockMessage.textContent = `That's the max quantity`;
        stockMessage.style.display = 'block';
      }
    } else if (stockMessage && stockMessage instanceof HTMLElement) {
      stockMessage.style.display = 'none';
    }
  };

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
