// Used for apps like CWise
function formatPatchBody(currentPath = '/', obj) {
    let patchArray = [];
    for (key in obj) {
        if (typeof obj[key] === 'object') {
            let nextPath = currentPath + key + '/';
            let nestedPatch = formatPatchBody(nextPath, obj[key]);
            patchArray = patchArray.concat(nestedPatch);
        } else {
            let entry = {
                op: 'replace',
                path: currentPath + key,
                value: obj[key],
            };
            patchArray.push(entry);
        }
    }
    return patchArray;
}

module.exports = formatPatchBody;
