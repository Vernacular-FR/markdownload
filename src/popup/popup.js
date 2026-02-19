
// default variables
var selectedText = null;
var imageList = null;
var mdClipsFolder = '';
let currentOptions = null;

const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
// set up event handlers
const cm = CodeMirror.fromTextArea(document.getElementById("md"), {
    theme: darkMode ? "xq-dark" : "xq-light",
    mode: "markdown",
    lineWrapping: true
});
const syncButtonsWithSelection = (hasSelection) => {
    const selectionBtn = document.getElementById("downloadSelection");
    const mdBtn = document.getElementById("download");

    if (hasSelection) {
        selectionBtn.classList.add("visible");
        mdBtn.style.display = "none";
    } else {
        selectionBtn.classList.remove("visible");
        mdBtn.style.display = "flex";
    }
};

cm.on("cursorActivity", (cm) => {
    const somethingSelected = cm.listSelections().some(sel => !sel.empty());
    syncButtonsWithSelection(somethingSelected);
});
document.getElementById("download").addEventListener("click", download);
document.getElementById("downloadSelection").addEventListener("click", downloadSelection);

const defaultOptions = {
    includeTemplate: false,
    clipSelection: true,
    downloadImages: false
}

const updateDownloadButtonLabel = (options) => {
    const btn = document.getElementById("download");
    const label = btn.querySelector("span:nth-child(2)");
    const selectionBtn = document.getElementById("downloadSelection");
    const selectionLabel = selectionBtn.querySelector("span:nth-child(2)");
    if (!label) return;
    label.textContent = options.downloadImages ? "Download .md (with images)" : "Download .md";
    if (selectionLabel) {
        selectionLabel.textContent = options.downloadImages ? "Download selection (with images)" : "Download selection";
    }
}

const updateContextMenusSafe = async (options) => {
    if (!browser.contextMenus || !browser.contextMenus.update) return;
    try {
        await browser.contextMenus.update("toggle-includeTemplate", {
            checked: options.includeTemplate
        });
    } catch (err) {
        console.debug('contextMenu toggle-includeTemplate missing', err);
    }
    try {
        await browser.contextMenus.update("tabtoggle-includeTemplate", {
            checked: options.includeTemplate
        });
    } catch (err) {
        console.debug('contextMenu tabtoggle-includeTemplate missing', err);
    }
};

const applyOptionsState = (options) => {
    // include template
    const includeBtn = document.querySelector("#includeTemplate");
    if (includeBtn) includeBtn.classList.toggle("checked", !!options.includeTemplate);

    // clip selection
    const selBtn = document.querySelector("#selected");
    const docBtn = document.querySelector("#document");
    if (selBtn && docBtn) {
        selBtn.classList.toggle("checked", !!options.clipSelection);
        docBtn.classList.toggle("checked", !options.clipSelection);
    }

    // download images
    const dlBtn = document.querySelector("#downloadImages");
    if (dlBtn) dlBtn.classList.toggle("checked", !!options.downloadImages);

    updateDownloadButtonLabel(options);
};

const checkInitialSettings = options => {
    applyOptionsState(options);
}

const toggleClipSelection = options => {
    options.clipSelection = !options.clipSelection;
    document.querySelector("#selected").classList.toggle("checked");
    document.querySelector("#document").classList.toggle("checked");
    browser.storage.sync.set(options).then(() => clipSite()).catch((error) => {
        console.error(error);
    });
}

const toggleIncludeTemplate = options => {
    options.includeTemplate = !options.includeTemplate;
    document.querySelector("#includeTemplate").classList.toggle("checked");
    browser.storage.sync.set(options)
        .then(() => updateContextMenusSafe(options))
        .then(() => clipSite())
        .catch((error) => {
            console.error(error);
        });
}

const toggleDownloadImages = options => {
    options.downloadImages = !options.downloadImages;
    currentOptions = options;
    document.querySelector("#downloadImages").classList.toggle("checked");
    browser.storage.sync.set(options).then(() => {
        browser.contextMenus.update("toggle-downloadImages", {
            checked: options.downloadImages
        });
        try {
            browser.contextMenus.update("tabtoggle-downloadImages", {
                checked: options.downloadImages
            });
        } catch { }
        updateDownloadButtonLabel(options);
    }).catch((error) => {
        console.error(error);
    });
}
const showOrHideClipOption = selection => {
    if (selection) {
        document.getElementById("clipOption").style.display = "flex";
    }
    else {
        document.getElementById("clipOption").style.display = "none";
    }
}

const clipSite = id => {
    return browser.tabs.executeScript(id, { code: "getSelectionAndDom()" })
        .then((result) => {
            if (result && result[0]) {
                showOrHideClipOption(result[0].selection);
                let message = {
                    type: "clip",
                    dom: result[0].dom,
                    selection: result[0].selection
                }
                return browser.storage.sync.get(defaultOptions).then(options => {
                    browser.runtime.sendMessage({
                        ...message,
                        ...options
                    });
                }).catch(err => {
                    console.error(err);
                    showError(err)
                    return browser.runtime.sendMessage({
                        ...message,
                        ...defaultOptions
                    });
                }).catch(err => {
                    console.error(err);
                    showError(err)
                });
            }
        }).catch(err => {
            console.error(err);
            showError(err)
        });
}

// inject the necessary scripts
browser.storage.sync.get(defaultOptions).then(options => {
    currentOptions = options;
    checkInitialSettings(options);
    syncButtonsWithSelection(false);
    
    document.getElementById("selected").addEventListener("click", (e) => {
        e.preventDefault();
        toggleClipSelection(options);
    });
    document.getElementById("document").addEventListener("click", (e) => {
        e.preventDefault();
        toggleClipSelection(options);
    });
    document.getElementById("includeTemplate").addEventListener("click", (e) => {
        e.preventDefault();
        toggleIncludeTemplate(options);
    });
    document.getElementById("downloadImages").addEventListener("click", (e) => {
        e.preventDefault();
        toggleDownloadImages(options);
    });

    // Keep popup in sync with external changes (options page / other windows)
    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        let mutated = false;
        ['includeTemplate', 'clipSelection', 'downloadImages'].forEach(key => {
            if (changes[key]) {
                options[key] = changes[key].newValue;
                mutated = true;
            }
        });
        if (mutated) {
            applyOptionsState(options);
        }
    });
    
    return browser.tabs.query({
        currentWindow: true,
        active: true
    });
}).then((tabs) => {
    var id = tabs[0].id;
    var url = tabs[0].url;
    browser.tabs.executeScript(id, {
        file: "/browser-polyfill.min.js"
    })
    .then(() => {
        return browser.tabs.executeScript(id, {
            file: "/contentScript/contentScript.js"
        });
    }).then( () => {
        console.info("Successfully injected MarkDownload content script");
        return clipSite(id);
    }).catch( (error) => {
        console.error(error);
        showError(error);
    });
});

// listen for notifications from the background page
browser.runtime.onMessage.addListener(notify);

//function to send the download message to the background page
function sendDownloadMessage(text) {
    if (text != null) {

        return browser.tabs.query({
            currentWindow: true,
            active: true
        }).then(tabs => {
            var message = {
                type: "download",
                markdown: text,
                title: document.getElementById("title").value,
                tab: tabs[0],
                imageList: imageList,
                mdClipsFolder: mdClipsFolder,
                options: currentOptions
            };
            return browser.runtime.sendMessage(message);
        });
    }
}

//function to send the download ZIP message to the background page
function sendDownloadZipMessage(text, selection = false) {
    if (text != null) {

        return browser.tabs.query({
            currentWindow: true,
            active: true
        }).then(tabs => {
            var message = {
                type: "downloadZip",
                markdown: text,
                title: document.getElementById("title").value,
                tab: tabs[0],
                clipSelection: selection,
                options: currentOptions
            };
            return browser.runtime.sendMessage(message);
        });
    }
}

// event handler for download button
async function download(e) {
    e.preventDefault();
    const useSelection = document.querySelector("#selected").classList.contains("checked");
    if (currentOptions && currentOptions.downloadImages) {
        await sendDownloadZipMessage(cm.getValue(), useSelection);
    } else {
        await sendDownloadMessage(cm.getValue());
    }
    window.close();
}

// event handler for download ZIP button
async function downloadZip(e) {
    e.preventDefault();
    const useSelection = document.querySelector("#selected").classList.contains("checked");
    await sendDownloadZipMessage(cm.getValue(), useSelection);
    window.close();
}

// event handler for download selected button
async function downloadSelection(e) {
    e.preventDefault();
    if (cm.somethingSelected()) {
        const selectionText = cm.getSelection();
        if (currentOptions && currentOptions.downloadImages) {
            await sendDownloadZipMessage(selectionText, true);
        } else {
            await sendDownloadMessage(selectionText);
        }
    }
    window.close();
}

//function that handles messages from the injected script into the site
function notify(message) {
    // message for displaying markdown
    if (message.type == "display.md") {

        // set the values from the message
        //document.getElementById("md").value = message.markdown;
        cm.setValue(message.markdown);
        document.getElementById("title").value = message.article.title;
        imageList = message.imageList;
        mdClipsFolder = message.mdClipsFolder;
        
        // show the hidden elements
        document.getElementById("container").style.display = 'flex';
        document.getElementById("spinner").style.display = 'none';
         // focus the download button
        document.getElementById("download").focus();
        cm.refresh();
        syncButtonsWithSelection(false);
    }
}

function showError(err) {
    // show the hidden elements
    document.getElementById("container").style.display = 'flex';
    document.getElementById("spinner").style.display = 'none';
    cm.setValue(`Error clipping the page\n\n${err}`)
}

