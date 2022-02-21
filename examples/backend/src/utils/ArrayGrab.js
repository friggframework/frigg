async function grab(array, predicate) {
    for (let i = 0; i < array.length; i++) {
        if (predicate(array[i])) {
            return array.splice(i, 1)[0];
        }
    }
    return null;
}

module.exports = grab;
