// services/exchangeRateService.js
import fetch from "node-fetch";

const apiKeys = [
  "85b74576b01e8837973975c5",
  "551a0a522ee35a6b81ab564c",
  "18e51cab9c3d220d0e11fc18",
  "0f3c74ea59fdb4c30890822e"
];

let cachedRates = null;
let lastUpdated = null;

// Fetch and rotate keys
async function fetchRates() {
  for (const key of apiKeys) {
    try {
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/${key}/latest/EUR`
      );
      const data = await response.json();

      if (data?.result === "success") {
        cachedRates = data.conversion_rates;
        lastUpdated = new Date();
        console.log("✔ Exchange rates updated!");
        return cachedRates;
      }
    } catch (err) {
      console.log("API key failed, trying next...");
    }
  }

  throw new Error("All exchange rate API keys failed");
}

// Getter function used everywhere
export async function getRates() {
  // If no cache yet → fetch immediately
  if (!cachedRates) {
    await fetchRates();
  }
  return cachedRates;
}

// Auto-refresh every 12 hours
setInterval(fetchRates, 12 * 60 * 60 * 1000);

// Initial fetch at server startup
fetchRates();

export { cachedRates, lastUpdated };
