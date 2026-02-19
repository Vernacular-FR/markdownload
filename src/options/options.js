let options = defaultOptions;
let keyupTimeout = null;


const clampMaxTitle = (raw) => {
    const val = parseInt(raw, 10);
    if (Number.isNaN(val)) return 150;
    return Math.min(500, Math.max(50, val));
}

const sanitizeMaxTitleInput = () => {
    const el = document.querySelector("[name='maxTitleLength']");
    if (!el) return;
    const digits = (el.value || '').replace(/[^0-9]/g, '');
    el.value = digits;
    el.value = clampMaxTitle(el.value);
}

const saveOptions = e => {
    e.preventDefault();

    sanitizeMaxTitleInput();

    options = {
        frontmatter: document.querySelector("[name='frontmatter']").value,
        backmatter: document.querySelector("[name='backmatter']").value,
        title: document.querySelector("[name='title']").value,
        maxTitleLength: clampMaxTitle(document.querySelector("[name='maxTitleLength']").value),
        disallowedChars: document.querySelector("[name='disallowedChars']").value,
        includeTemplate: document.querySelector("[name='includeTemplate']").checked,
        saveAs: document.querySelector("[name='saveAs']").checked,
        downloadImages: document.querySelector("[name='downloadImages']").checked,
        imagePrefix: document.querySelector("[name='imagePrefix']").value,
        mdClipsFolder: document.querySelector("[name='mdClipsFolder']").value,
        turndownEscape: document.querySelector("[name='turndownEscape']").checked,
        contextMenus: document.querySelector("[name='contextMenus']").checked,
        obsidianIntegration: document.querySelector("[name='obsidianIntegration']").checked,
        obsidianVault: document.querySelector("[name='obsidianVault']").value,
        obsidianFolder: document.querySelector("[name='obsidianFolder']").value,

        headingStyle: getCheckedValue(document.querySelectorAll("input[name='headingStyle']")),
        hr: getCheckedValue(document.querySelectorAll("input[name='hr']")),
        bulletListMarker: getCheckedValue(document.querySelectorAll("input[name='bulletListMarker']")),
        codeBlockStyle: getCheckedValue(document.querySelectorAll("input[name='codeBlockStyle']")),
        fence: getCheckedValue(document.querySelectorAll("input[name='fence']")),
        emDelimiter: getCheckedValue(document.querySelectorAll("input[name='emDelimiter']")),
        strongDelimiter: getCheckedValue(document.querySelectorAll("input[name='strongDelimiter']")),
        linkStyle: getCheckedValue(document.querySelectorAll("input[name='linkStyle']")),
        linkReferenceStyle: getCheckedValue(document.querySelectorAll("input[name='linkReferenceStyle']")),
        imageStyleWithout: getCheckedValue(document.querySelectorAll("input[name='imageStyleWithout']")),
        imageStyleWith: getCheckedValue(document.querySelectorAll("input[name='imageStyleWith']")),
        imageRefStyle: getCheckedValue(document.querySelectorAll("input[name='imageRefStyle']")),
        downloadMode: getCheckedValue(document.querySelectorAll("input[name='downloadMode']")),
        // obsidianPathType: getCheckedValue(document.querySelectorAll("input[name='obsidianPathType']")),
    }

    save();
}

// === MAX TITLE LENGTH GUARD ===
let maxTitleGuardAttached = false;

const setupMaxTitleLengthGuard = () => {
    if (maxTitleGuardAttached) return;

    const el = document.querySelector("[name='maxTitleLength']");
    if (!el) return;

    const sanitize = () => {
        if (!el) return;
        const digits = (el.value || '').replace(/[^0-9]/g, '');
        if (digits !== el.value) {
            el.value = digits;
        }
    };

    el.addEventListener('input', (e) => {
        requestAnimationFrame(sanitize);
    }, true);

    el.addEventListener('keydown', (e) => {
        if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    el.addEventListener('paste', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const digits = paste.replace(/[^0-9]/g, '');
        el.value = (el.value || '') + digits;
    }, true);

    maxTitleGuardAttached = true;
};

// Fallback: Use event delegation at document level
document.addEventListener('beforeinput', (e) => {
    if (e.target?.name === 'maxTitleLength') {
        if (e.inputType === 'insertText' && e.data && !/^[0-9]$/.test(e.data)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
}, true);

document.addEventListener('input', (e) => {
    if (e.target?.name === 'maxTitleLength') {
        const el = e.target;
        const digits = (el.value || '').replace(/[^0-9]/g, '');
        if (digits !== el.value) {
            el.value = digits;
        }
    }
}, true);

document.addEventListener('keydown', (e) => {
    if (e.target?.name === 'maxTitleLength') {
        if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }
}, true);

// Watch for element to be added to DOM
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node.querySelector?.("[name='maxTitleLength']");
                if (el) {
                    setupMaxTitleLengthGuard();
                    return;
                }
            }
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true, attributes: false, characterData: false });

// Also try immediately and on tab content load
window.addEventListener('tabContentLoaded', () => {
    setTimeout(() => {
        const el = document.querySelector("[name='maxTitleLength']");
        if (el) {
            setupMaxTitleLengthGuard();
        } else {
            // no-op; element not yet present
        }
    }, 200);
});

setTimeout(() => {
    const el = document.querySelector("[name='maxTitleLength']");
    if (el) {
        setupMaxTitleLengthGuard();
    } else {
        // element absent on initial check
    }
}, 1000);

const save = () => {
    const spinner = document.getElementById("spinner");
    spinner.style.display = "block";
    browser.storage.sync.set(options)
        .then(() => {
            browser.contextMenus.update("toggle-includeTemplate", {
                checked: options.includeTemplate
            });
            try {
                browser.contextMenus.update("tabtoggle-includeTemplate", {
                    checked: options.includeTemplate
                });
            } catch { }
            
            browser.contextMenus.update("toggle-downloadImages", {
                checked: options.downloadImages
            });
            try {
                browser.contextMenus.update("tabtoggle-downloadImages", {
                    checked: options.downloadImages
                });
            } catch { }
        })
        .then(() => {
            document.querySelectorAll(".status").forEach(statusEl => {
                statusEl.textContent = "Options Saved 💾";
                statusEl.classList.remove('error');
                statusEl.classList.add('success');
                statusEl.style.opacity = 1;
            });
            setTimeout(() => {
                document.querySelectorAll(".status").forEach(statusEl => {
                    statusEl.style.opacity = 0;
                });
            }, 5000)
            spinner.style.display = "none";
        })
        .catch(err => {
            document.querySelectorAll(".status").forEach(statusEl => {
                statusEl.textContent = err;
                statusEl.classList.remove('success');
                statusEl.classList.add('error');
                statusEl.style.opacity = 1;
            });
            spinner.style.display = "none";
        });
}

function hideStatus() {
    this.style.opacity = 0;
}

const setCurrentChoice = result => {
    options = result;

    // Migration / fallback to ensure both imageStyle groups always have a value
    if (!options.imageStyleWith && options.imageStyle) {
        options.imageStyleWith = options.imageStyle;
    }
    if (!options.imageStyleWithout) {
        // If old imageStyle existed and was not obsidian, reuse it for without; else default
        const legacy = options.imageStyle || defaultOptions.imageStyleWithout;
        options.imageStyleWithout = legacy === 'noImage' ? 'noImage' : defaultOptions.imageStyleWithout;
    }
    if (!options.imageStyleWith) options.imageStyleWith = defaultOptions.imageStyleWith;
    if (!options.imageStyleWithout) options.imageStyleWithout = defaultOptions.imageStyleWithout;

    console.log('setCurrentChoice called with options:', options);

    // if browser doesn't support the download api (i.e. Safari)
    if (!browser.downloads) {
        options.downloadMode = 'contentLink';
        document.querySelectorAll("[name='downloadMode']").forEach(el => el.disabled = true)
        document.querySelector('#downloadMode p').innerText = "The Downloas API is unavailable in this browser."
    }

    const downloadImages = options.downloadImages && options.downloadMode == 'downloadsApi';

    // Compute combined imageStyle for downstream code (background uses imageStyle)
    options.imageStyle = downloadImages ? options.imageStyleWith : options.imageStyleWithout;

    safeSetValue("[name='frontmatter']", options.frontmatter);
    textareaInput.bind(document.querySelector("[name='frontmatter']"))();
    safeSetValue("[name='backmatter']", options.backmatter);
    textareaInput.bind(document.querySelector("[name='backmatter']"))();
    safeSetValue("[name='title']", options.title);
    safeSetValue("[name='maxTitleLength']", options.maxTitleLength);
    sanitizeMaxTitleInput();
    safeSetValue("[name='disallowedChars']", options.disallowedChars);
    safeSetValue("[name='includeTemplate']", options.includeTemplate, 'checked');
    safeSetValue("[name='saveAs']", options.saveAs, 'checked');
    safeSetValue("[name='downloadImages']", options.downloadImages, 'checked');
    safeSetValue("[name='imagePrefix']", options.imagePrefix);
    safeSetValue("[name='mdClipsFolder']", options.mdClipsFolder);
    safeSetValue("[name='turndownEscape']", options.turndownEscape, 'checked');
    safeSetValue("[name='contextMenus']", options.contextMenus, 'checked');
    safeSetValue("[name='obsidianIntegration']", options.obsidianIntegration, 'checked');
    safeSetValue("[name='obsidianVault']", options.obsidianVault);
    safeSetValue("[name='obsidianFolder']", options.obsidianFolder);

    safeSetRadio("[name='headingStyle']", options.headingStyle);
    safeSetRadio("[name='hr']", options.hr);
    safeSetRadio("[name='bulletListMarker']", options.bulletListMarker);
    safeSetRadio("[name='codeBlockStyle']", options.codeBlockStyle);
    safeSetRadio("[name='fence']", options.fence);
    safeSetRadio("[name='emDelimiter']", options.emDelimiter);
    safeSetRadio("[name='strongDelimiter']", options.strongDelimiter);
    safeSetRadio("[name='linkStyle']", options.linkStyle);
    safeSetRadio("[name='linkReferenceStyle']", options.linkReferenceStyle);
    safeSetRadio("[name='imageStyleWithout']", options.imageStyleWithout);
    safeSetRadio("[name='imageStyleWith']", options.imageStyleWith);
    safeSetRadio("[name='imageRefStyle']", options.imageRefStyle);
    safeSetRadio("[name='downloadMode']", options.downloadMode);

    refereshElements();
}

const restoreOptions = () => {

    const onError = error => {
        console.error(error);
    }

    // Ensure DOM is ready before loading options
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            browser.storage.sync.get(defaultOptions).then(setCurrentChoice, onError);
        });
    } else {
        browser.storage.sync.get(defaultOptions).then(setCurrentChoice, onError);
    }
}

function textareaInput(){
    if (this.parentNode) {
        this.parentNode.dataset.value = this.value;
    }
}

// NOTE: show() function is now in scripts/dom-utils.js

const refereshElements = () => {
    const downloadModeGroup = document.getElementById("downloadModeGroup");
    if (downloadModeGroup) {
        downloadModeGroup.querySelectorAll('.radio-container,.checkbox-container,.textbox-container').forEach(container => {
            show(container, options.downloadMode == 'downloadsApi')
        });
    }

    // document.getElementById("obsidianUriGroup").querySelectorAll('.radio-container,.checkbox-container,.textbox-container').forEach(container => {
    //     show(container, options.downloadMode == 'obsidianUri')
    // });
    show(document.getElementById("mdClipsFolder"), options.downloadMode == 'downloadsApi');

    show(document.getElementById("linkReferenceStyle"), (options.linkStyle == "referenced"));

    // Always show image reference style radio buttons
    show(document.getElementById("imageRefOptions"), true);

    // Always show image style sections (with/without) regardless of checkbox state
    show(document.getElementById("imageOptionsWithout"), true);
    show(document.getElementById("imageOptionsWith"), true);

    show(document.getElementById("fence"), (options.codeBlockStyle == "fenced"));

    const downloadImages = options.downloadImages && options.downloadMode == 'downloadsApi';

    show(document.getElementById("imagePrefix"), downloadImages);

    options.imageStyle = downloadImages ? options.imageStyleWith : options.imageStyleWithout;

    ['markdown', 'base64', 'obsidian', 'obsidian-nofolder'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.disabled = !downloadImages;
    });

    // Always keep radio inputs enabled for selection
    document.querySelectorAll("[name='imageStyleWith'], [name='imageStyleWithout']").forEach(input => {
        input.disabled = false;
    });
}

const inputChange = e => {
    console.log('inputChange');

    if (e) {
        let key = e.target.name;
        let value = e.target.value;
        if (key == "import-file") {
            fr = new FileReader();
            fr.onload = (ev) => {
                let lines = ev.target.result;
                options = JSON.parse(lines);
                setCurrentChoice(options);
                browser.contextMenus.removeAll()
                createMenus()
                save();            
                refereshElements();
            };
            fr.readAsText(e.target.files[0])
        }
        else {
            if (e.target.type == "checkbox") value = e.target.checked;
            options[key] = value;

            if (key == "contextMenus") {
                if (value) { createMenus() }
                else { browser.contextMenus.removeAll() }
            }
    
            save();
            refereshElements();
        }
    }
}

const inputKeyup = (e) => {
    if (keyupTimeout) clearTimeout(keyupTimeout);
    keyupTimeout = setTimeout(inputChange, 500, e);
}

const buttonClick = (e) => {
    if (e.target.id == "import") {
        document.getElementById("import-file").click();
    }
    else if (e.target.id == "export") {
        console.log("export");
        const json = JSON.stringify(options, null, 2);
        var blob = new Blob([json], { type: "text/json" });
        var url = URL.createObjectURL(blob);
        var d = new Date();

        var datestring = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
        browser.downloads.download({
            url: url,
            saveAs: true,
            filename: `MarkDownload-export-${datestring}.json`
        });
    }
}

const loaded = () => {
    restoreOptions();

    // Listen for storage changes to keep options page synchronized
    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync') {
            // Update global options with changed values
            Object.keys(changes).forEach(key => {
                if (changes[key].newValue !== undefined) {
                    options[key] = changes[key].newValue;
                }
            });

            // Update UI with new values
            setCurrentChoice(options);
            refereshElements();
        }
    });

    document.querySelectorAll('input,textarea,button').forEach(input => {
        if (input.tagName == "TEXTAREA" || input.type == "text") {
            input.addEventListener('keyup', inputKeyup);
        }
        else if (input.tagName == "BUTTON") {
            input.addEventListener('click', buttonClick);
        }
        else input.addEventListener('change', inputChange);
    })

    // Force refresh of all radio buttons after a short delay to ensure they're set
    setTimeout(() => {
        console.log('Forcing refresh of all radio buttons...');
        setCheckedValue(document.querySelectorAll("[name='headingStyle']"), options.headingStyle);
        setCheckedValue(document.querySelectorAll("[name='hr']"), options.hr);
        setCheckedValue(document.querySelectorAll("[name='bulletListMarker']"), options.bulletListMarker);
        setCheckedValue(document.querySelectorAll("[name='codeBlockStyle']"), options.codeBlockStyle);
        setCheckedValue(document.querySelectorAll("[name='fence']"), options.fence);
        setCheckedValue(document.querySelectorAll("[name='emDelimiter']"), options.emDelimiter);
        setCheckedValue(document.querySelectorAll("[name='strongDelimiter']"), options.strongDelimiter);
        setCheckedValue(document.querySelectorAll("[name='linkStyle']"), options.linkStyle);
        setCheckedValue(document.querySelectorAll("[name='linkReferenceStyle']"), options.linkReferenceStyle);
        setCheckedValue(document.querySelectorAll("[name='imageStyleWithout']"), options.imageStyleWithout);
        setCheckedValue(document.querySelectorAll("[name='imageStyleWith']"), options.imageStyleWith);
        setCheckedValue(document.querySelectorAll("[name='imageRefStyle']"), options.imageRefStyle);
        setCheckedValue(document.querySelectorAll("[name='downloadMode']"), options.downloadMode);
        console.log('Radio buttons refreshed');
    }, 200);
}

document.addEventListener("DOMContentLoaded", loaded);
document.querySelectorAll(".save").forEach(el => el.addEventListener("click", saveOptions));
document.querySelectorAll(".status").forEach(el => el.addEventListener("click", hideStatus));
document.querySelectorAll(".input-sizer > textarea").forEach(el => el.addEventListener("input", textareaInput));

/// https://www.somacon.com/p143.php
// return the value of the radio button that is checked
// return an empty string if none are checked, or
// there are no radio buttons
// NOTE: This function is now in scripts/dom-utils.js