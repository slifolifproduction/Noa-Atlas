/** True when keyboard input is going into a text field, so single-key shortcuts should not fire. */
export const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
