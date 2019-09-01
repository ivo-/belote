/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sort array of objects by attribute in selected order.
 * @param {Array} arr
 * @param {String} attribute
 * @param {Boolean} ascOrder
 */
export function sortArrBy(arr, attribute, ascOrder = true) {
  const result = arr.sort((prev, next) => {
    if (prev[attribute] > next[attribute]) {
      return 1;
    }

    if (prev[attribute] < next[attribute]) {
      return -1;
    }

    return 0;
  });

  if (ascOrder) {
    return result;
  }

  return result.reverse();
}
