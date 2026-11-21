// Serves the Sticky Days static app. All user data lives in the phone's browser
// storage (localStorage + IndexedDB); this Worker never sees or stores any of it.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
