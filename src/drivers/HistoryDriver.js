export function createHistoryDriver() {
  const history = window.history;
  const popStateListeners = [];
  function handlePopState(event) {
    for (const listener of popStateListeners) {
      listener(event);
    }
  }
  window.addEventListener('popstate', handlePopState);
  return {
    pushState(state, title, url) {
      history.pushState(state, title, url);
    },
    replaceState(state, title, url) {
      history.replaceState(state, title, url);
    },
    back() {
      history.back();
    },
    forward() {
      history.forward();
    },
    go(delta) {
      history.go(delta);
    },
    onPopState(callback) {
      popStateListeners.push(callback);
      return function unsubscribe() {
        const index = popStateListeners.indexOf(callback);
        if (index !== -1) {
          popStateListeners.splice(index, 1);
        }
        if (popStateListeners.length === 0) {
          window.removeEventListener('popstate', handlePopState);
        }
      };
    },
    _cleanup() {
      window.removeEventListener('popstate', handlePopState);
      popStateListeners.length = 0;
    }
  };
}
