// Shared DOM utility helpers for options page

function show(el, visible) {
  if (!el) return;
  el.style.display = visible ? "" : "none";
  el.style.opacity = visible ? "1" : "0";
}

function safeSetValue(selector, value, type = 'value') {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`Element not found: ${selector}`);
    return false;
  }
  if (type === 'value') {
    el.value = value;
  } else if (type === 'checked') {
    el.checked = !!value;
  }
  return true;
}

function safeSetRadio(selector, value) {
  const radios = document.querySelectorAll(selector);
  if (!radios || radios.length === 0) {
    console.warn(`No radio buttons found: ${selector}`);
    return false;
  }
  setCheckedValue(radios, value);
  return true;
}

// return the value of the radio button that is checked
// return an empty string if none are checked, or there are no radio buttons
function getCheckedValue(radioObj) {
  if (!radioObj) return "";
  const radioLength = radioObj.length;
  if (radioLength === undefined) return radioObj.checked ? radioObj.value : "";
  for (let i = 0; i < radioLength; i++) {
    if (radioObj[i].checked) return radioObj[i].value;
  }
  return "";
}

// set the radio button with the given value as being checked
// do nothing if there are no radio buttons
// if the given value does not exist, all the radio buttons are reset to unchecked
function setCheckedValue(radioObj, newValue) {
  if (!radioObj) return;
  const radioLength = radioObj.length;
  if (radioLength === undefined) {
    radioObj.checked = (radioObj.value == newValue.toString());
    return;
  }
  for (let i = 0; i < radioLength; i++) {
    radioObj[i].checked = false;
    if (radioObj[i].value == newValue.toString()) {
      radioObj[i].checked = true;
    }
  }
}
