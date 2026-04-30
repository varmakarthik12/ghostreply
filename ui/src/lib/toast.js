let _fn = null;
export const setToastFn = (fn) => {
  _fn = fn;
};
export const toast = (msg, type = "success") => {
  _fn?.(msg, type);
};
