// utils/vat.js
import soap from 'soap';

const VIES_WSDL_URL = 'https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl';

export const euCountries = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT',
  'RO', 'SK', 'SI', 'ES', 'SE'
];

export const isValidEUCountry = (code) => euCountries.includes(code.toUpperCase());
export const validateVATNumber = async (vatNumber, countryCode) => {
  try {
    const client = await soap.createClientAsync(VIES_WSDL_URL);

    // Strip country code from VAT number if present
    const cleanedVat = vatNumber.startsWith(countryCode.toUpperCase())
      ? vatNumber.slice(2)
      : vatNumber;

    const args = {
      countryCode: countryCode.toUpperCase(),
      vatNumber: cleanedVat,
    };

const [result] = await client.checkVatAsync(args);
console.log("VIES Result:", result);

    return result.valid === true;
  } catch (error) {
    console.warn("VIES down, falling back to vatcomply.com...");
    try {
      const response = await fetch(`https://api.vatcomply.com/vat?vat_number=${vatNumber}`);
      const data = await response.json();
      return data.valid && data.country_code === countryCode;
    } catch {
      return false;
    }
  }
};

