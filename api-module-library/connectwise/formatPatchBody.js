function formatPatchBody(currentPath = '/', obj) {
    let patchArray = [];
    for (key in obj) {
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            const nextPath = `${currentPath + key}/`;
            const nestedPatch = formatPatchBody(nextPath, obj[key]);
            // console.log("Nested Patch: ", nestedPatch);
            patchArray = patchArray.concat(nestedPatch);
        } else {
            const entry = {
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
