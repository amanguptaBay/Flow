export async function getNewFileHandle() {
    const opts = {
        types: [{
            description: 'ThinkingDFS Graph',
            accept: { 'application/json': ['.json'] },
        }],
    };
    return await window.showSaveFilePicker(opts);
}

export async function getOpenFileHandle() {
    const opts = {
        types: [{
            description: 'ThinkingDFS Graph',
            accept: { 'application/json': ['.json'] },
        }],
        multiple: false,
    };
    const [handle] = await window.showOpenFilePicker(opts);
    return handle;
}

export async function writeFile(fileHandle, contents) {
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
}

export async function readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return await file.text();
}
