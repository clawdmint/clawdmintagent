// ═══════════════════════════════════════════════════════════════════════════════
// ASYNC-STORAGE SHIM FOR BROWSER
// ═══════════════════════════════════════════════════════════════════════════════
// This shim satisfies MetaMask SDK's import of @react-native-async-storage/async-storage
// which is not available in browser environments.

module.exports = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
  mergeItem: async () => {},
  clear: async () => {},
  getAllKeys: async () => [],
  multiGet: async () => [],
  multiSet: async () => {},
  multiRemove: async () => {},
  multiMerge: async () => {},
};
