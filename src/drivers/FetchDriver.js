export function createFetchDriver(entityName) {
  return function fetchDriver(input, init) {
    return window.fetch(input, init);
  };
}
